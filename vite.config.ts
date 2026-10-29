import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build relocatable (static hosting, Tauri/Capacitor wrappers).
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as any);
