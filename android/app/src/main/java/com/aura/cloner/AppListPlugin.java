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

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
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
                    appObj.put("apkPath", appInfo.sourceDir);
                    // Include split APKs if they exist (required for App Bundle installs)
                    if (pkgInfo.splitNames != null && appInfo.splitSourceDirs != null) {
                        JSArray splits = new JSArray();
                        for (String splitPath : appInfo.splitSourceDirs) {
                            splits.put(splitPath);
                        }
                        appObj.put("splitApkPaths", splits);
                    }
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
     * Streams the APK file to the desktop server in chunks via multipart/form-data.
     * This avoids loading the entire APK into memory (no more OOM crashes).
     * Supports files of any size (tested for 5GB+).
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void uploadApkToServer(PluginCall call) {
        call.setKeepAlive(true);

        String apkPath = call.getString("path");
        String serverUrl = call.getString("serverUrl");
        String newName = call.getString("newName");
        String originalPackage = call.getString("originalPackage");

        if (apkPath == null || serverUrl == null || newName == null || originalPackage == null) {
            call.reject("Missing required parameters: path, serverUrl, newName, originalPackage");
            return;
        }

        new Thread(() -> {
            File file = new File(apkPath);
            if (!file.exists()) {
                call.reject("APK not found at: " + apkPath);
                return;
            }

            String boundary = "----AuraBoundary" + System.currentTimeMillis();
            long fileLength = file.length();

            try {
                // ---- Notify upload starting ----
                JSObject progress = new JSObject();
                progress.put("stage", "uploading");
                progress.put("percent", 0);
                call.resolve(progress);

                URL url = new URL(serverUrl + "/api/cloner-upload");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setChunkedStreamingMode(256 * 1024); // 256KB chunks - no pre-allocation
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(600000); // 10 min for large apps
                conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                conn.setRequestProperty("X-New-Name", newName);
                conn.setRequestProperty("X-Original-Package", originalPackage);

                OutputStream out = new BufferedOutputStream(conn.getOutputStream());

                // Write text fields
                writeField(out, boundary, "newName", newName);
                writeField(out, boundary, "originalPackage", originalPackage);

                // Write APK file part (streamed)
                String fileHeader = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"apk\"; filename=\"base.apk\"\r\n"
                    + "Content-Type: application/vnd.android.package-archive\r\n\r\n";
                out.write(fileHeader.getBytes("UTF-8"));

                // ---- Stream file in 1MB chunks ----
                byte[] buffer = new byte[1024 * 1024]; // 1MB buffer
                FileInputStream fis = new FileInputStream(file);
                long bytesUploaded = 0;
                int read;
                int lastPercent = 0;

                while ((read = fis.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    bytesUploaded += read;

                    int currentPercent = (int) ((bytesUploaded * 100) / fileLength);
                    // Only notify every 5% to avoid flooding the bridge
                    if (currentPercent >= lastPercent + 5) {
                        lastPercent = currentPercent;
                        JSObject uploadProgress = new JSObject();
                        uploadProgress.put("stage", "uploading");
                        uploadProgress.put("percent", currentPercent);
                        call.resolve(uploadProgress);
                    }
                }
                fis.close();

                // End multipart
                out.write(("\r\n--" + boundary + "--\r\n").getBytes("UTF-8"));
                out.flush();
                out.close();

                // ---- Read server response ----
                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    InputStream responseStream = conn.getInputStream();
                    byte[] responseBytes = responseStream.readAllBytes();
                    String responseBody = new String(responseBytes, "UTF-8");

                    JSObject done = new JSObject();
                    done.put("stage", "done");
                    done.put("percent", 100);
                    done.put("response", responseBody);
                    call.resolve(done);
                    call.setKeepAlive(false);
                } else {
                    call.reject("Server returned error: " + responseCode);
                }

                conn.disconnect();
            } catch (Exception e) {
                call.reject("Upload failed: " + e.getMessage());
            }
        }).start();
    }

    private void writeField(OutputStream out, String boundary, String name, String value) throws IOException {
        String part = "--" + boundary + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
            + value + "\r\n";
        out.write(part.getBytes("UTF-8"));
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
                call.reject("APK file not found at: " + path);
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
