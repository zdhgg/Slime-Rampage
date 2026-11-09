import { getElement } from './ElementSystem.js'

/**
 * 原生元素印记的晶核回响：只服务 origin 的「元素印记」。
 *
 * 元素等级继续由 Player.elements 统一维护；这里仅从已经激活的主/副反应
 * 中选择一对等级最高的元素，并把它翻译成一次有限的超载附加效果。
 * 回响不改变主反应、不授予未激活反应，也不再次产生异源能量。
 */

const ELEMENT_ORDER = ['fire', 'water', 'poison', 'lightning']
const REACTION_ORDER = ['acid', 'gel', 'burst', 'corrode', 'steam', 'venom']
const REACTION_COLORS = {
  acid: '#c8e84a',
  gel: '#8ae8f7',
  burst: '#ffc166',
  corrode: '#a8f06a',
  steam: '#dff4fb',
  venom: '#c9a6f0',
}
const EFFECT_LABELS = {
  acid: '酸液余波',
  gel: '连锁电弧',
  burst: '爆裂脉冲',
  corrode: '腐蚀附着',
  steam: '蒸汽迷雾',
  venom: '毒雷麻痹',
}
const MAX_TARGETS = 5
const MAX_CHAIN_HOPS = 3

const reactionOrder = (id) => {
  const index = REACTION_ORDER.indexOf(id)
  return index < 0 ? REACTION_ORDER.length : index
}

const elementOrder = (id) => {
  const index = ELEMENT_ORDER.indexOf(id)
  return index < 0 ? ELEMENT_ORDER.length : index
}

/** 返回 origin 元素印记当前应显示的晶核回响；无可用反应时返回 null。 */
export function getOriginCoreResonance(engine) {
  if (engine?.startingStrain !== 'origin' || engine?.originMark !== 'elemental') return null
  const player = engine.player
  const elements = player?.elements
  const reactions = player?._reactions
  if (!elements?.size || !Array.isArray(reactions) || reactions.length === 0) return null

  const candidates = reactions
    .filter((reaction) => Array.isArray(reaction?.combo) && reaction.combo.length === 2)
    .map((reaction) => {
      const [a, b] = reaction.combo
      const aLevel = elements.get(a) || 0
      const bLevel = elements.get(b) || 0
      return {
        reaction,
        combo: [a, b],
        levels: [aLevel, bLevel],
        strength: Math.min(aLevel, bLevel),
        total: aLevel + bLevel,
        primary: reaction.id === player._primaryReaction,
      }
    })
    .filter((candidate) => candidate.strength > 0)

  if (candidates.length === 0) return null
  candidates.sort((a, b) =>
    b.strength - a.strength ||
    Number(b.primary) - Number(a.primary) ||
    b.total - a.total ||
    reactionOrder(a.reaction.id) - reactionOrder(b.reaction.id) ||
    elementOrder(a.combo[0]) - elementOrder(b.combo[0])
  )

  const selected = candidates[0]
  const icons = selected.combo.map((id) => getElement(id)?.icon || '?')
  return {
    id: selected.reaction.id,
    name: selected.reaction.name,
    desc: selected.reaction.desc,
    combo: selected.combo,
    icons,
    levels: selected.levels,
    strength: Math.min(4, selected.strength),
    color: REACTION_COLORS[selected.reaction.id] || '#8cffc8',
    effect: EFFECT_LABELS[selected.reaction.id] || '元素余波',
    primary: selected.primary,
  }
}

function inRadius(enemy, x, y, radius) {
  if (!enemy?.active || enemy.devouring) return false
  return (enemy.x - x) ** 2 + (enemy.y - y) ** 2 < radius * radius
}

function nearbyTargets(engine, radius) {
  const p = engine.player
  return (engine.enemyManager?.enemies || [])
    .filter((enemy) => inRadius(enemy, p.x, p.y, radius))
    .sort((a, b) => {
      const ad = (a.x - p.x) ** 2 + (a.y - p.y) ** 2
      const bd = (b.x - p.x) ** 2 + (b.y - p.y) ** 2
      return ad - bd
    })
}

function applyStatusTargets(engine, targets, effects, color) {
  const ws = engine.weaponSystem
  for (const enemy of targets.slice(0, MAX_TARGETS)) {
    enemy.hit(0, effects)
    ws._burstColor?.(enemy.x, enemy.y, color, 3)
  }
}

