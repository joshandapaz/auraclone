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
            // GET_META_DATA | GET_PERMISSIONS gives us full app info
            List<PackageInfo> packages = pm.getInstalledPackages(PackageManager.GET_META_DATA);
            JSArray appsArray = new JSArray();

            for (PackageInfo pkgInfo : packages) {
                ApplicationInfo appInfo = pkgInfo.applicationInfo;
                if (appInfo == null) continue;

                boolean isSystemApp = (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                boolean isUpdatedSystemApp = (appInfo.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
                boolean hasLauncher = pm.getLaunchIntentForPackage(appInfo.packageName) != null;

                // Include: user-installed apps, updated system apps, OR anything with a launcher
                // Exclude: pure system apps with no launcher (they weren't installed by the user)
                if (hasLauncher || isUpdatedSystemApp || !isSystemApp) {
                    // Skip framework packages that have no name
                    String label = pm.getApplicationLabel(appInfo).toString().trim();
                    if (label.isEmpty()) continue;

                    JSObject appObj = new JSObject();
                    appObj.put("packageName", appInfo.packageName);
                    appObj.put("name", label);
                    appObj.put("versionName", pkgInfo.versionName != null ? pkgInfo.versionName : "");
                    appObj.put("hasLauncher", hasLauncher);
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
}
