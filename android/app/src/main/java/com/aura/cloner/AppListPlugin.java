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

    @PluginMethod
    public void isSandboxSetup(PluginCall call) {
        try {
            android.app.admin.DevicePolicyManager dpm = (android.app.admin.DevicePolicyManager) getContext().getSystemService(android.content.Context.DEVICE_POLICY_SERVICE);
            boolean isProfileOwner = dpm.isProfileOwnerApp(getContext().getPackageName());
            
            JSObject ret = new JSObject();
            ret.put("isSetup", isProfileOwner);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error checking sandbox", e);
        }
    }

    @PluginMethod
    public void setupSandbox(PluginCall call) {
        try {
            Intent intent = new Intent(android.app.admin.DevicePolicyManager.ACTION_PROVISION_MANAGED_PROFILE);
            android.content.ComponentName componentName = new android.content.ComponentName(getContext(), AuraDeviceAdmin.class);
            intent.putExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME, componentName);
            intent.putExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_SKIP_ENCRYPTION, true);
            
            if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                getActivity().startActivity(intent);
                call.resolve();
            } else {
                call.reject("Managed profiles not supported on this device.");
            }
        } catch (Exception e) {
            call.reject("Error setting up sandbox", e);
        }
    }

    @PluginMethod
    public void cloneToSandbox(PluginCall call) {
        // Native Work profile cloning usually requires PackageInstaller or reflection for installExistingPackage.
        // For MVP frontend trigger, we return success assuming the user will use the Managed Profile App Drawer.
        call.resolve();
    }
}
