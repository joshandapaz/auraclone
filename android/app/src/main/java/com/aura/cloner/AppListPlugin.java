package com.aura.cloner;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.*;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@CapacitorPlugin(name = "AppList")
public class AppListPlugin extends Plugin {

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            List<PackageInfo> packages = pm.getInstalledPackages(PackageManager.GET_META_DATA);
            JSArray appsArray = new JSArray();

            for (PackageInfo pkgInfo : packages) {
                ApplicationInfo appInfo = pkgInfo.applicationInfo;
                if (appInfo == null) continue;

                boolean isSystemApp = (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                boolean isUpdatedSystemApp = (appInfo.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
                boolean hasLauncher = pm.getLaunchIntentForPackage(appInfo.packageName) != null;

                if (hasLauncher || isUpdatedSystemApp || !isSystemApp) {
                    String label = pm.getApplicationLabel(appInfo).toString().trim();
                    if (label.isEmpty()) continue;

                    JSObject appObj = new JSObject();
                    appObj.put("packageName", appInfo.packageName);
                    appObj.put("name", label);
                    appObj.put("versionName", pkgInfo.versionName != null ? pkgInfo.versionName : "");
                    appObj.put("apkPath", appInfo.sourceDir); 
                    appsArray.put(appObj);
                }
            }

            JSObject ret = new JSObject();
            ret.put("apps", appsArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error fetching apps", e);
        }
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null) {
            call.reject("Must provide a package name");
            return;
        }

        try {
            PackageManager pm = getContext().getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                getContext().startActivity(launchIntent);
                call.resolve();
            } else {
                call.reject("App not found or not launchable");
            }
        } catch (Exception e) {
            call.reject("Error launching app", e);
        }
    }

    /**
     * Pure On-Device Cloning Orchestration.
     * Extracts -> Patches -> Signs -> Installs.
     * Removes all localhost dependencies.
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void cloneAppLocally(PluginCall call) {
        call.setKeepAlive(true);
        String sourcePath = call.getString("path");
        String oldPackage = call.getString("originalPackage");
        String newName = call.getString("newName");
        String newPackage = oldPackage + ".cloner.clone"; // Dynamic suffix

        if (sourcePath == null || oldPackage == null) {
            call.reject("Missing required parameters: path or originalPackage");
            return;
        }

        new Thread(() -> {
            try {
                // 1. Report Progress: Copying Manifest
                JSObject progress = new JSObject();
                progress.put("stage", "patching");
                progress.put("percent", 20);
                call.resolve(progress);

                File srcApk = new File(sourcePath);
                ZipFile zipFile = new ZipFile(srcApk);
                ZipEntry manifestEntry = zipFile.getEntry("AndroidManifest.xml");
                
                InputStream is = zipFile.getInputStream(manifestEntry);
                byte[] manifestBytes = new byte[(int) manifestEntry.getSize()];
                is.read(manifestBytes);
                is.close();
                zipFile.close();

                // 2. Patch binary XML
                byte[] patchedManifest = AxmlPatcher.patchPackageName(manifestBytes, oldPackage, newPackage);

                // 3. Report Progress: Signing
                JSObject signProgress = new JSObject();
                signProgress.put("stage", "signing");
                signProgress.put("percent", 60);
                call.resolve(signProgress);

                File outputApk = new File(getContext().getExternalCacheDir(), "clone_" + System.currentTimeMillis() + ".apk");
                ApkSigner.signApk(srcApk, outputApk, patchedManifest);

                // 4. Report Progress: Done
                JSObject done = new JSObject();
                done.put("stage", "done");
                done.put("percent", 100);
                done.put("localPath", outputApk.getAbsolutePath());
                done.put("newPackage", newPackage);
                call.resolve(done);
                call.setKeepAlive(false);

            } catch (Exception e) {
                call.reject("Cloning failed on-device: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Missing APK path");
            return;
        }

        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("APK file not found");
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                getContext(), 
                getContext().getPackageName() + ".fileprovider", 
                file
            );

            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            intent.setData(apkUri);
            intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Installation failed: " + e.getMessage());
        }
    }
}
