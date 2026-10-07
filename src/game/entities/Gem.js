const TAU = Math.PI * 2

/** 经验值 → 颜色分级：小经验蓝色、中经验紫色、大经验红色 */
function gemColor(value) {
  if (value >= 15) return '#ef5350' // 红：hp=3 的勇者
  if (value >= 10) return '#ba68c8' // 紫：hp=2 的勇者
  return '#4fc3f7' // 蓝：hp=1 的勇者
}

/** 经验值 → 尺寸分级 */
function gemSize(value) {
  if (value >= 15) return 8
  if (value >= 10) return 6.5
  return 5
}

/** 元素核心外观表（颜色 + 中心图标图形） */
const ELEMENTS = {
  fire: { color: '#ff6b4a', icon: 'fire' },
  water: { color: '#4fc3f7', icon: 'water' },
  poison: { color: '#7ce86a', icon: 'poison' },
  lightning: { color: '#ffd166', icon: 'lightning' },
}

/**
 * 经验宝石 / 元素核心（普通对象，由 GemManager 批量管理）
 *
 * 状态机：
 *  - idle：静止在地面，等待进入玩家 pickupRadius；
 *  - magnet：被磁力吸附，vx/vy 每帧向玩家方向加速（见 GemManager.update）。
 *
 * 外观区分：
 *  - type='exp'：菱形水晶（蓝色小/紫色中/红色大，按经验分级）；
 *  - 元素核心：圆形发光 + 中心元素图标（火三角/水滴/毒泡/闪电），
 *    拾取后进入玩家元素集合参与流派融合。
 */
export class Gem {
  constructor(x, y, value, type = 'exp', meta = null) {
    this.x = x
    this.y = y
    this.value = value // 经验值（元素核心时无意义，取 0）
    this.type = type // 'exp' | 'fire' | 'water' | 'poison' | 'lightning'
    this.mastery = !!meta?.mastery // type='tome' 时区分普通王级秘籍与职业秘典
    this.state = 'idle' // 'idle' | 'magnet'
    this.vx = 0 // 吸附速度（magnet 状态使用）
    this.vy = 0
    this.size = type === 'exp' ? gemSize(value) : type === 'tome' ? (this.mastery ? 10 : 9) : 7
    this.color = type === 'exp' ? gemColor(value) : type === 'tome' ? (this.mastery ? '#ff8bd1' : '#ffd166') : ELEMENTS[type].color
    this.icon = type === 'exp' || type === 'tome' ? null : ELEMENTS[type].icon
    this.phase = Math.random() * TAU // 闪烁相位（每颗错开，避免同步闪烁）
    this.merged = false // 被同位置大宝石吸收标记（GemManager 合并轮回收用）
    this.rejectedUntil = 0 // 首融确认「吐掉」后的拾取冷却（游戏时间秒，阶段十六）
    this.life = Infinity // 元素核心由 GemManager 赋予有限寿命；经验与秘籍永久保留
    this.maxLife = Infinity
  }

  /** 合并后更新经验值与对应尺寸/颜色分级（阶段十三：同位置宝石自动合并） */
  setExpValue(value) {
    this.value = value
    this.size = gemSize(value)
    this.color = gemColor(value)
  }

