import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    // The LiveKit chunk is ~650 kB raw (~175 kB gzipped) and only loads inside a room.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Vendor code changes rarely: keep it in long-lived cacheable chunks.
        // LiveKit is only fetched when a room opens.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](livekit-client|@livekit)[\\/]/.test(id)) return 'livekit';
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
