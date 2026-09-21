import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '..'),
  publicDir: resolve(__dirname, '../dist'),
  server: {
    port: 3000,
    open: true,
    https: false, // For localhost testing (Web Push works on localhost HTTP)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../dist-example'),
    emptyOutDir: true,
  },
});
