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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.io.DataInputStream;
import android.content.pm.PackageInstaller;
import android.app.PendingIntent;

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
        String oldPackage = call.getString("originalPackage");
        String newName = call.getString("newName");
        String newPackage = oldPackage + ".cloner.clone"; // Dynamic suffix

        if (oldPackage == null) {
            call.reject("Missing required parameter: originalPackage");
            return;
        }

        new Thread(() -> {
            try {
                // 1. Report Progress
                JSObject progress = new JSObject();
                progress.put("stage", "fetching");
                progress.put("percent", 10);
                call.resolve(progress);

                PackageManager pm = getContext().getPackageManager();
                ApplicationInfo appInfo = pm.getApplicationInfo(oldPackage, 0);

                List<String> allSrcPaths = new ArrayList<>();
                allSrcPaths.add(appInfo.sourceDir);
                if (appInfo.splitSourceDirs != null) {
                    allSrcPaths.addAll(Arrays.asList(appInfo.splitSourceDirs));
                }

                // Generate a single signing identity for the entire app bundle
                ApkSigner.Identity identity = ApkSigner.generateIdentity();
                JSArray outPaths = new JSArray();

                for (int i = 0; i < allSrcPaths.size(); i++) {
                    String srcPath = allSrcPaths.get(i);
                    File srcApk = new File(srcPath);
                    
                    // Progress
                    JSObject iterProgress = new JSObject();
                    iterProgress.put("stage", "patching_and_signing");
                    iterProgress.put("percent", 20 + (int) (((i + 1) / (float) allSrcPaths.size()) * 70));
                    call.resolve(iterProgress);

                    ZipFile zipFile = new ZipFile(srcApk);
                    ZipEntry manifestEntry = zipFile.getEntry("AndroidManifest.xml");
                    
                    byte[] manifestBytes = null;
                    if (manifestEntry != null) {
                        DataInputStream dis = new DataInputStream(zipFile.getInputStream(manifestEntry));
                        manifestBytes = new byte[(int) manifestEntry.getSize()];
                        dis.readFully(manifestBytes);
                        dis.close();
                    }
                    zipFile.close();

                    byte[] patchedManifest = manifestBytes;
                    if (manifestBytes != null) {
                        try {
                            patchedManifest = AxmlPatcher.patchPackageName(manifestBytes, oldPackage, newPackage);
                        } catch (IOException e) {
                            // If string pool fails or oldPackage not found, keep original
                        }
                    }

                    File outputApk = new File(getContext().getExternalCacheDir(), "clone_" + i + "_" + System.currentTimeMillis() + ".apk");
                    ApkSigner.signApk(srcApk, outputApk, patchedManifest, identity);
                    outPaths.put(outputApk.getAbsolutePath());
                }

                // 4. Report Progress: Done
                JSObject done = new JSObject();
                done.put("stage", "done");
                done.put("percent", 100);
                done.put("localPaths", outPaths);
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
        JSArray pathsArray = call.getArray("paths");
        
        // Backward compatibility for single path
        if (pathsArray == null) {
            String singlePath = call.getString("path");
            if (singlePath == null) {
                call.reject("Missing APK paths");
                return;
            }
            pathsArray = new JSArray();
            pathsArray.put(singlePath);
        }

        try {
            PackageInstaller packageInstaller = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            int sessionId = packageInstaller.createSession(params);

            try (PackageInstaller.Session session = packageInstaller.openSession(sessionId)) {
                for (int i = 0; i < pathsArray.length(); i++) {
                    String path = pathsArray.getString(i);
                    File file = new File(path);
                    if (!file.exists()) continue;

                    try (InputStream in = new FileInputStream(file);
                         OutputStream out = session.openWrite(file.getName(), 0, file.length())) {
                        byte[] buffer = new byte[65536];
                        int c;
                        while ((c = in.read(buffer)) != -1) {
                            out.write(buffer, 0, c);
                        }
                        session.fsync(out);
                    }
                }

                Intent intent = new Intent("com.aura.cloner.INSTALL_COMPLETE");
                intent.setPackage(getContext().getPackageName());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    flags |= PendingIntent.FLAG_MUTABLE;
                }
                PendingIntent pendingIntent = PendingIntent.getBroadcast(getContext(), 0, intent, flags);
                session.commit(pendingIntent.getIntentSender());
                call.resolve();
            }
        } catch (Exception e) {
            call.reject("Session Installation failed: " + e.getMessage());
        }
    }
}
