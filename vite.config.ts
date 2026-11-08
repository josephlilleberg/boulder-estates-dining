import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fixed port so the Tauri shell (added before Step 2) can point at it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  clearScreen: false,
});
