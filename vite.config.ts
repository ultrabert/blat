import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    port: 5173,
    // IPv4 + IPv6. Default Vite 8 binds [::1] only, so 127.0.0.1:5173 fails in Cloud Agent browsers.
    host: true,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['colyseus.js', '@colyseus/schema'],
  },
});
