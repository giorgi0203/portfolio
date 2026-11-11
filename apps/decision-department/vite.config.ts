import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(__dirname),
  base: '/',
  build: {
    outDir: resolve(__dirname, '../../dist/apps/decision-department/public'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 4210,
    proxy: {
      '/api': 'http://127.0.0.1:3360',
      '/health': 'http://127.0.0.1:3360',
    },
  },
});
