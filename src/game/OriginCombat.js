import { gainOriginEnergy, ORIGIN_SOURCES } from './PrimalEnergy.js'
import {
  ORIGIN_BASE, ORIGIN_MARKS, ORIGIN_ROUTES, ORIGIN_RULES,
  getOriginGrowth, getOriginShockProfile, originShockDescription,
  hasOriginFragment,
} from './OriginBuild.js'
import { applyElementalMarkProc, fireOriginEchoBolts } from './OriginEchoes.js'

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * 原生黏液的战斗层：唯一主动「黏液震荡」+ 三路线形态 + 五印记附加。
 *
 * 黏液震荡是战术辅助：击退解围、补充充能、催化路线状态。
 * 超载已与震荡解耦——由被动超载控制器（OriginOverload）自动驱动，
 * 这里不再支付能量、不再调用源质技能。
 * 它不读取 primarySpec / secondarySpec，也不写任何职业状态；
 * 路线和印记只改变震荡的表现，不改变主动 id。
 */
export class OriginCombat {
  constructor(weapon) {
    this.weapon = weapon
    this.reset()
  }

  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  get levels() { return this.game?.skillLevels || {} }

  reset() {
    this.fields = []
    this.pendingRings = []
    this.shockPulse = 0
  }

  update(dt) {
    const p = this.player
    if (!p) return
    const g = getOriginGrowth(this.game)

    // 超载窗口
    if (p.overloadState?.active) {
      p.overloadState.timer = Math.max(0, p.overloadState.timer - dt)
      if (p.overloadState.timer <= 0) p.overloadState.active = false
    }

    // 同化层数 / 形变
    if (p.mutationState) {
      p.mutationState.max = g.maxStacks
      if (p.mutationState.timer > 0) {
        p.mutationState.timer = Math.max(0, p.mutationState.timer - dt)
        if (p.mutationState.timer <= 0) {
          p.mutationState.stacks = 0
          p.mutationState.empowered = false
        }
      }
      if (p.mutationState.formTimer > 0) p.mutationState.formTimer = Math.max(0, p.mutationState.formTimer - dt)
      p.originFormDr = p.mutationState.formTimer > 0 ? 0.05 : 0
      const atMaxStacks = this.game?.originRoute === 'assimilation' &&
        p.mutationState.max > 0 && p.mutationState.stacks >= p.mutationState.max
      if (p.mutationState.formTimer > 0 || atMaxStacks) {
        // 局部形态重组 / 满层适应：短时移速 +10%，与流体机动共享同一移速窗口。
        p.originMoveBuff = Math.max(p.originMoveBuff || 0, 0.1)
        p.originMoveBuffTimer = Math.max(p.originMoveBuffTimer || 0, 0.2)
      }
      p.originDr = this.game?.originRoute === 'assimilation'
        ? Math.min(0.2, p.mutationState.stacks * g.stackDrBonus)
        : 0
    } else {
      p.originDr = 0
    }
    p.originAdaptReduction = p.overloadState?.active ? g.adaptReduction : 0

    // 印记 ICD / 泡泡 / 原生护甲
    if (p.markState) {
      if (p.markState.icd > 0) p.markState.icd = Math.max(0, p.markState.icd - dt)
      if (p.markState.bubbleTimer > 0) {
        p.markState.bubbleTimer = Math.max(0, p.markState.bubbleTimer - dt)
        if (p.markState.bubbleTimer <= 0) p.markState.bubble = 0
      }
      for (const key of Object.keys(p.markState.icdByFamily || {})) {
        p.markState.icdByFamily[key] = Math.max(0, p.markState.icdByFamily[key] - dt)
      }
    }
    if (p.originGuardTimer > 0) {
      p.originGuardTimer = Math.max(0, p.originGuardTimer - dt)
      if (p.originGuardTimer <= 0) p.originGuard = 0
    }
    if (p.originMoveBuffTimer > 0) {
      p.originMoveBuffTimer = Math.max(0, p.originMoveBuffTimer - dt)
      if (p.originMoveBuffTimer <= 0) p.originMoveBuff = 0
    }

    // 共振回路窗口：超过持续时间没有新来源就清空。
    const resonance = p.routeState?.resonance
    if (resonance?.circuitTimer > 0) {
      resonance.circuitTimer = Math.max(0, resonance.circuitTimer - dt)
      if (resonance.circuitTimer <= 0) {
        resonance.sources.length = 0
        resonance.circuits = 0
      }
    }

    // 残留液痕
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i]
      field.life -= dt
      field.tick -= dt
      if (field.tick <= 0) {
        field.tick += 0.5
        for (const enemy of this.weapon.enemyManager?.enemies || []) {
          if (!enemy.active || enemy.devouring) continue
          if ((enemy.x - field.x) ** 2 + (enemy.y - field.y) ** 2 > field.r * field.r) continue
          enemy.hit(field.dmg)
          if (enemy.active && !enemy.isBoss) enemy.primeSlow = Math.max(enemy.primeSlow || 0, field.slow)
          if (!enemy.active) {
            enemy._originDerivedKill = true // 路线衍生伤害击杀不返还超载充能
            this.weapon._onKill(enemy)
          }
        }
      }
      if (field.life <= 0) this.fields.splice(i, 1)
    }

    // 扩张副环
    for (let i = this.pendingRings.length - 1; i >= 0; i--) {
      const ring = this.pendingRings[i]
      ring.delay -= dt
      if (ring.delay > 0) continue
      this.weapon._suppressKillCharge = true // 副环是路线衍生伤害，击杀不返还超载充能
      try { this.weapon._explode(ring.x, ring.y, ring.damage, null, ring.radius) }
      finally { this.weapon._suppressKillCharge = false }
      this.weapon._ring?.(ring.x, ring.y, ring.color, ring.radius)
      this.pendingRings.splice(i, 1)
    }
  }

  render(ctx) {
    const t = this.game?.elapsed || 0
    for (const field of this.fields) {
      const k = Math.max(0, field.life / field.maxLife)
      const pulse = 0.86 + 0.14 * Math.sin(t * 4 + field.x * 0.02)
      ctx.save()
      ctx.translate(field.x, field.y)
      ctx.globalAlpha = 0.26 * k
      ctx.fillStyle = field.color
      ctx.beginPath()
      ctx.ellipse(0, 0, field.r * pulse, field.r * 0.62 * pulse, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.42 * k
      ctx.strokeStyle = field.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(0, 0, field.r * 0.7, field.r * 0.44, 0, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    // 碎片/印记的防御型效果必须有画面：1 点护甲和支援泡泡都只存在于状态里，
    // 不画出来玩家就永远不知道它们触发过。
    const p = this.player
    if (p && !p.dead) {
      if (p.originGuard > 0 && p.originGuardTimer > 0) {
        const guardRadius = (p.radius || 14) + 7
        ctx.save()
        ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 8)
        ctx.strokeStyle = ORIGIN_MARKS.glutton.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, guardRadius, 0, TAU)
        ctx.stroke()
        ctx.restore()
      }
      if ((p.markState?.bubble || 0) > 0) {
        const bubbleRadius = (p.radius || 14) + 11
        ctx.save()
        ctx.globalAlpha = 0.24 + 0.06 * Math.sin(t * 3)
        ctx.fillStyle = ORIGIN_MARKS.symbiosis.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, bubbleRadius, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.6
        ctx.strokeStyle = ORIGIN_MARKS.symbiosis.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, bubbleRadius, 0, TAU)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  castShock() {
    const ws = this.weapon
    const p = this.player
    if (!ws || !p) return false
    // 震荡永远是普通形态：超载由被动控制器独立支付与释放。
    const profile = getOriginShockProfile(this.game)
    const growth = profile.growth
    const radius = profile.radius
    const damage = ws.damage * ws.levelMul * profile.damageMul
    const hitCount = this.countEnemies(radius)
    // 「命中残血目标」必须在震荡结算前取样：结算后再看，会漏掉被震荡打死的
    // 残血目标，也会把“被打成残血”的满血目标误算进来。
    const lowHpBefore = this.hasLowHpEnemy(radius, 0.35)

    ws._explode(p.x, p.y, damage, null, radius)
    const kills = Math.max(0, hitCount - this.countEnemies(radius))
    gainOriginEnergy(this.game, ORIGIN_SOURCES.SHOCK)
    if (p.dead || this.game.runFinished) return true

    this.repel(radius, profile.knockback)
    this.game.mapFeatures?.attackBarricades(p.x, p.y, radius)

    const route = this.game.originRoute
    const color = ORIGIN_ROUTES[route]?.color || '#8cffc8'
    ws._ring?.(p.x, p.y, color, radius)
    ws._burstColor?.(p.x, p.y, color, 10, false)

    if (route === 'expansion') this.applyExpansion(profile, damage, hitCount)
    else if (route === 'assimilation') this.applyAssimilation(profile, hitCount)
    else if (route === 'resonance') this.applyResonance(profile)

    this.applyRiders(profile, damage, hitCount, lowHpBefore)

    // 液态回流：震荡击杀回复 1 点生命，独立 ICD。
    if (growth.recoveryLevel > 0 && kills > 0 && this.ready('recovery') && p.hp < p.maxHp) {
      p.heal(1)
      this.setIcd('recovery', growth.recoveryLevel >= 2 ? 10 : 12)
    }

    if (growth.motilityBonus > 0) {
      p.originMoveBuff = Math.max(p.originMoveBuff || 0, growth.motilityBonus)
      p.originMoveBuffTimer = Math.max(p.originMoveBuffTimer || 0, 1.5)
    }
    return true
  }

  countEnemies(radius) {
    const p = this.player
    let count = 0
    for (const e of this.weapon.enemyManager?.enemies || []) {
      if (!e.active || e.devouring) continue
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= radius * radius) count++
    }
    return count
  }

  addStacks(hitCount) {
    const p = this.player
    if (!p?.mutationState) return
    const g = getOriginGrowth(this.game)
    const gain = Math.min(ORIGIN_RULES.mutationMaxGainPerCast, 1 + (hitCount >= 3 ? 1 : 0))
    p.mutationState.stacks = Math.min(g.maxStacks, p.mutationState.stacks + gain)
    p.mutationState.max = g.maxStacks
    p.mutationState.timer = g.stackDuration
    p.mutationState.empowered = p.mutationState.stacks >= g.maxStacks
  }

  applyExpansion(profile, damage, hitCount) {
    const p = this.player
    const g = profile.growth
    const state = p.routeState?.expansion
    if (!state) return
    state.shockCount++
    const rings = state.shockCount % 3 === 0 ? 1 : 0
    for (let i = 0; i < rings; i++) {
      this.pendingRings.push({
        x: p.x, y: p.y,
        delay: 0.12 + i * 0.12,
        damage: damage * g.ringDamage,
        radius: profile.radius * 0.6,
        color: ORIGIN_ROUTES.expansion.color,
      })
    }

    // 边缘伤害：只补一次，避免重复结算主体伤害。
    if (g.edgeDamageBonus > 0) {
      const inner = profile.radius * 0.7
      for (const e of this.weapon.enemyManager?.enemies || []) {
        if (!e.active || e.devouring) continue
        const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
        if (d2 >= inner * inner && d2 <= profile.radius * profile.radius) {
          e.hit(damage * g.edgeDamageBonus)
          if (!e.active) {
            e._originDerivedKill = true
            this.weapon._onKill(e)
          }
        }
      }
    }

    // 场上最多 1 个液痕：新的顶替旧的。
    const residueIndex = this.fields.findIndex(f => f.origin === true)
    if (residueIndex >= 0) this.fields.splice(residueIndex, 1)
    this.fields.push({
      x: p.x, y: p.y, origin: true,
      life: g.residueDuration, maxLife: g.residueDuration,
      r: Math.min(110, profile.radius * 0.5),
      dmg: Math.max(1, Math.round(this.weapon.damage * this.weapon.levelMul * (g.residueDamage || 0.4))),
      tick: 0.5, slow: g.residueSlow, color: ORIGIN_ROUTES.expansion.color,
    })
  }

  /** 同化路线：震荡只负责积累层数；满层兑现只由被动超载触发，震荡不再消耗。 */
  applyAssimilation(profile, hitCount) {
    if (!this.player?.mutationState) return
    this.addStacks(hitCount)
  }

  /** 共振路线：震荡本身计入一次不同来源，让回路有机会达到 3；不再放脉冲、不清空回路。 */
  applyResonance(profile) {
    const resonance = this.player?.routeState?.resonance
    if (!resonance) return
    this.noteRouteSource(resonance, profile.growth)
  }

  noteRouteSource(resonance, growth) {
    const source = ORIGIN_SOURCES.ROUTE
    if (!resonance.sources.includes(source)) {
      resonance.sources.push(source)
      resonance.circuits = Math.min(ORIGIN_RULES.resonanceMaxCircuits, resonance.sources.length)
      resonance.circuitTimer = growth.circuitWindow
    }
  }

  applyRiders(profile, damage, hitCount, lowHpBefore = false) {
    const mark = this.game.originMark
    const p = this.player
    if (!p?.markState) return
    const hasMark = (family) => mark === family
    const fragmentActive = (family) => hasOriginFragment(this.game, family) && mark !== family
    const rank = Math.max(1, p.markState?.rank || 1)

    // 暴食：残血回复/护甲（不吞噬）
    if (hasMark('glutton') || fragmentActive('glutton')) {
      if (this.ready('glutton')) {
        if (lowHpBefore) {
          const amount = hasMark('glutton') && rank >= 2 ? 2 : 1
          if (hasMark('glutton') && p.hp < p.maxHp) p.heal(amount)
          p.originGuard = Math.max(p.originGuard || 0, amount)
          p.originGuardTimer = Math.max(p.originGuardTimer || 0, 2)
          this.weapon._ring?.(p.x, p.y, ORIGIN_MARKS.glutton.color, p.radius + 14)
          this.weapon.enemyManager?.addText?.(p.x, p.y - 30, `🛡 护甲 +${amount}`, null, ORIGIN_MARKS.glutton.color, 13)
          this.game.sound?.originWard?.()
          this.setIcd('glutton', (hasMark('glutton') ? 8 : 6) * (rank >= 2 ? 0.8 : 1))
        }
      }
    }

    // 弹射：副弹
    if (hasMark('gatling') || fragmentActive('gatling')) {
      if (this.ready('gatling')) {
        if (hasMark('gatling')) {
          const count = Math.min(3, 1 + (hitCount >= 3 ? 1 : 0) + (rank >= 2 ? 1 : 0))
          fireOriginEchoBolts(this.game, count, 0.5 * (rank >= 2 ? 1.5 : 1))
          this.setIcd('gatling', 4)
        } else if (Math.random() < 0.5) {
          fireOriginEchoBolts(this.game, 1, 0.35)
          this.setIcd('gatling', 3)
        }
      }
    }

    // 元素：轻量附着
    if (hasMark('elemental') || fragmentActive('elemental')) {
      if (this.ready('elemental')) {
        const chance = hasMark('elemental') ? 0.25 + (rank >= 2 ? 0.15 : 0) : 0.35
        const bonus = hasMark('elemental') && rank >= 2 ? 0.75 : 0
        applyElementalMarkProc(this.game, chance, bonus)
        this.setIcd('elemental', 2)
      }
    }

    // 暗影：短隐匿 + 强化下一击
    if (hasMark('assassin') || fragmentActive('assassin')) {
      if (this.ready('assassin')) {
        const strong = hasMark('assassin')
        const duration = (strong ? 0.6 : 0.5) + (strong && rank >= 2 ? 0.4 : 0)
        const mul = (strong ? 0.2 : 0.12) + (strong && rank >= 2 ? 0.15 : 0)
        p.stealthTimer = Math.max(p.stealthTimer || 0, duration)
        p.originNextHitMul = Math.max(p.originNextHitMul || 1, 1 + mul)
        this.weapon.enemyManager?.addText?.(p.x, p.y - 30, '🗡 隐匿', null, ORIGIN_MARKS.assassin.color, 13)
        this.game.sound?.shadowBlade?.(false, false)
        this.setIcd('assassin', 6)
      }
    }

    // 共生：支援泡泡
    if (hasMark('symbiosis') || fragmentActive('symbiosis')) {
      if (this.ready('symbiosis') && (p.markState?.bubble || 0) <= 0) {
        p.markState.bubble = hasMark('symbiosis') && rank >= 2 ? 2 : 1
        p.markState.bubbleTimer = 12
        this.weapon._ring?.(p.x, p.y, ORIGIN_MARKS.symbiosis.color, p.radius + 16)
        this.weapon.enemyManager?.addText?.(p.x, p.y - 30, '🫧 支援泡泡', null, ORIGIN_MARKS.symbiosis.color, 13)
        this.game.sound?.originWard?.()
        this.setIcd('symbiosis', hasMark('symbiosis') ? 12 : 10)
      }
    }
  }

  ready(family) {
    return (this.player?.markState?.icdByFamily?.[family] || 0) <= 0
  }

  setIcd(family, seconds) {
    if (!this.player?.markState) return
    this.player.markState.icdByFamily ||= {}
    this.player.markState.icdByFamily[family] = seconds
  }

  hasLowHpEnemy(radius, ratio) {
    const p = this.player
    for (const e of this.weapon.enemyManager?.enemies || []) {
      if (!e.active || e.devouring) continue
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > radius * radius) continue
      if (e.maxHp > 0 && e.hp / e.maxHp <= ratio) return true
    }
    return false
  }

  repel(radius, distance) {
    const p = this.player
    for (const e of this.weapon.enemyManager?.enemies || []) {
      if (!e.active || e.devouring || e.isBoss) continue
      if (Math.hypot(e.x - p.x, e.y - p.y) > radius) continue
      const angle = Math.atan2(e.y - p.y, e.x - p.x)
      e.x = clamp(e.x + Math.cos(angle) * distance, e.radius, this.game.worldWidth - e.radius)
      e.y = clamp(e.y + Math.sin(angle) * distance, e.radius, this.game.worldHeight - e.radius)
    }
  }
}

export const ORIGIN_SKILL = {
  id: 'slime_shock',
  name: '黏液震荡',
  icon: '🫧',
  cooldown: ORIGIN_BASE.shockCooldown,
  desc: '原生黏液唯一的主动技：以自身为中心释放黏液冲击，击退解围并补充异源充能；超载由异源能量自动驱动。',
  getDesc(engine) { return originShockDescription(engine) },
  use(engine) { return engine.weaponSystem?.originCombat?.castShock() || false },
}
