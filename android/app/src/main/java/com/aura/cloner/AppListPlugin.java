package com.aura.cloner;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

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
                    appObj.put("apkPath", appInfo.sourceDir); // Added for cloning
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

    @PluginMethod
    public void getApkBase64(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }

        try {
            java.io.File file = new java.io.File(path);
            if (!file.exists()) {
                call.reject("File not found at: " + path);
                return;
            }

            long length = file.length();
            if (length > 150 * 1024 * 1024) { // 150MB limit for base64 transfer
                call.reject("APK is too large for transmission (" + (length / 1024 / 1024) + "MB). Limit is 150MB.");
                return;
            }

            byte[] bytes = new byte[(int) length];
            java.io.FileInputStream fis = new java.io.FileInputStream(file);
            fis.read(bytes);
            fis.close();

            String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("base64", base64);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error reading APK: " + e.getMessage());
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Missing APK path");
            return;
        }

        try {
            java.io.File file = new java.io.File(path);
            if (!file.exists()) {
                call.reject("APK file not found");
                return;
            }

            android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
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
