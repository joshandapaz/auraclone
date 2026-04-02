package com.aura.cloner;

import android.util.Base64;

import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
import java.util.zip.*;

/**
 * On-Device APK Signer (JAR / v1 signing).
 *
 * Key correctness requirements this implementation satisfies:
 *
 *  1. CERT.RSA is a proper PKCS#7 / CMS SignedData DER block (not raw bytes).
 *  2. Each ZIP entry preserves the original compression method (STORED vs DEFLATED).
 *     resources.arsc and native libs MUST be STORED or Android rejects the APK.
 *  3. STORED entries carry correct CRC-32, size and compressedSize metadata,
 *     which ZipOutputStream requires before calling putNextEntry().
 *  4. signatureAlgorithm in SignerInfo uses rsaEncryption (OID_RSA), not
 *     sha256WithRSAEncryption — matching the JAR-signing spec (RFC 2315).
 *  5. certificates [0] IMPLICIT correctly wraps the full Certificate DER.
 */
public class ApkSigner {

    // -------------------------------------------------------------------------
    // OID value bytes (inner content only, without the 0x06 tag)
    // -------------------------------------------------------------------------
    private static final byte[] OID_RSA         = h("2a 86 48 86 f7 0d 01 01 01");
    private static final byte[] OID_SHA256_RSA  = h("2a 86 48 86 f7 0d 01 01 0b");
    private static final byte[] OID_SHA256      = h("60 86 48 01 65 03 04 02 01");
    private static final byte[] OID_SIGNED_DATA = h("2a 86 48 86 f7 0d 01 07 02");
    private static final byte[] OID_DATA        = h("2a 86 48 86 f7 0d 01 07 01");
    private static final byte[] OID_CN          = h("55 04 03");

    // -------------------------------------------------------------------------
    // Entry record — keeps content + original ZIP metadata together
    // -------------------------------------------------------------------------
    private static class Entry {
        final String  name;
        final byte[]  data;
        final int     method;   // ZipEntry.STORED or ZipEntry.DEFLATED
        final long    crc;      // original CRC (needed for STORED entries)

