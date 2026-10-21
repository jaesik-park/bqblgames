import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bqblgames.zsquad',
  appName: 'Z-Squad',
  webDir: 'dist',
  backgroundColor: '#14171c',
  android: {
    backgroundColor: '#14171c',
  },
  ios: {
    backgroundColor: '#14171c',
    contentInset: 'never',
  },
};

export default config;
