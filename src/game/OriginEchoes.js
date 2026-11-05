import { gainOriginSecondary, onPrimalKill } from './PrimalEnergy.js'

/**
 * 原生副专精超载回响。一次支付只兑现一个副树小效果，不触发技能等级、
 * 伙伴攻击链或递归充能；每项回响都带目标数、倍率或时长上限。
 */
export function triggerOriginSecondaryEcho(engine, { center = engine?.player, overloaded = false } = {}) {
  if (!overloaded || engine?.startingStrain !== 'origin' || !engine.secondarySpec || !center) return false
  const ws = engine.weaponSystem, p = engine.player
  const spec = engine.secondarySpec
  const rankBySpec = {
    gluttony: 'glut_sub_armor', gatling: 'gat_sub_mag', elemental: 'ele_sub_aura',
    assassin: 'ass_sub_insight', symbiosis: 'sym_sub_echo',
  }
  const rank = Math.max(0, engine.skillLevels?.[rankBySpec[spec]] || 0)
  if (!rank) return false
  const enemies = ws?.enemyManager?.enemies || []
  const hit = (enemy, damage, effects) => {
    const before = enemy.hp
    enemy.hit(damage, effects)
    if (enemy.hp < before && !enemy.active) { ws._onKill(enemy); onPrimalKill(engine, enemy) }
  }
  const finish = applied => {
    if (applied) gainOriginSecondary(engine, spec)
    return !!applied
  }

  if (spec === 'gluttony') {
    const targets = enemies.filter(e => e.active && !e.devouring && Math.hypot(e.x - center.x, e.y - center.y) <= 105)
      .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y)).slice(0, 3)
    const damage = ws.damage * ws.levelMul * Math.min(0.65, 0.45 + rank * 0.04)
    for (const enemy of targets) hit(enemy, damage)
    if (targets.length) ws._ring?.(center.x, center.y, '#ff9f43', 105)
    return finish(targets.length > 0)
  }
  if (spec === 'gatling') {
    const target = ws?._findNearest?.()
    if (!target) return false
    ws.fire(target)
    ws.rapidVolley = { remaining: Math.min(3, 1 + Math.floor(rank / 2)), timer: 0.12 }
    return finish(true)
  }
  if (spec === 'elemental') {
    const procs = p?._procs
    if (!procs) return false
    let applied = 0
    const radius = Math.min(210, 150 + rank * 10)
    const bonus = Math.min(0.2, 0.05 + rank * 0.04)
    for (const enemy of enemies) {
      if (!enemy.active || enemy.devouring || Math.hypot(enemy.x - center.x, enemy.y - center.y) > radius) continue
      const effects = {}
      if (procs.burn?.chance && Math.random() < Math.min(1, procs.burn.chance + bonus)) { effects.burn = Math.min(3, procs.burn.duration); effects.burnDmg = Math.max(1, Math.round(ws.damage * ws.levelMul * 0.4)) }
      if (procs.freeze?.chance && Math.random() < Math.min(1, procs.freeze.chance + bonus)) effects.freeze = Math.min(1.5, procs.freeze.duration)
      if (procs.poison?.chance && Math.random() < Math.min(1, procs.poison.chance + bonus)) { effects.poison = Math.min(3, procs.poison.duration); effects.poisonDmg = Math.max(1, Math.round(ws.damage * ws.levelMul * 0.4)) }
      if (Object.keys(effects).length) { hit(enemy, 0, effects); applied++ }
    }
    return finish(applied > 0)
  }
  if (spec === 'assassin') {
    p.stealthTimer = Math.max(p.stealthTimer || 0, Math.min(1.2, 0.55 + rank * 0.12))
    p.guaranteedCrit = true
    return finish(true)
  }
  if (spec === 'symbiosis') return finish(!!ws?.petCombat?.primalEchoBurst?.())
  return false
}
