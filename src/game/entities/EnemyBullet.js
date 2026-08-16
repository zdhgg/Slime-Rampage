const TAU = Math.PI * 2

/**
 * 敌人弹幕（法师火球 / 弓手箭矢）
 *
 * 直线飞行，由 EnemyManager 批量管理：
 *  - 只与玩家碰撞（友军火力不伤同伴）；
 *  - 命中玩家 → player.hit（玩家侧无敌帧兜底）；
 *  - 寿命耗尽或飞出视口余量外自动销毁。
 */
export class EnemyBullet {
  constructor({ x, y, angle, kind, speed = 0, damage = 1, radius = 0, life = 3, isBoss = false }) {
    this.x = x
    this.y = y
    this.kind = kind // 'mage'（火球）| 'archer'（箭矢）
    this.speed = speed || (kind === 'mage' ? 260 : 380)
    this.radius = radius || (kind === 'mage' ? 7 : 5)
    this.damage = damage
    this.vx = Math.cos(angle) * this.speed
    this.vy = Math.sin(angle) * this.speed
    this.life = life // 存活上限（秒）
    this.isBoss = isBoss
    this.active = true
  }

  update(dt) {
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.life -= dt
    if (this.life <= 0) this.active = false
  }

  render(ctx) {
    ctx.save()
    ctx.translate(this.x, this.y)
    if (this.kind === 'mage') {
      if (this.isBoss) {
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, 0, this.radius * 1.8, 0, TAU)
        ctx.stroke()
      }
      // 法师奥术法球：三层光晕 + 高亮核心
      ctx.fillStyle = 'rgba(180, 100, 255, 0.22)'
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 2.4, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(215, 130, 255, 0.55)'
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 1.4, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 0.7, 0, TAU)
      ctx.fill()
    } else {
      // 弓手飞箭：箭杆 + 铁箭头 + 绿白箭羽
      ctx.rotate(Math.atan2(this.vy, this.vx))
      ctx.strokeStyle = '#5a3d28'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-10, 0)
      ctx.lineTo(5, 0)
      ctx.stroke()
      // 钢尖
      ctx.fillStyle = '#dcdde1'
      ctx.beginPath()
      ctx.moveTo(10, 0)
      ctx.lineTo(4, -3.5)
      ctx.lineTo(4, 3.5)
      ctx.closePath()
      ctx.fill()
      // 箭羽
      ctx.fillStyle = '#10ac84'
      ctx.fillRect(-10, -3, 3, 6)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-7, -2, 2, 4)
      if (this.isBoss) {
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)'
        ctx.lineWidth = 1
        ctx.strokeRect(-11, -4, 22, 8)
      }
    }
    ctx.restore()
  }
}
