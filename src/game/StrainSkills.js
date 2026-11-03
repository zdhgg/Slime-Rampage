import { GLUTTON_CHARGE_MAX, gluttonSkillHud } from './GluttonResource.js'
import { GLUTTON_HEAVY_DAMAGE, GLUTTON_BOSS_HEAVY_DAMAGE } from './GluttonCombat.js'
import { PET_RALLY_BASE, getPetRally } from './PetSkills.js'
import { gainPrimalEnergy, trySpendPrimalOverload, getOriginActiveGrowth, hasPrimalEnergy, primalOverloadDescription, PRIMAL_OVERLOAD_COST, PRIMAL_SOURCES } from './PrimalEnergy.js'

const VOLLEY_SHOTS = 4

/** 重咬在命中时按正常伤害路径结算；开局可用，猎食点来自吞噬/近战命中首领。 */
export const GLUTTON_SKILL = {
  id: 'devour_pulse',
  name: '暴食重咬',
  icon: '🦷',
  cooldown: 0,
  chargeMax: GLUTTON_CHARGE_MAX,
  desc: `消耗 1 猎食点，对前方近处敌人造成 ${GLUTTON_HEAVY_DAMAGE} 倍攻击伤害（首领 ${GLUTTON_BOSS_HEAVY_DAMAGE} 倍），将可吞噬的残血或被咬杀目标直接吞噬；吞噬或重咬命中首领获得短时护甲。重咬不返还猎食点`,
  getDesc(engine) {
    if (!hasPrimalEnergy(engine?.player)) return this.desc
    const growth = getOriginActiveGrowth(engine)
    return `${this.desc}；震荡扩能继承：重咬伤害 +${Math.round((growth.damageMul - 1) * 100)}%、范围 +${growth.rangeBonus}px；拟态能量 ≥${PRIMAL_OVERLOAD_COST} 时超载：${primalOverloadDescription(engine)}`
  },
  getHud: gluttonSkillHud,
  use(engine) {
    return engine.weaponSystem?.gluttonCombat?.heavyBite() || false
  },
}

/**
 * 弹射 · 疾射：四轮齐射以 0.12 秒间隔发射；没有目标时不消耗冷却。
 * 复用 WeaponSystem.fire，因此弹数/分裂/附魔/视觉全部自动继承。
 */
export const RICOCHET_SKILL = {
  id: 'rapid_volley',
  name: '疾射',
  icon: '🔫',
  cooldown: 8,
  desc: `连续追加 ${VOLLEY_SHOTS} 轮齐射，释放后移速 +20% 持续 1 秒`,
  use(engine) {
    const ws = engine.weaponSystem
    if (!ws || !ws._findNearest()) return false
    ws.fire(ws._findNearest())
    ws.rapidVolley = { remaining: VOLLEY_SHOTS - 1, timer: 0.12 }
    engine.player.volleyMoveTimer = 1
    ws._ring?.(engine.player.x, engine.player.y, '#8ae8f7', 70)
    return true
  },
}

/**
 * 元素 · 原质释放：随攻击成长的近身冲击，普通敌人额外击退与减速。
 */
export const ELEMENTAL_SKILL = {
  id: 'prime_burst',
  name: '原质释放',
  icon: '🔮',
  cooldown: 10,
  desc: '150px 元素冲击，击退普通敌人并减速 30%，持续 1.5 秒',
  use(engine) {
    const ws = engine.weaponSystem
    if (!ws) return false
    if (ws.spellCombat?.enabled) return ws.spellCombat.useActive()
    const player = engine.player
    const power = 2.4
    ws._explode(
      player.x,
      player.y,
      Math.round(ws.damage * ws.levelMul * power),
      null,
      150
    )
    if (player.dead || engine.runFinished) return true
    repel(engine, 150, 22, 1.5)
    engine.mapFeatures?.attackBarricades(player.x, player.y, 150)
    ws._ring?.(player.x, player.y, '#a29bfe', 150)
    ws._burstColor?.(player.x, player.y, '#a29bfe', 18, true)
    engine.shakeScreen?.(4, 0.22)
  },
}

