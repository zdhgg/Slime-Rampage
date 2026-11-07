import {
  DEVOUR_SOURCE_GLUTTON, DEVOUR_SOURCE_NORMAL, GLUTTON_CHARGE_MAX, GLUTTON_FEAST_DURATION,
  hasGluttonCharge, isGluttonLocked, onGluttonBossBasicHit, spendGluttonCharge,
} from './GluttonResource.js'
import { bitePose, renderBiteMotion, renderBiteFeedback } from './effects/GluttonBiteVisual.js'
import { GLUTTON_ROUTES, GLUTTON_RULES, getGluttonEndlessDamageMultiplier, getGluttonHeavyDamageMultiplier, getGluttonHeavyReachMultiplier, gluttonCowDurationAt, gluttonCowPowerAt, gluttonProgressReady, gluttonRouteReady, gluttonRouteInvestment } from './GluttonBuild.js'
import { traceShadowPath } from './ShadowGeometry.js'

const TAU = Math.PI * 2
/** 从 a 转到 b 的最短有符号角差。 */
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
/** 以有限角速度转向，避免单帧直接翻到身后。 */
const turnToward = (from, to, maxStep) => {
  const delta = angleDelta(from, to)
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}
const angleTo = (player, enemy) => Math.atan2(enemy.y - player.y, enemy.x - player.x)

export const GLUTTON_BITE_REACH = 48 // 从身体边缘起算，留出与接触伤害之间的走位空间。
export const GLUTTON_HEAVY_REACH = 68
export const GLUTTON_BITE_ARC = Math.PI * 11 / 18 // 110°：明确留出侧后方空隙。
export const GLUTTON_HEAVY_ARC = Math.PI * 7 / 9
/** 可读性前摇：张嘴蓄力要看得清，出手本身仍保持干脆。 */
export const GLUTTON_BITE_WINDUP = 0.17
export const GLUTTON_BITE_STRIKE = 0.045
export const GLUTTON_HEAVY_WINDUP = 0.25
export const GLUTTON_HEAVY_STRIKE = 0.06
export const GLUTTON_BITE_DAMAGE = 1.35
export const GLUTTON_HEAVY_DAMAGE = 4
export const GLUTTON_BOSS_HEAVY_DAMAGE = 6
export const GLUTTON_GUARD_COOLDOWN = 2.5
export const GLUTTON_HEAL_COOLDOWN = 4
/**
 * 重咬突进（近战补偿·机制层）：重咬进入出手帧时向前扑一小段，吃腐蚀重碾等级，
 * 停在目标身位前——扑食的手感与贴脸的门槛一起解决，普攻咬击不带位移。
 */
export const GLUTTON_HEAVY_LUNGE_BASE = 36
export const GLUTTON_HEAVY_LUNGE_PER_LEVEL = 8
export const GLUTTON_HEAVY_LUNGE_MAX = 64

/** 前方候选范围：正前方左右各 100°。范围内优先选最近目标。 */
export const GLUTTON_FORWARD_HALF_ARC = Math.PI * 5 / 9
/** 目标方向与当前口器朝向差超过 60° 时，先用转头阶段预告，再锁定咬击方向。 */
export const GLUTTON_AIM_SNAP_LIMIT = Math.PI / 3
/** 转头角速度（弧度/秒）：180° 约 0.22 秒，既看得见又不会拖慢连续攻击。 */
export const GLUTTON_AIM_TURN_RATE = 14
/** 目标粘性：同层级目标不比当前目标近 22% 以上时保持不变，避免左右反复横跳。 */
export const GLUTTON_TARGET_STICKY = 1.22
/** 转头阶段的最长时长，避免目标高速绕圈时无限等待。 */
export const GLUTTON_AIM_MAX_TIME = 0.3

