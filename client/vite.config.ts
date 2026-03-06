import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Output to repo root /dist so Vercel finds it at the default location.
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to the local dev-server during development.
      '/api': 'http://localhost:3001',
    },
  },
});
