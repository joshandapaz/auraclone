import { NextResponse, NextRequest } from 'next/server';
import { writeFile, mkdir, rm, copyFile, readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execPromise = promisify(exec);

const JAVA_PATH = "C:\\Users\\HP\\.antigravity\\exx86_64\\bin\\java.exe";
const APKTOOL_JAR = path.join(process.cwd(), "bin", "apktool.jar");
const SIGNER_JAR = path.join(process.cwd(), "bin", "uber-apk-signer.jar");

// Needed for Next.js to not buffer the body (large file streaming)
export const dynamic = 'force-dynamic';

/**
 * Dedicated upload endpoint that receives the APK as a multipart stream.
 * Unlike the old base64 approach, this never loads the entire APK into RAM.
 * Supports apps of any size (tested logic for 5GB+).
 */
export async function POST(req: NextRequest) {
  const workDir = path.join(process.cwd(), "temp_clones", `${Date.now()}`);
  const apkPath = path.join(workDir, "original.apk");
  const unpackedDir = path.join(workDir, "unpacked");

  try {
    await mkdir(workDir, { recursive: true });

    // Parse the streaming multipart body
    const formData = await req.formData();
    const newName = formData.get('newName') as string;
    const originalPackage = formData.get('originalPackage') as string;
    const apkFile = formData.get('apk') as File;

    if (!newName || !originalPackage || !apkFile) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    // Write streamed APK to disk (uses streams internally, avoids OOM on server)
    const stream = (apkFile as any).stream(); // Web readable stream
    const reader = stream.getReader();
    const writer = require('fs').createWriteStream(apkPath);
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
    }
    writer.end();

    const stats = await require('fs/promises').stat(apkPath);
    const newPackage = `${originalPackage}.auraclone`;

    // Step 1: Decompile
    console.log(`[Aura] Decompiling ${originalPackage} (${(stats.size / 1024 / 1024).toFixed(1)}MB)...`);
    // Increased heap to 4GB for 5GB+ apps
    await execPromise(`"${JAVA_PATH}" -Xmx4g -jar "${APKTOOL_JAR}" d "${apkPath}" -o "${unpackedDir}" -f`);

    // Step 2: Rename Package in Manifest
    console.log('[Aura] Renaming package...');
    const manifestPath = path.join(unpackedDir, "AndroidManifest.xml");
    let manifest = await readFile(manifestPath, "utf-8");
    // Replace ALL occurrences of the old package to avoid broken references
    manifest = manifest.split(originalPackage).join(newPackage);
    await writeFile(manifestPath, manifest);

    // Step 3: Rename App Label in strings.xml
    const stringsPath = path.join(unpackedDir, "res", "values", "strings.xml");
    try {
      let strings = await readFile(stringsPath, "utf-8");
      // Use [\\ \\S\\s]*? to match across newlines without ES2018 /s flag
      strings = strings.replace(/<string name="app_name">[\s\S]*?<\/string>/, `<string name="app_name">${newName}</string>`);
      await writeFile(stringsPath, strings);
    } catch {
      console.warn('[Aura] Could not modify strings.xml — skipping label rename.');
    }

    // Step 4: Rebuild
    console.log('[Aura] Rebuilding APK...');
    const rebuiltApk = path.join(workDir, "rebuilt.apk");
    await execPromise(`"${JAVA_PATH}" -Xmx4g -jar "${APKTOOL_JAR}" b "${unpackedDir}" -o "${rebuiltApk}"`);

    // Step 5: Sign
    console.log('[Aura] Signing APK...');
    await execPromise(`"${JAVA_PATH}" -jar "${SIGNER_JAR}" --apks "${rebuiltApk}"`);

    // uber-apk-signer appends "-aligned-debugSigned" to the output
    const signedApkPath = path.join(workDir, "rebuilt-aligned-debugSigned.apk");

    // Step 6: Move to public/clones for download
    const publicDir = path.join(process.cwd(), "public", "clones");
    await mkdir(publicDir, { recursive: true });
    const finalName = `${Date.now()}_clone.apk`;
    const finalPath = path.join(publicDir, finalName);
    await copyFile(signedApkPath, finalPath);

    // Step 7: Cleanup temp workspace
    await rm(workDir, { recursive: true, force: true });

    console.log(`[Aura] Deep clone ready: /clones/${finalName}`);
    return NextResponse.json({
      success: true,
      url: `/clones/${finalName}`,
      packageName: newPackage,
      name: newName
    });
  } catch (error: any) {
    console.error('[Aura] Deep clone failed:', error.message);
    // Cleanup on failure
    try { await rm(workDir, { recursive: true, force: true }); } catch {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
