import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate build keeps the Classic bundle and Pro styles independent.
// Relative asset URLs work both at /pro/ and on project-based GitHub Pages.
export default defineConfig({
  root: fileURLToPath(new URL('./pro', import.meta.url)),
  base: './',
  optimizeDeps: { include: ['@rtt/transport'] },
  publicDir: false,
  plugins: [react()],
  build: {
    commonjsOptions: { include: [/node_modules/, /shared\/transport\.cjs/] },
    outDir: fileURLToPath(new URL('./dist/pro', import.meta.url)),
    emptyOutDir: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
