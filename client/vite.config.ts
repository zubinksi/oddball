import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone client config (used for `vite build` and type-checking).
// In development the client is served by the Express server via Vite
// middleware mode, so this config's `server` block is not used then.
export default defineConfig({
  plugins: [react()],
});
