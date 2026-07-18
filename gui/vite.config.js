import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { frontendBuildInfo } from './config/frontendBuildInfo.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __WEBQUANTUMSAVORY_BUILD_INFO__: JSON.stringify(frontendBuildInfo),
  },
  server: {
    proxy: {
      '/_mcp': {
        target: 'http://127.0.0.1:8000',
        // Preserve the browser-facing Host header so the backend's strict
        // same-origin check can compare it with Origin.
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
  },
})
