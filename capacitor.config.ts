import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.nexus.mesh',
  appName: 'NEXUS',
  webDir: 'frontend/dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
