const TAU = Math.PI * 2

/**
 * 决斗圈：固定地面软结界——不做硬墙，玩家可出界，但出界 0.9s 宽限后每 0.5s 受灼烧；
 * 圈心在首领激活时锚定双方之间并固定不动，半径随时间平滑收缩至底线，
 * 同时把首领自身位移与冲锋限制在当前圈内（保证双方在同一固定擂台内对决）。
 */
export const DUEL_ARENA = {
  radius: 820,
  minRadius: 520,
  shrinkRate: 1,
  followSpeed: 0,
  graceTime: 0.9,
  tickInterval: 0.5,
  tickDamage: 1,
  dissolveTime: 0.6,
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/** 决斗圈调试开关：置 false 可整体停用（排查用），不影响 BOSS 本体逻辑 */
export const DUEL_ARENA_DEBUG = { enabled: true }

/**
 * 决斗圈生效清单（按模式 + 首领身份）：覆盖每个模式下玩家会正面遭遇的主要单体首领。
 * 通用排除（在 activate 里统一卡）：编队成员（bossGroupSize>1）、复合首领（终局/统帅轮转）；
 * TD/Runner 不走 EnemyManager 生成，天然不涉及。
 * 单条规则可带 params 覆盖圈参数与特性开关：
 *  - radius / minRadius / shrinkRate：固定擂台的初始半径、保底半径与收缩速度
 *  - rage / pincer：残血狂暴与冲锋夹击（默认开；独立 AI 体系的首领应显式关闭）
 */
export const DUEL_ARENA_RULES = [
  { mode: 'timed', label: '限时前段首领（第 5/10 波）', match: (boss) => boss.wave <= 10 },
  {
    mode: 'expedition',
    label: '远征第 1 章边防官',
    match: (boss) => boss.encounter?.id === 'border_warden',
    // 边防官是长距突刺/冲锋压制者，固定擂台给予更大起手与保底空间（850 → 550，每 10 秒仅缩 10px），
    // 其冲锋与追击会被固定擂台裁剪在圈内，避免 BOSS 自己冲出安全区。
    params: { radius: 850, minRadius: 550, shrinkRate: 1, followSpeed: 0, rage: false, pincer: false },
  },
  { mode: 'expedition', label: '远征章节首领', match: (boss) => !!boss.encounter },
  { mode: 'endless', label: '无尽单体首领', match: () => true },
]

export class BossArena {
  constructor(game) {
    this.game = game
    this.reset()
  }

  reset() {
    this.active = false
    this.boss = null
    this.cx = 0
    this.cy = 0
    this.initialRadius = DUEL_ARENA.radius
    this.radius = DUEL_ARENA.radius
    this.minRadius = DUEL_ARENA.minRadius
    this.shrinkRate = DUEL_ARENA.shrinkRate
    this.followSpeed = DUEL_ARENA.followSpeed
    this.outTime = 0
    this.nextBurnAt = DUEL_ARENA.graceTime
    this.dissolve = 0
    this.redFlash = 0
    this.rageEnabled = false
    this.pincerEnabled = false
    this.burnDamage = DUEL_ARENA.tickDamage
  }

  /** 出界灼烧开始前的剩余宽限（HUD/测试读数用）；在圈内为完整宽限 */
  get graceRemaining() {
    return this.active ? Math.max(0, DUEL_ARENA.graceTime - this.outTime) : DUEL_ARENA.graceTime
  }

  /** 按 DUEL_ARENA_RULES 清单判定：单体、非复合、模式命中才开圈；固定圆心于双方间 */
  activate(boss) {
    if (!boss || this.active || !DUEL_ARENA_DEBUG.enabled) return false
    if (!boss.isBoss || boss.isCompositeBoss || (boss.bossGroupSize || 1) > 1) return false
    const mode = this.game.runSelection?.mode
    const rule = DUEL_ARENA_RULES.find((r) => r.mode === mode && r.match(boss))
    if (!rule) return false
    const params = rule.params || {}
    const difficulty = this.game.runProfile?.id || 'normal'
    this.active = true
    this.boss = boss
    this.initialRadius = params.radius ?? DUEL_ARENA.radius
    this.radius = this.initialRadius
    this.minRadius = Math.min(this.initialRadius, params.minRadius ?? DUEL_ARENA.minRadius)
    this.shrinkRate = params.shrinkRate ?? DUEL_ARENA.shrinkRate
    this.followSpeed = params.followSpeed ?? DUEL_ARENA.followSpeed

    const p = this.game.player
    const rawCx = p ? boss.x * 0.6 + p.x * 0.4 : boss.x
    const rawCy = p ? boss.y * 0.6 + p.y * 0.4 : boss.y
    const ww = this.game.worldWidth || 2000
    const wh = this.game.worldHeight || 2000
    const margin = Math.min(this.minRadius, Math.min(ww, wh) * 0.25)
    this.cx = clamp(rawCx, margin, ww - margin)
    this.cy = clamp(rawCy, margin, wh - margin)

    this.outTime = 0
    this.nextBurnAt = DUEL_ARENA.graceTime
    this.dissolve = 0
    // 难度分档（走 runProfile，不硬编码）：简单只留圈；普通全量；困难灼烧 ×1.5；地狱灼烧 ×2
    // 规则层可整体关闭狂暴/夹击（如边防官这类独立 AI 体系）
    this.rageEnabled = (params.rage ?? true) && difficulty !== 'easy'
    this.pincerEnabled = (params.pincer ?? true) && difficulty !== 'easy'
    this.burnDamage =
      difficulty === 'hell'
        ? DUEL_ARENA.tickDamage * 2
        : difficulty === 'hard'
          ? DUEL_ARENA.tickDamage * 1.5
          : DUEL_ARENA.tickDamage
    boss.duelArena = this
    this.game.enemyManager.addText(this.cx, this.cy - 40, '固定决斗圈展开', null, '#ff9f6e', 16)
    return true
  }

  /** 将实体坐标约束在当前固定圈内（用于确保 BOSS 不会走出或冲出安全区） */
  clampPosition(x, y, entityRadius = 0, pad = 16) {
    if (!this.active || this.dissolve > 0) return { x, y }
    const maxR = Math.max(24, this.radius - entityRadius - pad)
    const dx = x - this.cx
    const dy = y - this.cy
    const d2 = dx * dx + dy * dy
    if (d2 <= maxR * maxR || d2 === 0) return { x, y }
    const d = Math.sqrt(d2)
    return {
      x: this.cx + (dx / d) * maxR,
      y: this.cy + (dy / d) * maxR,
    }
  }

  /** 将直线冲锋射线裁剪在当前决斗圈内，保持地面预警与实际终点一致 */
  clipRayLength(originX, originY, angle, length, entityRadius = 0, pad = 16) {
    if (!this.active || this.dissolve > 0) return length
    const maxR = Math.max(24, this.radius - entityRadius - pad)
    const ox = originX - this.cx
    const oy = originY - this.cy
    const co = Math.cos(angle)
    const si = Math.sin(angle)
    const b = ox * co + oy * si
    const c = ox * ox + oy * oy - maxR * maxR
    if (c >= 0) return b >= 0 ? 0 : Math.min(length, -2 * b)
    const disc = Math.max(0, b * b - c)
    const maxT = -b + Math.sqrt(disc)
    return Math.min(length, Math.max(0, maxT))
  }

  /** 兼容保留接口（不再用于残血瞬缩） */
  shrink(factor) {
    if (this.active && factor > 0) {
      this.radius = Math.max(this.minRadius, this.radius * factor)
    }
  }

  /** 狂暴全屏红闪（由 BOSS 狂暴事件调用） */
  flash() {
    this.redFlash = 0.7
  }

  /** BOSS 死亡：圈进入 0.6s 消散，不再灼烧 */
  onBossDeath(boss) {
    if (!this.active || (boss && boss !== this.boss)) return
    if (this.dissolve <= 0) this.dissolve = DUEL_ARENA.dissolveTime
  }

  get playerOutside() {
    if (!this.active || this.dissolve > 0) return false
    const p = this.game.player
    return (p.x - this.cx) ** 2 + (p.y - this.cy) ** 2 > this.radius * this.radius
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return
    this.redFlash = Math.max(0, this.redFlash - dt)
    if (!this.active) return
    if (this.dissolve > 0) {
      this.dissolve -= dt
      if (this.dissolve <= 0) this.reset()
      return
    }
    const boss = this.boss
    if (!boss || !boss.active || boss.hp <= 0) {
      this.onBossDeath(boss)
      return
    }

    // 固定圆心不再追随飘移；半径随时间平滑收紧到底线 minRadius
    if (this.radius > this.minRadius && this.shrinkRate > 0) {
      this.radius = Math.max(this.minRadius, this.radius - this.shrinkRate * dt)
    }

    // 当圈随时间向内收缩时，同步将 BOSS 保持在圈内
    const clampedBoss = this.clampPosition(boss.x, boss.y, boss.radius, 16)
    boss.x = clampedBoss.x
    boss.y = clampedBoss.y

    const p = this.game.player
    if (p.dead) return // 玩家死在界外：结算已触发，圈不再补刀
    const outside = (p.x - this.cx) ** 2 + (p.y - this.cy) ** 2 > this.radius * this.radius
    if (!outside) {
      this.outTime = 0
      this.nextBurnAt = DUEL_ARENA.graceTime
      return
    }
    // 软结界：0.9s 宽限（覆盖被击退出圈的瞬间），之后每 0.5s 灼烧一次
    this.outTime += dt
    while (this.outTime >= this.nextBurnAt) {
      this.nextBurnAt += DUEL_ARENA.tickInterval
      p.hit(this.burnDamage, { zoneBurn: true }) // 环境灼烧：不可闪避、不吃无敌帧，但吃护盾/减伤
    }
  }

  /** 圈环渲染：挂在实体层之前（敌人与预警之下），世界坐标系 */
  renderWorld(ctx) {
    if (!this.active) return
    const t = this.game.elapsed
    const alpha = this.dissolve > 0 ? Math.max(0, this.dissolve / DUEL_ARENA.dissolveTime) : 1
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
    ctx.save()
    ctx.globalAlpha = alpha
    // 圈内淡染：标示擂台范围但不遮地面积雪/预警
    ctx.fillStyle = `rgba(255, 90, 60, ${0.04 + pulse * 0.02})`
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius, 0, TAU)
    ctx.fill()
    // 圈环：双层描边 + 缓慢旋转的刻度弧，移动中也可读
    ctx.strokeStyle = `rgba(255, 120, 80, ${0.5 + pulse * 0.25})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 190, 140, ${0.25 + pulse * 0.15})`
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius - 5, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 230, 200, ${0.55 + pulse * 0.3})`
    ctx.lineWidth = 4
    for (let i = 0; i < 4; i++) {
      const a = t * 0.6 + (i / 4) * TAU
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, this.radius, a, a + 0.35)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** 屏幕层反馈：狂暴红闪 + 出界边缘泛红与指向圈内的箭头（屏幕坐标系） */
  renderOverlay(ctx, width, height) {
    if (this.redFlash > 0) {
      ctx.fillStyle = `rgba(255, 40, 30, ${(this.redFlash / 0.7) * 0.32})`
      ctx.fillRect(0, 0, width, height)
    }
    if (!this.active || this.dissolve > 0) return
    const p = this.game.player
    if (p.dead) return
    const dx = this.cx - p.x
    const dy = this.cy - p.y
    const outside = dx * dx + dy * dy > this.radius * this.radius
    if (!outside) return

    // 边缘泛红：越接近灼烧越浓（0.8s 宽限内线性加压）
    const urgency = clamp(this.outTime / DUEL_ARENA.graceTime, 0.15, 1)
    const edge = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.32,
      width / 2, height / 2, Math.max(width, height) * 0.72
    )
    edge.addColorStop(0, 'rgba(255, 50, 40, 0)')
    edge.addColorStop(1, `rgba(255, 50, 40, ${0.34 * urgency})`)
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, width, height)

    // 指向圈内的箭头：画在玩家屏幕位置朝向圈心的方向上
    const sx = p.x - this.game.camera.x
    const sy = p.y - this.game.camera.y
    const angle = Math.atan2(dy, dx)
    ctx.save()
    ctx.translate(sx + Math.cos(angle) * 58, sy + Math.sin(angle) * 58)
    ctx.rotate(angle)
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin((this.game.elapsed || 0) * 6) ** 2
    ctx.fillStyle = '#ffb08a'
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(-8, -9)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-8, 9)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
