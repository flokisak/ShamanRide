import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '.',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://dmxkqofoecqdjbigxoon.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteGtxb2ZvZWNxZGpiaWd4b29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDE5OTUsImV4cCI6MjA3MzcxNzk5NX0.FTnH0I9OC_rN7tyhK4Uss5yPWQ3B27XS72v5p1FAINo'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'ShamanRide Driver',
          short_name: 'ShamanRide',
          description: 'Professional taxi driver app with real-time dispatch, GPS tracking, and gamification',
          theme_color: '#2e3440', // Nord polar-1
          background_color: '#2e3440', // Nord polar-1
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          // Enhanced APK-ready configuration
          categories: ['business', 'productivity', 'transportation', 'navigation'],
          lang: 'cs',
          dir: 'ltr',
          prefer_related_applications: false,
          // APK-specific settings
          iarc_rating_id: '',
          related_applications: [],
          // Enhanced PWA capabilities for APK
          shortcuts: [
            {
              name: 'Active Rides',
              short_name: 'Rides',
              description: 'View and manage active rides',
              url: '/#rides',
              icons: [{ src: 'android-launchericon-96-96.png', sizes: '96x96' }]
            },
            {
              name: 'Chat',
              short_name: 'Chat',
              description: 'Communicate with dispatch',
              url: '/#chat',
              icons: [{ src: 'android-launchericon-96-96.png', sizes: '96x96' }]
            }
          ],
         icons: [
           // Android Chrome optimized icons - PNG preferred for better compatibility
           {
             src: 'android-launchericon-48-48.png',
             sizes: '48x48',
             type: 'image/png',
             purpose: 'any maskable'
           },
           {
             src: 'android-launchericon-72-72.png',
             sizes: '72x72',
             type: 'image/png',
             purpose: 'any maskable'
           },
           {
             src: 'android-launchericon-96-96.png',
             sizes: '96x96',
             type: 'image/png',
             purpose: 'any maskable'
           },
           {
             src: 'android-launchericon-144-144.png',
             sizes: '144x144',
             type: 'image/png',
             purpose: 'any maskable'
           },
           {
             src: 'android-launchericon-192-192.png',
             sizes: '192x192',
             type: 'image/png',
             purpose: 'any maskable'
           },
           {
             src: 'android-launchericon-512-512.png',
             sizes: '512x512',
             type: 'image/png',
             purpose: 'any maskable'
           },
           // Fallback SVG icons
           {
             src: 'pwa-192x192.svg',
             sizes: '192x192',
             type: 'image/svg+xml',
             purpose: 'any'
           },
           {
             src: 'pwa-512x512.svg',
             sizes: '512x512',
             type: 'image/svg+xml',
             purpose: 'any'
           }
         ]
      }
    })
  ],
  // When importing files from outside the driver-app directory (shared components at repo root),
  // Vite needs explicit permission and sometimes needs the automatic JSX runtime to be optimized.
  optimizeDeps: {
    include: ['react/jsx-runtime', '@supabase/supabase-js']
  },
  server: {
    fs: {
      // allow serving files from the monorepo root
      allow: [path.resolve(__dirname, '..')]
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Ensure imports of react from shared files resolve to this package's react
      'react': path.resolve(__dirname, 'node_modules', 'react'),
      'react-dom': path.resolve(__dirname, 'node_modules', 'react-dom')
      ,
      // Ensure supabase imported from shared code resolves to this driver's node_modules
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules', '@supabase', 'supabase-js')
    }
  },
  // Prevent Vite from externalizing certain ESM/CJS deps during SSR/build
  ssr: {
    noExternal: ['@supabase/supabase-js']
  },

});
