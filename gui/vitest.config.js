import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { frontendBuildInfo } from './config/frontendBuildInfo.js'

export default defineConfig({
  plugins: [vue()],
  define: {
    __WEBQUANTUMSAVORY_BUILD_INFO__: JSON.stringify(frontendBuildInfo),
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    include: ['tests/unit/**/*.test.js'],
    restoreMocks: true,
  },
})