function chainLightning(engine, origin, damage, strength) {
  const ws = engine.weaponSystem
  const enemies = engine.enemyManager?.enemies || []
  const visited = new Set([origin])
  let current = origin
  let hops = 0
  const paralyzeChance = Math.min(0.35, 0.12 + strength * 0.05)
  while (hops < MAX_CHAIN_HOPS) {
    let next = null
    let bestD2 = 90 * 90
    for (const enemy of enemies) {
      if (!inRadius(enemy, current.x, current.y, 90) || visited.has(enemy)) continue
      const d2 = (enemy.x - current.x) ** 2 + (enemy.y - current.y) ** 2
      if (d2 < bestD2) {
        bestD2 = d2
        next = enemy
      }
    }
    if (!next) break
    visited.add(next)
    const hopDamage = Math.max(1, Math.round(damage * 0.3))
    next.hit(hopDamage, Math.random() < paralyzeChance ? { freeze: 0.6 } : null)
    ws._burst?.(next.x, next.y, 'lightning', 4, true)
    if (!next.active) { next._originDerivedKill = true; ws._onKill?.(next) }
    current = next
    hops++
  }
  if (hops > 0) ws.stats.maxChain = Math.max(ws.stats.maxChain, hops)
  return hops
}

/**
 * 触发一次晶核共鸣。返回 HUD/飘字所需摘要；没有共鸣时返回 null。
 * baseDamage 是本次黏液震荡的实际伤害，附加效果始终有独立上限。
 */
export function applyOriginCoreResonance(engine, radius, baseDamage) {
  const resonance = getOriginCoreResonance(engine)
  if (!resonance || !engine?.weaponSystem || !engine?.player) return null

  const ws = engine.weaponSystem
  const p = engine.player
  const strength = resonance.strength
  const effectRadius = Math.min(84, Math.max(54, radius * 0.42))
  const targets = nearbyTargets(engine, effectRadius)
  let effect = resonance.effect

  if (resonance.id === 'acid') {
    ws._dropPool?.(p.x, p.y)
    const pool = ws._pools?.[ws._pools.length - 1]
    if (pool) {
      pool.life = Math.min(pool.life, 1.8)
      pool.r = Math.min(pool.r, 70 + strength * 3)
      pool.dmg = Math.min(pool.dmg, 2)
      pool.originDerived = true // 晶核回响产生的酸液池：击杀不返还超载充能
    }
  } else if (resonance.id === 'gel') {
    const origin = targets[0]
    if (origin) chainLightning(engine, origin, baseDamage, strength)
  } else if (resonance.id === 'burst') {
    const damage = Math.max(1, Math.round(baseDamage * Math.min(0.28, 0.16 + strength * 0.03)))
    for (const enemy of targets.slice(0, 3)) {
      enemy.hit(damage)
      ws._burstColor?.(enemy.x, enemy.y, REACTION_COLORS.burst, 5, true)
      if (!enemy.active) { enemy._originDerivedKill = true; ws._onKill?.(enemy) }
    }
  } else if (resonance.id === 'corrode') {
    const duration = Math.min(3, 1.2 + strength * 0.3)
    const tickDamage = Math.max(1, Math.round(baseDamage * 0.12))
    applyStatusTargets(engine, targets, {
      burn: duration,
      burnDmg: tickDamage,
      poison: duration,
      poisonDmg: tickDamage,
    }, REACTION_COLORS.corrode)
  } else if (resonance.id === 'steam') {
    ws._dropCloud?.(p.x, p.y)
    const cloud = ws._clouds?.[ws._clouds.length - 1]
    if (cloud) {
      cloud.life = Math.min(cloud.life, 1.5)
      cloud.r = Math.min(cloud.r, 68 + strength * 3)
      cloud.slowDur = Math.min(cloud.slowDur, 1.5)
    }
  } else if (resonance.id === 'venom') {
    const poison = Math.min(3, 1.2 + strength * 0.25)
    const tickDamage = Math.max(1, Math.round(baseDamage * 0.1))
    applyStatusTargets(engine, targets, {
      poison,
      poisonDmg: tickDamage,
      freeze: 0.35,
    }, REACTION_COLORS.venom)
  }

  ws._ring?.(p.x, p.y, resonance.color, effectRadius)
  ws._burstColor?.(p.x, p.y, resonance.color, 7, false)
  return { ...resonance, effect, effectRadius }
}

