package com.aura.cloner;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

public class AuraDeviceAdmin extends DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "Aura Work Profile Enabled", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "Aura Work Profile Disabled", Toast.LENGTH_SHORT).show();
    }
    
    @Override
    public void onProfileProvisioningComplete(Context context, Intent intent) {
        // Called when the managed profile has been successfully provisioned.
        // We could launch our app inside the profile here if needed.
    }
}
