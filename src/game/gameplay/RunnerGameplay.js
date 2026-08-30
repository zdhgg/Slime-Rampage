import { GameplayController } from './GameplayController.js'

const LANE_COUNT = 3 // 三线推进：三条纵向通道（左/中/右）
const TAU = Math.PI * 2

// 通道几何比例（唯一计算入口在 _ensureLayout / laneCenterX，禁止散落 width * xxx）
const LANE_WIDTH_RATIO = 0.16
const LANE_MIN_WIDTH = 48
const LANE_GAP_RATIO = 0.35
const LANE_TOP_RATIO = 0.06
const LANE_HEIGHT_RATIO = 0.9
// 玩家纵向位置：固定在画面下方区域
const PLAYER_Y_RATIO = 0.78
const PLAYER_RADIUS_RATIO = 0.3 // 史莱姆占位/子弹出生点共用的身体半径（相对通道宽）
// 玩家 X 平滑过渡：60fps 基准下每帧 22% 收敛（帧率无关指数插值）
const LANE_LERP_PER_FRAME = 0.22

// 最小射击闭环：固定射速自动射击（无需射击键）
const FIRE_INTERVAL = 1 / 5 // 每秒 5 发
const BULLET_SPEED = 900 // 子弹上飞速度（px/s）
const BULLET_RADIUS = 5
const BULLET_MARGIN = 40 // 子弹飞出通道顶部后的清除余量
const TARGET_HP = 5 // 测试靶生命（按每秒 5 发约 1 秒摧毁一个）
const TARGET_Y_RATIO = 0.25 // 靶子纵向位置（画面上方区域）
const TARGET_WIDTH_RATIO = 0.5 // 靶宽相对通道宽
const TARGET_MIN_H = 22 // 靶高下限
const TARGET_HEIGHT_RATIO = 0.15

// Runner 走廊配色：夜色底 + 冷色通道描边（与 Arena 的野外主题区分开）
const RUNNER_BG = '#0d1520'
const LANE_FILL = 'rgba(122, 178, 255, 0.06)'
const LANE_EDGE = 'rgba(122, 178, 255, 0.35)'
// 史莱姆占位与射击闭环配色（沿用 Arena 基础形态色系）
const SLIME_BODY = '#8ae84a'
const SLIME_EDGE = '#2f9e3a'
const BULLET_COLOR = '#ffd166'
const TARGET_BODY = 'rgba(236, 196, 119, 0.9)'
const TARGET_HP_OK = '#8ae84a'
const TARGET_HP_LOW = '#ff6b4a'
const TARGET_FONT = 'bold 12px sans-serif'

/**
 * Runner 玩法（原型射击阶段）：三线推进射击的空间范式。
 *
 * 已实现：三通道玩家移动（边沿触发/边界钳制/平滑过渡）+ 最小射击闭环——
 * 固定射速自动射击（无需射击键），子弹从玩家位置沿发射 lane 上飞，
 * 只命中同 lane 的测试靶；靶扣血、血条/HP 数值实时展示，归零后消失；
 * 已发射子弹保持原 lane，切换 lane 后新子弹跟随新 lane；
 * resize 后子弹与靶的 lane X 坐标保持对齐。
 * 仍未实现：怪物 AI/WeaponSystem 接入/Gate/Buff/开始界面入口。
 * 不接 RunRules.MODE_IDS，仅可通过 configureGameplay('runner') 进入。
 */
export class RunnerGameplay extends GameplayController {
  constructor() {
    super('runner')
    this.currentLane = 1 // 默认中间通道
    this.playerX = 0 // 玩家显示 X（平滑过渡中的当前值，CSS 像素）
    this.playerY = 0 // 玩家显示 Y（随视口高度固定在下方区域）
    this._prevLeft = false // 上一帧左键状态（边沿触发用）
    this._prevRight = false // 上一帧右键状态
    this._fireCooldown = 0 // 距下次自动射击的计时（秒）
    this._bullets = [] // 玩家子弹：{ lane, x, y }（lane 为发射时所属，不可变）
    this._targets = null // 测试靶：{ lane, hp, maxHp }（首次布局时创建，按 lane 索引）
    // 视口几何缓存（_ensureLayout 更新；热路径只读数值，零分配）
    this._viewportW = 0
    this._viewportH = 0
    this._laneW = 0
    this._laneGap = 0
    this._laneStartX = 0
    this._laneTop = 0
    this._laneH = 0
    this._targetY = 0
    this._targetW = 0
    this._targetH = 0
  }

