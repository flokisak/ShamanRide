import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      swSrc: 'public/sw.js',
      manifest: {
        name: 'Need For Taxi',
        short_name: 'NFTaxi',
        description: 'Fast and furious taxi driver app',
        theme_color: '#2e3440', // Nord polar-1
        background_color: '#2e3440', // Nord polar-1
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    rollupOptions: {
      external: ['@supabase/supabase-js']
    }
  },
  optimizeDeps: {
    exclude: ['@supabase/supabase-js']
  }
});