/**
 * 暗影 · 影袭：定向穿行、沿途刺击，首个目标必暴；空路径也可用于脱离。
 */
export const SHADOW_SKILL = {
  id: 'shadow_strike',
  name: '影袭',
  icon: '🗡️',
  cooldown: 5,
  desc: '沿移动方向穿行，首个目标 1.6 倍攻击且必暴，其余沿途目标 0.8 倍。已有分身优先分头突袭后排射手，遇首领集中夹击，造成分身普攻的 2 倍伤害。暴击可生成新分身；本体击杀返还一次 0.5 秒影袭冷却',
  use(engine) {
    return engine.weaponSystem?.shadowCombat?.useAssault() || false
  },
}

/** 解围控制不移动首领；独立计时，避免覆盖更强的蒸汽减速。 */
function repel(engine, radius, distance, slow = 0) {
  const p = engine.player
  for (const e of engine.enemyManager.enemies) {
    if (!e.active || e.devouring || e.isBoss || Math.hypot(e.x - p.x, e.y - p.y) > radius) continue
    const angle = Math.atan2(e.y - p.y, e.x - p.x)
    e.x = Math.max(e.radius, Math.min(engine.worldWidth - e.radius, e.x + Math.cos(angle) * distance))
    e.y = Math.max(e.radius, Math.min(engine.worldHeight - e.radius, e.y + Math.sin(angle) * distance))
    e.primeSlow = Math.max(e.primeSlow || 0, slow)
  }
}

/**
 * 元素分化：震荡把已吸收元素的附魔按概率滚到被波及的敌人身上。
 * 与飞弹命中同口径（chance 独立判定、duration 用吸收等级累积值、DOT 按震荡伤害换算）。
 * 未吸收任何元素时自然为空操作（纯击退）。
 */
function spreadShockProcs(engine, radius) {
  const p = engine.player
  const procs = p._procs
  if (!procs) return
  const ws = engine.weaponSystem
  const rMul = (ws.reactionDmgMul || 1) * (ws.geneReactionDmgMul || 1)
  const tickDmg = Math.max(1, Math.round(ws.damage * ws.levelMul * 0.4 * rMul))
  for (const e of engine.enemyManager.enemies) {
    if (!e.active || e.devouring || Math.hypot(e.x - p.x, e.y - p.y) > radius) continue
    const fx = {}
    if (procs.burn?.chance && Math.random() < procs.burn.chance) { fx.burn = procs.burn.duration; fx.burnDmg = tickDmg }
    if (procs.freeze?.chance && Math.random() < procs.freeze.chance) fx.freeze = procs.freeze.duration
    if (procs.poison?.chance && Math.random() < procs.poison.chance) { fx.poison = procs.poison.duration; fx.poisonDmg = tickDmg }
    if (Object.keys(fx).length) e.hit(0, fx)
  }
}

/**
 * 黏液震荡随主专精的派生描述（HUD getDesc 通道）：
 * 觉醒不是只改技能池，空格技本身也在进化——文案如实反映当前形态。
 * 震荡扩能（com_shock）的等级同样进文案：伤害倍率与半径与 use() 同口径。
 */
function originShockDesc(engine) {
  const spec = engine?.primarySpec
  const growth = getOriginActiveGrowth(engine)
  const power = Math.round(1.9 * growth.damageMul * 100) / 100
  const base = `周围 ${120 + growth.rangeBonus}px 造成 ${power} 倍攻击伤害并击退普通敌人`
  if (spec === 'gatling') return `${base}，并追加 2 轮齐射（机枪形态）`
  if (spec === 'elemental') return `${base}，并把已吸收元素的附魔扩散给被击退者（元素形态）`
  if (spec === 'assassin') return `${base}；替身/隐匿联动已生效（暗影形态）`
  return `${base}；觉醒后保留`
}

/** 超载版震荡的 HUD 附注（拟态能量 ≥40 时下次释放升档） */
const OVERLOAD_DESC = `拟态能量 ≥${PRIMAL_OVERLOAD_COST} 时超载释放：半径 ×1.5、伤害 ×2.5、击退翻倍`

