const TAU = Math.PI * 2

/**
 * 决斗圈：软结界——不做硬墙，玩家可以出界，但出界 0.8s 宽限后每 0.5s 受灼烧；
 * 圈心跟随 BOSS，把战斗压缩在移动擂台内；BOSS 死亡即消散。
 * 生效范围由 DUEL_ARENA_RULES 清单决定（按模式 + 首领身份，可带参数覆盖）。
 */
export const DUEL_ARENA = {
  radius: 520,
  followSpeed: 40,
  graceTime: 0.8,
  tickInterval: 0.5,
  tickDamage: 1,
  rageShrink: 0.85,
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
 *  - radius / followSpeed：按 BOSS 自身体型与位移能力适配（默认 520 / 40）
 *  - rage / pincer：残血狂暴与冲锋夹击（默认开；独立 AI 体系的首领应显式关闭）
 */
export const DUEL_ARENA_RULES = [
  { mode: 'timed', label: '限时前段首领（第 5/10 波）', match: (boss) => boss.wave <= 10 },
  {
    mode: 'expedition',
    label: '远征第 1 章边防官',
    match: (boss) => boss.encounter?.id === 'border_warden',
    // 边防官是高频位移的近战压制者：举盾冲锋最远 600px（920px/s）、追击 195px/s。
    // 沿用 520/40 会让一次满冲锋就把圈心甩开 600px——圈心要 15s 才追得上，
    // 期间贴着 BOSS 打的玩家会被自己的圈灼烧，属于规则制造的不公平。
    // radius 640：一次满冲锋落地后 BOSS 与贴身玩家仍留在圈内（600 < 640）；
    // followSpeed 180 ≈ 其追击速度 195：圈心回归与追击同速，满冲锋后约 3.3s 重新居中，
    // 过渡期由 640 半径兜住；仍远低于玩家移速 340，玩家不能拖着圈走。
    // rage/pincer 关闭：边防官是独立 AI（50% 二阶段、无困兽之斗、无骑士王冲锋分支），
    // 不叠加决斗狂暴/夹击——是否适配另行讨论。
    params: { radius: 640, followSpeed: 180, rage: false, pincer: false },
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
    this.radius = DUEL_ARENA.radius
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

  /** 按 DUEL_ARENA_RULES 清单判定：单体、非复合、模式命中才开圈；规则可覆盖圈参数与特性 */
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
    this.cx = boss.x
    this.cy = boss.y
    this.radius = params.radius ?? DUEL_ARENA.radius
    this.followSpeed = params.followSpeed ?? DUEL_ARENA.followSpeed
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
    this.game.enemyManager.addText(boss.x, boss.y - boss.radius - 52, '决斗圈展开', null, '#ff9f6e', 16)
    return true
  }

  /** 狂暴收圈：半径再收 15%（由 BOSS 狂暴事件调用） */
  shrink(factor) {
    if (this.active) this.radius *= factor
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

    // 圈心跟随 BOSS（慢于玩家移速，玩家不能把圈甩在身后；速度可由规则按 BOSS 适配）
    const dx = boss.x - this.cx
    const dy = boss.y - this.cy
    const dist = Math.hypot(dx, dy)
    const step = this.followSpeed * dt
    if (dist <= step) {
      this.cx = boss.x
      this.cy = boss.y
    } else if (dist > 0) {
      this.cx += (dx / dist) * step
      this.cy += (dy / dist) * step
    }

    const p = this.game.player
    if (p.dead) return // 玩家死在界外：结算已触发，圈不再补刀
    const outside = (p.x - this.cx) ** 2 + (p.y - this.cy) ** 2 > this.radius * this.radius
    if (!outside) {
      this.outTime = 0
      this.nextBurnAt = DUEL_ARENA.graceTime
      return
    }
    // 软结界：0.8s 宽限（覆盖被击退出圈的瞬间），之后每 0.5s 灼烧一次
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
