/**
 * 环境氛围层：主题环境粒子 + 随波次加深的时段色调。
 *
 * 粒子是世界坐标下的「环视回收」池：飞出相机视野 + 边距后从对侧回绕，
 * 密度恒定、无内存分配（复用同一粒子数组）；主题切换时原地重散布并换配置。
 * 色调是叠加在烘焙背景之上、实体之下的低透明度色幕——
 * 不碰背景烘焙管线，长局里制造「时间在流逝」的时段感。
 */

const TAU = Math.PI * 2

/** 主题氛围配置：frontier 萤火 / blight 孢子 / royal 余烬 + 各自的暮色幕 */
const AMBIENT_THEMES = {
  frontier: {
    color: '214, 240, 150', // 萤火黄绿
    count: 32,
    speed: 22, // 缓慢游移
    rise: -9, // 微微上浮
    size: [1.1, 2.2],
    pulse: true, // 呼吸明灭
    tint: [70, 90, 130, 0.16], // 暮色：向夜蓝偏移
  },
  blight: {
    color: '172, 214, 168', // 孢子青绿
    count: 42,
    speed: 12, // 几乎悬浮
    rise: -14, // 孢子缓升
    size: [1.0, 2.0],
    pulse: false,
    tint: [110, 60, 150, 0.16], // 暮色：腐紫加深
  },
  royal: {
    color: '255, 176, 102', // 余烬暖橙
    count: 30,
    speed: 18,
    rise: 15, // 余烬缓落
    size: [0.8, 1.8],
    pulse: true,
    tint: [40, 55, 110, 0.2], // 暮色：冷夜蓝
  },
}

const TINT_RAMP_WAVES = 24 // 色调随波次加深的爬坡长度（波）

export class AmbientLayer {
  constructor() {
    this._themeId = null
    this._particles = []
    this._time = 0
    this._habitats = []
    this._tintCache = new Map() // `theme:档位` → rgba 字符串（避免每帧拼串分配）
  }

  /** First-chapter fireflies gather around pools and shrubs, using world coordinates. */
  setHabitats(items = []) {
    this._habitats = items.filter(item => item.type === 'woodland-pool' || item.type === 'woodland-shrub')
    this._themeId = null
  }

  /** 每帧推进：主题变化时重散布；粒子在相机视野 + 边距的盒内环视回绕 */
  update(dt, camera, viewW, viewH, themeId) {
    this._time += dt
    const config = AMBIENT_THEMES[themeId] || AMBIENT_THEMES.frontier
    if (themeId !== this._themeId) {
      this._themeId = themeId
      this._scatter(camera, viewW, viewH, config)
    }

    const margin = 48
    const minX = camera.x - margin
    const minY = camera.y - margin
    const boxW = viewW + margin * 2
    const boxH = viewH + margin * 2

    for (const p of this._particles) {
      // 游移：基础漂移 + 正弦横摆（相位错开的轻乱流）
      p.phase += dt * p.wander
      p.x += (Math.sin(p.phase) * config.speed * 0.6 + p.vx) * dt
      p.y += (config.rise + Math.cos(p.phase * 0.7) * 6) * dt

      // 环视回绕：飞出视野盒即从对侧进入，密度恒定
      if (p.x < minX) p.x += boxW
      else if (p.x > minX + boxW) p.x -= boxW
      if (p.y < minY) p.y += boxH
      else if (p.y > minY + boxH) p.y -= boxH
    }
  }

  render(ctx) {
    const config = AMBIENT_THEMES[this._themeId]
    if (!config) return
    const base = 0.55
    for (const p of this._particles) {
      const alpha = config.pulse
        ? base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this._time * 2.4 + p.phase * 3)))
        : base
      ctx.fillStyle = `rgba(${config.color}, ${alpha.toFixed(2)})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, TAU)
      ctx.fill()
    }
  }

  /** 时段色调：波次推进 TINT_RAMP_WAVES 内从透明渐入主题暮色（结果按 4% 档位缓存） */
  tintFor(themeId, wave) {
    const key0 = AMBIENT_THEMES[themeId] ? themeId : 'frontier'
    const config = AMBIENT_THEMES[key0]
    const step = Math.min(25, Math.max(0, Math.round(((Math.max(1, wave) - 1) / TINT_RAMP_WAVES) * 25)))
    if (step <= 0) return null
    const key = `${key0}:${step}`
    let cached = this._tintCache.get(key)
    if (!cached) {
      const [r, g, b, a] = config.tint
      cached = `rgba(${r}, ${g}, ${b}, ${(a * (step / 25)).toFixed(3)})`
      this._tintCache.set(key, cached)
    }
    return cached
  }

  _scatter(camera, viewW, viewH, config) {
    this._particles.length = 0
    const habitats = this._habitats.filter(item => item.x >= camera.x && item.x <= camera.x + viewW && item.y >= camera.y && item.y <= camera.y + viewH)
    for (let i = 0; i < config.count; i++) {
      const size = config.size[0] + Math.random() * (config.size[1] - config.size[0])
      const anchor = i % 3 !== 0 && habitats.length ? habitats[i % habitats.length] : null
      this._particles.push({
        x: anchor ? anchor.x + (Math.random() - 0.5) * 90 : camera.x + Math.random() * viewW,
        y: anchor ? anchor.y - Math.random() * 45 : camera.y + Math.random() * viewH,
        vx: (Math.random() * 2 - 1) * config.speed * 0.5,
        size,
        phase: Math.random() * TAU,
        wander: 0.6 + Math.random() * 1.2,
      })
    }
  }
}
