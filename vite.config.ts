import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    // Sin recursos incrustados como data: (la CSP solo admite fuentes y scripts del mismo origen)
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
    proxy: {
      // changeOrigin en false: el servidor compara Origin con Host para su defensa CSRF.
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
});
