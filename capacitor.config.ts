import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skalaprioritas.app',
  appName: 'Skala Prioritas',
  webDir: 'public',
  server: {
    url: 'https://www.skala-prioritas.com',
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Pertahankan User-Agent WebView asli perangkat sambil menyertakan token SkalaApp/2.1
    appendUserAgent: 'SkalaApp/2.1'
  }
};

export default config;
