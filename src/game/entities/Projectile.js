import { Entity } from '../core/Entity.js'
import { BASE_PROJECTILE_VISUAL, tintedWeaponVisual } from '../WeaponVisuals.js'

const TAU = Math.PI * 2

/**
 * 魔法飞弹（自动追踪弹）
 *
 * 移动逻辑（每帧 update）：
 *  - 锁定目标存活时：用目标当前坐标重新计算单位方向向量，再 × speed × dt
 *    叠加位移 → 全程「追着目标飞」（homing）；
 *  - 目标已死亡/失效：保持最后的速度方向直线飞行（vx/vy 不被清零），
 *    直到撞上其他敌人或 lifetime 耗尽。
 *
 * 渲染（纯 Canvas 发光球）：
 *  - 刻意不用 shadowBlur —— 它属于离屏特效光栅化，飞弹数量一多就掉帧；
 *  - 改用「多层半透明圆叠加」模拟光晕：外圈大而淡、核心小而亮，
 *    成本仅为几次 fill，数百飞弹也毫无压力；
 *  - 尾部沿飞行方向画一条半透明彗尾，增强速度感。
 */
export class Projectile extends Entity {
  constructor({
    x,
    y,
    target,
    speed = 520,
    damage = 1,
    life = 2.5,
    vx = 0,
    vy = 0,
    homing = 1,
    // —— 特效（阶段七）：由武器系统按技能等级注入 ——
    splitChance = 0, // 命中分裂概率（分裂出 2 枚小弹）
    critChance = 0, // 暴击概率（3 倍伤害）
    freezeChance = 0, // 冰冻概率（定身 1.5s）
    burnChance = 0, // 燃烧概率（DOT）
    poisonChance = 0, // 染毒概率（DOT）
    isSplit = false, // 是否分裂小弹（小弹不再分裂，防指数爆炸）
    pierces = 0, // 还能额外穿透的目标数
    glow = '#8cffc8', // 辉光颜色（阶段十五：随激活反应/元素变化，武器行为可视化）
    radius = null,
    visual = null,
  }) {
    super()
    this.x = x
    this.y = y
    this.target = target // 锁定的敌人实体（可为 null，此时直线飞行）
    this.speed = speed // px/s
    this.damage = damage // 命中伤害
    this.life = life // 存活时长（秒），超时自动销毁
    this.visual = visual || (glow === '#8cffc8' ? BASE_PROJECTILE_VISUAL : tintedWeaponVisual(glow))
    this.radius = radius ?? this.visual.radius
    this.vx = vx // 当前速度（含方向），发射时由武器系统注入
    this.vy = vy
    this.homing = homing // 追踪强度 0~1：1 完全锁定；<1 保留发射时的扇形惯性
    this.splitChance = splitChance
    this.critChance = critChance
    this.freezeChance = freezeChance
    this.burnChance = burnChance
    this.poisonChance = poisonChance
    this.isSplit = isSplit
    this.pierces = pierces
    this.hitTargets = pierces > 0 ? new Set() : null
    this.glow = this.visual.color
    this.angle = Math.atan2(vy, vx) // 渲染朝向（彗尾朝后）
  }

  update(dt) {
    // 存活判定：寿命耗尽 → 销毁
    this.life -= dt
    if (this.life <= 0) {
      this.destroy()
      return
    }

    // 追踪：目标存活则把速度方向向「指向目标的方向」插值——
    // homing=1 时每帧全量重定向（完全锁定）；多弹齐射用 0.9 左右，
    // 弹道呈弧线聚拢，保留扇形散射的视觉层次
    if (this.target?.active) {
      const dx = this.target.x - this.x
      const dy = this.target.y - this.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1 // 防御除零：恰好重合时任意方向
      const tx = (dx / d) * this.speed
      const ty = (dy / d) * this.speed
      this.vx += (tx - this.vx) * this.homing
      this.vy += (ty - this.vy) * this.homing
    }
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.angle = Math.atan2(this.vy, this.vx)
  }

  render(ctx) {
    const r = this.radius
    const visual = this.visual
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.angle) // 本地 -x 方向 = 彗尾
    ctx.scale(visual.scaleX, visual.scaleY)

