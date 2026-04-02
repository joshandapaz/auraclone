package com.aura.cloner;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Robust AXML (Binary AndroidManifest.xml) Patcher.
 *
 * Fixes vs. previous version:
 *  - Correctly handles AXML variable-length encoding for strings > 127 chars
 *    (the format uses 2-byte lengths with the high bit set as a flag).
 *  - Properly pads the string pool to 4-byte alignment.
 */
public class AxmlPatcher {

    private static final int CHUNK_STRING_POOL = 0x001C0001;

    public static byte[] patchPackageName(byte[] axml, String oldPackage, String newPackage)
            throws IOException {
        ByteBuffer buf = ByteBuffer.wrap(axml).order(ByteOrder.LITTLE_ENDIAN);
        buf.position(8); // skip file header (magic + total size)

        while (buf.hasRemaining()) {
            int chunkType = buf.getInt();
            int chunkSize = buf.getInt();
            int startPos  = buf.position() - 8;

            if (chunkType == CHUNK_STRING_POOL) {
                return patchStringPool(buf, axml, startPos, chunkSize, oldPackage, newPackage);
            }
            buf.position(startPos + chunkSize);
        }
        throw new IOException("String pool chunk not found in binary AXML");
    }

    // -------------------------------------------------------------------------
    // String pool patching
    // -------------------------------------------------------------------------

    private static byte[] patchStringPool(ByteBuffer buf, byte[] original,
            int startPos, int chunkSize,
            String oldPkg, String newPkg) throws IOException {

        int stringCount   = buf.getInt();
        int styleCount    = buf.getInt();
        int flags         = buf.getInt();
        int stringsOffset = buf.getInt();
        int stylesOffset  = buf.getInt();

        boolean isUtf8 = (flags & (1 << 8)) != 0;

        int[] oldOffsets = new int[stringCount];
        for (int i = 0; i < stringCount; i++) oldOffsets[i] = buf.getInt();

        // Rebuild strings data, replacing all occurrences of oldPkg
        ByteArrayOutputStream newStrings = new ByteArrayOutputStream();
        int[] newOffsets = new int[stringCount];

        for (int i = 0; i < stringCount; i++) {
            newOffsets[i] = newStrings.size();
            int pos = startPos + stringsOffset + oldOffsets[i];
            String s = readString(original, pos, isUtf8);
            if (s.equals(oldPkg)) s = newPkg;
            writeString(newStrings, s, isUtf8);
        }

        // Pad strings block to 4-byte boundary
        while (newStrings.size() % 4 != 0) newStrings.write(0);

        int newStringsSize = newStrings.size();
        // Header (8) + string pool header (20) + offset table (stringCount*4) + strings data
        int headerSize    = 28; // 8 chunk header + 5 ints = 28
        int newChunkSize  = headerSize + (stringCount * 4) + newStringsSize;

        ByteBuffer newChunk = ByteBuffer.allocate(newChunkSize).order(ByteOrder.LITTLE_ENDIAN);
        newChunk.putInt(CHUNK_STRING_POOL);
        newChunk.putInt(newChunkSize);
        newChunk.putInt(stringCount);
        newChunk.putInt(styleCount);
        newChunk.putInt(flags);
        newChunk.putInt(headerSize + (stringCount * 4)); // stringsOffset relative to chunk start
        newChunk.putInt(0);                              // stylesOffset = 0 (no styles)

        for (int off : newOffsets) newChunk.putInt(off);
        newChunk.put(newStrings.toByteArray());

        // Rebuild the full file: new header + new chunk + remaining chunks
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        // File header: magic + new total size
        ByteBuffer fileHdr = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        int newTotalSize = original.length - chunkSize + newChunkSize;
        fileHdr.putInt(0x00080003);
        fileHdr.putInt(newTotalSize);
        out.write(fileHdr.array());
        out.write(newChunk.array());
        // Append all chunks after the string pool unchanged
        out.write(original, startPos + chunkSize, original.length - (startPos + chunkSize));

        return out.toByteArray();
    }

    // -------------------------------------------------------------------------
    // AXML string read/write with proper variable-length encoding
    // -------------------------------------------------------------------------

    /**
     * AXML UTF-8 strings use two variable-length fields before the data:
     *   charLen  (1 or 2 bytes — 2-byte if high bit is set in first byte)
     *   byteLen  (1 or 2 bytes — same rule)
     *
     * AXML UTF-16 strings use one 2-byte little-endian char count.
     */
    private static String readString(byte[] data, int pos, boolean isUtf8) {
        if (isUtf8) {
            int offset = 0;
            // charLen
            int b0 = data[pos + offset] & 0xFF;
            offset += (b0 & 0x80) != 0 ? 2 : 1;
            // byteLen
            int b1 = data[pos + offset] & 0xFF;
            int byteLen;
            if ((b1 & 0x80) != 0) {
                byteLen = ((b1 & 0x7F) << 8) | (data[pos + offset + 1] & 0xFF);
                offset += 2;
            } else {
                byteLen = b1;
                offset += 1;
            }
            return new String(data, pos + offset, byteLen, StandardCharsets.UTF_8);
        } else {
            // UTF-16LE: 2-byte char count (little-endian)
            int len = (data[pos] & 0xFF) | ((data[pos + 1] & 0xFF) << 8);
            return new String(data, pos + 2, len * 2, StandardCharsets.UTF_16LE);
        }
    }

    private static void writeString(ByteArrayOutputStream out, String s, boolean isUtf8)
            throws IOException {
        if (isUtf8) {
            byte[] bytes  = s.getBytes(StandardCharsets.UTF_8);
            int charLen   = s.length();
            int byteLen   = bytes.length;
            writeAxmlVarLen(out, charLen);
            writeAxmlVarLen(out, byteLen);
            out.write(bytes);
            out.write(0); // null terminator
        } else {
            byte[] bytes = s.getBytes(StandardCharsets.UTF_16LE);
            int len      = s.length();
            out.write(len & 0xFF);
            out.write((len >> 8) & 0xFF);
            out.write(bytes);
            out.write(0); // null terminator (2 bytes for UTF-16)
            out.write(0);
        }
    }

    /**
     * Writes an AXML variable-length integer:
     *   value <= 0x7F  → 1 byte
     *   value > 0x7F   → 2 bytes: high byte has bit 7 set, contains upper bits;
     *                              low byte contains lower 8 bits.
     */
    private static void writeAxmlVarLen(ByteArrayOutputStream out, int value) {
        if (value > 0x7F) {
            out.write(((value >> 8) & 0x7F) | 0x80);
            out.write(value & 0xFF);
        } else {
            out.write(value & 0xFF);
        }
    }
}
