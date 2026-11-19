const TAU = Math.PI * 2

/**
 * 敌人弹幕（法师火球 / 弓手箭矢）
 *
 * 直线飞行，由 EnemyManager 批量管理：
 *  - 普通弹幕可被暗影分身拦截，Boss 弹幕仍只与玩家碰撞；
 *  - 命中玩家 → player.hit（玩家侧无敌帧兜底）；
 *  - 寿命耗尽或飞出视口余量外自动销毁。
 */
export class EnemyBullet {
  constructor({ x, y, angle, kind, rank = 2, speed = 0, damage = 1, radius = 0, life = 0, isBoss = false }) {
    this.x = x
    this.y = y
    this.kind = kind // 'mage'（奥术法球）| 'archer'（飞箭）
    this.rank = Math.max(1, Math.min(3, Math.round(rank || 2)))
    this.speed = speed || (kind === 'mage' ? (isBoss ? 210 : 115) : 380)
    this.radius = radius || (kind === 'mage' ? (this.rank === 1 ? 6.5 : this.rank === 3 ? 8.5 : 8) : (this.rank === 3 ? 5.5 : 5))
    this.damage = damage
    this.vx = Math.cos(angle) * this.speed
    this.vy = Math.sin(angle) * this.speed
    this.life = life || (kind === 'mage' ? 4.5 : 3) // 存活上限（秒）
    this.isBoss = isBoss
    this.active = true
    this.age = 0
  }

  update(dt) {
    this.age += dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.life -= dt
    if (this.life <= 0) this.active = false
  }

  render(ctx) {
    ctx.save()
    ctx.translate(this.x, this.y)
    const angle = Math.atan2(this.vy, this.vx)
    const pulse = 0.75 + 0.25 * Math.sin(this.age * 12)
    if (this.kind === 'mage') {
      if (this.isBoss) {
        // Boss orbs carry a short directional trail and a second orbit ring.
        ctx.rotate(angle)
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.28 + pulse * 0.24})`
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(-this.radius * 4.6, 0); ctx.lineTo(-this.radius * 1.1, 0); ctx.stroke()
        ctx.rotate(-angle)
        ctx.strokeStyle = `rgba(255, 226, 148, ${0.45 + pulse * 0.25})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, 0, this.radius * (1.8 + pulse * 0.28), 0, TAU)
        ctx.stroke()
      }
      // 法师 1/2/3 阶敌对魔球：统一加暗色外描边防线，与友方柔和光弹 / 静止菱形经验宝石显著区分
      const outerRgba = this.rank === 1
        ? 'rgba(96, 130, 214, 0.20)'
        : this.rank === 3
          ? `rgba(244, 63, 142, ${(0.24 + pulse * 0.08).toFixed(2)})`
          : (this.isBoss ? `rgba(194, 108, 255, ${(0.24 + pulse * 0.08).toFixed(2)})` : 'rgba(180, 100, 255, 0.22)')
      const innerRgba = this.rank === 1
        ? 'rgba(128, 158, 238, 0.52)'
        : this.rank === 3
          ? `rgba(224, 56, 152, ${(0.56 + pulse * 0.14).toFixed(2)})`
          : (this.isBoss ? `rgba(230, 148, 255, ${(0.48 + pulse * 0.12).toFixed(2)})` : 'rgba(215, 130, 255, 0.56)')
      const inkRing = this.rank === 1 ? '#1e2b54' : this.rank === 3 ? '#3b0824' : '#2e104d'
      const coreFill = this.rank === 3 ? '#fff3c4' : '#ffffff'

      ctx.fillStyle = outerRgba
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * (this.rank === 1 ? 2.0 : 2.35), 0, TAU)
      ctx.fill()

      ctx.fillStyle = innerRgba
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 1.32, 0, TAU)
      ctx.fill()

      // 深色危险环描边：明确敌对威胁轮廓，与经验宝石和友方无描边光弹区隔
      ctx.strokeStyle = inkRing
      ctx.lineWidth = this.rank === 3 ? 2 : 1.5
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 1.15, 0, TAU)
      ctx.stroke()

      if (!this.isBoss && this.rank >= 2) {
        ctx.strokeStyle = this.rank === 3
          ? `rgba(254, 240, 138, ${(0.65 + pulse * 0.25).toFixed(2)})`
          : `rgba(224, 155, 255, ${(0.48 + pulse * 0.25).toFixed(2)})`
        ctx.lineWidth = this.rank === 3 ? 1.6 : 1.2
        ctx.beginPath()
        ctx.arc(0, 0, this.radius * 1.48, 0, TAU)
        ctx.stroke()
      }

      if (this.rank === 3) {
        // 3 阶大魔导士旋转四星芒魔核
        ctx.save()
        ctx.rotate(this.age * 3.5)
        ctx.strokeStyle = '#fde047'
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        const sr = this.radius * 1.15
        ctx.beginPath()
        ctx.moveTo(-sr, 0); ctx.lineTo(sr, 0)
        ctx.moveTo(0, -sr); ctx.lineTo(0, sr)
        ctx.stroke()
        ctx.restore()
      }

      ctx.fillStyle = coreFill
      ctx.beginPath()
      ctx.arc(0, 0, this.radius * 0.65, 0, TAU)
      ctx.fill()
    } else {
      // 弓手 1/2/3 阶物理实体飞箭：1 阶粗糙木羽短箭 / 2 阶钢尖绿羽猎箭 / 3 阶金羽附魔长锋箭
      ctx.rotate(angle)
      if (this.isBoss) {
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.22 + pulse * 0.18})`
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(-this.radius * 5, 0); ctx.lineTo(-this.radius * 1.1, 0); ctx.stroke()
      }
      if (this.rank === 1) {
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#2d1a0b'
        ctx.lineWidth = 2.8
        ctx.beginPath(); ctx.moveTo(-8.5, 0); ctx.lineTo(4, 0); ctx.stroke()
        ctx.strokeStyle = '#9a6b3e'
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.moveTo(-8.5, 0); ctx.lineTo(4, 0); ctx.stroke()
        ctx.fillStyle = '#cbd5e1'
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 0.9
        ctx.beginPath(); ctx.moveTo(8.5, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#64748b'
        ctx.fillRect(-8.5, -2.5, 3, 5)
      } else if (this.rank === 3) {
        // 淡淡暖金尾迹 + 实体深金箭杆与附魔尖锋
        ctx.strokeStyle = `rgba(250, 204, 21, ${(0.28 + pulse * 0.18).toFixed(2)})`
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-7, 0); ctx.stroke()
        ctx.strokeStyle = '#3b240b'
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(6, 0); ctx.stroke()
        ctx.strokeStyle = '#d97706'
        ctx.lineWidth = 1.8
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(6, 0); ctx.stroke()
        // 附魔长锋倒刺钢尖
        ctx.fillStyle = '#f8fafc'
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(12.5, 0); ctx.lineTo(4, -4.2); ctx.lineTo(5.8, 0); ctx.lineTo(4, 4.2)
        ctx.closePath()
        ctx.fill(); ctx.stroke()
        // 翡翠金双羽
        ctx.fillStyle = '#22c55e'
        ctx.fillRect(-11.5, -3.5, 3.5, 7)
        ctx.fillStyle = '#fde047'
        ctx.fillRect(-8, -2.5, 2.5, 5)
      } else {
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
      }
      if (this.isBoss) {
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.62 + pulse * 0.2})`
        ctx.lineWidth = 1.5
        ctx.strokeRect(-11, -4, 22, 8)
      }
    }
    ctx.restore()
  }
}
