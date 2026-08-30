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
// 玩家 X 平滑过渡：60fps 基准下每帧 22% 收敛（帧率无关指数插值）
const LANE_LERP_PER_FRAME = 0.22

// Runner 走廊配色：夜色底 + 冷色通道描边（与 Arena 的野外主题区分开）
const RUNNER_BG = '#0d1520'
const LANE_FILL = 'rgba(122, 178, 255, 0.06)'
const LANE_EDGE = 'rgba(122, 178, 255, 0.35)'
// 史莱姆占位图形配色（沿用 Arena 基础形态色）
const SLIME_BODY = '#8ae84a'
const SLIME_EDGE = '#2f9e3a'

/**
 * Runner 玩法（三通道移动阶段）：三线推进射击的空间范式。
 *
 * 已实现：左/中/右三条通道的玩家移动——复用 game.input.state.left/right
 * （A/D 与 ←/→ 都映射到这两个轴），边沿触发（按住只切一条通道），
 * 0/2 边界钳制，切换时玩家 X 指数平滑过渡（不瞬移）。
 * 仍未实现：怪物/子弹/Gate/Buff/WeaponSystem 接入/开始界面入口。
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
    // 视口几何缓存（_ensureLayout 更新；热路径只读数值，零分配）
    this._viewportW = 0
    this._viewportH = 0
    this._laneW = 0
    this._laneGap = 0
    this._laneStartX = 0
    this._laneTop = 0
    this._laneH = 0
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
   * 世界更新：读取输入切换通道 + 推进玩家 X 平滑过渡。
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
  }

  /** 第 lane 条通道（0..2）的中心 X：lane 坐标计算的唯一入口 */
  laneCenterX(lane) {
    return this._laneStartX + lane * (this._laneW + this._laneGap) + this._laneW / 2
  }

  /** 世界渲染：夜色走廊 + 三条纵向通道 + 玩家史莱姆占位 */
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

    this._renderPlayerPlaceholder(ctx)
  }

  /** 史莱姆占位图形（Canvas 基础图形）：椭圆身体 + 高光 + 双眼 */
  _renderPlayerPlaceholder(ctx) {
    const r = this._laneW * 0.3
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

  /**
   * 视口几何自适应：尺寸变化时重建通道布局缓存并同步玩家锚点。
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
    this.playerY = height * PLAYER_Y_RATIO
    // resize 后直接吸附到当前通道中心（罕见操作，不做过渡动画）
    this.playerX = this.laneCenterX(this.currentLane)
  }
}