/** 圆形目标与扇形相交；范围、预览和结算共享同一份几何判定。 */
export function inBiteSector(player, enemy, angle, reach, arc) {
  if (!enemy?.active || enemy.devouring || !(enemy.hp > 0)) return false
  const dx = enemy.x - player.x
  const dy = enemy.y - player.y
  const distance = Math.hypot(dx, dy)
  const radius = enemy.radius || 0
  if (distance > reach + radius) return false
  if (distance <= radius) return true
  const delta = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)))
  if (delta <= arc / 2) return true
  // 角度在扇面外时，检查目标圆到边界线段的距离，避免同时擦过射程/角度却误中。
  const cosine = Math.cos(delta - arc / 2)
  const nearest = Math.max(0, Math.min(reach, distance * cosine))
  return distance * distance + nearest * nearest - 2 * distance * nearest * cosine <= radius * radius + 1e-8
}

/** 暴食的近战时序与表现。伤害、护盾、吞噬奖励仍经过原有实体结算。 */
export class GluttonCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  reset() {
    this.swing = null
    this.flash = null
    this.impacts = []
    this.morsels = []
    this.acidBursts = []
    this.guardPulse = 0
    this.acidPending = false
    this.acidSource = DEVOUR_SOURCE_NORMAL
    this.acidCooldown = 0
    // 口器朝向跨攻击保留：转头阶段从这里开始旋转，而不是瞬间重置。
    this.aimAngle = this.weapon?.player?.facing ?? -Math.PI / 2
    this.aimTarget = null
    this.acidBurstSeq = 0
    this.route = null
    this.normalChoices = 0
    this.mires = []
  }

  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  /** 全套近战咬击（自动咬人替代普攻）：仅暴食血统。 */
  get enabled() { return this.weapon.game?.startingStrain === 'glutton' }
  /** 重咬与吞噬结算表现的统一闸门：只有真正的暴食血统。 */
  get biteUnlocked() { return this.enabled }
  get routeInfo() { return GLUTTON_ROUTES[this.route] || null }
  get endlessDamageMultiplier() { return getGluttonEndlessDamageMultiplier(this.weapon.game?.skillLevels) }
  refreshStats() {}
  chooseRoute(route) {
    if (!this.enabled || !GLUTTON_ROUTES[route] || !gluttonRouteReady(this.game) || !this.game.skillLevels?.[GLUTTON_ROUTES[route].seed]) return false
    this.route = route
    this.weapon._weaponPulse = .7
    return true
  }
  hud() {
    const route = this.routeInfo
    return {
      route: this.route, name: route?.name || '暴食探索', icon: route?.icon || '🍽️', color: route?.color || '#ff9f43',
      investment: route ? gluttonRouteInvestment(this.game, this.route) : 0,
      normalChoices: this.normalChoices, routeReady: gluttonRouteReady(this.game), progressReady: gluttonProgressReady(this.game),
      ultimate: !!(route && this.game.skillLevels?.[route.ultimate]), ultimateName: route?.ultimateName || '',
      ultimateReady: !!(route && this.game.player?.level >= GLUTTON_RULES.ultimateLevel && gluttonProgressReady(this.game, true)),
      note: route ? `${route.name}已锁定 · ${route.ultimateName}为互斥终极` : `前期随机探索 · 选卡满${GLUTTON_RULES.choicesBeforeRoute}次且第${GLUTTON_RULES.routeWave}波／远征第${GLUTTON_RULES.routeStage}章后确认路线`,
    }
  }
  get pose() { return this.biteUnlocked && !this.player.dead ? bitePose(this.swing, this.flash) : null }
  reach(heavy = false) {
    return this.player.radius + (heavy ? GLUTTON_HEAVY_REACH * getGluttonHeavyReachMultiplier(this.player.gluttonHeavyLevel) : GLUTTON_BITE_REACH) * (this.player.isGluttonyLord ? 1.25 : 1) * (this.weapon.geneRangeMul || 1)
  }

  /** 朝向参考：玩家最近一次有效移动方向；静止时沿用最后朝向。 */
  aimReference() {
    const facing = this.player.facing
    return Number.isFinite(facing) ? facing : -Math.PI / 2
  }

  /**
   * 前方优先的自动索敌。
   *
   * 规则保持简单：
   *  - 正前方左右各 100° 内存在目标时，只在这些目标里选最近者；
   *  - 前方没有目标才回落到最近目标，保证被追击时仍会自动防身；
   *  - 同层级目标之间保留少量粘性，避免两只敌人交替成为「最近」时方向横跳。
   * 不做复杂评分，也不改变任何移动或追击行为。
   */
  nearest(heavy = false) {
    const reach = this.reach(heavy)
    const facing = this.aimReference()
    const current = this.aimTarget
    let frontBest = null, frontEdge = Infinity
    let anyBest = null, anyEdge = Infinity
    let currentEdge = Infinity, currentFront = false, currentSeen = false

    for (const e of this.weapon.enemyManager.enemies) {
      if (!e.active || e.devouring || !(e.hp > 0)) continue
      const dx = e.x - this.player.x
      const dy = e.y - this.player.y
      const radius = e.radius || 0
      const distance = Math.hypot(dx, dy)
      if (distance > reach + radius) continue
      const edge = distance - radius
      const front = Math.abs(angleDelta(facing, Math.atan2(dy, dx))) <= GLUTTON_FORWARD_HALF_ARC
      if (e === current) { currentSeen = true; currentEdge = edge; currentFront = front }
      if (edge < anyEdge) { anyEdge = edge; anyBest = e }
      if (front && edge < frontEdge) { frontEdge = edge; frontBest = e }
    }

    const preferred = frontBest || anyBest
    if (!preferred) { this.aimTarget = null; return null }
    if (currentSeen && current !== preferred) {
      const preferredFront = !!frontBest
      // 前方有目标时，绝不为了更近的身后目标而回头。
      if (currentFront && !preferredFront) return current
      // 前方目标出现时，从身后目标切回前方。
      if (!currentFront && preferredFront) { this.aimTarget = preferred; return preferred }
      const preferredEdge = preferred === frontBest ? frontEdge : anyEdge
      // 同层级：除非新目标明显更近，否则保持当前目标。
      if (currentEdge <= preferredEdge * GLUTTON_TARGET_STICKY) return current
    }
    this.aimTarget = preferred
    return preferred
  }

  bite(target = null, heavy = false) {
    // 只有暴食血统会进入咬击；origin 不再拟态，普攻始终是飞弹。
    if (!this.enabled || this.player.dead || this.weapon.game.runFinished) return false
    // 重咬可以替换尚未结算的普通前摇/转头；出手阶段不能被覆盖。
    if (this.swing && (!heavy || this.swing.heavy || this.swing.phase === 'strike')) return false
    const chosen = target || this.nearest(heavy)
    if (!chosen) return false
    const desired = angleTo(this.player, chosen)
    const reach = this.reach(heavy)
    if (!inBiteSector(this.player, chosen, desired, reach, Math.PI)) return false
    if (heavy && (!hasGluttonCharge(this.player) || isGluttonLocked(this.player))) return false
    // 前摇与出手占用既有攻击周期；高攻速优先压缩收势，仍保留可见张嘴。
    const pace = Math.min(1, Math.max(0.55, this.weapon.attackInterval / 0.4))
    const windup = heavy ? GLUTTON_HEAVY_WINDUP * (this.game?.bossTomes?.heavyWindup() || 1) : GLUTTON_BITE_WINDUP * pace
    const strike = heavy ? GLUTTON_HEAVY_STRIKE : GLUTTON_BITE_STRIKE * pace
    const gap = Math.abs(angleDelta(this.aimAngle, desired))
    const needsTurn = gap > GLUTTON_AIM_SNAP_LIMIT
    const aimDuration = needsTurn ? Math.min(GLUTTON_AIM_MAX_TIME, gap / GLUTTON_AIM_TURN_RATE + 0.02) : 0
    // 不需要转头时，口器在起手瞬间已对准目标；同步缓存，重咬替换普攻时不会误判。
    if (!needsTurn) this.aimAngle = desired
    // 猎食点在起手时扣除：转头/前摇都算已起手，目标随后离开仍按挥空处理。
    if (heavy && !spendGluttonCharge(this.player)) return false
    if (heavy && this.game?.bossTomes) this.game.bossTomes.fastBite = false

    this.flash = null
    this.aimTarget = chosen
    this.swing = {
      target: chosen,
      angle: needsTurn ? this.aimAngle : desired,
      desiredAngle: desired,
      reach, arc: heavy ? GLUTTON_HEAVY_ARC : GLUTTON_BITE_ARC,
      remaining: needsTurn ? aimDuration : windup,
      windup, strike, heavy,
      phase: needsTurn ? 'aim' : 'windup',
      aimDuration,
      recovery: heavy ? 0.22 : Math.min(0.16, this.weapon.attackInterval * 0.25),
    }
    return true
  }

  heavyBite() { return this.bite(this.nearest(true), true) }

  grantGuard(force = false) {
    const p = this.player
    if (!this.biteUnlocked || p.dead || (!force && p.gluttonGuardCooldown > 0)) return
    p.gluttonGuard = 1
    p.gluttonGuardTimer = p.gluttonGuardDuration
    p.gluttonGuardCooldown = GLUTTON_GUARD_COOLDOWN
    this.guardPulse = 0.24
  }

  onGuardBlocked() {
    if (this.route !== 'shell' || !(this.player.gluttonCounterLevel > 0) || this.player.gluttonCounterCooldown > 0) return
    this.player.gluttonCounterCooldown = this.player.gluttonShellUltimate ? 0.7 : 1.1
    this.counterPulse()
  }

  onDevoured(enemy) {
    if (!this.biteUnlocked || this.player.dead) return
    this.player.gluttonFeastTimer = GLUTTON_FEAST_DURATION
    const angle = this.swing?.angle ?? this.flash?.angle ?? Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x)
    this.morsels.push({ x: enemy.x, y: enemy.y, angle, life: 0.3, maxLife: 0.3 })
    if (this.morsels.length > 20) this.morsels.shift()
    if (this.route === 'mire' && this.player.gluttonMireLevel > 0) this.spawnMire(enemy.x, enemy.y)
  }

  spawnMire(x, y) {
    const level = this.player.gluttonMireLevel || 0
    this.mires.push({ x, y, r: 46 + Math.min(7, level) * 5, life: Math.min(3.2, 2.2 + level * .2), maxLife: Math.min(3.2, 2.2 + level * .2), tick: 0 })
    if (this.mires.length > 8) this.mires.shift()
  }

  counterPulse() {
    if (this.route !== 'shell' || !(this.player.gluttonCounterLevel > 0)) return
    const level = this.player.gluttonCounterLevel
    const radius = 92 + Math.min(6, level) * 8
    const damage = this.weapon.damage * this.weapon.levelMul * this.endlessDamageMultiplier * (.4 + Math.min(5, level - 1) * .08)
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!enemy.active || enemy.devouring || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > radius + enemy.radius) continue
      enemy.hit(damage, { preventDevour: true })
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    this.weapon._ring(this.player.x, this.player.y, '#e3bd73', radius)
    this.weapon._burstColor(this.player.x, this.player.y, '#fff0b0', 8, false)
  }

  aftershock(angle, level, damage, ultimate = false) {
    const radius = 120 + Math.min(5, level) * 12
    const waves = ultimate ? 2 : 1
    for (let wave = 0; wave < waves; wave++) {
      const waveDamage = damage * (0.3 + Math.min(5, level - 1) * .08) * (wave ? .65 : 1)
      for (const enemy of this.weapon.enemyManager.enemies) {
        if (!enemy.active || enemy.devouring) continue
        const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y
        if (Math.hypot(dx, dy) > radius + enemy.radius) continue
        const delta = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)))
        if (delta > Math.PI * .3) continue
        enemy.hit(waveDamage, { preventDevour: true })
        if (!enemy.active) this.weapon._onKill(enemy)
      }
    }
    this.weapon._ring(this.player.x + Math.cos(angle) * radius * .45, this.player.y + Math.sin(angle) * radius * .45, '#f28a59', radius * .55)
  }

  impact(enemy, swing, x, y) {
    const dx = x - this.player.x, dy = y - this.player.y
    const distance = Math.hypot(dx, dy) || 1
    const contact = Math.max(0, distance - (enemy.radius || 0))
    this.impacts.push({
      x: this.player.x + dx / distance * contact, y: this.player.y + dy / distance * contact,
      angle: swing.angle, heavy: swing.heavy, devoured: enemy.devouring,
      life: 0.18, maxLife: 0.18,
    })
    if (this.impacts.length > 32) this.impacts.shift()
  }

  /** 同一帧的多次吞噬合并为一次近身爆发，不递归吞噬、不生成远程弹幕。 */
  queueAcid(source = DEVOUR_SOURCE_NORMAL) {
    if (this.biteUnlocked && this.player.devourAcidBurst > 0) {
      if (!this.acidPending || source === DEVOUR_SOURCE_GLUTTON) this.acidSource = source
      this.acidPending = true
    }
  }

  /**
   * 胃酸迸发表现：伤害仍是原有的圆形近身判定，这里只预生成喷溅团块。
   * 团块中心和半径都限制在实际伤害半径内，避免视觉声称不存在的范围。
   */
  spawnAcidBurst(radius) {
    const tier = this.player.devourAcidBurst || 0
    const count = Math.min(14, 8 + tier * 2)
    const seed = this.acidBurstSeq++
    // 纯表现噪声：不消耗 Math.random，避免视觉变化干扰固定种子的战斗结算。
    const noise = (i, k) => {
      const value = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233 + seed * 37.719 + this.player.x * 0.013 + this.player.y * 0.017) * 43758.5453
      return value - Math.floor(value)
    }
    const blobs = []
    for (let i = 0; i < count; i++) {
      blobs.push({
        angle: (i / count) * TAU + (noise(i, 1) - 0.5) * 0.7,
        distance: radius * (0.22 + noise(i, 2) * 0.42),
        radius: radius * (0.07 + noise(i, 3) * 0.055),
        drift: radius * (0.05 + noise(i, 4) * 0.08),
        roll: (noise(i, 5) - 0.5) * 1.1,
        phase: noise(i, 6) * TAU,
      })
    }
    this.acidBursts.push({ x: this.player.x, y: this.player.y, radius, blobs, life: 0.42, maxLife: 0.42 })
    if (this.acidBursts.length > 3) this.acidBursts.shift()
  }

  hit(enemy, damage, { source = DEVOUR_SOURCE_NORMAL, basic = false, execute = false } = {}) {
    if (this.player.dead || this.weapon.game.runFinished) return false
    if (!enemy.active || enemy.devouring || enemy._settled) return false
    const before = enemy.hp
    enemy.hit(damage, { devourOnHit: true, devourSource: source, devourExecute: execute, bossTomeContext: { heavy: source === DEVOUR_SOURCE_GLUTTON, biteBasic: basic } })
    const landed = enemy.hp < before
    if (landed && basic && enemy.isBoss && onGluttonBossBasicHit(this.player, enemy)) {
      this.weapon.enemyManager.addText(this.player.x, this.player.y - 46,
        `🍽️ 猎食点 +1（${this.player.gluttonCharge}/${GLUTTON_CHARGE_MAX}）`, null, '#a6e77c', 15)
    }
    if (landed && !enemy.devouring) {
      this.weapon.enemyManager.addText(enemy.x, enemy.y - 14, String(Math.round((before - enemy.hp) * 10) / 10), null, '#eaffc9', 15)
      if (!enemy.isBoss && !enemy.isEnraged && enemy.active) {
        enemy.gluttonStagger = Math.max(enemy.gluttonStagger || 0, 0.14)
        // 咬合震慑（饕甲进阶卡）：本体咬中的普通敌人出手伤害短时打折。
        if (this.player.gluttonCowLevel > 0) {
          enemy.gluttonCow = gluttonCowDurationAt(this.player.gluttonCowLevel)
          enemy.gluttonCowMul = gluttonCowPowerAt(this.player.gluttonCowLevel)
        }
        const dx = enemy.x - this.player.x
        const dy = enemy.y - this.player.y
        const d = Math.hypot(dx, dy) || 1
        enemy.x += dx / d * 6
        enemy.y += dy / d * 6
      }
    }
    if (!enemy.active) {
      this.weapon._onKill(enemy)
      this.player.gluttonFeastTimer = GLUTTON_FEAST_DURATION
    }
    return landed
  }

  /** 重咬前扑：沿锁定咬合方向小步突进，不越过目标身位；路障与世界边界照常约束。 */
  lunge(swing) {
    const p = this.player
    const target = swing.target
    let distance = Math.min(GLUTTON_HEAVY_LUNGE_MAX,
      GLUTTON_HEAVY_LUNGE_BASE + GLUTTON_HEAVY_LUNGE_PER_LEVEL * (p.gluttonHeavyLevel || 0))
    if (target?.active && !target.devouring && target.hp > 0) {
      const gap = Math.hypot(target.x - p.x, target.y - p.y) - (target.radius || 0) - p.radius
      distance = Math.min(distance, Math.max(0, gap - 2))
    }
    if (distance <= 0) return
    const end = traceShadowPath(this.game, p, swing.angle, distance)
    p.x = end.x; p.y = end.y
  }

  update(dt) {
    if (!this.biteUnlocked || this.player.dead || this.weapon.game.runFinished) { this.reset(); return }
    if (this.flash) {
      this.flash.life -= dt
      if (this.flash.life <= 0) this.flash = null
    }
    this.guardPulse = Math.max(0, this.guardPulse - dt)
    for (const list of [this.impacts, this.morsels, this.acidBursts, this.mires]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt
        if (list[i].life <= 0) list.splice(i, 1)
      }
    }
    for (const mire of this.mires) {
      mire.tick -= dt
      if (mire.tick > 0) continue
      mire.tick = .45
      const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * (.22 + Math.min(5, this.player.gluttonMireLevel - 1) * .035)
      for (const enemy of this.weapon.enemyManager.enemies) {
        if (!enemy.active || enemy.devouring || Math.hypot(enemy.x - mire.x, enemy.y - mire.y) > mire.r + enemy.radius) continue
        enemy.hit(damage, { preventDevour: true })
        if (!enemy.isBoss) enemy.slow = Math.max(enemy.slow || 0, .35)
        if (!enemy.active) this.weapon._onKill(enemy)
      }
    }
    this.acidCooldown = Math.max(0, this.acidCooldown - dt)
    if (this.swing) {
      if (this.swing.phase === 'aim') {
        // 转头阶段只追随目标方向，不锁定命中；目标在这段时间内移动仍可被重新对准。
        const target = this.swing.target
        if (target && target.active && !target.devouring && target.hp > 0) {
          this.swing.desiredAngle = angleTo(this.player, target)
        }
        this.swing.angle = turnToward(this.swing.angle, this.swing.desiredAngle, GLUTTON_AIM_TURN_RATE * dt)
        this.aimAngle = this.swing.angle
        this.swing.remaining -= dt
        if (Math.abs(angleDelta(this.swing.angle, this.swing.desiredAngle)) <= 0.03 || this.swing.remaining <= 0) {
          // 进入前摇即锁定方向：之后目标绕背仍会挥空，保留现有躲避规则。
          this.swing.angle = this.swing.desiredAngle
          this.aimAngle = this.swing.angle
          this.swing.phase = 'windup'
          this.swing.remaining = this.swing.windup
        }
      } else {
        this.swing.remaining -= dt
        if (this.swing.phase === 'windup' && this.swing.remaining <= 0) {
          this.swing.phase = 'strike'
          this.swing.remaining += this.swing.strike
          // 重咬出手帧前扑：前摇读招阶段不位移，扑食动作才带身位。
          if (this.swing.heavy) this.lunge(this.swing)
        }
        if (this.swing.remaining <= 0) {
          const swing = this.swing
          this.swing = null
          // 命中残像留在真实咬合位置，移动后不会把特效拖到新的敌人身上。
          this.flash = { ...swing, x: this.player.x, y: this.player.y, life: swing.recovery, maxLife: swing.recovery }
          this.aimAngle = swing.angle
          const source = swing.heavy ? DEVOUR_SOURCE_GLUTTON : DEVOUR_SOURCE_NORMAL
          // 在结算前固定目标，吞噬/首领阶段变化产生的新敌人不会被同一次攻击扫到。
          const targets = this.weapon.enemyManager.enemies.filter(e => inBiteSector(this.player, e, swing.angle, swing.reach, swing.arc))
          this.weapon.game.mapFeatures?.attackBarricades(this.player.x, this.player.y, swing.reach)
          let landed = false
          let bossHit = false
          for (const e of targets) {
            if (this.player.dead || this.weapon.game.runFinished) break
            const multiplier = swing.heavy ? (e.isBoss ? GLUTTON_BOSS_HEAVY_DAMAGE : GLUTTON_HEAVY_DAMAGE) : GLUTTON_BITE_DAMAGE
            const crit = !swing.heavy && Math.random() < this.weapon.critChance ? this.weapon.critMul : 1
            const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * multiplier * (swing.heavy ? getGluttonHeavyDamageMultiplier(this.player.gluttonHeavyLevel) : 1) * crit * (this.player.isGluttonyLord ? 1.25 : 1)
            const x = e.x, y = e.y
            const hit = this.hit(e, damage, { source, basic: !swing.heavy, execute: swing.heavy && this.player.isGluttonyLord })
            landed ||= hit
            if (hit) this.impact(e, swing, x, y)
            if (hit && e.isBoss && swing.heavy) {
              bossHit = true
              this.grantGuard()
              this.queueAcid(source)
            }
          }
          if (landed && swing.heavy && this.route === 'jaw' && this.player.gluttonAftershockLevel > 0) {
            this.aftershock(swing.angle, this.player.gluttonAftershockLevel, this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier, this.player.gluttonJawUltimate)
          }
          if (landed && swing.heavy && this.player.gluttonShellUltimate) this.grantGuard()
          this.weapon.game.sound.bite(swing.heavy, landed)
          if (landed && swing.heavy) {
            // 首领命中的咬合反馈略强，但保持适度，不打断玩家走位。
            if (bossHit) this.weapon.game.shakeScreen(4, 0.15)
            else this.weapon.game.shakeScreen(3, 0.12)
          }
        }
      }
    }
    if (this.player.dead || this.weapon.game.runFinished) { this.reset(); return }
    if (this.acidPending && this.acidCooldown <= 0) {
      this.acidPending = false
      this.acidCooldown = 0.4
      const radius = 90 + this.player.devourAcidBurst * 10
      const damage = this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul * this.endlessDamageMultiplier * (0.65 + this.player.devourAcidBurst * 0.35)
      for (const e of [...this.weapon.enemyManager.enemies]) {
        if (this.player.dead || this.weapon.game.runFinished) break
        if (!e.active || e.devouring || Math.hypot(e.x - this.player.x, e.y - this.player.y) > radius + e.radius) continue
        e.hit(damage, { devourSource: this.acidSource })
        if (!e.isBoss) e.slow = Math.max(e.slow || 0, 0.7)
        if (!e.active) this.weapon._onKill(e)
      }
      // 不再使用通用扩散圆环；由不规则酸团表达喷溅，伤害范围仍是上面的圆形判定。
      this.spawnAcidBurst(radius)
    }
  }

  render(ctx) {
    if (!this.biteUnlocked || this.player.dead) return
    for (const mire of this.mires) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, mire.life / mire.maxLife) * .45
      ctx.fillStyle = '#b5d66f'
      ctx.beginPath(); ctx.arc(mire.x, mire.y, mire.r, 0, TAU); ctx.fill()
      ctx.globalAlpha = Math.max(0, mire.life / mire.maxLife) * .75
      ctx.strokeStyle = '#dff6a1'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(mire.x, mire.y, mire.r * .82, 0, TAU); ctx.stroke()
      ctx.restore()
    }
    renderBiteMotion(ctx, this.player, this.swing, this.flash)
    renderBiteFeedback(ctx, this)
  }
}
