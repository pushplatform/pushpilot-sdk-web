import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
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
