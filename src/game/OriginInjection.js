import { getElement, getReaction } from './ElementSystem.js'

/**
 * 原生黏液的元素注入（超载 × 元素构筑联动）。
 *
 * 注入元素由元素等级排名自动决定，不再手动配置：
 *  - 主技能注入第 1 名元素，协同注入第 2 名，第三技能（多重超载）注入第 3 名；
 *  - 同一目标集齐主反应组合（第 1＋2 名）时触发一次主反应连招；
 *  - 同一目标集齐某个副反应组合（第 3 名分别与第 1/2 名）时触发一次副反应连招，
 *    强度为主连招的 60%——三重超载兑现「主反应 + 副反应」的完整构筑；
 *  - 每次超载两类连招各最多一次；元素等级 1~4 提高注入效果。
 */
export function originInjectionPlan(game) {
  const p = game?.player
  const ranked = p?._elementRanks || []
  const primary = ranked[0] || null
  const secondary = ranked[1] || primary
  const third = ranked[2] || null
  const reaction = p?._primaryReaction || null
  const secondaries = [...(p?._secondaryIds || [])]
    .map((id) => getReaction(id))
    .filter(Boolean)
  return {
    primary,
    secondary,
    third,
    reaction,
    secondaries,
    levels: Object.fromEntries(p?.elements || []),
  }
}

export function createOriginInjectionToken(game) {
  return { echoUsed: false, plan: originInjectionPlan(game), injected: new Map(),
    marks: new Map(), reactionUsed: false, secondaryUsed: false }
}

export function skillInjectionToken(shared, secondary = false, category = 'main') {
  const plan = shared?.plan
  const element = category === 'third'
    ? (plan?.third || plan?.secondary)
    : secondary ? plan?.secondary : plan?.primary
  return { shared, element, category }
}

/** At most five targets per injected element; one reaction of each tier for the whole combo. */
export function applyOriginInjection(combat, enemy, damage, token) {
  const shared = token?.shared
  const element = token?.element
  if (!shared || !element || !enemy.active) return
  const targets = shared.injected.get(element) || new Set()
  shared.injected.set(element, targets)
  if (targets.has(enemy) || targets.size >= 5) return
  targets.add(enemy)
  const lv = Math.max(1, Math.min(4, shared.plan.levels[element] || 1))
  const power = gamePower(combat.game)
  if (element === 'fire' || element === 'poison') {
    const ticks = element === 'fire' ? 2 : 3
    for (let i = 1; i <= ticks; i++) combat.jobs.push({ kind: 'element_tick', target: enemy,
      due: combat.time + i * (element === 'fire' ? 0.5 : 1), damage: damage * (0.07 + lv * 0.01) * power })
  } else if (element === 'water' && !enemy.isBoss) {
    enemy.primeSlow = Math.max(enemy.primeSlow || 0, 0.8 + lv * 0.1)
  } else if (element === 'lightning') {
    const nearby = combat._targets().filter(other => other !== enemy && distance2(other, enemy) <= 90 ** 2)
      .sort((a, b) => distance2(a, enemy) - distance2(b, enemy)).slice(0, lv >= 3 ? 2 : 1)
    for (const other of nearby) combat._hit(other, damage * (0.12 + lv * 0.02) * power, null, 'element')
  }
  combat.weapon._burstColor?.(enemy.x, enemy.y, COLORS[element], 4, false)
  const seen = shared.marks.get(enemy) || new Set()
  seen.add(element)
  shared.marks.set(enemy, seen)
  const plan = shared.plan
  if (!shared.reactionUsed && plan.reaction && plan.primary !== plan.secondary &&
      seen.has(plan.primary) && seen.has(plan.secondary)) {
    shared.reactionUsed = true
    fireReactionCombo(combat, enemy, plan.reaction, damage, `元素连招：${getElement(plan.primary)?.name}＋${getElement(plan.secondary)?.name}`)
  }
  if (!shared.secondaryUsed) {
    const secondary = plan.secondaries.find((r) => r.combo.every((id) => seen.has(id)))
    if (secondary) {
      shared.secondaryUsed = true
      fireReactionCombo(combat, enemy, secondary.id, damage * 0.6, `副反应连招：${secondary.name}`)
    }
  }
}

/** 连招兑现：以连招目标为心的小范围效果，六种反应共用同一预算口径。 */
function fireReactionCombo(combat, enemy, reactionId, damage, label) {
  const power = gamePower(combat.game)
  const routeMul = combat.game.originRoute === 'resonance' ? 1.15 : 1
  const geneMul = (combat.weapon.geneReactionDmgMul || 1) * (combat.weapon.reactionDmgMul || 1)
  const amount = damage * 0.3 * power * routeMul * geneMul
  const tick = Math.max(1, Math.round(amount * 0.35))
  const radius = reactionId === 'steam' ? 105 : 85
  const victims = combat._targets().filter(other => distance2(other, enemy) <= radius ** 2).slice(0, 5)
  if (reactionId === 'acid' || reactionId === 'burst') {
    // 酸液范围爆裂；爆裂反应同样以溅射兑现，伤害略高并打雷火光色
    const hit = reactionId === 'burst' ? amount * 1.15 : amount
    for (const other of victims) combat._hit(other, hit, null, 'reaction')
  } else if (reactionId === 'gel') {
    for (const other of victims.slice(0, 3)) combat._hit(other, amount * 0.6, null, 'reaction')
    for (const other of victims) if (other.active && !other.isBoss && !other.isEnraged) other.primeSlow = Math.max(other.primeSlow || 0, 1.5)
  } else if (reactionId === 'corrode') {
    for (const other of victims.slice(0, 5)) other.hit(0, { burn: 2.5, burnDmg: tick, poison: 2.5, poisonDmg: tick })
  } else if (reactionId === 'venom') {
    for (const other of victims.slice(0, 5)) other.hit(0, {
      poison: 2.5, poisonDmg: tick, freeze: Math.random() < 0.2 ? 0.5 : 0 })
  } else {
    // steam：纯控制云雾，不追加伤害
    for (const other of victims) if (other.active && !other.isBoss && !other.isEnraged) other.primeSlow = Math.max(other.primeSlow || 0, 1.5)
  }
  combat.weapon._ring?.(enemy.x, enemy.y, '#d4edaa', radius)
  combat.game.enemyManager?.addText?.(enemy.x, enemy.y - 30, label, null, '#d4edaa', 13)
}

const COLORS = { fire: '#ff9d4a', water: '#8ae8f7', poison: '#7ce86a', lightning: '#ffd166' }
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
const gamePower = game => game.originMark === 'elemental' ? (game.player?.markState?.rank >= 2 ? 1.3 : 1.2)
  : game.skillLevels?.ori_frag_elemental ? 1.1 : 1
