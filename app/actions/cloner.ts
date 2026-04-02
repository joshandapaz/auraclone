"use server";

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
  };

  const command = `start "" "${exePath}"`;
  
  try {
    await execPromise(command, { env });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
