import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: ['colyseus.js', '@colyseus/schema'],
  },
});
