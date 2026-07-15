import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { frontendBuildInfo } from './config/frontendBuildInfo.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __WEBQUANTUMSAVORY_BUILD_INFO__: JSON.stringify(frontendBuildInfo),
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
  },
})
