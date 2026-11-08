import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skalaprioritas.app',
  appName: 'Skala Prioritas',
  webDir: 'public',
  server: {
    url: 'https://www.skala-prioritas.com',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Paksa WebView memakai lebar layar perangkat sesungguhnya
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SkalaApp/2.1'
  }
};

export default config;