    ctx.fillStyle = visual.outer
    ctx.beginPath()
    ctx.arc(0, 0, r * 2.4, 0, TAU)
    ctx.fill()
    ctx.fillStyle = visual.middle
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.5, 0, TAU)
    ctx.fill()

    this._renderBody(ctx, r, visual)

    ctx.strokeStyle = visual.trail
    ctx.lineWidth = visual.trailWidth
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-r * visual.trailLength, 0)
    ctx.lineTo(0, 0)
    ctx.stroke()

    if (visual.orbit) {
      ctx.strokeStyle = visual.trail
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 1.55, r * 0.72, 0.35, 0, TAU)
      ctx.stroke()
    }
    if (visual.crescent) {
      ctx.strokeStyle = visual.core
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.25, -0.85, 0.85)
      ctx.stroke()
    }
    if (visual.lobes) {
      ctx.fillStyle = visual.faint
      ctx.beginPath()
      ctx.arc(-r * 0.55, -r * 0.52, r * 0.42, 0, TAU)
      ctx.arc(-r * 0.55, r * 0.52, r * 0.42, 0, TAU)
      ctx.fill()
    }
    if (visual.spine) {
      ctx.strokeStyle = visual.core
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-r * 0.8, 0)
      ctx.lineTo(r * 0.9, 0)
      ctx.stroke()
    }

    ctx.restore()
  }

  _renderBody(ctx, r, visual) {
    ctx.fillStyle = visual.core
    if (visual.shape === 'glob') {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.arc(-r * 0.22, 0, r * 0.85, 0, TAU)
      ctx.arc(r * 0.48, -r * 0.2, r * 0.58, 0, TAU)
      ctx.arc(r * 0.45, r * 0.36, r * 0.42, 0, TAU)
      ctx.fill()
      ctx.fillStyle = visual.core
      ctx.beginPath()
      ctx.arc(r * 0.05, -r * 0.12, r * 0.42, 0, TAU)
      ctx.fill()
      return
    }
    if (visual.shape === 'drop') {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.moveTo(r * 1.2, 0)
      ctx.quadraticCurveTo(r * 0.15, -r * 1.05, -r * 0.85, 0)
      ctx.quadraticCurveTo(r * 0.15, r * 1.05, r * 1.2, 0)
      ctx.fill()
      ctx.fillStyle = visual.core
      ctx.beginPath()
      ctx.arc(r * 0.25, -r * 0.18, r * 0.34, 0, TAU)
      ctx.fill()
      return
    }
    if (visual.shape === 'shard' || visual.shape === 'ember') {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.moveTo(r * 1.35, 0)
      ctx.lineTo(-r * 0.35, -r * (visual.shape === 'ember' ? 0.95 : 0.7))
      ctx.lineTo(-r, 0)
      ctx.lineTo(-r * 0.35, r * (visual.shape === 'ember' ? 0.95 : 0.7))
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = visual.core
      ctx.beginPath()
      ctx.moveTo(r * 0.72, 0)
      ctx.lineTo(-r * 0.2, -r * 0.35)
      ctx.lineTo(-r * 0.45, 0)
      ctx.lineTo(-r * 0.2, r * 0.35)
      ctx.closePath()
      ctx.fill()
      return
    }
    if (visual.shape === 'spore') {
      ctx.fillStyle = visual.color
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * TAU
        ctx.beginPath()
        ctx.arc(Math.cos(angle) * r * 0.72, Math.sin(angle) * r * 0.72, r * 0.42, 0, TAU)
        ctx.fill()
      }
    } else if (visual.shape === 'puff') {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.arc(-r * 0.45, 0, r * 0.7, 0, TAU)
      ctx.arc(r * 0.18, -r * 0.28, r * 0.72, 0, TAU)
      ctx.arc(r * 0.48, r * 0.28, r * 0.55, 0, TAU)
      ctx.fill()
    } else if (visual.shape === 'core') {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.moveTo(r * 1.15, 0)
      ctx.lineTo(0, -r)
      ctx.lineTo(-r * 1.15, 0)
      ctx.lineTo(0, r)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = visual.color
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = visual.core
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.48, 0, TAU)
    ctx.fill()
  }
}
