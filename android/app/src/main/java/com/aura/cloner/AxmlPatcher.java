package com.aura.cloner;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Robust AXML Patcher for Android.
 * Handles dual-length encoding for UTF-8 and UTF-16 in BXML string pools.
 * Correctly pads chunks to 4-byte boundaries.
 */
public class AxmlPatcher {

    private static final int CHUNK_STRING_POOL = 0x001C0001;

    public static byte[] patchPackageName(byte[] axml, String oldPackage, String newPackage) throws IOException {
        ByteBuffer buffer = ByteBuffer.wrap(axml).order(ByteOrder.LITTLE_ENDIAN);
        
        buffer.position(8); // Skip Header
        
        while (buffer.hasRemaining()) {
            int chunkType = buffer.getInt();
            int chunkSize = buffer.getInt();
            int startPos = buffer.position() - 8;

            if (chunkType == CHUNK_STRING_POOL) {
                return patchStringPool(buffer, axml, startPos, chunkSize, oldPackage, newPackage);
            }
            
            buffer.position(startPos + chunkSize);
        }
        
        throw new IOException("String pool missing in AXML");
    }

    private static byte[] patchStringPool(ByteBuffer buffer, byte[] original, int startPos, int chunkSize, String oldPackage, String newPackage) throws IOException {
        int stringCount = buffer.getInt();
        int styleCount = buffer.getInt();
        int flags = buffer.getInt();
        int stringsOffset = buffer.getInt();
        int stylesOffset = buffer.getInt();
        
        int[] stringOffsets = new int[stringCount];
        for (int i = 0; i < stringCount; i++) {
            stringOffsets[i] = buffer.getInt();
        }

        ByteArrayOutputStream newStringsStream = new ByteArrayOutputStream();
        int[] newOffsets = new int[stringCount];
        boolean isUtf8 = (flags & (1 << 8)) != 0;
        
        for (int i = 0; i < stringCount; i++) {
            newOffsets[i] = newStringsStream.size();
            int pos = startPos + stringsOffset + stringOffsets[i];
            String s = readAxmlString(original, pos, isUtf8);
            
            if (s.equals(oldPackage)) s = newPackage;
            
            writeAxmlString(newStringsStream, s, isUtf8);
        }

        // Pad to 4-byte boundary
        while (newStringsStream.size() % 4 != 0) {
            newStringsStream.write(0);
        }

        int newStringsSize = newStringsStream.size();
        int newChunkSize = 28 + (stringCount * 4) + newStringsSize;
        
        ByteBuffer newChunk = ByteBuffer.allocate(newChunkSize).order(ByteOrder.LITTLE_ENDIAN);
        newChunk.putInt(CHUNK_STRING_POOL);
        newChunk.putInt(newChunkSize);
        newChunk.putInt(stringCount);
        newChunk.putInt(styleCount);
        newChunk.putInt(flags);
        newChunk.putInt(28 + (stringCount * 4));
        newChunk.putInt(0);
        
        for (int offset : newOffsets) newChunk.putInt(offset);
        newChunk.put(newStringsStream.toByteArray());

        ByteArrayOutputStream finalFile = new ByteArrayOutputStream();
        ByteBuffer fileHeader = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        fileHeader.putInt(0x00080003); // AXML Magic
        fileHeader.putInt(original.length - chunkSize + newChunkSize);
        
        finalFile.write(fileHeader.array());
        finalFile.write(newChunk.array());
        finalFile.write(original, startPos + chunkSize, original.length - (startPos + chunkSize));
        
        return finalFile.toByteArray();
    }

    private static String readAxmlString(byte[] data, int pos, boolean isUtf8) {
        if (isUtf8) {
            // UTF-8 AXML has two counts: characters and bytes. We skip both.
            int charLen = data[pos]; // Approx
            int byteLen = data[pos + 1];
            return new String(data, pos + 2, byteLen, StandardCharsets.UTF_8);
        } else {
            // UTF-16 AXML has a 2-byte count
            int len = ((data[pos + 1] & 0xFF) << 8) | (data[pos] & 0xFF);
            return new String(data, pos + 2, len * 2, StandardCharsets.UTF_16LE);
        }
    }

    private static void writeAxmlString(ByteArrayOutputStream out, String s, boolean isUtf8) throws IOException {
        if (isUtf8) {
            byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
            out.write(s.length()); // Char count
            out.write(bytes.length); // Byte count
            out.write(bytes);
            out.write(0);
        } else {
            byte[] bytes = s.getBytes(StandardCharsets.UTF_16LE);
            int len = s.length();
            out.write(len & 0xFF);
            out.write((len >> 8) & 0xFF);
            out.write(bytes);
            out.write(0);
            out.write(0);
        }
    }
}
