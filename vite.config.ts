import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: ['colyseus.js', '@colyseus/schema'],
  },
});
