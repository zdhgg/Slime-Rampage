import { Projectile } from './entities/Projectile.js'
import { resolveWeaponVisual, splitWeaponVisual } from './WeaponVisuals.js'
import { CELL_SIZE, GRID_KEY_SCALE } from './EnemyManager.js'
import {
  RICOCHET_ROUTES,
  RICOCHET_RULES,
  RICOCHET_SKILL_BY_ID,
  ricochetRouteReady,
  ricochetProgressReady,
  ricochetSkillAvailable,
  ricochetBuildNote,
  ricochetInvestment,
  ricochetSplitChance,
  splitSporeDamageBonus,
  ricochetPierceOverdrivePct,
  ricochetShockPct,
  pierceCaliberPct,
  pierceRouteDamageMultiplier,
  bounceAmplifyPct,
  prismScatterBonus,
  prismExtensionStats,
  prismWidthForCount,
  prismDamageScaleForCount,
} from './RicochetRules.js'

const TRACE_CAP = 140

const ACTIVE = Object.fromEntries(['base', 'split', 'pierce', 'bounce'].flatMap(route => [false, true].map(ultimate => {
  const r = RICOCHET_ROUTES[route]
  return [`${route}:${ultimate}`, {
    id: ultimate ? r?.ultimate || 'rapid_volley' : 'rapid_volley',
    name: ultimate ? r?.ultimateName || '疾射' : r?.activeName || '疾射', icon: r?.icon || '🔫',
    cooldown: ultimate ? route === 'pierce' ? 10 : 12 : 8,
    getDesc: game => game.weaponSystem.ricochetCombat.activeDescription,
    use: game => game.weaponSystem.ricochetCombat.useActive(),
  }]
})))

