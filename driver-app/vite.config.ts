import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  envDir: '.',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://dmxkqofoecqdjbigxoon.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteGtxb2ZvZWNxZGpiaWd4b29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDE5OTUsImV4cCI6MjA3MzcxNzk5NX0.FTnH0I9OC_rN7tyhK4Uss5yPWQ3B27XS72v5p1FAINo'),
  },
  plugins: [
    react()
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
