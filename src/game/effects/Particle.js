import { AssetManager } from '../AssetManager.js'

const TAU = Math.PI * 2

const rand = (min, max) => min + Math.random() * (max - min)

/**
 * 击杀与命中粒子：极简炸裂 + 命中火花
 */
export class Particle {
  constructor(x, y, color, isSpark = false) {
    this.x = x
    this.y = y
    const angle = rand(0, TAU)
    const speed = rand(70, 240) // px/s，随机初速
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.color = color
    this.isSpark = isSpark
    this.life = rand(0.2, 0.42) // 寿命（秒）
    this.maxLife = this.life
    this.size = rand(1.5, 3.5)
    this.active = true
  }

  update(dt) {
    this.life -= dt
    if (this.life <= 0) {
      this.active = false
      return
    }
    const damp = Math.max(0, 1 - 3 * dt) // 阻尼系数
    this.vx *= damp
    this.vy *= damp
    this.x += this.vx * dt
    this.y += this.vy * dt
  }

  render(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife)
    ctx.globalAlpha = alpha

    if (this.isSpark) {
      const assets = AssetManager.getInstance()
      assets.draw(ctx, 'vfx_hit_spark', this.x, this.y, this.size * 5, this.size * 5)
    } else {
      ctx.fillStyle = this.color
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size, 0, TAU)
      ctx.fill()
    }

    ctx.globalAlpha = 1
  }
}
