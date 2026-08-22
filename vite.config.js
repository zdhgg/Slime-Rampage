import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // 相对路径，便于任意目录部署
  server: {
    host: true, // 监听所有网卡，允许局域网设备访问（等价于 0.0.0.0）
    proxy: {
      '/api': 'http://127.0.0.1:4173',
    },
  },
  build: {
    target: 'es2020',
  },
})
