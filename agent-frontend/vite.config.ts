import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            const url = req.url ?? '';
            if (url.includes('view=updates') || proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/health': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