        Entry(String name, byte[] data, int method, long crc) {
            this.name   = name;
            this.data   = data;
            this.method = method;
            this.crc    = crc;
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public static void signApk(File sourceApk, File targetApk, byte[] modifiedManifest)
            throws Exception {

        /* 1. Generate ephemeral RSA-2048 key pair */
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048, new SecureRandom());
        KeyPair kp  = kpg.generateKeyPair();
        RSAPublicKey pub = (RSAPublicKey) kp.getPublic();

        BigInteger serial = new BigInteger(64, new SecureRandom()).abs().add(BigInteger.ONE);
        long now = System.currentTimeMillis();
        long exp = now + 30L * 365 * 24 * 3600 * 1000; // 30 years

        /* 2. Build self-signed X.509 certificate */
        byte[] issuer = buildName("Aura Cloner");
        byte[] spki   = buildSPKI(pub);
        byte[] tbs    = buildTBS(serial, issuer, now, exp, spki);

        Signature certSig = Signature.getInstance("SHA256withRSA");
        certSig.initSign(kp.getPrivate());
        certSig.update(tbs);
        byte[] certDer = seq(tbs, algSha256Rsa(), bitStr(certSig.sign()));

        /* 3. Collect APK entries — strip META-INF, preserve compression info */
        ZipFile zf = new ZipFile(sourceApk);
        List<Entry> entries = new ArrayList<>();

        Enumeration<? extends ZipEntry> en = zf.entries();
        while (en.hasMoreElements()) {
            ZipEntry ze = en.nextElement();
            if (ze.getName().startsWith("META-INF/")) continue;

            byte[] data;
            long   crc;
            int    method = ze.getMethod(); // STORED=0, DEFLATED=8

            if (ze.getName().equals("AndroidManifest.xml")) {
                data = modifiedManifest;
                // Recalculate CRC for the patched manifest
                CRC32 c32 = new CRC32();
                c32.update(data);
                crc = c32.getValue();
                // Always store the manifest uncompressed so PackageParser can mmap it
                method = ZipEntry.STORED;
            } else {
                data = readEntry(zf, ze);
                crc  = ze.getCrc(); // use original CRC (already verified by ZipFile)
            }

            entries.add(new Entry(ze.getName(), data, method, crc));
        }
        zf.close();

        /* 4. Write all entries preserving compression method */
        ZipOutputStream zos = new ZipOutputStream(
                new BufferedOutputStream(new FileOutputStream(targetApk)));

        for (Entry e : entries) {
            ZipEntry out = new ZipEntry(e.name);
            out.setMethod(e.method);

            if (e.method == ZipEntry.STORED) {
                // ZipOutputStream requires CRC, size, and compressedSize to be
                // set BEFORE putNextEntry() for STORED entries — otherwise it throws.
                out.setSize(e.data.length);
                out.setCompressedSize(e.data.length);
                out.setCrc(e.crc);
            }

            zos.putNextEntry(out);
            zos.write(e.data);
            zos.closeEntry();
        }

        /* 5. Build MANIFEST.MF */
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        StringBuilder mfSb = new StringBuilder(
                "Manifest-Version: 1.0\r\nCreated-By: 1.0 (Aura Cloner)\r\n\r\n");
        for (Entry e : entries) {
            sha256.reset();
            mfSb.append("Name: ").append(e.name).append("\r\n");
            mfSb.append("SHA-256-Digest: ")
                    .append(Base64.encodeToString(sha256.digest(e.data), Base64.NO_WRAP))
                    .append("\r\n\r\n");
        }
        byte[] mfBytes = mfSb.toString().getBytes(StandardCharsets.UTF_8);
        addEntry(zos, "META-INF/MANIFEST.MF", mfBytes);

        /* 6. Build CERT.SF */
        sha256.reset();
        byte[] sfBytes = ("Signature-Version: 1.0\r\n"
                + "Created-By: 1.0 (Aura Cloner)\r\n"
                + "SHA-256-Digest-Manifest: "
                + Base64.encodeToString(sha256.digest(mfBytes), Base64.NO_WRAP)
                + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        addEntry(zos, "META-INF/CERT.SF", sfBytes);

        /* 7. Sign CERT.SF */
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(kp.getPrivate());
        sig.update(sfBytes);
        byte[] rawSig = sig.sign();

        /* 8. PKCS#7 SignedData block → CERT.RSA */
        addEntry(zos, "META-INF/CERT.RSA", buildPkcs7(rawSig, certDer, issuer, serial));

        zos.close();
    }

    // -------------------------------------------------------------------------
    // PKCS#7 / CMS SignedData (DER-encoded)
    // -------------------------------------------------------------------------

    private static byte[] buildPkcs7(byte[] sig, byte[] certDer,
            byte[] issuer, BigInteger serial) throws IOException {

        /*
         * SignerInfo per RFC 2315 §9.2:
         *   version                  INTEGER (1)
         *   issuerAndSerialNumber    IssuerAndSerialNumber
         *   digestAlgorithm          AlgorithmIdentifier (SHA-256)
         *   signatureAlgorithm       AlgorithmIdentifier (rsaEncryption — NOT sha256WithRSA)
         *   signature                OCTET STRING
         */
        byte[] signerInfo = seq(
                intDer(1),
                seq(issuer, intDer(serial)),
                algSha256(),   // digestAlgorithm
                algRsa(),      // signatureAlgorithm = rsaEncryption
                octet(sig)
        );

        /*
         * SignedData:
         *   version            1
         *   digestAlgorithms   SET { SHA-256 }
         *   contentInfo        { data OID, no content = detached }
         *   certificates [0]   IMPLICIT — A0 wraps the full Certificate DER
         *   signerInfos        SET { signerInfo }
         */
        byte[] signedData = seq(
                intDer(1),
                set(algSha256()),
                seq(oid(OID_DATA)),
                tlv(0xA0, certDer),  // [0] IMPLICIT: wrap certDer with A0 tag
                set(signerInfo)
        );

        // ContentInfo = SEQUENCE { signedData OID, [0] EXPLICIT SignedData }
        return seq(oid(OID_SIGNED_DATA), tlv(0xA0, signedData));
    }

    // -------------------------------------------------------------------------
    // X.509 Certificate builders
    // -------------------------------------------------------------------------

    private static byte[] buildName(String cn) throws IOException {
        return seq(set(seq(oid(OID_CN), utf8(cn))));
    }

    private static byte[] buildSPKI(RSAPublicKey pub) throws IOException {
        byte[] rsaKey = seq(intDer(pub.getModulus()), intDer(pub.getPublicExponent()));
        return seq(seq(oid(OID_RSA), nul()), bitStr(rsaKey));
    }

    private static byte[] buildTBS(BigInteger serial, byte[] name,
            long notBefore, long notAfter, byte[] spki) throws IOException {
        return seq(
                tlv(0xA0, intDer(2)),                        // [0] EXPLICIT version v3
                intDer(serial),
                algSha256Rsa(),
                name,
                seq(utcTime(notBefore), utcTime(notAfter)),
                name,   // subject = issuer (self-signed)
                spki
        );
    }

    // -------------------------------------------------------------------------
    // AlgorithmIdentifier helpers
    // -------------------------------------------------------------------------

    private static byte[] algSha256()    throws IOException { return seq(oid(OID_SHA256),    nul()); }
    private static byte[] algSha256Rsa() throws IOException { return seq(oid(OID_SHA256_RSA), nul()); }
    private static byte[] algRsa()       throws IOException { return seq(oid(OID_RSA),        nul()); }

    // -------------------------------------------------------------------------
    // ASN.1 / DER primitives
    // -------------------------------------------------------------------------

    private static byte[] tlv(int tag, byte[] value) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(tag);
        writeLen(b, value.length);
        try { b.write(value); } catch (IOException ignored) {}
        return b.toByteArray();
    }

