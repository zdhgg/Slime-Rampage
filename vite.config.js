import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发服务器端口（门户系统会注入 VITE_PORT），默认 3013
const devPort = Number(process.env.VITE_PORT) || 3013
// 局域网主机端口（仅用 SLIME_PORT 覆盖，避免与门户注入的 PORT 混淆），默认 8013
const apiPort = Number(process.env.SLIME_PORT) || 8013

export default defineConfig({
  plugins: [vue()],
  base: './', // 相对路径，便于任意目录部署
  server: {
    host: true, // 监听所有网卡，允许局域网设备访问（等价于 0.0.0.0）
    port: devPort,
    watch: {
      // 验收浏览器的缓存和扩展文件不参与应用热更新。
      ignored: ['**/.workbuddy/background-review/browser-profile*/**'],
    },
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
  build: {
    target: 'es2020',
  },
})
