/**
 * 资产与精灵管理器（AssetManager · Hybrid Rendering Core）
 *
 * 职责：
 *  - 离屏预渲染高质量、高 DPI 适配的精灵（SpriteAtlas）与特效贴图；
 *  - 提供人类勇者（骑士/法师/弓手/三王）的身体部位、步态帧、武器与攻击特效；
 *  - 提供史莱姆多表情图层（平时/愤怒/受击/吞噬/濒死/眨眼）与进化外观配件；
 *  - 提供战斗通用光效（弧形刀光、奥术符文阵、命中火花）；
 *  - 零外部网络依赖、零黑屏等待，热路径直接 drawImage 极速绘制。
 */

const TAU = Math.PI * 2

/** 创建带 DPR 适配的离屏画布 */
function createOffscreen(w, h, scale = 2) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w * scale, h * scale)
    : document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = true
  return { canvas, ctx, w, h, scale }
}

export class AssetManager {
  static #instance = null

  static getInstance() {
    if (!AssetManager.#instance) {
      AssetManager.#instance = new AssetManager()
    }
    return AssetManager.#instance
  }

  constructor() {
    this.sprites = new Map()
    this.initialized = false
    this.init()
  }

  init() {
    if (this.initialized) return
    this._generateSlimeExpressions()
    this._generateSlimeProps()
    this._generateCombatVFX()
    this._generateCharacters()
    this.initialized = true
  }

  /**
   * 1. 史莱姆动态表情精灵
   */
  _generateSlimeExpressions() {
    const size = 48
    const types = ['idle', 'blink', 'angry', 'hurt', 'devour', 'lowhp']

    for (const type of types) {
      const { canvas, ctx } = createOffscreen(size, size)
      const cx = size / 2
      const cy = size / 2

      ctx.save()
      ctx.translate(cx, cy)

      if (type === 'idle') {
        // 萌萌大眼 + 瞳孔高光 + 腮红 + 微笑
        for (const s of [-1, 1]) {
          const ex = s * 9
          const ey = -3
          // 眼白/大黑眸
          ctx.fillStyle = '#1c241d'
          ctx.beginPath()
          ctx.ellipse(ex, ey, 4.5, 5.5, 0, 0, TAU)
          ctx.fill()
          // 双重水灵高光
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(ex + 1.2, ey - 2, 2.2, 0, TAU)
          ctx.arc(ex - 1.5, ey + 2, 1.1, 0, TAU)
          ctx.fill()
          // 腮红
          ctx.fillStyle = 'rgba(255, 100, 130, 0.45)'
          ctx.beginPath()
          ctx.ellipse(s * 14, 5, 4.5, 2.5, s * 0.15, 0, TAU)
          ctx.fill()
        }
        // 可爱 W 微笑
        ctx.strokeStyle = '#15401b'
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(-2.5, 3.5, 3, 0.1 * Math.PI, 0.9 * Math.PI)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(2.5, 3.5, 3, 0.1 * Math.PI, 0.9 * Math.PI)
        ctx.stroke()
      } else if (type === 'blink') {
        // 闭眼萌线
        for (const s of [-1, 1]) {
          ctx.strokeStyle = '#1c241d'
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.arc(s * 9, -1, 4.5, 0.15 * Math.PI, 0.85 * Math.PI)
          ctx.stroke()
          // 腮红
          ctx.fillStyle = 'rgba(255, 100, 130, 0.45)'
          ctx.beginPath()
          ctx.ellipse(s * 14, 5, 4.5, 2.5, 0, 0, TAU)
          ctx.fill()
        }
      } else if (type === 'angry') {
        // 冲刺/攻击怒视眼神
        for (const s of [-1, 1]) {
          const ex = s * 9
          const ey = -2
          // 锐利斜眼
          ctx.fillStyle = '#1c241d'
          ctx.beginPath()
          ctx.moveTo(ex - s * 5, ey - 3)
          ctx.lineTo(ex + s * 5, ey - 1)
          ctx.lineTo(ex + s * 4, ey + 4)
          ctx.lineTo(ex - s * 4, ey + 3)
          ctx.closePath()
          ctx.fill()
          // 反光
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(ex + s * 1, ey, 1.5, 0, TAU)
          ctx.fill()
        }
        // 咬牙切齿小嘴
        ctx.strokeStyle = '#15401b'
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-4, 5)
        ctx.lineTo(4, 5)
        ctx.stroke()
      } else if (type === 'hurt') {
        // 晕眩旋转圈圈眼
        for (const s of [-1, 1]) {
          const ex = s * 9
          const ey = -2
          ctx.strokeStyle = '#1c241d'
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.arc(ex, ey, 4.5, 0, TAU)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(ex, ey, 2.2, 0, TAU)
          ctx.stroke()
        }
        // 波浪嘴
        ctx.strokeStyle = '#15401b'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(-5, 6)
        ctx.quadraticCurveTo(-2.5, 3, 0, 6)
        ctx.quadraticCurveTo(2.5, 9, 5, 6)
        ctx.stroke()
      } else if (type === 'devour') {
        // 吞噬：星星眼 + 大口吸入
        for (const s of [-1, 1]) {
          const ex = s * 10
          const ey = -5
          ctx.fillStyle = '#ffdf5d'
          ctx.beginPath()
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2
            ctx.lineTo(ex + Math.cos(a) * 5, ey + Math.sin(a) * 5)
            const a2 = a + Math.PI / 4
            ctx.lineTo(ex + Math.cos(a2) * 2, ey + Math.sin(a2) * 2)
          }
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = '#2b2100'
          ctx.lineWidth = 1
          ctx.stroke()
        }
        // 张开的大嘴
        ctx.fillStyle = '#1a0b1f'
        ctx.beginPath()
        ctx.ellipse(0, 4, 8, 7, 0, 0, TAU)
        ctx.fill()
        // 舌头
        ctx.fillStyle = '#ff6b8b'
        ctx.beginPath()
        ctx.ellipse(0, 7, 5, 3.5, 0, 0, TAU)
        ctx.fill()
      } else if (type === 'lowhp') {
        // 濒死虚弱汗滴
        for (const s of [-1, 1]) {
          const ex = s * 8
          const ey = -1
          ctx.fillStyle = '#1c241d'
          ctx.beginPath()
          ctx.ellipse(ex, ey, 3.5, 4, 0, 0, TAU)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(ex + 1, ey - 1, 1.2, 0, TAU)
          ctx.fill()
        }
        // 蓝冷汗滴
        ctx.fillStyle = '#64c8ff'
        ctx.beginPath()
        ctx.moveTo(15, -12)
        ctx.quadraticCurveTo(12, -7, 12, -4)
        ctx.arc(14.5, -4, 2.5, Math.PI, 0, true)
        ctx.quadraticCurveTo(17, -7, 15, -12)
        ctx.closePath()
        ctx.fill()
        // 倒 U 委屈嘴
        ctx.strokeStyle = '#15401b'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(0, 8, 4, Math.PI * 1.15, Math.PI * 1.85)
        ctx.stroke()
      }

