import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../../dist/apps/split-supra'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 4213,
    proxy: { '/api': 'http://127.0.0.1:3360' },
  },
});