/** 弹射血统的弹道快照、有限连锁与命中结算。派生效果不回调自身，避免递归。 */
export class RicochetCombat {
  constructor(weapon) { this.weapon = weapon; this.reset() }
  get game() { return this.weapon.game }
  get enabled() { return this.game?.startingStrain === 'ricochet' }
  level(id) { return this.game?.skillLevels?.[`rico_${id}`] || 0 }
  get ultimate() { return !!this.game?.skillLevels?.[RICOCHET_ROUTES[this.route]?.ultimate] }
  get activeSkill() { return ACTIVE[`${this.route || 'base'}:${this.ultimate}`] }
  get activeDescription() {
    if (this.ultimate) return RICOCHET_ROUTES[this.route].ultimateDesc
    if (this.route === 'pierce') return '连续发射 4 枚高爆穿甲重弹，逐轮锁定不同敌人，单枚威力随齐射弹数倍增（0.95×）并额外穿透 +1 且在首击引爆破盾冲击波；移速 +20% 持续 1 秒。'
    if (this.route === 'bounce') return '连续追加 4 轮光棱聚能射击，逐轮优先锁定不同敌人并在落点爆发星爆散射；移速 +20% 持续 1 秒。'
    return '连续追加 4 轮齐射，弹体优先分散锁定不同敌人；移速 +20% 持续 1 秒。'
  }
  reset() {
    this.route = null
    this.normalChoices = 0
    this.shockCooldown = 0
    this.traces = []
    this.beams = []
    this.metrics = { shots: 0, splits: 0, bounces: 0, penetrations: 0, splashKills: 0 }
  }
  chooseRoute(route) {
    if (!this.enabled || !RICOCHET_ROUTES[route] || !ricochetRouteReady(this.game) ||
        !this.game.skillLevels[RICOCHET_ROUTES[route].seed]) return false
    this.route = route
    // 在冷却未结束时进化，不刷新现有冷却；收益作用于下一次施放。
    this.weapon._muzzleVisual = this.visual()
    this.weapon._weaponPulse = .7
    return true
  }
  hud() {
    return {
      route: this.route, name: RICOCHET_ROUTES[this.route]?.name || '弹道探索',
      icon: RICOCHET_ROUTES[this.route]?.icon || '✦',
      investment: ricochetInvestment(this.game),
      investmentTarget: RICOCHET_RULES.ultimateInvestment,
      normalChoices: this.normalChoices,
      choicesTarget: RICOCHET_RULES.choicesBeforeRoute,
      routeGateText: `第 ${RICOCHET_RULES.routeWave} 波／第 ${RICOCHET_RULES.routeStage} 章`,
      ultimate: this.ultimate, ultimateName: RICOCHET_ROUTES[this.route]?.ultimateName || '',
      ultimateReady: !!this.route && ricochetSkillAvailable(this.game, RICOCHET_SKILL_BY_ID[RICOCHET_ROUTES[this.route].ultimate]),
      routeReady: ricochetRouteReady(this.game), progressReady: ricochetProgressReady(this.game),
      note: ricochetBuildNote(this.game),
      seeds: Object.values(RICOCHET_ROUTES).filter(r => this.game.skillLevels[r.seed]).map(r => r.short),
    }
  }
  visual(child = false) {
    const visual = resolveWeaponVisual({
      primarySpec: 'gatling', tier: this.ultimate ? 4 : this.route ? 2 : 1,
      strain: 'ricochet', ricochetRoute: this.route,
    })
    return child ? splitWeaponVisual(visual) : visual
  }
  _pushTrace(entry) {
    if (this.traces.length >= TRACE_CAP) this.traces.shift()
    this.traces.push(entry)
  }
  update(dt) {
    this.shockCooldown = Math.max(0, this.shockCooldown - dt)
    for (let i = this.traces.length - 1; i >= 0; i--) {
      this.traces[i].life -= dt
      if (this.traces[i].life <= 0) this.traces.splice(i, 1)
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]
      if (b.delay > 0) { b.delay -= dt; continue }
      b.life -= dt
      if (b.life <= 0) this.beams.splice(i, 1)
    }
    // 已穿过首个目标的重弹若锁定目标在半途被他弹击杀，立刻前向微吸附至前方下个目标，防止盲飞。
    for (const p of this.weapon._projectiles) {
      const r = p.ricochet
      if (!p.active || !r?.pierceSnap || r.hits <= 0 || p.pierces <= 0) continue
      if (p.target && p.target.active && !p.hitTargets?.has(p.target)) continue
      const next = this.findForwardSnapTarget(p, r.pierceSnapRange || 260, r.pierceSnapCos || 0.88)
      if (next) this._steerPierceSnap(p, next, 0.34)
      else { p.target = null; p.homing = 0 }
    }
  }
  /** 棱镜群落：聚能节奏略慢于连射枪口，换取厚重单束直击与星爆散射；折光加速可逐步加快蓄能。 */
  prismIntervalMultiplier() {
    if (!this.enabled || this.route !== 'bounce') return 1
    return 1.15 * (1 - prismExtensionStats(this.level('extension')).hastePct / 100)
  }
  findTarget(x, y, excluded, range = 600) {
    let best = null, d2 = range * range
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || excluded?.has(e)) continue
      const d = (e.x - x) ** 2 + (e.y - y) ** 2
      if (d < d2) { d2 = d; best = e }
    }
    return best
  }
  /** 歼灭巨炮智能索敌：优先锁定 750px 内首领；否则沿射束走廊挑选敌人密度最高的精英／密集纵队。 */
  findCannonTarget(fallback) {
    const p = this.weapon.player, enemies = this.weapon.enemyManager.enemies
    let bestBoss = null, bossD2 = 750 * 750
    const candidates = []
    for (const e of enemies) {
      if (!e.active || e.devouring) continue
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
      if (d2 > 750 * 750) continue
      if (e.isBoss && d2 < bossD2) { bossD2 = d2; bestBoss = e }
      if (d2 <= 650 * 650) candidates.push(e)
    }
    if (bestBoss) return bestBoss
    if (candidates.length <= 1) return candidates[0] || fallback
    let best = fallback, bestScore = -Infinity
    const halfWidth = 85
    for (const c of candidates) {
      const dx = c.x - p.x, dy = c.y - p.y, len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      let score = 0
      for (const e of candidates) {
        const ex = e.x - p.x, ey = e.y - p.y
        const proj = ex * ux + ey * uy
        if (proj <= 0 || proj > 650) continue
        const perp = Math.abs(ex * uy - ey * ux)
        if (perp <= halfWidth + (e.radius || 14)) {
          score += e.isElite ? 4 : e.crowdSquad?.leader === e ? 3.5 : 1
        }
      }
      if (score > bestScore) { bestScore = score; best = c }
    }
    return best || fallback
  }
  /** 统计前向扇区内的其他威胁数量：孤立首领时自动收束重炮扇面集火，敌群来袭时展开宽幅扇面横扫。 */
  _countForwardCluster(px, py, baseAngle, primary, maxDist = 480, minCos = 0.57) {
    const ux = Math.cos(baseAngle), uy = Math.sin(baseAngle), r2 = maxDist * maxDist
    let count = 0
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || e === primary) continue
      const dx = e.x - px, dy = e.y - py, d2 = dx * dx + dy * dy
      if (d2 > r2 || d2 < 1) continue
      const proj = dx * ux + dy * uy
      if (proj > 0 && proj / Math.sqrt(d2) >= minCos) count++
    }
    return count
  }
  /** 前向微吸附索敌：在飞弹前方有限锥角内搜寻下一目标，优先首领、旗手与精英以打穿防线。 */
  findForwardSnapTarget(p, maxDist = 260, minCos = 0.88) {
    const speed = Math.hypot(p.vx, p.vy)
    if (!speed) return null
    const ux = p.vx / speed, uy = p.vy / speed
    let best = null, bestScore = Infinity
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || p.hitTargets?.has(e)) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const proj = dx * ux + dy * uy
      if (proj < -4 || proj > maxDist) continue
      const dist = Math.hypot(dx, dy) || 1
      const cos = proj / dist
      if (cos < minCos) continue
      let score = dist + (1 - cos) * 420
      if (e.isBoss) score -= 180
      else if (e.crowdSquad?.leader === e || e.isElite) score -= 95
      if (score < bestScore) { bestScore = score; best = e }
    }
    return best
  }
  _steerPierceSnap(p, next, blend = 0.38) {
    const speed = Math.hypot(p.vx, p.vy) || p.speed
    const dx = next.x - p.x, dy = next.y - p.y
    const dist = Math.hypot(dx, dy) || 1
    const tx = (dx / dist) * speed, ty = (dy / dist) * speed
    const nx = p.vx + (tx - p.vx) * blend
    const ny = p.vy + (ty - p.vy) * blend
    const nLen = Math.hypot(nx, ny) || 1
    p.vx = (nx / nLen) * speed
    p.vy = (ny / nLen) * speed
    p.target = next
    p.homing = p.ricochet.pierceHoming || 0.34
  }
  useActive() {
    const ws = this.weapon, target = ws._findNearest()
    if (!this.enabled || !target) return false
    const ultimate = this.ultimate
    // aimed 跨轮共享：各轮/各弹优先锁定未被占用的敌人，让齐射扫向不同方向
    // 而不是反复集火同一最近目标；可选目标耗尽时自然回落最近敌人集火。
    const aimed = new Set()
    ws.fire(target, { ricochetActive: true, ultimate, aimed })
    const rounds = ultimate && this.route === 'pierce' ? 1 : ultimate && this.route === 'bounce' ? 1 : ultimate ? 6 : 4
    ws.rapidVolley = rounds > 1 ? { remaining: rounds - 1, timer: .12, ricochetActive: true, ultimate, aimed } : null
    ws.player.volleyMoveTimer = 1
    ws._ring(ws.player.x, ws.player.y, RICOCHET_ROUTES[this.route]?.color || '#79d9ee', ultimate ? 100 : 70)
    if (ultimate) this.game.shakeScreen?.(this.route === 'pierce' ? 6 : 3, this.route === 'pierce' ? .22 : .16)
    return true
  }
  fire(target, options = {}) {
    const ws = this.weapon, p = ws.player, active = options.ricochetActive === true
    const ultimate = active && options.ultimate === true
    const cannon = active && this.route === 'pierce'
    const heavyActive = cannon && !ultimate
    const megaCannon = cannon && ultimate
    const prism = ultimate && this.route === 'bounce'
    const swarmActive = active && ultimate && this.route === 'split'
    const beamMode = this.route === 'bounce'
    const pierceRoute = this.route === 'pierce'
    const count = cannon ? 1 : prism ? 3 : beamMode ? 1 : ws.projectileCount
    const pierceLv = this.level('pierce')
    const caliberMul = 1 + pierceCaliberPct(pierceLv) / 100
    const visual = this.visual()
    const damage = ws.damage * ws.levelMul * ws.devourDamageMul * (options.tomeEcho || 1) * pierceRouteDamageMultiplier(this.game)
    const radiusMul = caliberMul * (pierceRoute ? 1.55 : 1) * (pierceRoute && this.ultimate ? 1.4 : 1)
    const activeCount = Math.min(RICOCHET_RULES.activeCountCap, ws.projectileCount)
    const baseDamage = beamMode
      ? damage * prismDamageScaleForCount(activeCount) * (prism ? 1.5 : 1)
      : damage * (megaCannon ? activeCount * 8 : heavyActive ? activeCount * .95 : 1)
    const splitLevel = this.level('split')
    const splitChance = this.route === 'split' ? 1 : Math.min(.95,
      (splitLevel ? ricochetSplitChance(splitLevel) / 100 : 0) + ws.baseSplitChance)
    const huntRank = this.level('hunt')
    const shotSpeed = ws.projectileSpeed * (megaCannon ? 1.25 : heavyActive ? 1.15 : pierceRoute ? 1.08 : 1)
    const reach = beamMode ? this.beamReach() * (prism ? 1.15 : 1) : 0
    const pierces = beamMode
      ? Math.min(6, (this.level('pierce_bounce') ? 3 : 0) + Math.min(2, pierceLv) + ws.basePierces + ws.genePierces)
      : Math.min(18, pierceLv + (pierceRoute ? 1 : 0) + ws.basePierces + ws.genePierces + (megaCannon ? 8 : heavyActive ? 1 : 0))
    const volley = { blooms: 0, shocks: 0, heavyBlasts: 0 }, aimed = options.aimed || new Set()
    const extStats = prismExtensionStats(this.level('extension'))
    const scatterData = prismScatterBonus(this.level('bounce'))
    const beamConfig = beamMode ? {
      damage: baseDamage,
      width: prismWidthForCount(activeCount, prism),
      reach,
      pierces,
      visual,
      ultimate: prism,
      tomeEcho: !!options.tomeEcho,
      activeTome: active,
      scatterCount: prism ? 7 : Math.min(8, 1 + scatterData.rays + Math.floor((activeCount - 1) / 2) + Number(this.ultimate)),
      scatterRange: 230 + extStats.rangeBonus,
      scatterRatio: .62 + scatterData.retentionPct / 100,
      scatterAmplify: bounceAmplifyPct(this.level('amplify')) / 100,
      secondaryEcho: this.level('echo') > 0 || prism,
      secondarySources: (this.level('echo') > 0 && prism) ? 4 : 3,
      hybridPierceScatter: this.level('pierce_bounce') > 0,
    } : null
    const pierceSnap = pierceRoute ? 1 : pierceLv > 0 ? .55 : 0
    const behavior = {
      main: true, tomeEcho: !!options.tomeEcho, activeTome: active, splitChance, volley, sourceDamage: baseDamage,
      bounces: Math.min(12, this.level('bounce')),
      bounceRetention: .85,
      bounceRange: 300 + this.level('extension') * 120,
      pierceRetention: pierceRoute ? 1 : .9,
      overdriveBonus: ricochetPierceOverdrivePct(this.level('sustain')) / 100,
      bounceBonus: bounceAmplifyPct(this.level('amplify')) / 100,
      turnSpeed: Math.min(2.6, 1 + .25 * this.level('extension')),
      pingPong: false,
      hybridPierces: this.level('pierce_bounce') ? 4 : 0,
      armorPiercing: pierceRoute,
      heavyActive,
      pierceSnap,
      pierceSnapRange: megaCannon ? 380 : heavyActive ? 320 : pierceRoute ? 280 : 220,
      pierceSnapCos: megaCannon ? .83 : heavyActive ? .85 : pierceRoute ? .88 : .95,
      pierceHoming: pierceRoute ? .36 : .28,
      echo: this.level('echo') > 0,
      bloom: this.level('bloom') > 0, breach: this.level('breach') > 0,
      shock: this.level('shock'), cannon: megaCannon,
      splitCount: Math.min(8, 2 + Number(splitLevel >= 2) + this.level('density') + (this.route === 'split' && this.ultimate ? 2 : 0)),
      childDamage: ((this.route === 'split' ? .5 : .35) + splitSporeDamageBonus(huntRank) / 100) * (swarmActive ? 1.3 : 1),
      childExecute: huntRank > 0 ? 1.3 : 1,
      childLife: 1.2 + Math.min(1.5, huntRank * .25),
      childPierces: this.level('split_pierce') ? 2 : 0,
      childPierceRetention: this.level('split_pierce') ? 1 : .8,
      childBounces: this.level('split_bounce') ? 2 : 0,
      childBounceRetention: .85,
    }

    const base = Math.atan2(target.y - p.y, target.x - p.x)
    const explorePierceFan = !this.route && pierceLv > 0 && !splitLevel && !this.level('bounce') && !active
    const soloFront = pierceRoute && !active && count > 1 && this._countForwardCluster(p.x, p.y, base, target) === 0
    const fanStep = pierceRoute && !active
      ? (soloFront ? Math.min(.035, .14 / Math.max(1, count - 1)) : Math.min(.115, .52 / Math.max(1, count - 1)))
      : explorePierceFan ? .18 : .2
    const spreadStep = beamMode ? 10 : pierceRoute ? (soloFront ? 6 : 9) : explorePierceFan ? 9 : 8
    const muzzleSpreadStep = count > 1 ? Math.min(spreadStep, 22 / (count - 1)) : 0

    let totalScatter = 0
    let muzzleAngle = base
    for (let i = 0; i < count; i++) {
      let aim = target
      if (megaCannon) {
        aim = this.findCannonTarget(target)
      } else if (active) {
        aim = this.findTarget(p.x, p.y, aimed, beamMode ? reach : 600) || target
        aimed.add(aim)
      }
      const aimAngle = Math.atan2(aim.y - p.y, aim.x - p.x)
      if (i === 0) muzzleAngle = aimAngle
      const offsetIndex = i - (count - 1) / 2
      const angle = aimAngle + (!beamMode && count > 1 ? offsetIndex * fanStep : 0)
      const spread = count > 1 ? offsetIndex * muzzleSpreadStep : 0
      if (beamMode) {
        totalScatter += this.firePrismBeam(p.x, p.y, aim, angle, spread, beamConfig)
        this.metrics.shots++
        continue
      }
      let homing = 1 - (count > 1 ? .2 : 0)
      if (megaCannon || heavyActive) homing = .45
      else if (pierceRoute && count > 1) homing = soloFront ? .28 : Math.abs(offsetIndex) < .6 ? .22 : 0
      else if (explorePierceFan && count > 1) homing = .38
      const shellRadius = visual.radius * radiusMul * (megaCannon ? 2.4 : heavyActive ? 1.45 : 1)
      const fwd = Math.hypot(aim.x - p.x, aim.y - p.y) > 28 ? 10 : 0
      const projectile = this.spawn({
        x: p.x + Math.cos(aimAngle) * fwd - Math.sin(aimAngle) * spread,
        y: p.y + Math.sin(aimAngle) * fwd + Math.cos(aimAngle) * spread,
        target: homing > 0 ? aim : null, speed: shotSpeed, damage: baseDamage,
        vx: Math.cos(angle) * shotSpeed, vy: Math.sin(angle) * shotSpeed,
        homing, visual,
        radius: shellRadius,
        life: ultimate ? 5 : 2.5, isBasicAttack: !active,
        pierces,
      }, { ...behavior })
      if (projectile) {
        projectile._muzzleFresh = true
        this.metrics.shots++
      }
    }
    if (pierceRoute && (megaCannon || heavyActive || !options.tomeEcho)) {
      const ox = Math.cos(muzzleAngle) * 12, oy = Math.sin(muzzleAngle) * 12
      this._pushTrace({
        kind: 'muzzle_cone',
        anchorPlayer: true, ox, oy,
        x: p.x + ox, y: p.y + oy,
        ux: Math.cos(muzzleAngle), uy: Math.sin(muzzleAngle),
        len: megaCannon ? 90 : heavyActive ? 52 : 28,
        width: megaCannon ? 34 : heavyActive ? 19 : 11,
        life: megaCannon ? .14 : heavyActive ? .1 : .08,
        maxLife: megaCannon ? .14 : heavyActive ? .1 : .08,
        color: megaCannon ? '#ffe08a' : '#f1bf74',
      })
    }
    if (!active && !options.tomeEcho && !options.activeVolley) {
      const echo = this.game?.bossTomes?.echoMultiplier() || 0
      if (echo) this.fire(target, { tomeEcho: echo })
    }
    ws._muzzleT = beamMode ? .1 : .08; ws._muzzleAngle = muzzleAngle; ws._muzzleVisual = visual
    if (beamMode) this.game.sound.prismBeam?.(totalScatter, prism)
    else if (pierceRoute) this.game.sound.pierceCannon?.(megaCannon, heavyActive)
    else this.game.sound.shoot(visual.sound, ultimate ? 1.3 : 1)
  }
  spawn(config, behavior, excluded = null) {
    if (this.weapon._projectiles.length >= RICOCHET_RULES.projectileLimit) return null
    const life = config.life * (this.weapon.geneRangeMul || 1)
    const p = new Projectile({ ...config, life, critChance: this.weapon.critChance })
    p.prevX = p.x; p.prevY = p.y
    p.hitTargets = new Set(excluded || [])
    p.ricochet = { hits: 0, turns: 0, lastHit: null, initialDamage: p.damage, baseSpeed: p.speed,
      pierceRetention: .9, overdriveBonus: 0, bounceRetention: .85, bounceRange: 300, turnSpeed: 1,
      bounces: 0, hybridPierces: 0, bounceBonus: 0, pingPong: false, childExecute: 1, ...behavior }
    this.weapon._projectiles.push(p)
    return p
  }
  split(enemy, parent) {
    const r = parent.ricochet, excluded = new Set(parent.hitTargets)
    for (let i = 0; i < r.splitCount; i++) {
      const target = this.findTarget(enemy.x, enemy.y, excluded)
      if (!target) break
      excluded.add(target)
      const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x) + (i % 2 ? .55 : -.55)
      const child = this.spawn({ x: enemy.x, y: enemy.y, target, damage: parent.damage * r.childDamage,
        speed: 440, vx: Math.cos(angle) * 440, vy: Math.sin(angle) * 440, homing: .82,
        life: r.childLife, radius: 4, isSplit: true, visual: this.visual(true),
        pierces: r.childPierces + this.weapon.genePierces,
      }, { main: false, pierceRetention: r.childPierceRetention, bounces: r.childBounces, bounceRetention: r.childBounceRetention,
        pingPong: r.pingPong && r.childBounces > 0, bounceRange: r.bounceRange,
        childExecute: r.childExecute, bloom: r.bloom,
        sourceDamage: r.sourceDamage, volley: r.volley, tomeEcho: r.tomeEcho, activeTome: r.activeTome }, parent.hitTargets)
      if (child) this.metrics.splits++
    }
  }
  /** 光棱有效射程：受弹速与折光加速软封顶在中近视距内，并完整吃满黑市扩张基因。 */
  beamReach() {
    const ws = this.weapon
    const speedFactor = 1 + Math.min(.22, Math.max(0, ws.projectileSpeed / 520 - 1) * .16)
    const extFactor = 1 + prismExtensionStats(this.level('extension')).reachPct / 100
    return Math.round(380 * speedFactor * extFactor * (ws.geneRangeMul || 1))
  }
  _pushBeam(beam) {
    if (this.beams.length >= 160) this.beams.shift()
    this.beams.push(beam)
  }
  _collectScatter(origin, excluded, range, limit) {
    const out = [], r2 = range * range
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || excluded.has(e)) continue
      const d2 = (e.x - origin.x) ** 2 + (e.y - origin.y) ** 2
      if (d2 <= r2) out.push({ e, d2 })
    }
    out.sort((a, b) => a.d2 - b.d2)
    return out.slice(0, limit).map(entry => entry.e)
  }
  /** 线段扫掠：按投影距离排序收集光路上的敌人；对 aim 放宽浮点容差避免斜角漏判。 */
  beamSweep(sx, sy, ux, uy, len, excluded, aim = null) {
    const out = []
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || excluded.has(e)) continue
      const dx = e.x - sx, dy = e.y - sy
      const proj = dx * ux + dy * uy
      if (proj < -e.radius || proj > len + (e === aim ? .5 : 1e-4)) continue
      const reach = e.radius + 10
      if (dx * dx + dy * dy - proj * proj > reach * reach) continue
      out.push({ e, proj })
    }
    out.sort((a, b) => a.proj - b.proj)
    return out
  }
  beamHit(p, e, ux, uy) {
    p.x = e.x; p.y = e.y; p.vx = ux; p.vy = uy
    this.hit(p, e)
  }
  /**
   * 红警光棱激光：单道聚能主束直击首个目标（沿途可顺穿挡路敌），
   * 在命中点炸开棱镜星芒并同时向外星爆散射多道子激光；每发同目标至多受击 1 次。
   */
  firePrismBeam(sx, sy, aim, angle, spread, cfg) {
    const ws = this.weapon
    const dist = Math.hypot(aim.x - sx, aim.y - sy) || 1
    const ux = Math.cos(angle), uy = Math.sin(angle)
    const ox = -uy * spread + (dist > 28 ? ux * 10 : 0)
    const oy = -8 + ux * spread + (dist > 28 ? uy * 10 : 0)
    const startX = sx + ox
    const startY = sy + oy
    const proxy = {
      x: sx, y: sy, vx: ux, vy: uy, damage: cfg.damage,
      critChance: ws.critChance, visual: cfg.visual, pierces: cfg.pierces,
      hitTargets: new Set(),
      ricochet: {
        hits: 0, turns: 0, lastHit: null, initialDamage: cfg.damage, sourceDamage: cfg.damage,
        main: true, tomeEcho: cfg.tomeEcho, activeTome: cfg.activeTome,
        overdriveBonus: 0, splitChance: 0, childExecute: 1, suppressHitSound: true,
      },
    }
    const segLen = Math.min(dist, cfg.reach)
    let endpoint = null
    for (const b of this.beamSweep(sx, sy, ux, uy, segLen, proxy.hitTargets, aim)) {
      if (ws.player.dead || this.game.runFinished) return 0
      if (b.e === aim) { endpoint = b.e; break }
      if (proxy.pierces > 0) {
        proxy.pierces--
        proxy.damage = cfg.damage * .75
        this.beamHit(proxy, b.e, ux, uy)
        this.metrics.penetrations++
      } else { endpoint = b.e; break }
    }
    if (!endpoint) {
      const endX = sx + ux * segLen, endY = sy + uy * segLen
      this._pushBeam({
        stage: 0, delay: 0, life: .16, maxLife: .16, width: cfg.width,
        color: '#7ef9ff', glowColor: '#b4a2ef', damage: cfg.damage,
        bounces: cfg.ultimate ? 6 : 0,
        anchorPlayer: true, ox, oy, missDx: endX - startX, missDy: endY - startY,
        pts: [{ x: startX, y: startY }, { x: endX, y: endY }],
      })
      return 0
    }
    proxy.damage = cfg.damage
    this.beamHit(proxy, endpoint, ux, uy)
    let tailEndX = endpoint.x, tailEndY = endpoint.y, lastPierced = null
    // 末段穿透（穿透腺体／兵工原核／折光穿梭）：沿主束直线先行穿刺后排，再各自展开星爆散射。
    if (proxy.pierces > 0 && !ws.player.dead && !this.game.runFinished) {
      const tailLen = Math.min(260, Math.max(120, cfg.reach - Math.hypot(endpoint.x - sx, endpoint.y - sy)))
      for (const b of this.beamSweep(endpoint.x, endpoint.y, ux, uy, tailLen, proxy.hitTargets)) {
        if (proxy.pierces <= 0 || ws.player.dead || this.game.runFinished) break
        proxy.pierces--
        proxy.damage = cfg.damage * .75
        this.beamHit(proxy, b.e, ux, uy)
        this.metrics.penetrations++
        lastPierced = b.e
      }
      if (lastPierced) {
        tailEndX = lastPierced.x + ux * 28
        tailEndY = lastPierced.y + uy * 28
      }
    }
    this._pushBeam({
      stage: 0, delay: 0, life: .19, maxLife: .19, width: cfg.width,
      color: '#7ef9ff', glowColor: '#b4a2ef', damage: cfg.damage,
      bounces: cfg.ultimate ? 6 : cfg.scatterCount,
      anchorPlayer: true, ox, oy,
      impact: { x: endpoint.x, y: endpoint.y, r: cfg.width * 1.4 },
      pts: [{ x: startX, y: startY }, { x: tailEndX, y: tailEndY }],
    })
    if (ws.player.dead || this.game.runFinished) return 0

    // 主束命中点（或折光穿梭穿刺终点）触发星爆散射：同一束内已命中目标绝不重复打击。
    const emitBurst = (origin, count, delay, stage) => {
      const targets = this._collectScatter(origin, proxy.hitTargets, cfg.scatterRange, count)
      if (!targets.length) return []
      const ampFactor = Math.min(1, Math.max(0, targets.length - 1) / 3)
      const rayDamage = cfg.damage * (cfg.scatterRatio + cfg.scatterAmplify * ampFactor)
      proxy.ricochet.main = false
      for (const t of targets) {
        if (ws.player.dead || this.game.runFinished) break
        const len = Math.hypot(t.x - origin.x, t.y - origin.y) || 1
        proxy.damage = rayDamage
        this.beamHit(proxy, t, (t.x - origin.x) / len, (t.y - origin.y) / len)
        this._pushBeam({
          stage, delay, life: .21, maxLife: .21, width: Math.max(1.8, cfg.width * .55),
          color: '#8be9ff', glowColor: '#b4a2ef', damage: rayDamage, bounces: 0,
          impact: { x: t.x, y: t.y, r: cfg.width * .75 },
          pts: [{ x: origin.x, y: origin.y }, { x: t.x, y: t.y }],
        })
        this.metrics.bounces++
      }
      return targets
    }

    const stage1 = emitBurst(endpoint, cfg.scatterCount, .025, 1)
    let hits = stage1.length

    if (lastPierced && cfg.hybridPierceScatter && !ws.player.dead && !this.game.runFinished) {
      hits += emitBurst(lastPierced, Math.max(2, Math.ceil(cfg.scatterCount * .6)), .035, 1).length
    }

    // 棱镜分束／棱镜风暴：外侧一级目标化作次级棱镜，再各自折射 2 道余辉激光（不递归）。
    if (cfg.secondaryEcho && stage1.length > 0 && !ws.player.dead && !this.game.runFinished) {
      const ampFactor = Math.min(1, Math.max(0, stage1.length - 1) / 3)
      const echoDamage = cfg.damage * (.55 + cfg.scatterAmplify * .45 * ampFactor)
      const sources = stage1.slice(-cfg.secondarySources)
      proxy.ricochet.main = false
      for (const src of sources) {
        if (ws.player.dead || this.game.runFinished) break
        const subs = this._collectScatter(src, proxy.hitTargets, cfg.scatterRange * .85, 2)
        for (const sub of subs) {
          if (ws.player.dead || this.game.runFinished) break
          const len = Math.hypot(sub.x - src.x, sub.y - src.y) || 1
          proxy.damage = echoDamage
          this.beamHit(proxy, sub, (sub.x - src.x) / len, (sub.y - src.y) / len)
          this._pushBeam({
            stage: 2, delay: .05, life: .18, maxLife: .18, width: Math.max(1.4, cfg.width * .36),
            color: '#d9f8ff', glowColor: '#a78bfa', damage: echoDamage, bounces: 0,
            impact: { x: sub.x, y: sub.y, r: cfg.width * .5 },
            pts: [{ x: src.x, y: src.y }, { x: sub.x, y: sub.y }],
          })
          this.metrics.bounces++
          hits++
        }
      }
    }
    return hits
  }
  splash(x, y, radius, damage, color, effects = null) {
    const ws = this.weapon
    for (const e of ws.enemyManager.enemies) {
      if (ws.player.dead || this.game.runFinished) break
      if (!e.active || e.devouring || (e.x - x) ** 2 + (e.y - y) ** 2 > (radius + e.radius) ** 2) continue
      e.hit(damage, effects)
      if (!e.active) { ws._onKill(e); this.metrics.splashKills++ }
    }
    ws._ring(x, y, color, radius)
    ws._burstColor(x, y, color, 5)
    ws.stats.explosions++
  }
  hit(p, e) {
    const r = p.ricochet, ws = this.weapon, first = r.hits === 0
    const isCrit = !r.tomeEcho && (Math.random() < p.critChance || ws.player.guaranteedCrit)
    if (!r.tomeEcho) ws.player.guaranteedCrit = false
    let damage = p.damage * (isCrit ? ws.critMul : 1)
    if (r.main && r.overdriveBonus > 0) {
      const stacks = (e.isBoss || e.isElite) ? (e._ricoSustainStacks || 0) : 0
      const effHits = Math.min(4, r.hits + stacks)
      damage *= 1 + effHits * r.overdriveBonus
      if (e.isBoss || e.isElite) {
        damage *= 1 + r.overdriveBonus
        if (!r.tomeEcho) e._ricoSustainStacks = Math.min(4, stacks + 1)
      }
    }
    if (r.main && r.breach && first && (e.isBoss || e.isElite)) damage *= 1.4
    if (!r.main && r.childExecute > 1 && e.hp <= e.maxHp * .5) damage *= r.childExecute
    if (r.main && !r.tomeEcho && first && this.game?.bossTomes?.rank('rico_stabilizer') === 3) damage *= 1.15
    p.hitTargets.add(e); r.lastHit = e; r.hits++
    const hitAngle = (p.vx || p.vy) ? Math.atan2(p.vy, p.vx) : Math.atan2(e.y - p.y, e.x - p.x)
    const hitEffects = r.tomeEcho
      ? { bossTomeDerived: true, preventDevour: true, hitAngle }
      : { bossTomeContext: { activeRico: r.activeTome }, hitAngle }
    if (r.armorPiercing) {
      hitEffects.ignoreShield = true
      hitEffects.shieldBreak = r.cannon ? 3 : 2
      hitEffects.shieldPierceRatio = r.cannon ? .85 : .65
    }
    e.hit(damage, hitEffects)
    ws._burstColor(p.x, p.y, p.visual.impact, isCrit ? 7 : 3, isCrit)
    if (!r.suppressHitSound) this.game.sound.hit(p.visual.sound)
    ws.enemyManager.addText(e.x, e.y, String(Math.round(damage * 10) / 10), null, isCrit ? '#ffd166' : p.visual.core, isCrit ? 21 : 13)
    const killed = !e.active
    if (killed) ws._onKill(e)
    else if (r.main && r.armorPiercing && !e.isBoss && !e.devouring) {
      const len = Math.hypot(p.vx, p.vy) || 1
      const pushDist = (r.cannon ? 24 : r.heavyActive ? 15 : 9) * (e.hasAffix?.('juggernaut') ? .5 : 1)
      const ww = this.game.worldWidth || 2000, wh = this.game.worldHeight || 2000
      e.x = Math.max(e.radius, Math.min(ww - e.radius, e.x + (p.vx / len) * pushDist))
      e.y = Math.max(e.radius, Math.min(wh - e.radius, e.y + (p.vy / len) * pushDist))
    }
    if (r.main && r.armorPiercing) {
      this._pushTrace({
        kind: 'pierce_ring',
        x: e.x, y: e.y, ux: Math.cos(hitAngle), uy: Math.sin(hitAngle),
        r: Math.max(10, (p.radius || 8) * (r.cannon ? 2.4 : r.heavyActive ? 1.9 : 1.65)),
        life: r.cannon ? .22 : .15, maxLife: r.cannon ? .22 : .15,
        color: r.cannon ? '#ffe08a' : '#f1bf74',
      })
    }
    if (ws.player.dead || this.game.runFinished) return
    if (r.main) {
      if (first && r.splitChance > 0 && Math.random() < r.splitChance) this.split(e, p)
      if (r.shock && !r.shocked && (isCrit || !first) && (r.volley.shocks || 0) < 4) {
        r.shocked = true
        r.volley.shocks = (r.volley.shocks || 0) + 1
        const overdriveMul = 1 + Math.min(4, Math.max(0, r.hits - 1)) * (r.overdriveBonus || 0)
        const shockDmg = r.sourceDamage * (ricochetShockPct(r.shock) / 100) * overdriveMul * (isCrit ? 1.2 : 1)
        this.splash(e.x, e.y, 95, shockDmg, '#f1bf74', { ignoreShield: true })
      }
      if (r.heavyActive && first && (r.volley.heavyBlasts || 0) < 4) {
        r.volley.heavyBlasts = (r.volley.heavyBlasts || 0) + 1
        this.splash(e.x, e.y, 95, r.sourceDamage * .25, '#f1bf74', { ignoreShield: true })
      }
      if (r.cannon) this.splash(e.x, e.y, 165, r.sourceDamage * .22, '#ffe08a', { ignoreShield: true })
      if (r.breach && killed) {
        const len = Math.hypot(p.vx, p.vy) || 1
        this.splash(e.x + (p.vx / len) * 35, e.y + (p.vy / len) * 35, 115, r.sourceDamage * .9, '#f1bf74', { ignoreShield: true })
      }
    } else if (r.bloom) {
      if (killed && r.volley.blooms < 6) {
        r.volley.blooms++
        this.splash(e.x, e.y, 95, r.sourceDamage * .75, '#79dfc8')
      } else if (!killed && (e.isBoss || e.isElite) && e.active) {
        e._ricoSporeStacks = (e._ricoSporeStacks || 0) + 1
        if (e._ricoSporeStacks >= 4 && r.volley.blooms < 6) {
          e._ricoSporeStacks = 0
          r.volley.blooms++
          this.splash(e.x, e.y, 95, r.sourceDamage * .75, '#79dfc8')
        }
      }
    }
  }
  findBounceTarget(p, range) {
    const fresh = this.findTarget(p.x, p.y, p.hitTargets, range)
    if (fresh) return fresh
    const r = p.ricochet
    if (!r.pingPong) return null
    const last = r.lastHit
    let best = null, d2 = range * range
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || e === last) continue
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
      if (d < d2) { d2 = d; best = e }
    }
    if (best) p.hitTargets = new Set(last ? [last] : [])
    return best
  }
  spawnPrismSplit(p, primaryTarget) {
    const r = p.ricochet
    const exclude = new Set(p.hitTargets)
    exclude.add(primaryTarget)
    let alt = this.findTarget(p.x, p.y, exclude, r.bounceRange)
    if (!alt && r.pingPong) {
      const skip = new Set([r.lastHit, primaryTarget].filter(Boolean))
      alt = this.findTarget(p.x, p.y, skip, r.bounceRange) || (primaryTarget !== r.lastHit ? primaryTarget : null)
    }
    if (!alt) return null
    const angle = Math.atan2(alt.y - p.y, alt.x - p.x) + (alt === primaryTarget ? .28 : 0)
    const splitDmg = p.damage * .65
    const child = this.spawn({
      x: p.x, y: p.y, target: alt, speed: p.speed, damage: splitDmg,
      vx: Math.cos(angle) * p.speed, vy: Math.sin(angle) * p.speed,
      homing: 1, life: 2.5, radius: Math.max(4, p.radius * .78), isSplit: true,
      visual: this.visual(true), pierces: r.hybridPierces > 0 ? 1 : 0,
    }, {
      main: false, tomeEcho: r.tomeEcho, activeTome: r.activeTome,
      sourceDamage: r.sourceDamage * .65, initialDamage: r.initialDamage * .65,
      bounces: r.bounces, bounceRetention: r.bounceRetention, bounceRange: r.bounceRange,
      bounceBonus: r.bounceBonus, turnSpeed: r.turnSpeed, pingPong: r.pingPong,
      pierceRetention: r.pierceRetention, hybridPierces: Math.max(0, r.hybridPierces - 1),
      echo: false,
    }, r.lastHit ? [r.lastHit] : null)
    if (child) {
      this.metrics.bounces++
      this._pushTrace({
        x: p.x, y: p.y,
        x2: p.x + Math.cos(angle) * Math.min(65, Math.hypot(alt.x - p.x, alt.y - p.y)),
        y2: p.y + Math.sin(angle) * Math.min(65, Math.hypot(alt.x - p.x, alt.y - p.y)),
        life: .15, maxLife: .15, color: p.visual.color,
      })
    }
    return child
  }
  hasForwardTarget(p, maxDist = 240) {
    if (this.findForwardSnapTarget(p, maxDist, .94)) return true
    const len = Math.hypot(p.vx, p.vy)
    if (!len) return false
    const ux = p.vx / len, uy = p.vy / len
    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || p.hitTargets.has(e)) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const proj = dx * ux + dy * uy
      if (proj <= 0 || proj > maxDist) continue
      const perp2 = dx * dx + dy * dy - proj * proj
      const reach = p.radius + e.radius + 18
      if (perp2 <= reach * reach) return true
    }
    return false
  }
  continueAfterHit(p) {
    const r = p.ricochet
    if (p.pierces > 0) {
      const keepBounceTarget = r.turns > 0 && p.target?.active && !p.hitTargets.has(p.target)
      if (keepBounceTarget) {
        p.pierces--; p.damage *= r.pierceRetention
        this.metrics.penetrations++
        return 'straight'
      }
      // 只有前方确有可穿目标、或根本没有折射余量时才消耗穿透；
      // 否则让位给折射，避免混拿穿透后在空旷方向盲飞丢失锁定。
      if (r.bounces <= 0 || this.hasForwardTarget(p)) {
        p.pierces--; p.damage *= r.pierceRetention
        if (r.pierceSnap > 0) {
          const next = this.findForwardSnapTarget(p, r.pierceSnapRange || 260, r.pierceSnapCos || .88)
          if (next) this._steerPierceSnap(p, next, r.armorPiercing ? .42 : .28)
          else { p.target = null; p.homing = 0 }
        } else {
          p.target = null
        }
        this.metrics.penetrations++
        return 'straight'
      }
    }
    if (r.bounces > 0) {
      const target = this.findBounceTarget(p, r.bounceRange)
      if (target) {
        r.bounces--; r.turns++
        p.damage = p.damage * r.bounceRetention + (r.turns <= 6 ? r.initialDamage * r.bounceBonus : 0)
        p.speed = r.baseSpeed * r.turnSpeed
        const angle = Math.atan2(target.y - p.y, target.x - p.x)
        p.target = target; p.homing = 1
        p.vx = Math.cos(angle) * p.speed; p.vy = Math.sin(angle) * p.speed
        if (r.hybridPierces > 0) { p.pierces += 1; r.hybridPierces-- }
        this._pushTrace({ x: p.x, y: p.y,
          x2: p.x + Math.cos(angle) * Math.min(65, Math.hypot(target.x - p.x, target.y - p.y)),
          y2: p.y + Math.sin(angle) * Math.min(65, Math.hypot(target.x - p.x, target.y - p.y)),
          life: .15, maxLife: .15, color: p.visual.color })
        if (r.main && r.echo && r.turns === 1) this.spawnPrismSplit(p, target)
        this.metrics.bounces++
        return 'turn'
      }
    }
    p.destroy()
    return 'end'
  }
  _emitPierceTracer(p, x1, y1, x2, y2, fromMuzzle = false) {
    const r = p.ricochet
    if (!r?.armorPiercing) return
    if ((x2 - x1) ** 2 + (y2 - y1) ** 2 < 1) return
    const player = this.weapon.player
    // 刚离膛的首段曳光短暂锚定到史莱姆当前位置，避免高速移动时在身旁空地残留悬空起笔。
    const life = fromMuzzle ? (r.cannon ? .09 : .055) : (r.cannon ? .22 : r.heavyActive ? .16 : .13)
    this._pushTrace({
      kind: 'pierce',
      anchorPlayer: fromMuzzle,
      ox: fromMuzzle ? x1 - player.x : 0,
      oy: fromMuzzle ? y1 - player.y : 0,
      x: x1, y: y1, x2, y2,
      width: Math.max(2.2, (p.radius || 6) * (r.cannon ? 1.55 : r.heavyActive ? 1.2 : 1)),
      life, maxLife: life,
      color: r.cannon ? '#ffe08a' : '#f1bf74',
      core: '#fff9e6',
    })
  }
  /** 按线段/圆的首次相交时间排序，避免高速巨炮穿过敌人或按网格顺序倒着结算。 */
  resolve(p) {
    if (this.weapon.player.dead || this.game.runFinished) { p.destroy(); return }
    const ws = this.weapon, grid = ws.enemyManager.grid, pad = p.radius + RICOCHET_RULES.collisionPadding
    const minX = Math.floor((Math.min(p.prevX, p.x) - pad) / CELL_SIZE), maxX = Math.floor((Math.max(p.prevX, p.x) + pad) / CELL_SIZE)
    const minY = Math.floor((Math.min(p.prevY, p.y) - pad) / CELL_SIZE), maxY = Math.floor((Math.max(p.prevY, p.y) + pad) / CELL_SIZE)
    const dx = p.x - p.prevX, dy = p.y - p.prevY, len2 = dx * dx + dy * dy
    const hits = [], seen = new Set()
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      for (const e of grid.get(x * GRID_KEY_SCALE + y) || []) {
        if (seen.has(e) || !e.active || e.devouring || p.hitTargets.has(e)) continue
        seen.add(e)
        const ex = p.prevX - e.x, ey = p.prevY - e.y, rr = p.radius + e.radius
        const c = ex * ex + ey * ey - rr * rr
        let t = 0
        if (c > 0) {
          if (!len2) continue
          const b = ex * dx + ey * dy, disc = b * b - len2 * c
          if (disc < 0) continue
          t = (-b - Math.sqrt(disc)) / len2
          if (t < 0 || t > 1) continue
        }
        hits.push({ e, t })
      }
    }
    hits.sort((a, b) => a.t - b.t)
    const endX = p.x, endY = p.y, startX = p.prevX, startY = p.prevY
    const fromMuzzle = !!p._muzzleFresh
    p._muzzleFresh = false
    for (const { e, t } of hits) {
      if (ws.player.dead || this.game.runFinished) { p.destroy(); return }
      if (!e.active || e.devouring) continue
      p.x = startX + dx * t; p.y = startY + dy * t
      this.hit(p, e)
      if (ws.player.dead || this.game.runFinished) { p.destroy(); return }
      if (this.continueAfterHit(p) !== 'straight') {
        this._emitPierceTracer(p, startX, startY, p.x, p.y, fromMuzzle)
        return
      }
    }
    p.x = endX; p.y = endY
    this._emitPierceTracer(p, startX, startY, endX, endY, fromMuzzle)
  }
  _strokePath(ctx, pts) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }
  /** 视觉曳光与光棱激光渲染：穿甲炮道炽金曳光＋马赫激波环；光棱星爆激光网。 */
  render(ctx) {
    if (!this.enabled) return
    let hasAdditive = false
    for (const trace of this.traces) {
      if (trace.kind) { hasAdditive = true; continue }
      const maxLife = trace.maxLife || .15
      ctx.globalAlpha = Math.max(0, trace.life / maxLife) * .7
      ctx.strokeStyle = trace.color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(trace.x, trace.y); ctx.lineTo(trace.x2, trace.y2); ctx.stroke()
    }
    const player = this.weapon.player
    if (hasAdditive) {
      ctx.save()
      ctx.lineCap = 'round'
      ctx.globalCompositeOperation = 'lighter'
      for (const trace of this.traces) {
        if (!trace.kind) continue
        const a = Math.max(0, trace.life / (trace.maxLife || .15))
        if (trace.kind === 'pierce') {
          const sx = trace.anchorPlayer ? player.x + trace.ox : trace.x
          const sy = trace.anchorPlayer ? player.y + trace.oy : trace.y
          const w = trace.width * (.35 + .65 * a)
          ctx.globalAlpha = a * .26
          ctx.strokeStyle = trace.color; ctx.lineWidth = w * 2.2
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(trace.x2, trace.y2); ctx.stroke()
          ctx.globalAlpha = a * .68
          ctx.lineWidth = w
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(trace.x2, trace.y2); ctx.stroke()
          ctx.globalAlpha = a * .9
          ctx.strokeStyle = trace.core || '#fff9e6'; ctx.lineWidth = Math.max(1, w * .38)
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(trace.x2, trace.y2); ctx.stroke()
        } else if (trace.kind === 'pierce_ring') {
          const k = 1 - a
          const rad = trace.r * (.45 + k * .9)
          const ang = Math.atan2(trace.uy, trace.ux)
          ctx.save()
          ctx.translate(trace.x, trace.y)
          ctx.rotate(ang)
          ctx.globalAlpha = a * .75
          ctx.strokeStyle = trace.color
          ctx.lineWidth = Math.max(1.2, 2.8 * a)
          ctx.beginPath()
          ctx.ellipse(0, 0, rad * .42, rad, 0, -1.25, 1.25)
          ctx.stroke()
          ctx.restore()
        } else if (trace.kind === 'muzzle_cone') {
          const k = 1 - a
          const mx = trace.anchorPlayer ? player.x + trace.ox : trace.x
          const my = trace.anchorPlayer ? player.y + trace.oy : trace.y
          ctx.save()
          ctx.translate(mx, my)
          ctx.rotate(Math.atan2(trace.uy, trace.ux))
          ctx.globalAlpha = a * .55
          ctx.fillStyle = trace.color
          ctx.beginPath()
          ctx.moveTo(0, -trace.width * .45 * a)
          ctx.lineTo(trace.len * (.7 + .4 * k), 0)
          ctx.lineTo(0, trace.width * .45 * a)
          ctx.closePath(); ctx.fill()
          ctx.globalAlpha = a * .85
          ctx.fillStyle = '#fff9e6'
          ctx.beginPath()
          ctx.moveTo(0, -trace.width * .2 * a)
          ctx.lineTo(trace.len * .55, 0)
          ctx.lineTo(0, trace.width * .2 * a)
          ctx.closePath(); ctx.fill()
          ctx.restore()
        }
      }
      ctx.restore()
    }
    if (!this.beams.length) { ctx.globalAlpha = 1; return }
    ctx.save()
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.globalCompositeOperation = 'lighter'
    for (const beam of this.beams) {
      if (beam.delay > 0 || beam.pts.length < 2) continue
      const a = Math.max(0, beam.life / beam.maxLife)
      const taper = Math.pow(a, .65)
      const w = beam.width * (.35 + .65 * taper)
      const p0 = beam.anchorPlayer ? { x: player.x + beam.ox, y: player.y + beam.oy } : beam.pts[0]
      const p1 = beam.anchorPlayer && beam.missDx !== undefined
        ? { x: p0.x + beam.missDx, y: p0.y + beam.missDy }
        : beam.pts[1]
      // 散射/二级光束前 30ms 快速向外伸展，呈现由内向外折射感。
      const grow = beam.stage > 0 ? Math.min(1, (beam.maxLife - beam.life) / .028) : 1
      const endX = p0.x + (p1.x - p0.x) * grow, endY = p0.y + (p1.y - p0.y) * grow
      const seg = beam.pts.length === 2 && (grow < 1 || beam.anchorPlayer) ? [p0, { x: endX, y: endY }] : beam.pts

      ctx.globalAlpha = a * .24
      ctx.strokeStyle = beam.glowColor || beam.color; ctx.lineWidth = w * 2.7
      this._strokePath(ctx, seg)
      ctx.globalAlpha = a * .68
      ctx.strokeStyle = beam.color; ctx.lineWidth = w * 1.4
      this._strokePath(ctx, seg)
      if (beam.stage === 0 && w >= 6.5) {
        const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1
        const nx = -dy / len * (w * .45), ny = dx / len * (w * .45)
        ctx.globalAlpha = a * .45
        ctx.lineWidth = Math.max(1, w * .22)
        ctx.strokeStyle = '#5ef2ff'
        ctx.beginPath(); ctx.moveTo(p0.x + nx, p0.y + ny); ctx.lineTo(p1.x + nx, p1.y + ny); ctx.stroke()
        ctx.strokeStyle = '#e0aaff'
        ctx.beginPath(); ctx.moveTo(p0.x - nx, p0.y - ny); ctx.lineTo(p1.x - nx, p1.y - ny); ctx.stroke()
      }
      ctx.globalAlpha = a
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, w * .58)
      this._strokePath(ctx, seg)

      if (beam.impact && grow >= .85) {
        const ix = beam.impact.x, iy = beam.impact.y
        const r = beam.impact.r * (.6 + a * .85)
        ctx.globalAlpha = a * .75
        ctx.fillStyle = beam.glowColor || beam.color
        ctx.beginPath()
        ctx.moveTo(ix, iy - r * 1.5); ctx.lineTo(ix + r * .35, iy - r * .35)
        ctx.lineTo(ix + r * 1.5, iy); ctx.lineTo(ix + r * .35, iy + r * .35)
        ctx.lineTo(ix, iy + r * 1.5); ctx.lineTo(ix - r * .35, iy + r * .35)
        ctx.lineTo(ix - r * 1.5, iy); ctx.lineTo(ix - r * .35, iy - r * .35)
        ctx.closePath(); ctx.fill()
        ctx.globalAlpha = a
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ix, iy, Math.max(2, r * .42), 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }
}
