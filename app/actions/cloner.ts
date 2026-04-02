
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execPromise = promisify(exec);

const CLONES_FILE = path.join(process.cwd(), "clones.json");

export async function getClones() {
  try {
    const data = await fs.readFile(CLONES_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export async function getInstalledApps() {
  try {
    const psCommand = `powershell "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion, InstallLocation, DisplayIcon | ConvertTo-Json"`;
    const { stdout } = await execPromise(psCommand);
    const rawApps = JSON.parse(stdout);
    
    // Filter out duplicates and items without names/paths
    const apps = rawApps.filter((a: any) => a.DisplayName && a.InstallLocation);
    
    // De-duplicate by DisplayName
    const uniqueApps = Array.from(new Map(apps.map((a: any) => [a.DisplayName, a])).values());
    
    return { success: true, apps: uniqueApps };
  } catch (error: any) {
    console.error("Discovery Error:", error);
    return { success: false, error: error.message };
  }
}

export async function uploadIcon(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file selected");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const iconsDir = path.join(process.cwd(), "public", "icons");
    await fs.mkdir(iconsDir, { recursive: true });

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = path.join(iconsDir, fileName);
    
    await writeFile(filePath, buffer);
    
    return { success: true, url: `/icons/${fileName}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function cloneApp(sourcePath: string, destName: string, iconUrl?: string) {
  const destPath = path.join("C:/AuraClones", destName);
  
  try {
    // 1. Ensure destination directory exists
    await fs.mkdir("C:/AuraClones", { recursive: true });

    // 2. Run Robocopy (Physical duplication)
    // /E copies subdirectories, including empty ones.
    // /MT:32 uses multi-threaded copying for speed.
    // NOTE: Robocopy returns exit codes 0-7 as success.
    const command = `robocopy "${sourcePath}" "${destPath}" /E /MT:32 /R:2 /W:5`;
    
    try {
      await execPromise(command);
    } catch (error: any) {
      // Robocopy exit code 1 means one or more files were copied successfully.
      // Exit code 0 means no files were copied (already up to date).
      if (error.code > 7) {
        throw new Error(`Robocopy failed with code ${error.code}: ${error.message}`);
      }
    }

    // 3. Setup Account Isolation (AppData redirection folder)
    const appDataPath = path.join(destPath, "_aura_data");
    await fs.mkdir(path.join(appDataPath, "Roaming"), { recursive: true });
    await fs.mkdir(path.join(appDataPath, "Local"), { recursive: true });

    // 4. Update Clones Manifest
    const clones = await getClones();
    const newClone = {
      id: Date.now(),
      name: destName,
      source: sourcePath,
      path: destPath,
      appData: appDataPath,
      icon: iconUrl || null,
      createdAt: new Date().toISOString(),
    };
    
    clones.push(newClone);
    await fs.writeFile(CLONES_FILE, JSON.stringify(clones, null, 2));

    return { success: true, clone: newClone };
  } catch (error: any) {
    console.error("Cloning Error:", error);
    return { success: false, error: error.message };
  }
}

export async function launchApp(cloneId: number, exeName: string) {
  const clones = await getClones();
  const clone = clones.find((c: any) => c.id === cloneId);

  if (!clone) throw new Error("Clone not found");

  const exePath = path.join(clone.path, exeName);
  
  // Launch with isolated environment variables
  const env = {
    ...process.env,
    APPDATA: path.join(clone.appData, "Roaming"),
    LOCALAPPDATA: path.join(clone.appData, "Local"),
    USERPROFILE: clone.appData,
    HOMEDRIVE: clone.appData.substring(0, 2),
    HOMEPATH: clone.appData.substring(clone.appData.indexOf('\\'))
  };

  const command = `start "" "${exePath}"`;
  
  try {
    await execPromise(command, { env });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- Android Deep Cloning (APK Repackaging) ---

const JAVA_PATH = "C:\\Users\\HP\\.antigravity\\exx86_64\\bin\\java.exe"; // Adjusted to found path
const APKTOOL_JAR = path.join(process.cwd(), "bin", "apktool.jar");
const SIGNER_JAR = path.join(process.cwd(), "bin", "uber-apk-signer.jar");

export async function deepCloneApp(apkBase64: string, newName: string, originalPackage: string) {
  const workDir = path.join(process.cwd(), "temp_clones", `${Date.now()}`);
  const apkPath = path.join(workDir, "original.apk");
  const unpackedDir = path.join(workDir, "unpacked");
  const newPackage = `${originalPackage}.aura.clone`;
  
  try {
    await fs.mkdir(workDir, { recursive: true });
    
    // 1. Write the original APK
    const buffer = Buffer.from(apkBase64, 'base64');
    await fs.writeFile(apkPath, buffer);
    
    // 2. Decompile
    console.log("Decompiling...");
    await execPromise(`"${JAVA_PATH}" -jar "${APKTOOL_JAR}" d "${apkPath}" -o "${unpackedDir}" -f`);
    
    // 3. Modify Manifest (Package Name)
    console.log("Modifying Manifest...");
    const manifestPath = path.join(unpackedDir, "AndroidManifest.xml");
    let manifest = await fs.readFile(manifestPath, "utf-8");
    manifest = manifest.replace(`package="${originalPackage}"`, `package="${newPackage}"`);
    
    // 4. Modify App Label (strings.xml)
    // We attempt to find the app_name string and replace it
    const stringsPath = path.join(unpackedDir, "res", "values", "strings.xml");
    try {
      let strings = await fs.readFile(stringsPath, "utf-8");
      // This is a naive regex replacement for the app_name string
      strings = strings.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${newName}</string>`);
      await fs.writeFile(stringsPath, strings);
    } catch (e) {
      console.warn("Could not find strings.xml to rename app label, skipping.");
    }
    
    await fs.writeFile(manifestPath, manifest);
    
    // 5. Rebuild
    console.log("Rebuilding...");
    const rebuiltApk = path.join(workDir, "rebuilt.apk");
    await execPromise(`"${JAVA_PATH}" -jar "${APKTOOL_JAR}" b "${unpackedDir}" -o "${rebuiltApk}"`);
    
    // 6. Sign
    console.log("Signing...");
    await execPromise(`"${JAVA_PATH}" -jar "${SIGNER_JAR}" --apks "${rebuiltApk}"`);
    
    // uber-apk-signer names the output automatically
    // It will be rebuilt-aligned-debugSigned.apk
    const signedApkName = "rebuilt-aligned-debugSigned.apk";
    const signedApkPath = path.join(workDir, signedApkName);
    
    // 7. Move to public for download
    const publicDir = path.join(process.cwd(), "public", "clones");
    await fs.mkdir(publicDir, { recursive: true });
    const finalName = `${Date.now()}_clone.apk`;
    const finalPath = path.join(publicDir, finalName);
    
    await fs.copyFile(signedApkPath, finalPath);
    
    // Cleanup temp files
    await fs.rm(workDir, { recursive: true, force: true });
    
    return { success: true, url: `/clones/${finalName}`, packageName: newPackage };
  } catch (error: any) {
    console.error("Deep Clone Error:", error);
    return { success: false, error: error.message };
  }
}