    private static void writeLen(ByteArrayOutputStream b, int n) {
        if (n < 0x80)       { b.write(n); }
        else if (n < 0x100) { b.write(0x81); b.write(n); }
        else                { b.write(0x82); b.write((n >> 8) & 0xFF); b.write(n & 0xFF); }
    }

    private static byte[] cat(byte[]... parts) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (byte[] p : parts) b.write(p);
        return b.toByteArray();
    }

    private static byte[] seq(byte[]... parts) throws IOException { return tlv(0x30, cat(parts)); }
    private static byte[] set(byte[]... parts) throws IOException { return tlv(0x31, cat(parts)); }
    private static byte[] oid(byte[] v)                           { return tlv(0x06, v); }
    private static byte[] nul()                                   { return new byte[]{0x05, 0x00}; }
    private static byte[] octet(byte[] v)                         { return tlv(0x04, v); }
    private static byte[] utf8(String s) { return tlv(0x0C, s.getBytes(StandardCharsets.UTF_8)); }

    private static byte[] intDer(BigInteger n) { return tlv(0x02, n.toByteArray()); }
    private static byte[] intDer(int n)        { return intDer(BigInteger.valueOf(n)); }

    private static byte[] bitStr(byte[] v) {
        byte[] b = new byte[v.length + 1];
        b[0] = 0x00; // zero unused bits
        System.arraycopy(v, 0, b, 1, v.length);
        return tlv(0x03, b);
    }

    private static byte[] utcTime(long millis) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.setTimeInMillis(millis);
        String s = String.format(Locale.US, "%02d%02d%02d%02d%02d%02dZ",
                c.get(Calendar.YEAR) % 100,
                c.get(Calendar.MONTH) + 1,
                c.get(Calendar.DAY_OF_MONTH),
                c.get(Calendar.HOUR_OF_DAY),
                c.get(Calendar.MINUTE),
                c.get(Calendar.SECOND));
        return tlv(0x17, s.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] h(String hex) {
        String[] parts = hex.split("\\s+");
        byte[] out = new byte[parts.length];
        for (int i = 0; i < parts.length; i++)
            out[i] = (byte) Integer.parseInt(parts[i], 16);
        return out;
    }

    // -------------------------------------------------------------------------
    // ZIP helpers
    // -------------------------------------------------------------------------

    private static void addEntry(ZipOutputStream zos, String name, byte[] data)
            throws IOException {
        ZipEntry ze = new ZipEntry(name);
        // META-INF files are always DEFLATED (compressed)
        ze.setMethod(ZipEntry.DEFLATED);
        zos.putNextEntry(ze);
        zos.write(data);
        zos.closeEntry();
    }

    private static byte[] readEntry(ZipFile zf, ZipEntry ze) throws IOException {
        try (DataInputStream dis = new DataInputStream(zf.getInputStream(ze))) {
            byte[] buf = new byte[(int) ze.getSize()];
            dis.readFully(buf);
            return buf;
        }
    }
}