  /** 绘制元素图标（本地坐标，原点在核心中心） */
  _drawIcon(ctx) {
    const s = this.size
    ctx.fillStyle = '#ffffff'
    switch (this.icon) {
      case 'fire': {
        // 火：上尖下宽的小三角
        ctx.beginPath()
        ctx.moveTo(0, -s * 0.75)
        ctx.lineTo(s * 0.7, s * 0.7)
        ctx.lineTo(-s * 0.7, s * 0.7)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'water': {
        // 水滴：圆底 + 尖顶
        ctx.beginPath()
        ctx.arc(0, s * 0.15, s * 0.5, 0, TAU)
        ctx.moveTo(0, -s * 0.7)
        ctx.lineTo(s * 0.55, s * 0.25)
        ctx.lineTo(-s * 0.55, s * 0.25)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'poison': {
        // 毒泡：小圆 + 顶部高光点
        ctx.beginPath()
        ctx.arc(0, 0, s * 0.55, 0, TAU)
        ctx.fill()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.beginPath()
        ctx.arc(-s * 0.2, -s * 0.2, s * 0.16, 0, TAU)
        ctx.fill()
        break
      }
      case 'lightning': {
        // 闪电：折线
        ctx.beginPath()
        ctx.moveTo(s * 0.2, -s * 0.75)
        ctx.lineTo(-s * 0.4, s * 0.1)
        ctx.lineTo(-s * 0.05, s * 0.1)
        ctx.lineTo(-s * 0.2, s * 0.75)
        ctx.lineTo(s * 0.4, -s * 0.1)
        ctx.lineTo(s * 0.05, -s * 0.1)
        ctx.closePath()
        ctx.fill()
        break
      }
    }
  }

  /**
   * 渲染：经验菱形或元素核心圆，闪烁用整体缩放（纯数值运算，零分配）
   */
  render(ctx, t, warningSeconds = 0) {
    const s = this.size
    const isCore = this.type !== 'exp' && this.type !== 'tome'
    const expiring = isCore && warningSeconds > 0 && Number.isFinite(this.life) && this.life <= warningSeconds
    const pulse = expiring ? 1 : 0.85 + 0.15 * Math.sin(t * 5 + this.phase)

    ctx.save()
    ctx.translate(this.x, this.y)
    if (expiring) ctx.globalAlpha = 0.76 + Math.sin(t * 8 + this.phase) * 0.24
    ctx.scale(pulse, pulse)

    if (this.type === 'exp') {
      // 菱形水晶（旋转 45° 正方形 + 光晕 + 高光）
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.fillRect(-s * 1.7, -s * 1.7, s * 3.4, s * 3.4)
      ctx.fillStyle = this.color
      ctx.fillRect(-s, -s, s * 2, s * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.fillRect(-s * 0.7, -s * 0.7, s * 0.9, s * 0.9)
    } else if (this.type === 'tome') {
      // 王级秘籍：金色书卷（竖放 + 书脊 + 书页线 + 发光）
      const mastery = this.mastery
      ctx.fillStyle = mastery ? 'rgba(255, 139, 209, 0.28)' : 'rgba(255, 209, 102, 0.22)'
      ctx.beginPath()
      ctx.arc(0, 0, s * 2, 0, TAU)
      ctx.fill()
      ctx.fillStyle = this.color
      ctx.fillRect(-s * 0.55, -s * 0.75, s * 1.1, s * 1.5)
      ctx.fillStyle = mastery ? 'rgba(80, 20, 70, 0.9)' : 'rgba(90, 60, 10, 0.9)' // 书脊
      ctx.fillRect(-s * 0.1, -s * 0.75, s * 0.2, s * 1.5)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)' // 书页线
      ctx.lineWidth = 1
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(-s * 0.45, -s * 0.75 + i * s * 0.32)
        ctx.lineTo(s * 0.45, -s * 0.75 + i * s * 0.32)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)' // 书封符文
      ctx.beginPath()
      ctx.arc(s * 0.22, -s * 0.42, s * 0.12, 0, TAU)
      ctx.fill()
    } else {
      // 元素核心：圆形发光 + 白色图标
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.9, 0, TAU)
      ctx.fill()
      ctx.fillStyle = this.color
      ctx.beginPath()
      ctx.arc(0, 0, s, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.beginPath()
      ctx.arc(-s * 0.35, -s * 0.35, s * 0.5, 0, TAU)
      ctx.fill()
      this._drawIcon(ctx)
    }

    // 周期星光十字闪烁（阶段十五美化）：闪烁相位接近峰值时一闪而过
    const spark = Math.sin(t * 5 + this.phase)
    if (!expiring && spark > 0.88) {
      const a = (spark - 0.88) / 0.12
      ctx.globalAlpha = a * 0.9
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-s * 1.1, 0)
      ctx.lineTo(s * 1.1, 0)
      ctx.moveTo(0, -s * 1.1)
      ctx.lineTo(0, s * 1.1)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (expiring) {
      const ratio = Math.max(0, Math.min(1, this.life / warningSeconds))
      ctx.globalAlpha = 1
      ctx.strokeStyle = this.color
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0, 0, s * 2.15, -Math.PI / 2, -Math.PI / 2 + TAU * ratio)
      ctx.stroke()
    }

    ctx.restore()
  }
}
