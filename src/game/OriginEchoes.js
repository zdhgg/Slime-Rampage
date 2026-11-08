import { Projectile } from './entities/Projectile.js'
import { getElement } from './ElementSystem.js'
import { ORIGIN_MARKS, ORIGIN_RULES } from './OriginBuild.js'
import { applyOriginCoreResonance } from './OriginCoreResonance.js'

/**
 * 异源印记的轻量战斗执行器。
 *
 * 这里只做“附加特征”：副弹、护甲/回复、元素附着、隐匿、支援泡泡。
 * 不写任何职业状态（猎食点、伙伴名册、分身、法术路线），也不额外充能。
 */

export function fireOriginEchoBolts(engine, count = 1, damageMul = 0.5) {
  const ws = engine?.weaponSystem
  const p = engine?.player
  if (!ws || !p || p.dead || engine.runFinished) return 0
  const target = ws._findNearest?.()
  if (!target) return 0
  const damage = ws.damage * ws.levelMul * damageMul
  for (let i = 0; i < count; i++) {
    const bolt = new Projectile({
      x: p.x, y: p.y, target, speed: 520, damage, life: 1.2,
      homing: 1, glow: ORIGIN_MARKS[engine.originMark]?.color || '#8cffc8',
      radius: 5,
    })
    // 副弹只结算伤害：不充能、不分裂、不触发印记，避免递归。
    bolt.isOriginEcho = true
    ws._projectiles.push(bolt)
  }
  return count
}

/** 元素印记/碎片：把已吸收元素里等级最高的一种轻量附到最近的敌人身上。 */
export function applyElementalMarkProc(engine, chance = 0.25, durationBonus = 0) {
  const p = engine?.player
  const ws = engine?.weaponSystem
  if (!p || !ws || !p.elements?.size) return false
  if (Math.random() >= chance) return false
  let best = null
  for (const [id, level] of p.elements) {
    if (!best || level > best.level) best = { id, level }
  }
  if (!best) return false
  const proc = getElement(best.id)?.proc
  if (!proc) return false
  const enemies = [...(ws.enemyManager?.enemies || [])]
    .filter(e => e.active && !e.devouring)
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2))
  const target = enemies[0]
  if (!target) return false
  const duration = Math.min(3, (proc.duration || 1.5) + durationBonus)
  const effects = {}
  if (proc.status === 'burn') {
    effects.burn = duration
    effects.burnDmg = Math.max(1, Math.round(ws.damage * ws.levelMul * 0.35))
  } else if (proc.status === 'freeze') {
    effects.freeze = Math.min(2, duration)
  } else if (proc.status === 'poison') {
    effects.poison = duration
    effects.poisonDmg = Math.max(1, Math.round(ws.damage * ws.levelMul * 0.35))
  }
  if (!Object.keys(effects).length) return false
  target.hit(0, effects)
  const color = ORIGIN_MARKS[engine.originMark]?.color || '#a29bfe'
  ws._ring?.(target.x, target.y, color, 18)
  ws._burstColor?.(target.x, target.y, color, 4, false)
  engine.sound?.spellCast?.(best.id)
  return true
}

/** 超载时触发一次异源印记回响；本次超载只兑现一次。 */
export function triggerOriginMarkEcho(engine, { overloaded = false, center = engine?.player, profile = null } = {}) {
  const p = engine?.player
  const ws = engine?.weaponSystem
  const mark = engine?.originMark
  if (!overloaded || !p || !ws || !mark || !ORIGIN_MARKS[mark] || !center) return false
  const state = p.markState
  if (!state || state.echoUsed) return false
  state.echoUsed = true
  const rank = Math.max(1, state.rank || 1)
  const radius = Math.max(70, profile?.radius || 120)
  // 统一回响预算：一次超载的印记伤害总量不超过本次震荡伤害的 35%。
  const damage = (ws.damage * ws.levelMul) * (profile?.damageMul || 1) * ORIGIN_RULES.echoShareCap

  if (mark === 'glutton') {
    // 回复/护甲，不吞噬、不产生猎食点；深化后提升至 2 点，仍受 ICD 限制。
    const amount = rank >= 2 ? 2 : 1
    if (p.hp < p.maxHp) p.heal(amount)
    p.originGuard = Math.max(p.originGuard || 0, amount)
    p.originGuardTimer = Math.max(p.originGuardTimer || 0, 2)
    ws._ring?.(p.x, p.y, '#ff9f43', p.radius + 18)
    engine.enemyManager?.addText?.(p.x, p.y - 44, `🛡 回响护甲 +${amount}`, null, '#ff9f43', 14)
    engine.sound?.originWard?.()
    return true
  }

  if (mark === 'gatling') {
    const bolts = rank >= 2 ? 3 : 2
    const perBolt = damage / Math.max(0.0001, ws.damage * ws.levelMul) / bolts
    const fired = fireOriginEchoBolts(engine, bolts, perBolt)
    if (fired) ws._ring?.(p.x, p.y, '#00d2d3', p.radius + 14)
    return fired > 0
  }

  if (mark === 'elemental') {
    const resonance = applyOriginCoreResonance(engine, radius, damage)
    if (resonance) {
      engine.enemyManager?.addText?.(
        p.x, p.y - 48,
        `晶核回响：${resonance.icons.join('＋')} ${resonance.effect}`,
        null, resonance.color, 14
      )
    }
    return !!resonance
  }

  if (mark === 'assassin') {
    p.stealthTimer = Math.max(p.stealthTimer || 0, rank >= 2 ? 1.6 : 1.2)
    p.guaranteedCrit = true
    p.originNextHitMul = Math.max(p.originNextHitMul || 1, 1 + 0.15 * rank)
    ws._ring?.(p.x, p.y, '#ff6b6b', p.radius + 20)
    return true
  }

  if (mark === 'symbiosis') {
    // 旧泡泡先爆裂，再给一层新的支援泡泡；深化只扩大范围，不突破伤害预算。
    if ((state.bubble || 0) > 0) {
      const burstRadius = rank >= 2 ? 100 : 80
      ws._explode?.(p.x, p.y, damage, null, burstRadius)
      ws._ring?.(p.x, p.y, '#edc479', burstRadius)
    }
    state.bubble = rank >= 2 ? 2 : 1
    state.bubbleTimer = 3
    return true
  }

  return false
}