  attach(game) {
    super.attach(game)
    this._ensureLayout() // attach 时视口尺寸已就绪（Engine 构造末尾）
  }

  /** Runner 接管每帧世界更新/渲染，不走 Arena 帧管线 */
  usesArenaFramePipeline() {
    return false
  }

  /**
   * 世界更新：通道切换输入 → 玩家 X 平滑过渡 → 自动射击 → 子弹推进与命中。
   * 边沿触发：只在「上一帧未按、本帧按下」的瞬间切换，按住不连跳。
   */
  updateWorld(dt) {
    const game = this.game
    if (!game) return
    this._ensureLayout()

    const state = game.input.state
    const left = !!state.left
    const right = !!state.right
    if (left && !this._prevLeft && this.currentLane > 0) this.currentLane--
    if (right && !this._prevRight && this.currentLane < LANE_COUNT - 1) this.currentLane++
    this._prevLeft = left
    this._prevRight = right

    // 平滑过渡：帧率无关的指数收敛（首帧 dt=0 时原地不动）
    const targetX = this.laneCenterX(this.currentLane)
    const k = 1 - Math.pow(1 - LANE_LERP_PER_FRAME, dt * 60)
    this.playerX += (targetX - this.playerX) * k

    this._updateShooting(dt)
  }

  /** 第 lane 条通道（0..2）的中心 X：lane 坐标计算的唯一入口 */
  laneCenterX(lane) {
    return this._laneStartX + lane * (this._laneW + this._laneGap) + this._laneW / 2
  }

