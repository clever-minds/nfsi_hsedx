// vite.config.ts
import { defineConfig } from "file:///C:/Users/ujjaw/Videos/codecanyon-1kjwzhW0-lms-hub-nodejs-learning-management-system/Main%20Files/lmshub/lmshub/lmshub-fe/node_modules/vite/dist/node/index.js";
import vue from "file:///C:/Users/ujjaw/Videos/codecanyon-1kjwzhW0-lms-hub-nodejs-learning-management-system/Main%20Files/lmshub/lmshub/lmshub-fe/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///C:/Users/ujjaw/Videos/codecanyon-1kjwzhW0-lms-hub-nodejs-learning-management-system/Main%20Files/lmshub/lmshub/lmshub-fe/vite.config.ts";
var vite_config_default = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)) }
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor dipisah dari kode aplikasi supaya pembaruan aplikasi tidak
        // membatalkan cache pustaka yang jarang berubah, dan layar pertama
        // tidak menunggu seluruh bundel selesai diunduh.
        manualChunks: {
          vue: ["vue", "vue-router", "pinia"],
          i18n: ["vue-i18n"],
          http: ["axios"],
          sanitize: ["dompurify"]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/uploads": { target: "http://localhost:4000", changeOrigin: true }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1amphd1xcXFxWaWRlb3NcXFxcY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbVxcXFxNYWluIEZpbGVzXFxcXGxtc2h1YlxcXFxsbXNodWJcXFxcbG1zaHViLWZlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1amphd1xcXFxWaWRlb3NcXFxcY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbVxcXFxNYWluIEZpbGVzXFxcXGxtc2h1YlxcXFxsbXNodWJcXFxcbG1zaHViLWZlXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy91amphdy9WaWRlb3MvY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbS9NYWluJTIwRmlsZXMvbG1zaHViL2xtc2h1Yi9sbXNodWItZmUvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGgsIFVSTCB9IGZyb20gJ25vZGU6dXJsJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3Z1ZSgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7ICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8vIFZlbmRvciBkaXBpc2FoIGRhcmkga29kZSBhcGxpa2FzaSBzdXBheWEgcGVtYmFydWFuIGFwbGlrYXNpIHRpZGFrXG4gICAgICAgIC8vIG1lbWJhdGFsa2FuIGNhY2hlIHB1c3Rha2EgeWFuZyBqYXJhbmcgYmVydWJhaCwgZGFuIGxheWFyIHBlcnRhbWFcbiAgICAgICAgLy8gdGlkYWsgbWVudW5nZ3Ugc2VsdXJ1aCBidW5kZWwgc2VsZXNhaSBkaXVuZHVoLlxuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICB2dWU6IFsndnVlJywgJ3Z1ZS1yb3V0ZXInLCAncGluaWEnXSxcbiAgICAgICAgICBpMThuOiBbJ3Z1ZS1pMThuJ10sXG4gICAgICAgICAgaHR0cDogWydheGlvcyddLFxuICAgICAgICAgIHNhbml0aXplOiBbJ2RvbXB1cmlmeSddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHsgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJywgY2hhbmdlT3JpZ2luOiB0cnVlIH0sXG4gICAgICAnL3VwbG9hZHMnOiB7IHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsIGNoYW5nZU9yaWdpbjogdHJ1ZSB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBd2lCLFNBQVMsb0JBQW9CO0FBQ3JrQixPQUFPLFNBQVM7QUFDaEIsU0FBUyxlQUFlLFdBQVc7QUFGa1UsSUFBTSwyQ0FBMkM7QUFJdFosSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztBQUFBLEVBQ2YsU0FBUztBQUFBLElBQ1AsT0FBTyxFQUFFLEtBQUssY0FBYyxJQUFJLElBQUksU0FBUyx3Q0FBZSxDQUFDLEVBQUU7QUFBQSxFQUNqRTtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBSU4sY0FBYztBQUFBLFVBQ1osS0FBSyxDQUFDLE9BQU8sY0FBYyxPQUFPO0FBQUEsVUFDbEMsTUFBTSxDQUFDLFVBQVU7QUFBQSxVQUNqQixNQUFNLENBQUMsT0FBTztBQUFBLFVBQ2QsVUFBVSxDQUFDLFdBQVc7QUFBQSxRQUN4QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUSxFQUFFLFFBQVEseUJBQXlCLGNBQWMsS0FBSztBQUFBLE1BQzlELFlBQVksRUFBRSxRQUFRLHlCQUF5QixjQUFjLEtBQUs7QUFBQSxJQUNwRTtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
