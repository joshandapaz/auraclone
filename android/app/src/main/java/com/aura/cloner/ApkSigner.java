package com.aura.cloner;

import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
import java.util.zip.*;

import com.android.apksig.ApkSigner.SignerConfig;

class CountingOutputStream extends FilterOutputStream {
    public long count = 0;
    public CountingOutputStream(OutputStream out) { super(out); }
    @Override public void write(int b) throws IOException { out.write(b); count++; }
    @Override public void write(byte[] b, int off, int len) throws IOException { out.write(b, off, len); count += len; }
}

/**
 * On-Device APK Signer using Google's official apksig library.
 *
 * This implementation fixes "package appears to be invalid" on Android 11+
 * which requires APK Signature Scheme v2/v3 signatures.
 */
public class ApkSigner {

    private static final byte[] OID_RSA         = h("2a 86 48 86 f7 0d 01 01 01");
    private static final byte[] OID_SHA256_RSA  = h("2a 86 48 86 f7 0d 01 01 0b");
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
    // Identity - Represents a single signing identity for the cloning session
    // -------------------------------------------------------------------------
    public static class Identity {
        public final PrivateKey privateKey;
        public final X509Certificate certificate;

        public Identity(PrivateKey privateKey, X509Certificate certificate) {
            this.privateKey = privateKey;
            this.certificate = certificate;
        }
    }

    public static Identity generateIdentity() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048, new SecureRandom());
        KeyPair kp  = kpg.generateKeyPair();
        RSAPublicKey pub = (RSAPublicKey) kp.getPublic();

        BigInteger serial = new BigInteger(64, new SecureRandom()).abs().add(BigInteger.ONE);
        long now = System.currentTimeMillis();
        long exp = now + 30L * 365 * 24 * 3600 * 1000; // 30 years

        byte[] issuer = buildName("Aura Cloner");
        byte[] spki   = buildSPKI(pub);
        byte[] tbs    = buildTBS(serial, issuer, now, exp, spki);

        Signature certSig = Signature.getInstance("SHA256withRSA");
        certSig.initSign(kp.getPrivate());
        certSig.update(tbs);
        byte[] certDer = seq(tbs, algSha256Rsa(), bitStr(certSig.sign()));

        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        X509Certificate cert = (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(certDer));
        
        return new Identity(kp.getPrivate(), cert);
    }

    public static void signApk(File sourceApk, File targetApk, byte[] modifiedManifest, Identity identity)
            throws Exception {

        /* 1. Create an intermediate unsigned APK */
        File unsignedApk = new File(targetApk.getParentFile(), "unsigned_" + targetApk.getName());

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
                crc  = ze.getCrc(); // use original CRC
            }

            entries.add(new Entry(ze.getName(), data, method, crc));
        }
        zf.close();

        /* Write all entries preserving compression method & Zipalign */
        CountingOutputStream cos = new CountingOutputStream(
                new BufferedOutputStream(new FileOutputStream(unsignedApk), 65536));
        ZipOutputStream zos = new ZipOutputStream(cos);

        for (Entry e : entries) {
            zos.flush(); // ensure cos.count reflects exact written bytes so far
            long headerStart = cos.count;

            ZipEntry out = new ZipEntry(e.name);
            out.setMethod(e.method);
            out.setTime(0); // prevent ZIP64 or extended timestamp variation

            if (e.method == ZipEntry.STORED) {
                out.setSize(e.data.length);
                out.setCompressedSize(e.data.length);
                out.setCrc(e.crc);
            }

            // Calculate precise padding for Zipalign
            int alignment = (e.name.endsWith(".so")) ? 4096 : 4;
            int headerSizeExceptExtra = 30 + e.name.getBytes(StandardCharsets.UTF_8).length;
            
            // By default, if time=0, ZipOutputStream adds no extra field, so original extraLen=0.
            int offsetInsidePage = (int) ((headerStart + headerSizeExceptExtra) % alignment);
            int paddingParams = (alignment - offsetInsidePage) % alignment;
            
            // To use standard ZIP alignment, we use an extra field ID 0xD935 (Android Zipalign).
            // Format: ID (2 bytes) + Size (2 bytes) + Data (padding - 4 bytes)
            if (paddingParams < 4 && paddingParams > 0) {
                paddingParams += alignment; // Must be at least 4 bytes to hold the Extra header
            }

            if (paddingParams >= 4) {
                byte[] extra = new byte[paddingParams];
                extra[0] = (byte) 0x35;
                extra[1] = (byte) 0xD9;
                int dataSize = paddingParams - 4;
                extra[2] = (byte) (dataSize & 0xFF);
                extra[3] = (byte) ((dataSize >> 8) & 0xFF);
                out.setExtra(extra);
            }

            zos.putNextEntry(out);
            zos.write(e.data);
            zos.closeEntry();
        }
        zos.close();

        /* 2. Sign the intermediate APK using official com.android.apksig.ApkSigner */
        SignerConfig config = new SignerConfig.Builder(
                "aura", identity.privateKey, Collections.singletonList(identity.certificate)
        ).build();

        com.android.apksig.ApkSigner signer = new com.android.apksig.ApkSigner.Builder(Collections.singletonList(config))
                .setInputApk(unsignedApk)
                .setOutputApk(targetApk)
                .setV1SigningEnabled(true)
                .setV2SigningEnabled(true)
                .setV3SigningEnabled(true)
                .build();

        signer.sign();

        /* Clean up intermediate file */
        unsignedApk.delete();
    }

    // -------------------------------------------------------------------------
    // X.509 Certificate building (DER-encoded)
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

    private static byte[] algSha256Rsa() throws IOException { return seq(oid(OID_SHA256_RSA), nul()); }

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

    private static byte[] readEntry(ZipFile zf, ZipEntry ze) throws IOException {
        try (DataInputStream dis = new DataInputStream(zf.getInputStream(ze))) {
            byte[] buf = new byte[(int) ze.getSize()];
            dis.readFully(buf);
            return buf;
        }
    }
}
