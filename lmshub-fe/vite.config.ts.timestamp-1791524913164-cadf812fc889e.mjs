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
        // Vendor dipisah from kode aplikasi supaya pembaruan aplikasi no
        // membatalkan cache pustaka yang jarang berubah, dan layar pertama
        // no menunggu seluruh bundel finish diunduh.
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1amphd1xcXFxWaWRlb3NcXFxcY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbVxcXFxNYWluIEZpbGVzXFxcXGxtc2h1YlxcXFxsbXNodWJcXFxcbG1zaHViLWZlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1amphd1xcXFxWaWRlb3NcXFxcY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbVxcXFxNYWluIEZpbGVzXFxcXGxtc2h1YlxcXFxsbXNodWJcXFxcbG1zaHViLWZlXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy91amphdy9WaWRlb3MvY29kZWNhbnlvbi0xa2p3emhXMC1sbXMtaHViLW5vZGVqcy1sZWFybmluZy1tYW5hZ2VtZW50LXN5c3RlbS9NYWluJTIwRmlsZXMvbG1zaHViL2xtc2h1Yi9sbXNodWItZmUvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcclxuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnO1xyXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tICdub2RlOnVybCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFt2dWUoKV0sXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHsgJ0AnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjJywgaW1wb3J0Lm1ldGEudXJsKSkgfSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIC8vIFZlbmRvciBkaXBpc2FoIGZyb20ga29kZSBhcGxpa2FzaSBzdXBheWEgcGVtYmFydWFuIGFwbGlrYXNpIG5vXHJcbiAgICAgICAgLy8gbWVtYmF0YWxrYW4gY2FjaGUgcHVzdGFrYSB5YW5nIGphcmFuZyBiZXJ1YmFoLCBkYW4gbGF5YXIgcGVydGFtYVxyXG4gICAgICAgIC8vIG5vIG1lbnVuZ2d1IHNlbHVydWggYnVuZGVsIGZpbmlzaCBkaXVuZHVoLlxyXG4gICAgICAgIG1hbnVhbENodW5rczoge1xyXG4gICAgICAgICAgdnVlOiBbJ3Z1ZScsICd2dWUtcm91dGVyJywgJ3BpbmlhJ10sXHJcbiAgICAgICAgICBpMThuOiBbJ3Z1ZS1pMThuJ10sXHJcbiAgICAgICAgICBodHRwOiBbJ2F4aW9zJ10sXHJcbiAgICAgICAgICBzYW5pdGl6ZTogWydkb21wdXJpZnknXSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG4gIHNlcnZlcjoge1xyXG4gICAgcG9ydDogNTE3MyxcclxuICAgIHByb3h5OiB7XHJcbiAgICAgICcvYXBpJzogeyB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjQwMDAnLCBjaGFuZ2VPcmlnaW46IHRydWUgfSxcclxuICAgICAgJy91cGxvYWRzJzogeyB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjQwMDAnLCBjaGFuZ2VPcmlnaW46IHRydWUgfSxcclxuICAgIH0sXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBd2lCLFNBQVMsb0JBQW9CO0FBQ3JrQixPQUFPLFNBQVM7QUFDaEIsU0FBUyxlQUFlLFdBQVc7QUFGa1UsSUFBTSwyQ0FBMkM7QUFJdFosSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztBQUFBLEVBQ2YsU0FBUztBQUFBLElBQ1AsT0FBTyxFQUFFLEtBQUssY0FBYyxJQUFJLElBQUksU0FBUyx3Q0FBZSxDQUFDLEVBQUU7QUFBQSxFQUNqRTtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBSU4sY0FBYztBQUFBLFVBQ1osS0FBSyxDQUFDLE9BQU8sY0FBYyxPQUFPO0FBQUEsVUFDbEMsTUFBTSxDQUFDLFVBQVU7QUFBQSxVQUNqQixNQUFNLENBQUMsT0FBTztBQUFBLFVBQ2QsVUFBVSxDQUFDLFdBQVc7QUFBQSxRQUN4QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUSxFQUFFLFFBQVEseUJBQXlCLGNBQWMsS0FBSztBQUFBLE1BQzlELFlBQVksRUFBRSxRQUFRLHlCQUF5QixjQUFjLEtBQUs7QUFBQSxJQUNwRTtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
