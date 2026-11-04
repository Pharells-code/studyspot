import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (port 5173); every /api request is
// forwarded to the Express server (port 5000), so no address is hard-coded in the pages.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
});
