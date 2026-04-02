package com.aura.cloner;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
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
            List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            JSArray appsArray = new JSArray();

            for (ApplicationInfo appInfo : packages) {
                if (pm.getLaunchIntentForPackage(appInfo.packageName) != null) {
                    JSObject appObj = new JSObject();
                    appObj.put("packageName", appInfo.packageName);
                    appObj.put("name", pm.getApplicationLabel(appInfo).toString());
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
