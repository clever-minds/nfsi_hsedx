import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor dipisah dari kode aplikasi supaya pembaruan aplikasi tidak
        // membatalkan cache pustaka yang jarang berubah, dan layar pertama
        // tidak menunggu seluruh bundel selesai diunduh.
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          i18n: ['vue-i18n'],
          http: ['axios'],
          sanitize: ['dompurify'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
