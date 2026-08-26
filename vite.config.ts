import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        application: 'index.html',
        privacy: 'privacy.html',
        terms: 'terms.html',
      },
    },
  },
});