      ctx.restore()
      this.sprites.set(`slime_face_${type}`, canvas)
    }
  }

  /**
   * 2. 史莱姆进化附件（角、甲壳、毒腺）
   */
  _generateSlimeProps() {
    const size = 64
    // 雷角
    {
      const { canvas, ctx } = createOffscreen(size, size)
      ctx.translate(size / 2, size / 2)
      for (const s of [-1, 1]) {
        ctx.save()
        ctx.scale(s, 1)
        const g = ctx.createLinearGradient(8, -12, 16, -26)
        g.addColorStop(0, '#ffd166')
        g.addColorStop(0.5, '#fff6a8')
        g.addColorStop(1, '#ffffff')
        ctx.fillStyle = g
        ctx.strokeStyle = '#996f12'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(7, -8)
        ctx.lineTo(13, -16)
        ctx.lineTo(18, -26)
        ctx.lineTo(13, -24)
        ctx.lineTo(9, -15)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      this.sprites.set('prop_lightning_horns', canvas)
    }

    // 火系熔岩背甲
    {
      const { canvas, ctx } = createOffscreen(size, size)
      ctx.translate(size / 2, size / 2)
      ctx.fillStyle = '#2b1b17'
      ctx.strokeStyle = '#ff6b35'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-8, -16)
      ctx.lineTo(0, -22)
      ctx.lineTo(8, -16)
      ctx.lineTo(5, -10)
      ctx.lineTo(-5, -10)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // 裂纹发光
      ctx.strokeStyle = '#ffe45e'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, -21)
      ctx.lineTo(2, -15)
      ctx.lineTo(-2, -12)
      ctx.stroke()
      this.sprites.set('prop_magma_plates', canvas)
    }

    // 毒系剧毒囊泡
    {
      const { canvas, ctx } = createOffscreen(size, size)
      ctx.translate(size / 2, size / 2)
      for (const [x, y, r] of [[-12, -12, 6], [11, -14, 5], [0, -18, 7]]) {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r)
        g.addColorStop(0, '#d4ff70')
        g.addColorStop(0.6, '#75e638')
        g.addColorStop(1, '#2c7314')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU)
        ctx.fill()
      }
      this.sprites.set('prop_poison_bubbles', canvas)
    }
  }

  /**
   * 3. 战斗与特效贴图（刀光、魔法阵、命中火花）
   */
  _generateCombatVFX() {
    // 弧形刀光 (Slash Arc: 64x64)
    {
      const { canvas, ctx } = createOffscreen(64, 64)
      ctx.translate(32, 32)
      const grad = ctx.createLinearGradient(0, -28, 28, 0)
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
      grad.addColorStop(0.3, 'rgba(180, 230, 255, 0.8)')
      grad.addColorStop(0.8, 'rgba(100, 180, 255, 0.3)')
      grad.addColorStop(1, 'rgba(60, 120, 255, 0)')

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, 26, -Math.PI * 0.45, Math.PI * 0.25, false)
      ctx.arc(0, 0, 16, Math.PI * 0.25, -Math.PI * 0.45, true)
      ctx.closePath()
      ctx.fill()
      this.sprites.set('vfx_slash_arc', canvas)
    }

    // 奥术符文阵 (Magic Rune Circle: 64x64)
    {
      const { canvas, ctx } = createOffscreen(64, 64)
      ctx.translate(32, 32)
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, 28, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 24, 0, TAU)
      ctx.stroke()
      for (let k = 0; k < 2; k++) {
        ctx.beginPath()
        for (let i = 0; i < 3; i++) {
          const a = (i * TAU) / 3 + (k * Math.PI) / 3
          const x = Math.cos(a) * 22
          const y = Math.sin(a) * 22
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(230, 200, 255, 0.6)'
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, TAU)
      ctx.fill()
      this.sprites.set('vfx_magic_circle', canvas)
    }

    // 命中火花星芒 (Hit Spark: 32x32)
    {
      const { canvas, ctx } = createOffscreen(32, 32)
      ctx.translate(16, 16)
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.3, '#ffea78')
      g.addColorStop(0.8, '#ff7a18')
      g.addColorStop(1, 'rgba(255, 60, 0, 0)')

      ctx.fillStyle = g
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14)
        const a2 = a + Math.PI / 4
        ctx.lineTo(Math.cos(a2) * 3, Math.sin(a2) * 3)
      }
      ctx.closePath()
      ctx.fill()
      this.sprites.set('vfx_hit_spark', canvas)
    }
  }

  /**
   * 4. 敌方角色精灵生成（人类勇者 + 非人敌族 + Boss）
   */
  _generateCharacters() {
    const roles = [
      'knight',
      'mage',
      'archer',
      'assassin',
      'priest',
      'berserker',
      'hound',
      'golem',
      'wraith',
      'boss_knight',
      'boss_mage',
      'boss_archer',
    ]
    for (const role of roles) {
      for (let frame = 0; frame < 5; frame++) {
        const isAttack = frame === 4
        const walkPhase = frame < 4 ? frame / 4 : 0
        const { canvas } = this._drawCharacterFrame(role, walkPhase, isAttack)
        this.sprites.set(`char_${role}_${frame}`, canvas)
      }
    }
  }

  _drawCharacterFrame(role, walkPhase, isAttack) {
    const isBoss = role.startsWith('boss_')
    const size = isBoss ? 88 : 52
    const { canvas, ctx } = createOffscreen(size, size)
    const cx = size / 2
    const cy = size / 2

    ctx.save()
    ctx.translate(cx, cy)

    const bob = isAttack ? 0 : Math.sin(walkPhase * TAU) * 1.5
    const legSwing = isAttack ? 0 : Math.sin(walkPhase * TAU) * 0.45

    if (role === 'knight') {
      this._drawKnightSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'mage') {
      this._drawMageSprite(ctx, walkPhase, bob, isAttack)
    } else if (role === 'archer') {
      this._drawArcherSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'assassin') {
      this._drawAssassinSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'priest') {
      this._drawPriestSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'berserker') {
      this._drawBerserkerSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'hound') {
      this._drawHoundSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'golem') {
      this._drawGolemSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'wraith') {
      this._drawWraithSprite(ctx, walkPhase, bob, isAttack)
    } else if (role === 'boss_knight') {
      this._drawBossKnightSprite(ctx, legSwing, bob, isAttack)
    } else if (role === 'boss_mage') {
      this._drawBossMageSprite(ctx, walkPhase, bob, isAttack)
    } else if (role === 'boss_archer') {
      this._drawBossArcherSprite(ctx, legSwing, bob, isAttack)
    }

    ctx.restore()
    return { canvas, ctx }
  }

  _drawPriestSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)

    // 头顶悬浮金色圣光光环
    ctx.strokeStyle = '#ffd32a'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(0, -17, 6, 2.2, 0, 0, TAU)
    ctx.stroke()

    // 纯白长袍下摆与金滚边
    ctx.fillStyle = '#f5f6fa'
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    ctx.lineTo(-8 + Math.sin(legSwing) * 3, 11)
    ctx.lineTo(8 - Math.sin(legSwing) * 3, 11)
    ctx.lineTo(6, -4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#f1c40f'
    ctx.lineWidth = 1.4
    ctx.stroke()

    // 圣职者双腿
    ctx.fillStyle = '#dcdde1'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 3.5, 6)
      ctx.rotate(s * legSwing * 1.1)
      ctx.fillRect(-1.5, 0, 3, 6.5)
      ctx.fillStyle = '#718093'
      ctx.fillRect(-1.5, 4.5, 3.8, 2.2)
      ctx.restore()
    }

    // 白金圣洁法衣（胸前黄金十字纹章）
    const robeG = ctx.createLinearGradient(0, -10, 0, 8)
    robeG.addColorStop(0, '#ffffff')
    robeG.addColorStop(1, '#dfe4ea')
    ctx.fillStyle = robeG
    ctx.beginPath()
    ctx.ellipse(0, 0, 6.5, 8, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#ffd32a'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 黄金十字纹章
    ctx.fillStyle = '#f39c12'
    ctx.fillRect(-1, -4, 2, 8)
    ctx.fillRect(-3.5, -2, 7, 2)

    // 头部（圣洁发冠与平静面容）
    ctx.fillStyle = '#ffeaa7'
    ctx.beginPath()
    ctx.arc(0, -9, 5.5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#2d3436'
    ctx.fillRect(-3, -9.5, 1.8, 1.8)
    ctx.fillRect(1.2, -9.5, 1.8, 1.8)

    // 双手持握黄金十字圣光权杖
    ctx.save()
    ctx.translate(8, isAttack ? -6 : -1)
    if (isAttack) {
      ctx.rotate(-0.35)
    }
    // 杖柄
    ctx.strokeStyle = '#d35400'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 10)
    ctx.lineTo(0, -14)
    ctx.stroke()
    // 杖顶十字架
    ctx.fillStyle = '#ffd32a'
    ctx.fillRect(-1.5, -18, 3, 8)
    ctx.fillRect(-5, -15, 10, 3)
    // 杖顶璀璨圣光球
    const sunG = ctx.createRadialGradient(0, -14, 1, 0, -14, 7)
    sunG.addColorStop(0, '#ffffff')
    sunG.addColorStop(0.5, '#ffd32a')
    sunG.addColorStop(1, 'rgba(241, 196, 15, 0)')
    ctx.fillStyle = sunG
    ctx.beginPath()
    ctx.arc(0, -14, 7, 0, TAU)
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  _drawBerserkerSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)

    // 狼皮披肩（深褐红）
    ctx.fillStyle = '#572314'
    ctx.beginPath()
    ctx.moveTo(-8, -6)
    ctx.lineTo(-12 + Math.sin(legSwing) * 4, 8)
    ctx.lineTo(12 - Math.sin(legSwing) * 4, 8)
    ctx.lineTo(8, -6)
    ctx.closePath()
    ctx.fill()

    // 粗壮双腿与毛皮重靴
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 4.5, 6)
      ctx.rotate(s * legSwing * 1.4)
      ctx.fillStyle = '#3d3d3d'
      ctx.fillRect(-2, 0, 4, 8)
      ctx.fillStyle = '#83341b'
      ctx.fillRect(-2, 5, 5, 3.2)
      ctx.restore()
    }

    // 狂怒肌肉躯干（古铜色肌肤 + 交叉皮带与钢扣）
    const bodyG = ctx.createLinearGradient(-6, -6, 6, 6)
    bodyG.addColorStop(0, '#d35400')
    bodyG.addColorStop(1, '#ba4300')
    ctx.fillStyle = bodyG
    ctx.beginPath()
    ctx.ellipse(0, 0, 7.5, 8.5, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#2c3e50'
    ctx.lineWidth = 1.8
    ctx.stroke()

    // 头部（狂怒刺猬红发与战吼表情）
    ctx.fillStyle = '#e74c3c' // 狂怒红发
    ctx.beginPath()
    ctx.arc(0, -9, 6.5, 0, TAU)
    ctx.fill()
    // 粗犷面孔
    ctx.fillStyle = '#e58e26'
    ctx.fillRect(-3.5, -9, 7, 5)
    // 怒目
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-3, -8, 2.2, 2.2)
    ctx.fillRect(0.8, -8, 2.2, 2.2)
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(-2, -7.5, 1.2, 1.2)
    ctx.fillRect(1.8, -7.5, 1.2, 1.2)
    // 咆哮大嘴
    ctx.fillStyle = '#2c1e1e'
    ctx.fillRect(-2, -4.5, 4, 2)

    // 双手持握巨大双刃狂战巨斧
    ctx.save()
    ctx.translate(9, isAttack ? -7 : 0)
    if (isAttack) {
      ctx.rotate(0.9) // 暴怒重劈姿态
    } else {
      ctx.rotate(0.15)
    }
    // 斧柄（粗木黑铁）
    ctx.strokeStyle = '#2f3542'
    ctx.lineWidth = 2.8
    ctx.beginPath()
    ctx.moveTo(0, 13)
    ctx.lineTo(0, -16)
    ctx.stroke()
    // 双刃钢斧头
    ctx.fillStyle = '#ced6e0'
    ctx.strokeStyle = '#747d8c'
    ctx.lineWidth = 1.4
    // 左月牙刃
    ctx.beginPath()
    ctx.moveTo(-1, -12)
    ctx.quadraticCurveTo(-9, -15, -9, -6)
    ctx.quadraticCurveTo(-9, 2, -1, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // 右月牙刃
    ctx.beginPath()
    ctx.moveTo(1, -12)
    ctx.quadraticCurveTo(9, -15, 9, -6)
    ctx.quadraticCurveTo(9, 2, 1, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // 斧芯暗红符文宝石
    ctx.fillStyle = '#eb2f06'
    ctx.beginPath()
    ctx.arc(0, -6, 2.2, 0, TAU)
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  _drawAssassinSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)

    // 醒目的幽紫绯红流光长披巾（在暗色地图上极具辨识度）
    const capeG = ctx.createLinearGradient(-6, -4, -14, 12)
    capeG.addColorStop(0, '#6c5ce7')
    capeG.addColorStop(0.6, '#a29bfe')
    capeG.addColorStop(1, '#ff3838')
    ctx.fillStyle = capeG
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    ctx.lineTo(-14 + Math.sin(legSwing) * 5, 12)
    ctx.lineTo(-5, 9)
    ctx.lineTo(-2, -4)
    ctx.closePath()
    ctx.fill()

    // 敏捷潜行双腿（暗黑皮靴 + 亮紫护腿）
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 3.5, 6)
      ctx.rotate(s * legSwing * 1.3)
      ctx.fillStyle = '#2d3436'
      ctx.fillRect(-1.5, 0, 3, 7)
      ctx.fillStyle = '#a29bfe' // 亮紫护腿
      ctx.fillRect(-1.5, 2, 3, 2)
      ctx.fillStyle = '#1e272e'
      ctx.fillRect(-1.5, 5, 4, 2.2)
      ctx.restore()
    }

    // 紧身暗夜皮甲（深炭黑 + 亮紫金镶边）
    const suitG = ctx.createLinearGradient(-5, -6, 5, 6)
    suitG.addColorStop(0, '#4b4b4b')
    suitG.addColorStop(1, '#1e272e')
    ctx.fillStyle = suitG
    ctx.beginPath()
    ctx.ellipse(0, 0, 6, 7.5, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#a29bfe'
    ctx.lineWidth = 1.4
    ctx.stroke()

    // 蒙面夜行兜帽
    ctx.fillStyle = '#2d3436'
    ctx.beginPath()
    ctx.arc(0, -8, 6, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#6c5ce7'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // 闪耀猩红冷酷眼眸（带光芒亮点，暗处极度醒目）
    ctx.fillStyle = '#ff3838'
    ctx.fillRect(-3.5, -8.8, 2.6, 1.8)
    ctx.fillRect(0.9, -8.8, 2.6, 1.8)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-2, -8.5, 1, 1)
    ctx.fillRect(2.4, -8.5, 1, 1)

    // 双持亮银淬毒锋刃匕首（亮银反光 + 荧光刃芒）
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 7.5, isAttack ? -3 : 1)
      if (isAttack) {
        ctx.rotate(s * 0.75)
      } else {
        ctx.rotate(s * -0.35)
      }
      // 亮银匕首刃身
      const dG = ctx.createLinearGradient(0, -11, 0, 4)
      dG.addColorStop(0, '#ffffff')
      dG.addColorStop(0.5, '#dcdde1')
      dG.addColorStop(1, '#718093')
      ctx.fillStyle = dG
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(2.6, 1)
      ctx.lineTo(-2.6, 1)
      ctx.closePath()
      ctx.fill()
      // 青紫荧光附魔刃芒
      ctx.strokeStyle = '#00d2d3'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 握柄
      ctx.fillStyle = '#2f3640'
      ctx.fillRect(-1.5, 1, 3, 3.5)
      // 护手金色圆点
      ctx.fillStyle = '#ffd32a'
      ctx.beginPath()
      ctx.arc(0, 1, 1.4, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()
  }

  /** 战獒：王室猎犬——四足侧身，低伏疾行，项圈铜钉 */
  _drawHoundSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob + 3)

    // 四条腿（前后肢交错摆动）
    ctx.strokeStyle = '#5d3a1c'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    for (const [lx, phase] of [[-6, 0], [-3, Math.PI], [5, Math.PI], [8, 0]]) {
      const swing = Math.sin(legSwing + phase) * 3.5
      ctx.beginPath()
      ctx.moveTo(lx, 2)
      ctx.lineTo(lx + swing, 9)
      ctx.stroke()
    }

    // 低伏躯干
    const bodyG = ctx.createLinearGradient(0, -6, 0, 5)
    bodyG.addColorStop(0, '#b8834e')
    bodyG.addColorStop(1, '#6b4520')
    ctx.fillStyle = bodyG
    ctx.beginPath()
    ctx.ellipse(0, -1, 11, 5.5, 0, 0, TAU)
    ctx.fill()

    // 背脊鬃毛
    ctx.strokeStyle = '#3d2712'
    ctx.lineWidth = 1.4
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 3.2, -6)
      ctx.lineTo(i * 3.2 - 1, -9 - Math.abs(i) * -0.8)
      ctx.stroke()
    }

    // 头颈（攻击帧前扑）
    ctx.save()
    ctx.translate(10, isAttack ? -3 : -2)
    if (isAttack) ctx.rotate(0.35)
    const headG = ctx.createLinearGradient(0, -5, 0, 3)
    headG.addColorStop(0, '#c99760')
    headG.addColorStop(1, '#7a4e24')
    ctx.fillStyle = headG
    ctx.beginPath()
    ctx.ellipse(2, 0, 5.5, 4, 0, 0, TAU)
    ctx.fill()
    // 张口獠牙（攻击帧咧嘴）
    ctx.fillStyle = '#2a180a'
    ctx.beginPath()
    ctx.ellipse(6, 1, 2.4, isAttack ? 2 : 1.2, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#f4f0e8'
    ctx.beginPath()
    ctx.moveTo(5, -0.5)
    ctx.lineTo(6, 1.8)
    ctx.lineTo(7, -0.5)
    ctx.closePath()
    ctx.fill()
    // 血红细目
    ctx.fillStyle = '#ff5040'
    ctx.beginPath()
    ctx.arc(3, -1.5, 1.1, 0, TAU)
    ctx.fill()
    // 折耳
    ctx.fillStyle = '#5d3a1c'
    ctx.beginPath()
    ctx.moveTo(-1, -3.5)
    ctx.lineTo(1, -8)
    ctx.lineTo(3.5, -3)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 尾巴（兴奋上扬摆动）
    ctx.strokeStyle = '#6b4520'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(-10, -2)
    ctx.quadraticCurveTo(-15, -6 + Math.sin(legSwing * 2) * 2, -13, -10)
    ctx.stroke()

    // 王室铜钉项圈
    ctx.strokeStyle = '#c8963e'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(6, -5)
    ctx.lineTo(7, 2)
    ctx.stroke()
    ctx.fillStyle = '#ffd66e'
    for (const py of [-3, 0]) {
      ctx.beginPath()
      ctx.arc(6.6, py, 0.8, 0, TAU)
      ctx.fill()
    }

    ctx.restore()
  }

  /** 王朝魔像：奥术构造体——巨岩躯干、蓝辉核心、粗重石臂 */
  _drawGolemSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob + 2)

    // 石柱腿（缓慢交替）
    ctx.fillStyle = '#3d5266'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 5, 8)
      ctx.rotate(s * legSwing * 0.5)
      ctx.fillRect(-3.5, 0, 7, 7)
      ctx.fillStyle = '#2b3b4a'
      ctx.fillRect(-4.2, 5.5, 8.4, 2.5)
      ctx.fillStyle = '#3d5266'
      ctx.restore()
    }

    // 巨岩躯干（层叠石块）
    const torsoG = ctx.createLinearGradient(-10, -12, 10, 10)
    torsoG.addColorStop(0, '#8fa9c2')
    torsoG.addColorStop(0.55, '#5d7d9a')
    torsoG.addColorStop(1, '#35485c')
    ctx.fillStyle = torsoG
    ctx.beginPath()
    ctx.moveTo(-10, -8)
    ctx.lineTo(10, -8)
    ctx.lineTo(8.5, 8)
    ctx.lineTo(-8.5, 8)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#243544'
    ctx.lineWidth = 1.4
    ctx.stroke()

    // 砌石缝纹
    ctx.strokeStyle = 'rgba(20, 32, 44, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-9, -2)
    ctx.lineTo(9, -2)
    ctx.moveTo(-3, -8)
    ctx.lineTo(-4, -2)
    ctx.moveTo(3, -8)
    ctx.lineTo(4, -2)
    ctx.moveTo(-5, -2)
    ctx.lineTo(-6, 8)
    ctx.moveTo(5, -2)
    ctx.lineTo(6, 8)
    ctx.stroke()

    // 胸口奥术核心（攻击帧炽亮）
    const coreG = ctx.createRadialGradient(0, 0, 0.5, 0, 0, isAttack ? 6.5 : 4.5)
    coreG.addColorStop(0, '#eafcff')
    coreG.addColorStop(0.4, '#4ad8e8')
    coreG.addColorStop(1, 'rgba(30, 100, 140, 0.25)')
    ctx.fillStyle = coreG
    ctx.beginPath()
    ctx.arc(0, 0, isAttack ? 6.5 : 4.5, 0, TAU)
    ctx.fill()
    // 核心符文环
    ctx.strokeStyle = isAttack ? '#bff6ff' : 'rgba(120, 220, 235, 0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 7.5, 0.4, Math.PI - 0.4)
    ctx.stroke()

    // 粗重石臂（右臂攻击帧高举砸下）
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 12, -4)
      if (s === 1 && isAttack) {
        ctx.rotate(1.9)
      } else if (s === 1) {
        ctx.rotate(Math.sin(legSwing) * 0.15)
      } else {
        ctx.rotate(-Math.sin(legSwing) * 0.15)
      }
      ctx.fillStyle = '#4c6478'
      ctx.beginPath()
      ctx.ellipse(0, 4, 4, 8.5, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#243544'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 拳峰碎石
      ctx.fillStyle = '#66808f'
      ctx.beginPath()
      ctx.arc(0, 11, 4.2, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    // 岩雕头部（单眼蓝辉）
    ctx.fillStyle = '#54718a'
    ctx.beginPath()
    ctx.moveTo(-6, -8)
    ctx.lineTo(6, -8)
    ctx.lineTo(4.5, -16)
    ctx.lineTo(-4.5, -16)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#243544'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = isAttack ? '#bff6ff' : '#4ad8e8'
    ctx.beginPath()
    ctx.ellipse(0, -12, 3.4, 1.6, 0, 0, TAU)
    ctx.fill()

    // 头肩苔藓（年代感）
    ctx.fillStyle = 'rgba(90, 130, 80, 0.5)'
    ctx.beginPath()
    ctx.ellipse(-4, -14.5, 2.2, 1.1, 0.4, 0, TAU)
    ctx.ellipse(8, -7, 2.4, 1.2, -0.3, 0, TAU)
    ctx.fill()

    ctx.restore()
  }

  /** 怨灵：王陵亡魂——兜帽碎袍、幽绿目焰、下摆飘散 */
  _drawWraithSprite(ctx, walkPhase, bob, isAttack) {
    ctx.save()
    const floatBob = Math.sin(walkPhase * TAU) * 2.5 - 2.5
    ctx.translate(0, floatBob)

    // 拖尾幽雾
    ctx.fillStyle = 'rgba(77, 184, 154, 0.16)'
    ctx.beginPath()
    ctx.ellipse(0, 10, 9, 5 + Math.sin(walkPhase * TAU) * 1.5, 0, 0, TAU)
    ctx.fill()

    // 碎袍下摆（三片飘带，随步伐交错）
    const robeG = ctx.createLinearGradient(0, -10, 0, 12)
    robeG.addColorStop(0, '#3d8570')
    robeG.addColorStop(0.6, '#245c4d')
    robeG.addColorStop(1, 'rgba(20, 50, 44, 0.1)')
    ctx.fillStyle = robeG
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    for (const [tx, wobble] of [[-7, 0], [-2, 1.6], [3, -1.2], [7, 0.6]]) {
      ctx.lineTo(tx, 11 + Math.sin(walkPhase * TAU + wobble * 3) * 2)
      ctx.lineTo(tx + 2.4, 11)
    }
    ctx.lineTo(6, -4)
    ctx.closePath()
    ctx.fill()

    // 幽躯
    const bodyG = ctx.createRadialGradient(-2, -4, 1, 0, 0, 10)
    bodyG.addColorStop(0, '#9ae8cf')
    bodyG.addColorStop(0.5, '#4db89a')
    bodyG.addColorStop(1, '#1e5c4a')
    ctx.fillStyle = bodyG
    ctx.beginPath()
    ctx.ellipse(0, -2, 6.5, 8, 0, 0, TAU)
    ctx.fill()

    // 兜帽（空洞面向玩家）
    ctx.fillStyle = '#16352c'
    ctx.beginPath()
    ctx.moveTo(-6, -8)
    ctx.quadraticCurveTo(0, -20, 6, -8)
    ctx.quadraticCurveTo(0, -4, -6, -8)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#2f7a63'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // 帽下双目鬼火（攻击帧炽盛）
    const flame = isAttack ? 2 : 1.4
    ctx.fillStyle = '#8affd8'
    ctx.shadowColor = '#4dffb8'
    ctx.shadowBlur = isAttack ? 8 : 4
    for (const ex of [-2.2, 2.2]) {
      ctx.beginPath()
      ctx.arc(ex, -10.5, flame * 0.75, 0, TAU)
      ctx.fill()
    }
    ctx.shadowBlur = 0

    // 爪状双臂（攻击帧前伸抓取）
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 7.5, 0)
      ctx.rotate(s * (isAttack ? -0.9 : -0.35))
      ctx.strokeStyle = '#2a6b58'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(s * 3.5, 5.5)
      ctx.stroke()
      // 尖爪
      ctx.strokeStyle = '#9ae8cf'
      ctx.lineWidth = 1.1
      for (let c = -1; c <= 1; c++) {
        ctx.beginPath()
        ctx.moveTo(s * 3.5, 5.5)
        ctx.lineTo(s * 5 + c * 1.5, 9)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 环绕墓尘微光
    ctx.fillStyle = 'rgba(160, 255, 220, 0.35)'
    for (let i = 0; i < 3; i++) {
      const a = walkPhase * TAU + (i * TAU) / 3
      ctx.beginPath()
      ctx.arc(Math.cos(a) * 10, Math.sin(a) * 6 - 2, 0.9, 0, TAU)
      ctx.fill()
    }

    ctx.restore()
  }

  _drawKnightSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)

    // 蓝色小披风
    ctx.fillStyle = '#2b508f'
    ctx.beginPath()
    ctx.moveTo(-7, -4)
    ctx.lineTo(-12 + Math.sin(legSwing) * 3, 11)
    ctx.lineTo(-4, 10)
    ctx.lineTo(-2, -4)
    ctx.closePath()
    ctx.fill()

    // 腿与铁靴
    ctx.fillStyle = '#4a5b73'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 4, 6)
      ctx.rotate(s * legSwing)
      ctx.fillRect(-2, 0, 4, 7)
      ctx.fillStyle = '#2d3b4e'
      ctx.fillRect(-2, 5, 5, 2.5)
      ctx.restore()
    }

    // 铁甲身躯
    const bodyG = ctx.createLinearGradient(-6, -6, 6, 6)
    bodyG.addColorStop(0, '#c2d1e8')
    bodyG.addColorStop(0.5, '#7f93b0')
    bodyG.addColorStop(1, '#475870')
    ctx.fillStyle = bodyG
    ctx.beginPath()
    ctx.ellipse(0, 0, 7, 8, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#293545'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // 银色肩甲
    ctx.fillStyle = '#d0deef'
    ctx.beginPath()
    ctx.arc(-7, -3, 3.5, 0, TAU)
    ctx.arc(7, -3, 3.5, 0, TAU)
    ctx.fill()

    // 骑士全罩头盔 + T型视缝
    ctx.fillStyle = '#9eb3cf'
    ctx.beginPath()
    ctx.arc(0, -9, 6.5, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#293545'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = '#d8e5f5'
    ctx.fillRect(-1.2, -16, 2.4, 7)
    ctx.fillStyle = '#1a232f'
    ctx.fillRect(-4, -9, 8, 1.8)
    ctx.fillRect(-1, -9, 2, 4)

    // 左手圆盾
    ctx.save()
    ctx.translate(-9, 1)
    ctx.fillStyle = '#3a62a3'
    ctx.beginPath()
    ctx.arc(0, 0, 5.5, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#c2d1e8'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, 1.5, 0, TAU)
    ctx.fill()
    ctx.restore()

    // 右手精钢剑
    ctx.save()
    ctx.translate(8, 0)
    if (isAttack) {
      ctx.rotate(0.6)
    }
    const swordG = ctx.createLinearGradient(0, -16, 0, 2)
    swordG.addColorStop(0, '#ffffff')
    swordG.addColorStop(1, '#a6bace')
    ctx.fillStyle = swordG
    ctx.fillRect(0, -14, 2.5, 14)
    ctx.beginPath()
    ctx.moveTo(0, -14)
    ctx.lineTo(1.25, -17)
    ctx.lineTo(2.5, -14)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#8a6538'
    ctx.fillRect(-2.5, 0, 7.5, 2)
    ctx.fillRect(0, 2, 2.5, 3.5)
    ctx.restore()

    ctx.restore()
  }

  _drawMageSprite(ctx, walkPhase, bob, isAttack) {
    ctx.save()
    const floatBob = Math.sin(walkPhase * TAU) * 2.5 - 2
    ctx.translate(0, floatBob)

    // 法袍下摆
    ctx.fillStyle = '#4a2f73'
    ctx.beginPath()
    ctx.moveTo(-6, -2)
    ctx.lineTo(-8 + Math.sin(walkPhase * TAU) * 2, 12)
    ctx.lineTo(8 + Math.sin(walkPhase * TAU + 1) * 2, 12)
    ctx.lineTo(6, -2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // 法袍上身
    const robeG = ctx.createLinearGradient(-6, -6, 6, 6)
    robeG.addColorStop(0, '#8558c4')
    robeG.addColorStop(1, '#532f8a')
    ctx.fillStyle = robeG
    ctx.beginPath()
    ctx.ellipse(0, -1, 6, 7, 0, 0, TAU)
    ctx.fill()

    // 头部神秘脸
    ctx.fillStyle = '#221533'
    ctx.beginPath()
    ctx.arc(0, -8, 5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ffeaa7'
    ctx.beginPath()
    ctx.arc(-2, -8, 1.2, 0, TAU)
    ctx.arc(2, -8, 1.2, 0, TAU)
    ctx.fill()

    // 尖顶巫师帽
    ctx.fillStyle = '#391e5e'
    ctx.beginPath()
    ctx.ellipse(0, -9, 9, 2.5, 0, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-6, -9)
    ctx.quadraticCurveTo(-1, -18, 3, -21)
    ctx.lineTo(6, -9)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd166'
    ctx.fillRect(-5, -10.5, 10, 1.8)
    ctx.fillStyle = '#d980fa'
    ctx.beginPath()
    ctx.arc(0, -9.5, 1.8, 0, TAU)
    ctx.fill()

    // 法杖
    ctx.save()
    ctx.translate(9, -2)
    if (isAttack) ctx.rotate(-0.3)
    ctx.strokeStyle = '#5a3d28'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 12)
    ctx.lineTo(0, -12)
    ctx.stroke()
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, -12, 4, Math.PI * 0.3, Math.PI * 1.7)
    ctx.stroke()
    const orbG = ctx.createRadialGradient(-1, -13, 0.5, 0, -12, 4)
    orbG.addColorStop(0, '#ffffff')
    orbG.addColorStop(0.5, '#d980fa')
    orbG.addColorStop(1, '#833471')
    ctx.fillStyle = orbG
    ctx.beginPath()
    ctx.arc(0, -12, isAttack ? 4.5 : 3.2, 0, TAU)
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  _drawArcherSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)

    // 背部箭袋
    ctx.fillStyle = '#5c3a21'
    ctx.save()
    ctx.rotate(0.3)
    ctx.fillRect(-7, -10, 4, 10)
    ctx.fillStyle = '#ecf0f1'
    ctx.fillRect(-8, -13, 2, 4)
    ctx.fillRect(-5, -14, 2, 5)
    ctx.restore()

    // 双腿
    ctx.fillStyle = '#30522c'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 3.5, 6)
      ctx.rotate(s * legSwing)
      ctx.fillRect(-1.5, 0, 3, 7)
      ctx.fillStyle = '#543d2b'
      ctx.fillRect(-1.5, 5, 4, 2.2)
      ctx.restore()
    }

    // 翠绿游侠紧身衣
    const tunicG = ctx.createLinearGradient(-5, -6, 5, 6)
    tunicG.addColorStop(0, '#58a049')
    tunicG.addColorStop(1, '#2f6923')
    ctx.fillStyle = tunicG
    ctx.beginPath()
    ctx.ellipse(0, 0, 6, 7.5, 0, 0, TAU)
    ctx.fill()

    ctx.strokeStyle = '#543d2b'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-5, -4)
    ctx.lineTo(5, 4)
    ctx.stroke()

    // 游侠兜帽
    ctx.fillStyle = '#396b2d'
    ctx.beginPath()
    ctx.arc(0, -8, 6, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#f5cd79'
    ctx.beginPath()
    ctx.arc(1, -7.5, 3.8, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#1c241d'
    ctx.fillRect(0, -8.5, 1.8, 1.8)
    ctx.fillRect(3, -8.5, 1.8, 1.8)
    ctx.fillStyle = '#2b5422'
    ctx.beginPath()
    ctx.moveTo(-5, -11)
    ctx.lineTo(-8, -14)
    ctx.lineTo(-2, -12)
    ctx.closePath()
    ctx.fill()

    // 猎弓
    ctx.save()
    ctx.translate(8, 0)
    ctx.strokeStyle = '#784e2d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 9, -Math.PI * 0.45, Math.PI * 0.45)
    ctx.stroke()
    ctx.strokeStyle = '#dcdde1'
    ctx.lineWidth = 1
    const p1y = -Math.sin(Math.PI * 0.45) * 9
    const p1x = Math.cos(Math.PI * 0.45) * 9
    const p2y = Math.sin(Math.PI * 0.45) * 9
    const p2x = Math.cos(Math.PI * 0.45) * 9

    if (isAttack) {
      ctx.beginPath()
      ctx.moveTo(p1x, p1y)
      ctx.lineTo(-5, 0)
      ctx.lineTo(p2x, p2y)
      ctx.stroke()
      ctx.strokeStyle = '#dcdde1'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-5, 0)
      ctx.lineTo(8, 0)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(p1x, p1y)
      ctx.lineTo(p2x, p2y)
      ctx.stroke()
    }
    ctx.restore()

    ctx.restore()
  }

  _drawBossKnightSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)
    ctx.scale(1.4, 1.4)

    // 猩红披风
    ctx.fillStyle = '#8a1818'
    ctx.beginPath()
    ctx.moveTo(-10, -8)
    ctx.lineTo(-18 + Math.sin(legSwing) * 3, 16)
    ctx.lineTo(18 - Math.sin(legSwing) * 3, 16)
    ctx.lineTo(10, -8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f5f6fa'
    ctx.beginPath()
    ctx.ellipse(0, -9, 11, 4, 0, 0, TAU)
    ctx.fill()

    // 腿甲
    ctx.fillStyle = '#2f3542'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 6, 8)
      ctx.rotate(s * legSwing)
      ctx.fillRect(-3, 0, 6, 10)
      ctx.fillStyle = '#ffd166'
      ctx.fillRect(-3, 8, 7, 3)
      ctx.restore()
    }

    // 金纹重铠
    const armorG = ctx.createLinearGradient(-10, -10, 10, 10)
    armorG.addColorStop(0, '#57606f')
    armorG.addColorStop(0.5, '#2f3542')
    armorG.addColorStop(1, '#1e272e')
    ctx.fillStyle = armorG
    ctx.beginPath()
    ctx.ellipse(0, 0, 10, 11, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 1.8
    ctx.stroke()

    // 肩甲
    ctx.fillStyle = '#ffd166'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(s * 11, -5, 5.5, 0, TAU)
      ctx.fill()
    }

    // 头盔与皇冠
    ctx.fillStyle = '#747d8c'
    ctx.beginPath()
    ctx.arc(0, -12, 8.5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.moveTo(-8, -15)
    ctx.lineTo(-8, -22)
    ctx.lineTo(-4, -18)
    ctx.lineTo(0, -25)
    ctx.lineTo(4, -18)
    ctx.lineTo(8, -22)
    ctx.lineTo(8, -15)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ff4757'
    ctx.beginPath()
    ctx.arc(0, -17, 2, 0, TAU)
    ctx.fill()

    // 黄金符文巨剑
    ctx.save()
    ctx.translate(14, 0)
    if (isAttack) ctx.rotate(0.8)
    const swordG = ctx.createLinearGradient(0, -26, 0, 4)
    swordG.addColorStop(0, '#ffffff')
    swordG.addColorStop(0.5, '#ffd166')
    swordG.addColorStop(1, '#e67e22')
    ctx.fillStyle = swordG
    ctx.fillRect(-1, -24, 4.5, 24)
    ctx.beginPath()
    ctx.moveTo(-1, -24)
    ctx.lineTo(1.25, -28)
    ctx.lineTo(3.5, -24)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd166'
    ctx.fillRect(-4, 0, 10, 3)
    ctx.fillStyle = '#2f3542'
    ctx.fillRect(0, 3, 2.5, 5)
    ctx.restore()

    ctx.restore()
  }

  _drawBossMageSprite(ctx, walkPhase, bob, isAttack) {
    ctx.save()
    const floatBob = Math.sin(walkPhase * TAU) * 3 - 3
    ctx.translate(0, floatBob)
    ctx.scale(1.4, 1.4)

    // 星云长袍
    const robeG = ctx.createLinearGradient(0, -10, 0, 16)
    robeG.addColorStop(0, '#3c1361')
    robeG.addColorStop(0.7, '#1b1464')
    robeG.addColorStop(1, '#0c2461')
    ctx.fillStyle = robeG
    ctx.beginPath()
    ctx.moveTo(-9, -4)
    ctx.lineTo(-13 + Math.sin(walkPhase * TAU) * 3, 16)
    ctx.lineTo(13 + Math.sin(walkPhase * TAU + 1) * 3, 16)
    ctx.lineTo(9, -4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#00d2d3'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    for (const [sx, sy] of [[-4, 8], [3, 12], [0, 4]]) {
      ctx.beginPath()
      ctx.arc(sx, sy, 1, 0, TAU)
      ctx.fill()
    }

    ctx.fillStyle = '#2c0b4d'
    ctx.beginPath()
    ctx.arc(0, -11, 7.5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#f5f6fa'
    ctx.beginPath()
    ctx.moveTo(-4, -8)
    ctx.lineTo(0, -1)
    ctx.lineTo(4, -8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#00d2d3'
    ctx.beginPath()
    ctx.arc(-2.5, -11, 1.5, 0, TAU)
    ctx.arc(2.5, -11, 1.5, 0, TAU)
    ctx.fill()

    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + walkPhase * TAU
      const ox = Math.cos(a) * 16
      const oy = Math.sin(a) * 7 - 4
      const g = ctx.createRadialGradient(ox, oy, 1, ox, oy, 4)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.5, '#a29bfe')
      g.addColorStop(1, 'rgba(108, 92, 231, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(ox, oy, 4, 0, TAU)
      ctx.fill()
    }

    ctx.save()
    ctx.translate(13, -4)
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, 18)
    ctx.lineTo(0, -16)
    ctx.stroke()
    ctx.fillStyle = '#00d2d3'
    ctx.beginPath()
    ctx.moveTo(0, -24)
    ctx.lineTo(4, -18)
    ctx.lineTo(0, -12)
    ctx.lineTo(-4, -18)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  _drawBossArcherSprite(ctx, legSwing, bob, isAttack) {
    ctx.save()
    ctx.translate(0, bob)
    ctx.scale(1.4, 1.4)

    ctx.fillStyle = '#10ac84'
    ctx.beginPath()
    ctx.moveTo(-8, -6)
    ctx.lineTo(-14 + Math.sin(legSwing) * 3, 14)
    ctx.lineTo(-4, 12)
    ctx.lineTo(-2, -6)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#222f3e'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(s * 5, 8)
      ctx.rotate(s * legSwing)
      ctx.fillRect(-2, 0, 4, 9)
      ctx.fillStyle = '#10ac84'
      ctx.fillRect(-2, 7, 5, 2.5)
      ctx.restore()
    }

    ctx.fillStyle = '#1dd1a1'
    ctx.beginPath()
    ctx.ellipse(0, 0, 8, 9, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#f5cd79'
    ctx.beginPath()
    ctx.arc(0, -11, 7, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ffd32a'
    ctx.fillRect(-6, -16, 12, 6)
    ctx.fillStyle = '#10ac84'
    ctx.fillRect(-7, -13, 14, 2)

    ctx.save()
    ctx.translate(11, 0)
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 2.8
    ctx.beginPath()
    ctx.arc(0, 0, 14, -Math.PI * 0.45, Math.PI * 0.45)
    ctx.stroke()
    ctx.strokeStyle = '#00d2d3'
    ctx.lineWidth = 1.2
    const p1y = -Math.sin(Math.PI * 0.45) * 14
    const p1x = Math.cos(Math.PI * 0.45) * 14
    const p2y = Math.sin(Math.PI * 0.45) * 14
    const p2x = Math.cos(Math.PI * 0.45) * 14
    ctx.beginPath()
    ctx.moveTo(p1x, p1y)
    ctx.lineTo(isAttack ? -7 : p1x, 0)
    ctx.lineTo(p2x, p2y)
    ctx.stroke()
    ctx.restore()

    ctx.restore()
  }

  get(key) {
    return this.sprites.get(key)
  }

  draw(ctx, key, x, y, w, h) {
    const s = this.sprites.get(key)
    if (!s) return false
    if (w !== undefined && h !== undefined) {
      ctx.drawImage(s, x - w / 2, y - h / 2, w, h)
    } else {
      ctx.drawImage(s, x - s.width / 4, y - s.height / 4, s.width / 2, s.height / 2)
    }
    return true
  }
}
