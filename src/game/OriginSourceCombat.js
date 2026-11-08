import {
  ORIGIN_SOURCE_BY_ID,
  ORIGIN_SOURCE_RULES,
  advanceOriginMemoryCursor,
  nextOriginMemory,
  originMemoryLevel,
  originSourceLevel,
  originSourceRouteMods,
} from './OriginSourceSkills.js'

const TAU = Math.PI * 2
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))

/**
 * 源质记忆的战斗执行器（原生黏液独占）。
 *
 * 安全边界（与印记回响/超载余震刻意区分）：
 *  - 所有伤害都带 `originSource` 语义，经 `_hit` 统一收口：击杀仍走 `_onKill`
 *    （经验/掉落/击杀统计照常），但会给敌人打 `_originSourceKill` 标记，
 *    统一击杀结算据此跳过异源能量，杜绝「源质技能击杀 → 充能 → 再超载」的循环。
 *  - 本模块不调用 gainOriginEnergy，也不会触发印记回响或源质技能自身。
 *  - 弹体/波/原核都有明确的寿命与数量上限，单次释放的实体数固定。
 */
export class OriginSourceCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  get game() { return this.weapon?.game }
  get player() { return this.weapon?.player }
  get enabled() { return this.game?.startingStrain === 'origin' }

  reset() {
    this.time = 0
    this.jobs = []
    this.waves = []
    this.cores = []
    this.spikes = []
  }

  /** 超载瞬间的路线快照：必须在震荡消耗层数/回路之前取样。 */
  snapshot() {
    const p = this.player
    return {
      stacks: p?.mutationState?.stacks || 0,
      circuits: p?.routeState?.resonance?.circuits || 0,
      route: this.game?.originRoute || null,
    }
  }

  /**
   * 排入一次「超载 → 源质技能」延迟释放。返回是否真的排入了。
   * 没学任何源质记忆时完全不影响原有超载行为。
   */
  queueOverload(snapshot = null) {
    if (!this.enabled || !this.player || this.player.dead || this.game.runFinished) return false
    const next = nextOriginMemory(this.game)
    if (!next) return false
    this.jobs.push({
      kind: 'overload',
      due: this.time + ORIGIN_SOURCE_RULES.castDelay,
      memoryId: next.id,
      level: next.level,
      snapshot: snapshot || this.snapshot(),
    })
    return true
  }

  update(dt) {
    if (!this.enabled) return // 其他五种职业：零开销，不读任何源质状态
    const p = this.player
    if (!p || p.dead || this.game?.runFinished) {
      this.reset()
      return
    }
    this.time += dt

    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const job = this.jobs[i]
      if (job.due > this.time) continue
      this.jobs.splice(i, 1)
      this._runJob(job)
      if (p.dead || this.game?.runFinished) return
    }

    this._updateWaves(dt)
    if (p.dead || this.game?.runFinished) return
    this._updateCores(dt)
    if (p.dead || this.game?.runFinished) return
    this._updateSpikes(dt)
  }

  // ---------------------------------------------------------------- jobs

  _runJob(job) {
    if (job.kind === 'overload') return this._release(job)
    if (job.kind === 'echo') {
      this._area(this.player, job.radius, job.damage)
      this.weapon._ring?.(this.player.x, this.player.y, job.color || '#ffd166', job.radius)
      return
    }
    if (job.kind === 'burst') {
      this._area(job, job.radius, job.damage)
      this.weapon._ring?.(job.x, job.y, job.color || '#a29bfe', job.radius)
      this.weapon._burstColor?.(job.x, job.y, job.color || '#a29bfe', 8, false)
      return
    }
    return undefined
  }

  /** 真正释放：只有这里有「轮换游标 + 1」。无有效目标时跳过且不消耗轮换位。 */
  _release(job) {
    const def = ORIGIN_SOURCE_BY_ID[job.memoryId]
    const level = originMemoryLevel(this.game, job.memoryId)
    if (!def || level <= 0) return false
    if (!this._targets().length) return false // 无有效目标：不浪费轮换位，也不报错
    this._cast(def, level, job.snapshot)
    return true
  }

  _cast(def, level, snapshot) {
    const ws = this.weapon
    const p = this.player
    const stat = originSourceLevel(def, level)
    if (!stat) return false
    const mods = originSourceRouteMods(this.game, snapshot)
    const base = (ws.damage || 1) * (ws.levelMul || 1)

    advanceOriginMemoryCursor(this.game)
    this.game.originSourceLastCast = { id: def.id, name: def.name, level, at: this.game.elapsed || 0 }
    ws._ring?.(p.x, p.y, def.color, (p.radius || 14) + 22)
    ws._burstColor?.(p.x, p.y, def.color, 7, false)
    this.game.enemyManager?.addText?.(
      p.x, p.y - 48, `${def.icon} 源质记忆：${def.name} Lv.${level}`, null, def.color, 16
    )
    this.game.sound?.originWard?.()
    if (mods.route === 'expansion') {
      // 扩张：只加覆盖与扩散波纹，不追加独立伤害。
      ws._ring?.(p.x, p.y, def.color, (p.radius || 14) + 38)
    }

    // 一次超载最多兑现一次共振余波（棘刺多段命中也不会叠加多次）。
    const token = { echoUsed: false }
    if (def.exec === 'breach') this._castBreach(def, stat, base, mods, level, token)
    else if (def.exec === 'collapse') this._castCollapse(def, stat, base, mods, token)
    else if (def.exec === 'hunt') this._castHunt(def, stat, base, mods, token)
    return true
  }

  // ---------------------------------------------------------------- 破阵凝胶波

  _castBreach(def, stat, base, mods, level, token) {
    const p = this.player
    const width = stat.width * mods.area
    const distance = stat.distance * mods.area
    // 首领优先：直线波沿途本来就会命中杂兵，朝首领发射不会损失清群，
    // 却能让"吸收 BOSS 力量"真正落到 BOSS 身上（此前最近目标几乎总是杂兵）。
    const boss = this._bossTarget(distance * 0.95)
    const nearest = this.weapon._findNearest?.()
    const target = boss || nearest
    const angle = target
      ? Math.atan2(target.y - p.y, target.x - p.x)
      : (Number.isFinite(p.facing) ? p.facing : -Math.PI / 2)
    const damage = base * stat.damageMul * mods.damage
    this.waves.push({
      x: p.x, y: p.y, prevX: p.x, prevY: p.y,
      angle, dirX: Math.cos(angle), dirY: Math.sin(angle),
      speed: ORIGIN_SOURCE_RULES.breachSpeed,
      width, damage,
      knock: stat.knock * (mods.area > 1 ? 1.1 : 1),
      maxTravel: distance,
      travel: 0,
      hit: new Set(),
      color: def.color,
      level,
      burst: stat.burst ? { damageMul: stat.burst.damageMul, radius: stat.burst.radius * mods.area } : null,
      echo: mods.echo ? { share: ORIGIN_SOURCE_RULES.echoShare, radius: ORIGIN_SOURCE_RULES.echoRadius * mods.area } : null,
      token,
    })
  }

  _updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i]
      wave.prevX = wave.x
      wave.prevY = wave.y
      const step = wave.speed * dt
      wave.x += wave.dirX * step
      wave.y += wave.dirY * step
      wave.travel += step

      // 命中带随距离外扩：波体是"凝胶楔形"，不是等宽细线。
      // 原先固定半宽 28px，目标在飞行途中移动/被其他伤害提前打死时整道波会空放。
      const progress = Math.min(1, wave.travel / Math.max(1, wave.maxTravel))
      const halfW = wave.width * (0.5 + 0.35 * progress)
      for (const enemy of this._targets()) {
        if (wave.hit.has(enemy)) continue
        if (!this._segmentHits(wave, enemy, halfW)) continue
        wave.hit.add(enemy)
        this._hit(enemy, wave.damage)
        if (enemy.active && !enemy.isBoss) this._push(enemy, wave.angle, wave.knock)
      }
      if (this.player?.dead || this.game?.runFinished) return

      if (wave.travel < wave.maxTravel && wave.travel < 900) continue
      if (wave.burst) {
        this._area(wave, wave.burst.radius, wave.damage * wave.burst.damageMul)
        this.weapon._ring?.(wave.x, wave.y, wave.color, wave.burst.radius)
        this.weapon._burstColor?.(wave.x, wave.y, wave.color, 8, false)
      }
      if (wave.echo) this._scheduleEcho(wave.token, wave.damage, wave.echo, wave.color)
      this.waves.splice(i, 1)
    }
  }

  /** 线段（上一帧位置 → 本帧位置）到敌人的距离判定：任何 dt 下都不漏判。 */
  _segmentHits(wave, enemy, halfW) {
    const sx = wave.prevX
    const sy = wave.prevY
    const ex = wave.x
    const ey = wave.y
    const vx = ex - sx
    const vy = ey - sy
    const len2 = vx * vx + vy * vy
    let t = 0
    if (len2 > 1e-6) {
      t = ((enemy.x - sx) * vx + (enemy.y - sy) * vy) / len2
      t = clamp(t, 0, 1)
    }
    const px = sx + vx * t
    const py = sy + vy * t
    const dx = enemy.x - px
    const dy = enemy.y - py
    const reach = halfW + (enemy.radius || 0)
    return dx * dx + dy * dy <= reach * reach
  }

  // ---------------------------------------------------------------- 奥术坍缩

  _castCollapse(def, stat, base, mods, token) {
    const radius = stat.radius * mods.area
    const center = this._densestPoint(radius) || { x: this.player.x, y: this.player.y }
    const damage = base * stat.damageMul * mods.damage
    this.cores.push({
      x: center.x, y: center.y,
      t: 0,
      delay: stat.delay || 0.5,
      radius,
      damage,
      color: def.color,
      fired: false,
      life: (stat.delay || 0.5) + 0.55,
      extra: stat.extra
        ? { damageMul: stat.extra.damageMul, radius: stat.extra.radius * mods.area, delay: stat.extra.delay }
        : null,
      echo: mods.echo ? { share: ORIGIN_SOURCE_RULES.echoShare, radius: ORIGIN_SOURCE_RULES.echoRadius * mods.area } : null,
      token,
    })
  }

  _updateCores(dt) {
    for (let i = this.cores.length - 1; i >= 0; i--) {
      const core = this.cores[i]
      core.t += dt
      if (!core.fired && core.t >= core.delay) {
        core.fired = true
        this._area(core, core.radius, core.damage)
        this.weapon._ring?.(core.x, core.y, core.color, core.radius)
        this.weapon._burstColor?.(core.x, core.y, core.color, 10, false)
        this.game.shakeScreen?.(3, 0.18)
        if (core.extra) {
          this.jobs.push({
            kind: 'burst',
            due: this.time + (core.extra.delay || 0.3),
            x: core.x, y: core.y,
            radius: core.extra.radius,
            damage: core.damage * core.extra.damageMul,
            color: core.color,
          })
        }
        if (core.echo) this._scheduleEcho(core.token, core.damage, core.echo, core.color)
      }
      if (core.t >= core.life) this.cores.splice(i, 1)
    }
  }

  /** 敌人最密集处（采样上限 60，距离作为同分时的次级偏好）。 */
  _densestPoint(radius) {
    const list = this._targets()
    if (!list.length) return null
    const samples = list.length > 60 ? list.slice(0, 60) : list
    const p = this.player
    const boss = this._bossTarget(520)
    const r2 = radius * radius
    let best = null
    for (const sample of samples) {
      let count = 0
      for (const other of list) {
        const dx = other.x - sample.x
        const dy = other.y - sample.y
        if (dx * dx + dy * dy <= r2) count++
      }
      // 首领所在的簇额外加权：避免坍缩总是砸在杂兵堆上、把首领晾在旁边。
      if (boss && Math.hypot(sample.x - boss.x, sample.y - boss.y) <= radius) count += 2
      const score = count * 10000 - Math.hypot(sample.x - p.x, sample.y - p.y)
      if (!best || score > best.score) best = { x: sample.x, y: sample.y, score }
    }
    return best
  }

  // ---------------------------------------------------------------- 棘刺追猎雨

  _castHunt(def, stat, base, mods, token) {
    const p = this.player
    const list = this._targets()
    if (!list.length) return
    const count = Math.min(stat.count, ORIGIN_SOURCE_RULES.spikeCap)
    const picked = this._distinctTargets(list, count)
    // 首领优先：第一枚棘刺锁首领（其余仍打不同目标，保持多目标收割定位）。
    const boss = this._bossTarget(760)
    if (boss) {
      const index = picked.indexOf(boss)
      if (index >= 0) picked.splice(index, 1)
      picked.unshift(boss)
    }
    const damage = base * stat.damageMul * mods.damage
    for (let i = 0; i < count; i++) {
      if (this.spikes.length >= ORIGIN_SOURCE_RULES.spikeCap) break
      const target = picked[i % picked.length]
      const angle = Math.atan2(target.y - p.y, target.x - p.x) + (i - (count - 1) / 2) * 0.22
      this.spikes.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * (stat.speed || ORIGIN_SOURCE_RULES.huntSpeed),
        vy: Math.sin(angle) * (stat.speed || ORIGIN_SOURCE_RULES.huntSpeed),
        speed: stat.speed || ORIGIN_SOURCE_RULES.huntSpeed,
        angle,
        target,
        damage,
        splash: stat.splash,
        splashRadius: stat.splashRadius * mods.area,
        pierces: stat.pierces || 0,
        life: 1.9,
        hit: new Set(),
        color: def.color,
        echo: mods.echo ? { share: ORIGIN_SOURCE_RULES.echoShare, radius: ORIGIN_SOURCE_RULES.echoRadius * mods.area } : null,
        token,
      })
    }
  }

  /** 优先锁定不同敌人：按距离排序后依次挑未用过的目标。 */
  _distinctTargets(list, count) {
    const p = this.player
    const sorted = [...list].sort((a, b) =>
      (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2))
    return sorted.slice(0, Math.max(1, Math.min(count, sorted.length)))
  }

  _updateSpikes(dt) {
    // 每帧只取一次目标表：棘刺最多 12 枚，避免「每枚棘刺 × 每帧」重复分配数组。
    const targets = this._targets()
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const spike = this.spikes[i]
      spike.life -= dt
      if (spike.life <= 0) { this.spikes.splice(i, 1); continue }
      if (spike.target?.active && !spike.target.devouring) {
        const dx = spike.target.x - spike.x
        const dy = spike.target.y - spike.y
        const d = Math.hypot(dx, dy) || 1
        spike.vx += ((dx / d) * spike.speed - spike.vx) * 0.22
        spike.vy += ((dy / d) * spike.speed - spike.vy) * 0.22
      }
      spike.x += spike.vx * dt
      spike.y += spike.vy * dt
      spike.angle = Math.atan2(spike.vy, spike.vx)

      let impact = null
      for (const enemy of targets) {
        if (!enemy.active || spike.hit.has(enemy)) continue
        const reach = 11 + (enemy.radius || 0)
        if ((enemy.x - spike.x) ** 2 + (enemy.y - spike.y) ** 2 > reach * reach) continue
        impact = enemy
        break
      }
      if (!impact) continue

      spike.hit.add(impact)
      this._hit(impact, spike.damage)
      this._splash(impact, spike)
      if (spike.echo) this._scheduleEcho(spike.token, spike.damage, spike.echo, spike.color)

      if (spike.pierces > 0) {
        spike.pierces--
        const remaining = targets.filter(enemy => enemy.active && !spike.hit.has(enemy))
        if (remaining.length) {
          spike.target = this._distinctTargets(remaining, 1)[0]
          spike.x += Math.cos(spike.angle) * 12
          spike.y += Math.sin(spike.angle) * 12
          continue
        }
      }
      this.spikes.splice(i, 1)
    }
  }

  /** 命中后的小范围液态爆裂：只打周围其他敌人，不重复结算主目标。 */
  _splash(impact, spike) {
    if (!(spike.splash > 0)) return
    const radius = spike.splashRadius
    for (const other of this._targets()) {
      if (other === impact) continue
      const dx = other.x - impact.x
      const dy = other.y - impact.y
      const reach = radius + (other.radius || 0)
      if (dx * dx + dy * dy > reach * reach) continue
      this._hit(other, spike.damage * spike.splash)
      if (this.player?.dead || this.game?.runFinished) return
    }
    this.weapon._ring?.(impact.x, impact.y, spike.color, radius)
    this.weapon._burstColor?.(impact.x, impact.y, spike.color, 4, false)
  }

  // ---------------------------------------------------------------- 共用

  /** 一次超载只兑现一次共振余波：token 由本次释放持有，多段命中不会叠加多次。 */
  _scheduleEcho(token, damage, echo, color) {
    if (!token || token.echoUsed) return
    token.echoUsed = true
    const share = Math.min(ORIGIN_SOURCE_RULES.echoShare, echo.share ?? ORIGIN_SOURCE_RULES.echoShare)
    this.jobs.push({
      kind: 'echo',
      due: this.time + 0.28,
      damage: damage * share,
      radius: echo.radius,
      color,
    })
  }

  _targets() {
    const list = this.weapon?.enemyManager?.enemies || []
    const out = []
    for (const enemy of list) {
      if (!enemy?.active || enemy.devouring) continue
      out.push(enemy)
    }
    return out
  }

  /** 视距内最近的首领（无则 null）：源质技能用它做「首领优先」判定。 */
  _bossTarget(maxRange = Infinity) {
    const p = this.player
    if (!p) return null
    let best = null
    let bestD = maxRange * maxRange
    for (const enemy of this._targets()) {
      if (!enemy.isBoss) continue
      const d2 = (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2
      if (d2 > bestD) continue
      bestD = d2
      best = enemy
    }
    return best
  }

  /** 统一伤害收口：击杀保留经验/掉落/统计，但标记来源以阻断异源充能。 */
  _hit(enemy, damage) {
    if (!enemy?.active || enemy.devouring || damage <= 0) return false
    enemy.hit(damage)
    if (!enemy.active) {
      enemy._originSourceKill = true
      this.weapon._onKill(enemy)
      return true
    }
    return false
  }

  _area(center, radius, damage) {
    if (!(damage > 0)) return 0
    let hits = 0
    for (const enemy of this._targets()) {
      const dx = enemy.x - center.x
      const dy = enemy.y - center.y
      const reach = radius + (enemy.radius || 0)
      if (dx * dx + dy * dy > reach * reach) continue
      this._hit(enemy, damage)
      hits++
      if (this.player?.dead || this.game?.runFinished) break
    }
    return hits
  }

  _push(enemy, angle, distance) {
    const g = this.game
    const nx = enemy.x + Math.cos(angle) * distance
    const ny = enemy.y + Math.sin(angle) * distance
    enemy.x = Number.isFinite(g?.worldWidth) ? clamp(nx, enemy.radius, g.worldWidth - enemy.radius) : nx
    enemy.y = Number.isFinite(g?.worldHeight) ? clamp(ny, enemy.radius, g.worldHeight - enemy.radius) : ny
  }

  _updateRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]
      ring.t += dt
      if (ring.t >= ring.life) this.rings.splice(i, 1)
    }
  }

  // ---------------------------------------------------------------- render

  render(ctx) {
    if (!ctx) return
    this._renderWaves(ctx)
    this._renderCores(ctx)
    this._renderSpikes(ctx)
  }

  _renderWaves(ctx) {
    for (const wave of this.waves) {
      const k = Math.max(0, 1 - wave.travel / Math.max(1, wave.maxTravel))
      const progress = 1 - k
      ctx.save()
      ctx.translate(wave.x, wave.y)
      ctx.rotate(wave.angle)
      // 与命中带同口径：越远越宽，画成楔形而不是等宽胶囊。
      const halfW = wave.width * (0.5 + 0.35 * progress)
      const stretch = halfW * 1.5
      ctx.globalAlpha = 0.18 + 0.12 * k
      ctx.fillStyle = wave.color
      ctx.beginPath()
      ctx.ellipse(-stretch * 0.3, 0, halfW * 1.5, halfW * 0.92, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = wave.color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, halfW * 0.9, halfW * 0.55, 0, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1.2
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(-stretch * 1.4, i * halfW * 0.42)
        ctx.lineTo(-stretch * 0.2, i * halfW * 0.42)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  _renderCores(ctx) {
    for (const core of this.cores) {
      const t = core.fired ? Math.min(1, (core.t - core.delay) / 0.32) : core.t / core.delay
      ctx.save()
      ctx.translate(core.x, core.y)
      if (!core.fired) {
        // 向内坍缩：外环收缩 + 内核变亮。
        const r = core.radius * (1.25 - 0.85 * t)
        ctx.globalAlpha = 0.24 + 0.4 * t
        ctx.strokeStyle = core.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = 0.2 + 0.3 * t
        ctx.fillStyle = core.color
        ctx.beginPath()
        ctx.arc(0, 0, Math.max(4, r * 0.45), 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.5
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(0, 0, core.radius, 0, TAU)
        ctx.stroke()
      } else {
        const r = core.radius * (0.5 + t)
        ctx.globalAlpha = 0.4 * (1 - t)
        ctx.strokeStyle = core.color
        ctx.lineWidth = 3 * (1 - t) + 1
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = 0.16 * (1 - t)
        ctx.fillStyle = core.color
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.9, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  _renderSpikes(ctx) {
    for (const spike of this.spikes) {
      ctx.save()
      ctx.translate(spike.x, spike.y)
      ctx.rotate(spike.angle)
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = spike.color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-12, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()
      ctx.globalAlpha = 0.92
      ctx.fillStyle = spike.color
      ctx.beginPath()
      ctx.moveTo(9, 0)
      ctx.lineTo(-2, -4.4)
      ctx.lineTo(-5, 0)
      ctx.lineTo(-2, 4.4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }
}
