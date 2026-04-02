import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aura.cloner',
  appName: 'Aura Mobile',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
