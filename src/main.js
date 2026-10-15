import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

const app = createApp(App)
// 挂载阶段抛错时保留启动提示，避免空白页面。
let mountFailed = false
app.config.errorHandler = (error) => {
  mountFailed = true
  console.error(error)
  window.dispatchEvent(new Event('error'))
}
app.mount('#app')
if (!mountFailed) window.dispatchEvent(new Event('game-ready'))
