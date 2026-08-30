import { GameplayController } from './GameplayController.js'

const LANE_COUNT = 3 // 三线推进：三条纵向通道（左/中/右）

// Runner 走廊配色：夜色底 + 冷色通道描边（与 Arena 的野外主题区分开）
const RUNNER_BG = '#0d1520'
const LANE_FILL = 'rgba(122, 178, 255, 0.06)'
const LANE_EDGE = 'rgba(122, 178, 255, 0.35)'

/**
 * Runner 玩法（最小空壳）：三线推进射击的空间范式。
 *
 * 当前只建立执行边界下的自有画面：usesArenaFramePipeline() 返回 false，
 * 每帧由 renderWorld 绘制自适应的 Runner 背景与三条纵向通道；
 * updateWorld 暂为空（怪物/射击/Gate/Buff 等后续接入）。
 * 不接开始界面、不进 RunRules.MODE_IDS，仅可通过 configureGameplay('runner') 进入。
 */
export class RunnerGameplay extends GameplayController {
  constructor() {
    super('runner')
  }

  /** Runner 接管每帧世界更新/渲染，不走 Arena 帧管线 */
  usesArenaFramePipeline() {
    return false
  }

  /** 世界更新：空壳阶段无内容；dt 留给未来的推进/生成逻辑 */
  updateWorld(_dt) {}

  /**
   * Runner 背景 + 三条纵向通道（按 engine.width / engine.height 自适应）。
   * 热路径零分配：只用纯色填充与数值计算，不逐帧创建渐变等临时对象。
   */
  renderWorld(ctx) {
    const game = this.game
    if (!game) return
    const width = game.width
    const height = game.height

    // 夜色走廊底色（铺满视口）
    ctx.fillStyle = RUNNER_BG
    ctx.fillRect(0, 0, width, height)

    // 三条纵向通道：居中排列，宽度与高度随视口缩放
    const laneW = Math.max(48, width * 0.16)
    const gap = laneW * 0.35
    const totalW = laneW * LANE_COUNT + gap * (LANE_COUNT - 1)
    const startX = (width - totalW) / 2
    const top = height * 0.06
    const laneH = height * 0.9
    ctx.lineWidth = 2
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = startX + i * (laneW + gap)
      ctx.fillStyle = LANE_FILL
      ctx.fillRect(x, top, laneW, laneH)
      ctx.strokeStyle = LANE_EDGE
      ctx.strokeRect(x, top, laneW, laneH)
    }
  }
}
