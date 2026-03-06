import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to the local dev-server during development.
      '/api': 'http://localhost:3001',
    },
  },
});