  /** 自动射击 + 子弹推进 + 同 lane 命中判定 */
  _updateShooting(dt) {
    // 固定射速：FIRE_INTERVAL 大于单帧 dt 上限，逐帧重置即可保持节拍
    if (dt > 0) {
      this._fireCooldown -= dt
      if (this._fireCooldown <= 0) {
        this._fireCooldown = FIRE_INTERVAL
        this._bullets.push({
          lane: this.currentLane, // 发射时所属 lane，此后不可变
          x: this.playerX, // 出生于玩家当前位置（此前该弹跟随旧 lane 飞行）
          y: this.playerY - this._laneW * PLAYER_RADIUS_RATIO,
        })
      }
    }

    // 子弹推进；命中判定按「上一帧 → 本帧跨越靶面」检测，天然防穿透；
    // 靶只查 this._targets[b.lane]——子弹永远命中不了其他 lane 的目标
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const bullet = this._bullets[i]
      const prevY = bullet.y
      bullet.y -= BULLET_SPEED * dt
      const target = this._targets[bullet.lane]
      const contactY = this._targetY + this._targetH / 2
      if (target && target.hp > 0 && prevY >= contactY && bullet.y < contactY) {
        target.hp -= 1 // 命中扣血；hp <= 0 后 render 跳过 → 目标消失
        this._bullets.splice(i, 1)
        continue
      }
      if (bullet.y < this._laneTop - BULLET_MARGIN) this._bullets.splice(i, 1)
    }
  }

  /** 世界渲染：夜色走廊 + 三条纵向通道 + 测试靶 + 玩家史莱姆 + 子弹 */
  renderWorld(ctx) {
    const game = this.game
    if (!game) return
    this._ensureLayout()
    const width = game.width
    const height = game.height

    // 夜色走廊底色（铺满视口）
    ctx.fillStyle = RUNNER_BG
    ctx.fillRect(0, 0, width, height)

    // 三条纵向通道：居中排列，宽度与高度随视口缩放
    ctx.lineWidth = 2
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = this._laneStartX + i * (this._laneW + this._laneGap)
      ctx.fillStyle = LANE_FILL
      ctx.fillRect(x, this._laneTop, this._laneW, this._laneH)
      ctx.strokeStyle = LANE_EDGE
      ctx.strokeRect(x, this._laneTop, this._laneW, this._laneH)
    }

    this._renderTargets(ctx)
    this._renderPlayerPlaceholder(ctx)
    this._renderBullets(ctx)
  }

  /** 测试靶：靶体 + 血条 + HP 数值（hp <= 0 的靶直接跳过 = 消失） */
  _renderTargets(ctx) {
    const targets = this._targets
    if (!targets) return
    const halfW = this._targetW / 2
    const halfH = this._targetH / 2
    ctx.font = TARGET_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const target of targets) {
      if (target.hp <= 0) continue
      const x = this.laneCenterX(target.lane)
      ctx.fillStyle = TARGET_BODY
      ctx.fillRect(x - halfW, this._targetY - halfH, this._targetW, this._targetH)
      const barY = this._targetY - halfH - 10
      const ratio = target.hp / target.maxHp
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.fillRect(x - halfW, barY, this._targetW, 4)
      ctx.fillStyle = ratio > 0.4 ? TARGET_HP_OK : TARGET_HP_LOW
      ctx.fillRect(x - halfW, barY, this._targetW * ratio, 4)
      ctx.fillStyle = 'rgba(244, 238, 230, 0.85)'
      ctx.fillText(String(target.hp), x, this._targetY)
    }
  }

  /** 史莱姆占位图形（Canvas 基础图形）：椭圆身体 + 高光 + 双眼 */
  _renderPlayerPlaceholder(ctx) {
    const r = this._laneW * PLAYER_RADIUS_RATIO
    const px = this.playerX
    const py = this.playerY

    ctx.fillStyle = SLIME_BODY
    ctx.beginPath()
    ctx.ellipse(px, py, r, r * 0.78, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = SLIME_EDGE
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.ellipse(px - r * 0.35, py - r * 0.35, r * 0.22, r * 0.14, -0.6, 0, TAU)
    ctx.fill()

    ctx.fillStyle = SLIME_EDGE
    ctx.beginPath()
    ctx.arc(px - r * 0.28, py - r * 0.1, r * 0.09, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px + r * 0.28, py - r * 0.1, r * 0.09, 0, TAU)
    ctx.fill()
  }

  /** 子弹：圆形弹体，绘制在靶与玩家之上 */
  _renderBullets(ctx) {
    ctx.fillStyle = BULLET_COLOR
    for (const bullet of this._bullets) {
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, TAU)
      ctx.fill()
    }
  }

  /**
   * 视口几何自适应：尺寸变化时重建通道布局缓存并同步实体锚点。
   * 所有 lane 坐标只在这里按 width/height 计算一次，帧内只读缓存。
   */
  _ensureLayout() {
    const game = this.game
    if (!game) return
    const width = game.width
    const height = game.height
    if (this._viewportW === width && this._viewportH === height) return
    this._viewportW = width
    this._viewportH = height

    const laneW = Math.max(LANE_MIN_WIDTH, width * LANE_WIDTH_RATIO)
    const gap = laneW * LANE_GAP_RATIO
    const totalW = laneW * LANE_COUNT + gap * (LANE_COUNT - 1)
    this._laneW = laneW
    this._laneGap = gap
    this._laneStartX = (width - totalW) / 2
    this._laneTop = height * LANE_TOP_RATIO
    this._laneH = height * LANE_HEIGHT_RATIO
    this._targetY = height * TARGET_Y_RATIO
    this._targetW = laneW * TARGET_WIDTH_RATIO
    this._targetH = Math.max(TARGET_MIN_H, laneW * TARGET_HEIGHT_RATIO)
    this.playerY = height * PLAYER_Y_RATIO
    // resize 后直接吸附（罕见操作，不做过渡动画）；已发射子弹与靶保持 lane 对齐
    this.playerX = this.laneCenterX(this.currentLane)
    for (const bullet of this._bullets) bullet.x = this.laneCenterX(bullet.lane)
    if (!this._targets) {
      // 测试靶只创建一次：HP 状态不随 resize 丢失
      this._targets = Array.from({ length: LANE_COUNT }, (_, lane) => ({
        lane,
        hp: TARGET_HP,
        maxHp: TARGET_HP,
      }))
    }
  }
}
