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
  bounceAmplifyPct,
} from './RicochetRules.js'

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
    if (this.route === 'pierce') return '连续发射 4 枚聚能重弹，逐轮锁定不同敌人，单枚威力随齐射弹数倍增；移速 +20% 持续 1 秒。'
    return '连续追加 4 轮齐射，弹体优先分散锁定不同敌人；移速 +20% 持续 1 秒。'
  }
  reset() {
    this.route = null
    this.normalChoices = 0
    this.shockCooldown = 0
    this.traces = []
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
  update(dt) {
    this.shockCooldown = Math.max(0, this.shockCooldown - dt)
    for (let i = this.traces.length - 1; i >= 0; i--) {
      this.traces[i].life -= dt
      if (this.traces[i].life <= 0) this.traces.splice(i, 1)
    }
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
    if (ultimate) this.game.shakeScreen?.(this.route === 'pierce' ? 5 : 3, .16)
    return true
  }
  fire(target, options = {}) {
    const ws = this.weapon, p = ws.player, active = options.ricochetActive === true
    const ultimate = active && options.ultimate === true
    const cannon = active && this.route === 'pierce', prism = ultimate && this.route === 'bounce'
    const swarmActive = active && ultimate && this.route === 'split'
    const count = cannon ? 1 : prism ? 3 : ws.projectileCount
    const visual = this.visual(), base = Math.atan2(target.y - p.y, target.x - p.x)
    const damage = ws.damage * ws.levelMul * ws.devourDamageMul * (options.tomeEcho || 1) * (this.route === 'pierce' ? 1.35 : 1)
    const radiusMul = (this.route === 'pierce' ? 1.3 : 1) * (this.route === 'pierce' && this.ultimate ? 1.5 : 1)
    const activeCount = Math.min(RICOCHET_RULES.activeCountCap, ws.projectileCount)
    const baseDamage = damage * (cannon ? activeCount * (ultimate ? 8 : .9) : prism ? activeCount * 1.5 : 1)
    const splitLevel = this.level('split')
    const splitChance = this.route === 'split' ? 1 : Math.min(.95,
      (splitLevel ? ricochetSplitChance(splitLevel) / 100 : 0) + ws.baseSplitChance)
    const huntRank = this.level('hunt')
    const shotSpeed = prism ? ws.projectileSpeed * 1.15 : ws.projectileSpeed
    // 空格疾射（任意路线）与弹跳路线逐枚换锁：aimed 去重后各弹锁定不同敌人，
    // 齐射呈多方向扫射；集合跨轮共享时前几轮锁过的敌人跳开，无可锁目标回落主目标。
    const volley = { blooms: 0 }, aimed = options.aimed || new Set()
    for (let i = 0; i < count; i++) {
      let aim = target
      if (this.route === 'bounce' || active) {
        aim = this.findTarget(p.x, p.y, aimed) || target
        aimed.add(aim)
      }
      const angle = Math.atan2(aim.y - p.y, aim.x - p.x) + (count > 1 ? (i - (count - 1) / 2) * .2 : 0)
      const spread = count > 1 ? (i - (count - 1) / 2) * 11 : 0
      const projectile = this.spawn({
        x: p.x - Math.sin(base) * spread, y: p.y + Math.cos(base) * spread,
        target: aim, speed: shotSpeed, damage: baseDamage,
        vx: Math.cos(angle) * shotSpeed, vy: Math.sin(angle) * shotSpeed,
        homing: 1 - (count > 1 ? .2 : 0), visual,
        radius: visual.radius * radiusMul * (cannon && ultimate ? 2 : prism ? 1.4 : 1),
        life: ultimate ? 5 : 2.5, isBasicAttack: !active,
        pierces: Math.min(14, this.level('pierce') + (this.route === 'pierce' ? 1 : 0) + ws.basePierces + ws.genePierces + (cannon && ultimate ? 6 : 0)),
      }, {
        main: true, tomeEcho: !!options.tomeEcho, activeTome: active, splitChance, volley, sourceDamage: baseDamage,
        bounces: prism ? 6 : Math.min(12, this.level('bounce') + (this.route === 'bounce' ? 1 + this.level('extension') + Number(this.ultimate) : 0)),
        bounceRetention: prism || this.route === 'bounce' ? 1 : .85,
        bounceRange: (this.route === 'bounce' ? 360 : 300) + this.level('extension') * 120,
        pierceRetention: this.route === 'pierce' ? 1 : .9,
        overdriveBonus: ricochetPierceOverdrivePct(this.level('sustain')) / 100,
        bounceBonus: bounceAmplifyPct(this.level('amplify')) / 100,
        turnSpeed: Math.min(2.6, 1 + .25 * this.level('extension')),
        pingPong: this.route === 'bounce',
        hybridPierces: this.level('pierce_bounce') ? 4 : 0,
        echo: this.level('echo') > 0,
        bloom: this.level('bloom') > 0, breach: this.level('breach') > 0,
        shock: this.level('shock'), cannon: cannon && ultimate,
        splitCount: Math.min(8, 2 + Number(splitLevel >= 2) + this.level('density') + (this.route === 'split' && this.ultimate ? 2 : 0)),
        childDamage: ((this.route === 'split' ? .5 : .35) + splitSporeDamageBonus(huntRank) / 100) * (swarmActive ? 1.3 : 1),
        childExecute: huntRank > 0 ? 1.3 : 1,
        childLife: 1.2 + Math.min(1.5, huntRank * .25),
        childPierces: this.level('split_pierce') ? 2 : 0,
        childPierceRetention: this.level('split_pierce') ? 1 : .8,
        childBounces: this.level('split_bounce') ? 2 : 0,
        childBounceRetention: .85,
      })
      if (projectile) this.metrics.shots++
    }
    if (!active && !options.tomeEcho && !options.activeVolley) {
      const echo = this.game?.bossTomes?.echoMultiplier() || 0
      if (echo) this.fire(target, { tomeEcho: echo })
    }
    ws._muzzleT = .08; ws._muzzleAngle = base; ws._muzzleVisual = visual
    this.game.sound.shoot(visual.sound, ultimate ? 1.3 : 1)
  }
  spawn(config, behavior, excluded = null) {
    if (this.weapon._projectiles.length >= RICOCHET_RULES.projectileLimit) return null
    const p = new Projectile({ ...config, critChance: this.weapon.critChance })
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
  splash(x, y, radius, damage, color) {
    const ws = this.weapon
    for (const e of ws.enemyManager.enemies) {
      if (ws.player.dead || this.game.runFinished) break
      if (!e.active || e.devouring || (e.x - x) ** 2 + (e.y - y) ** 2 > (radius + e.radius) ** 2) continue
      e.hit(damage)
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
      damage *= 1 + Math.min(4, r.hits) * r.overdriveBonus
      if (e.isBoss || e.isElite) damage *= 1 + r.overdriveBonus
    }
    if (r.main && r.breach && first && (e.isBoss || e.isElite)) damage *= 1.4
    if (!r.main && r.childExecute > 1 && e.hp <= e.maxHp * .5) damage *= r.childExecute
    if (r.main && !r.tomeEcho && first && this.game?.bossTomes?.rank('rico_stabilizer') === 3) damage *= 1.15
    p.hitTargets.add(e); r.lastHit = e; r.hits++
    const hitAngle = (p.vx || p.vy) ? Math.atan2(p.vy, p.vx) : Math.atan2(e.y - p.y, e.x - p.x)
    e.hit(damage, r.tomeEcho
      ? { bossTomeDerived: true, preventDevour: true, hitAngle }
      : { bossTomeContext: { activeRico: r.activeTome }, hitAngle })
    ws._burstColor(p.x, p.y, p.visual.impact, isCrit ? 7 : 3, isCrit)
    this.game.sound.hit(p.visual.sound)
    ws.enemyManager.addText(e.x, e.y, String(Math.round(damage * 10) / 10), null, isCrit ? '#ffd166' : p.visual.core, isCrit ? 21 : 13)
    const killed = !e.active
    if (killed) ws._onKill(e)
    if (ws.player.dead || this.game.runFinished) return
    if (r.main) {
      if (first && r.splitChance > 0 && Math.random() < r.splitChance) this.split(e, p)
      if (r.shock && this.shockCooldown <= 0 && (isCrit || !first)) {
        this.shockCooldown = .2
        this.splash(e.x, e.y, 95, r.sourceDamage * (ricochetShockPct(r.shock) / 100), '#f1bf74')
      }
      if (r.cannon) this.splash(e.x, e.y, 130, r.sourceDamage * .15, '#f1bf74')
      if (r.breach && killed) {
        const len = Math.hypot(p.vx, p.vy) || 1
        this.splash(e.x + (p.vx / len) * 35, e.y + (p.vy / len) * 35, 110, r.sourceDamage * .9, '#f1bf74')
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
      if (this.traces.length < 48) this.traces.push({
        x: p.x, y: p.y,
        x2: p.x + Math.cos(angle) * Math.min(65, Math.hypot(alt.x - p.x, alt.y - p.y)),
        y2: p.y + Math.sin(angle) * Math.min(65, Math.hypot(alt.x - p.x, alt.y - p.y)),
        life: .15, color: p.visual.color,
      })
    }
    return child
  }
  hasForwardTarget(p, maxDist = 220) {
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
      if (r.turns === 0 || r.bounces <= 0 || this.hasForwardTarget(p)) {
        p.pierces--; p.damage *= r.pierceRetention; p.target = null
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
        if (this.traces.length < 48) this.traces.push({ x: p.x, y: p.y,
          x2: p.x + Math.cos(angle) * Math.min(65, Math.hypot(target.x - p.x, target.y - p.y)),
          y2: p.y + Math.sin(angle) * Math.min(65, Math.hypot(target.x - p.x, target.y - p.y)),
          life: .15, color: p.visual.color })
        if (r.main && r.echo && r.turns === 1) this.spawnPrismSplit(p, target)
        this.metrics.bounces++
        return 'turn'
      }
    }
    p.destroy()
    return 'end'
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
    for (const { e, t } of hits) {
      if (ws.player.dead || this.game.runFinished) { p.destroy(); return }
      if (!e.active || e.devouring) continue
      p.x = startX + dx * t; p.y = startY + dy * t
      this.hit(p, e)
      if (ws.player.dead || this.game.runFinished) { p.destroy(); return }
      if (this.continueAfterHit(p) !== 'straight') return
    }
    p.x = endX; p.y = endY
  }
  render(ctx) {
    if (!this.enabled) return
    for (const trace of this.traces) {
      ctx.globalAlpha = trace.life / .15 * .7
      ctx.strokeStyle = trace.color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(trace.x, trace.y); ctx.lineTo(trace.x2, trace.y2); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