export const ORIGIN_SKILL = {
  id: 'slime_shock', name: '黏液震荡', icon: '🫧', cooldown: 7,
  desc: originShockDesc() + '；' + OVERLOAD_DESC,
  getDesc: (engine) => originShockDesc(engine) + '；' + OVERLOAD_DESC,
  use(engine) {
    const ws = engine.weaponSystem, p = engine.player
    if (!ws) return false
    // 拟态能量超载（P0）：≥40 消耗 40，本次震荡升档——半径 ×1.5、伤害 ×2.5、击退翻倍。
    // 能量不足时基础版照常释放：资源是强化油门，不是发动许可。
    const overload = trySpendPrimalOverload(engine)
    // 震荡扩能（com_shock）：每级伤害 +10%、范围 +8px，满级合计伤害约 +30%
    // （成长轨不变；基础倍率 1.9 是早期补强，与成长轨乘算后满级 2.47 倍）
    const growth = getOriginActiveGrowth(engine)
    const radius = Math.round((120 + growth.rangeBonus) * (overload ? 1.5 : 1))
    ws._explode(p.x, p.y, ws.damage * ws.levelMul * 1.9 * growth.damageMul * (overload ? 2.5 : 1), null, radius)
    // 震荡本身计为充能来源②（黏液震荡）：与飞弹交替输出即构成异源轮转
    gainPrimalEnergy(engine, PRIMAL_SOURCES.SHOCK)
    if (p.dead || engine.runFinished) return true
    repel(engine, radius, overload ? 72 : 36)
    engine.mapFeatures?.attackBarricades(p.x, p.y, radius)
    ws._ring?.(p.x, p.y, overload ? '#ffd166' : '#8cffc8', radius)
    if (overload) engine.enemyManager?.addText?.(p.x, p.y - 30, '⚡ 超载震荡!', null, '#ffd166', 18)
    // 拟态分化：震荡随主专精变形（暗影的替身/隐匿联动在下方既有分支）
    const spec = engine.primarySpec
    if (spec === 'gatling') {
      // 机枪形态：击退中追加一轮齐射 + 后续 2 轮分时齐射（复用疾射通道）
      const target = ws._findNearest?.()
      if (target) {
        ws.fire(target)
        ws.rapidVolley = { remaining: 2, timer: 0.12 }
      }
    } else if (spec === 'elemental') {
      // 元素形态：附魔随冲击波扩散给被击退者
      spreadShockProcs(engine, radius)
    }
    if (p.shadowDecoyDuration > 0) {
      p._decoys.push({ x: p.x, y: p.y, radius: p.radius * 0.85,
        life: p.shadowDecoyDuration, maxLife: p.shadowDecoyDuration, flash: 0, isDecoy: true })
      if (p._decoys.length > 2) p._decoys.shift()
    }
    if (ws.isShadowLord || p.shadowBossStep) { p.stealthTimer = 1.5; p.guaranteedCrit = true }
    return true
  },
}

function petRallyDescription(level = 0, engine) {
  const rally = getPetRally(level)
  const origin = hasPrimalEnergy(engine?.player) && engine.primarySpec === 'symbiosis'
  if (origin) {
    const growth = getOriginActiveGrowth(engine)
    rally.duration += growth.rallyDuration
    rally.damage += growth.rallyDamage
  }
  const base = `鼓舞全体伙伴 ${rally.duration} 秒：攻击力 +${Math.round(rally.damage * 100)}%、攻速 +${Math.round(rally.haste * 100)}%、移速 +${Math.round(rally.move * 100)}%。无敌人时也可释放，全员倒地时不消耗冷却`
  return origin ? `${base}；已继承震荡扩能；拟态能量 ≥${PRIMAL_OVERLOAD_COST} 时超载：${primalOverloadDescription(engine)}` : base
}

export const PET_SKILL = {
  id: 'companion_hunt', name: '共生鼓舞', icon: '🐾', cooldown: PET_RALLY_BASE.cooldown,
  desc: petRallyDescription(),
  getDesc(engine) { return petRallyDescription(engine.skillLevels?.pet_command || 0, engine) },
  use(engine) { return engine.weaponSystem?.petCombat?.rally() || false },
}
