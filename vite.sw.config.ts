import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    // The package build runs after the main library build. Keep the main
    // entrypoints in dist so the published files match package.json exports.
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'service-worker/index.ts'),
      name: 'PushPlatformServiceWorker',
      formats: ['es', 'cjs'],
      fileName: (format) => {
        if (format === 'es') return 'service-worker.js';
        if (format === 'cjs') return 'service-worker.cjs';
        return `service-worker.${format}.js`;
      },
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
  plugins: [
    dts({
      include: ['service-worker/**/*'],
      outDir: 'dist',
    }),
  ],
});
