import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the build works on any sub-path
// and inside a Capacitor WebView.
export default defineConfig({
  base: './',
  server: { host: true },
});
