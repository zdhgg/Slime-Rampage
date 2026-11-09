/**
 * 虚拟摇杆（主战场 · 触屏）
 *
 * 设计要点：
 *  - 浮动式：在左半屏按下即出现，基座落在按点附近，拖多远就偏离多远；
 *  - 只产出「归一化方向 + 0~1 推力」，不直接改玩家坐标——移动仍走 InputManager /
 *    Player 的同一条位移管线，地形减速、边界、碰撞、影袭全都自然复用；
 *  - 死区与推力曲线：超过死区才出向量，避免手指轻触就漂移；
 *  - 纯逻辑 + 屏幕空间绘制，零 DOM、零 Vue；渲染在 DPR 变换之后，坐标即 CSS 像素。
 */

const BASE_RADIUS = 58 // 基座半径（CSS px）
const KNOB_RADIUS = 24 // 摇杆头半径
const MAX_OFFSET = 46 // 摇杆头最大偏移，也是满推力距离
const DEAD_ZONE = 0.16 // 死区（占最大偏移的比例）
const FADE_TIME = 0.18 // 松手后淡出时长（秒）

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class VirtualStick {
  constructor() {
    this.vector = { x: 0, y: 0 } // 归一化方向 × 推力（0~1）
    this.engaged = false // 是否正在拖动（按住中）
    this.pointerId = null
    this.baseX = 0
    this.baseY = 0
    this.dx = 0 // 摇杆头相对基座的偏移（已夹到 MAX_OFFSET）
    this.dy = 0
    this.alpha = 0 // 绘制透明度（松手淡出）
    this._originX = 0 // 按下点：推力按「相对按下点的位移」计算，基座被夹到边缘时也不会误出向量
    this._originY = 0
  }

  /**
   * 开始拖动。x/y 为画布 CSS 像素坐标，width/height 用于把基座夹在可视区域内。
   * 返回是否成功接管（同一时间只允许一根手指操作摇杆）。
   */
  begin(pointerId, x, y, width, height) {
    if (this.engaged) return false
    this.engaged = true
    this.pointerId = pointerId
    this._originX = x
    this._originY = y
    this.baseX = clamp(x, BASE_RADIUS + 8, Math.max(BASE_RADIUS + 8, width - BASE_RADIUS - 8))
    this.baseY = clamp(y, BASE_RADIUS + 8, Math.max(BASE_RADIUS + 8, height - BASE_RADIUS - 8))
    this.dx = 0
    this.dy = 0
    this.vector.x = 0
    this.vector.y = 0
    this.alpha = 1
    return true
  }

  /** 拖动更新；超出满推力距离时夹到圆周上，方向不变 */
  move(pointerId, x, y) {
    if (!this.engaged || pointerId !== this.pointerId) return false
    let dx = x - this._originX
    let dy = y - this._originY
    let dist = Math.hypot(dx, dy)
    if (dist > MAX_OFFSET) {
      const k = MAX_OFFSET / dist
      dx *= k
      dy *= k
      dist = MAX_OFFSET
    }
    this.dx = dx
    this.dy = dy
    const power = dist / MAX_OFFSET
    if (power <= DEAD_ZONE) {
      this.vector.x = 0
      this.vector.y = 0
      return true
    }
    // 死区外重新映射到 0~1：轻推起步更细腻，推到底仍是满推力
    const thrust = (power - DEAD_ZONE) / (1 - DEAD_ZONE)
    const inv = 1 / dist
    this.vector.x = dx * inv * thrust
    this.vector.y = dy * inv * thrust
    return true
  }

  /** 松手/取消；必须带 pointerId，避免多指时被其它手指误结束 */
  end(pointerId) {
    if (!this.engaged || pointerId !== this.pointerId) return false
    this.engaged = false
    this.pointerId = null
    this.dx = 0
    this.dy = 0
    this.vector.x = 0
    this.vector.y = 0
    return true
  }

  /** 立即归零（暂停/重开/切玩法/失焦），不留残余推力 */
  reset() {
    this.engaged = false
    this.pointerId = null
    this.dx = 0
    this.dy = 0
    this.vector.x = 0
    this.vector.y = 0
    this.alpha = 0
  }

  /** 松手后淡出；拖住时保持完全不透明 */
  update(dt) {
    if (this.engaged) this.alpha = 1
    else if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - dt / FADE_TIME)
  }

  /** 屏幕空间绘制（调用方已完成 DPR 变换，坐标可直接用 CSS 像素） */
  render(ctx) {
    if (this.alpha <= 0.01) return
    const a = this.alpha
    ctx.save()
    // 基座
    ctx.globalAlpha = 0.30 * a
    ctx.fillStyle = '#0a110d'
    ctx.beginPath()
    ctx.arc(this.baseX, this.baseY, BASE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.42 * a
    ctx.strokeStyle = '#f3dfa4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(this.baseX, this.baseY, BASE_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    // 方向刻度：四向短线，静止时也能看出这是一个摇杆
    ctx.globalAlpha = 0.22 * a
    ctx.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i
      ctx.beginPath()
      ctx.moveTo(this.baseX + Math.cos(angle) * (BASE_RADIUS - 13), this.baseY + Math.sin(angle) * (BASE_RADIUS - 13))
      ctx.lineTo(this.baseX + Math.cos(angle) * (BASE_RADIUS - 5), this.baseY + Math.sin(angle) * (BASE_RADIUS - 5))
      ctx.stroke()
    }
    // 摇杆头
    const kx = this.baseX + this.dx
    const ky = this.baseY + this.dy
    ctx.globalAlpha = 0.55 * a
    ctx.fillStyle = '#f3dfa4'
    ctx.beginPath()
    ctx.arc(kx, ky, KNOB_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.9 * a
    ctx.fillStyle = '#fff6dd'
    ctx.beginPath()
    ctx.arc(kx, ky, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export const VIRTUAL_STICK_METRICS = { BASE_RADIUS, KNOB_RADIUS, MAX_OFFSET, DEAD_ZONE, FADE_TIME }
