import { GLUTTON_CHARGE_MAX, gluttonSkillHud } from './GluttonResource.js'
import { GLUTTON_HEAVY_DAMAGE, GLUTTON_BOSS_HEAVY_DAMAGE } from './GluttonCombat.js'

const VOLLEY_SHOTS = 4

/** 重咬在命中时按正常伤害路径结算；开局可用，猎食点来自吞噬/近战命中首领。 */
export const GLUTTON_SKILL = {
  id: 'devour_pulse',
  name: '暴食重咬',
  icon: '🦷',
  cooldown: 0,
  chargeMax: GLUTTON_CHARGE_MAX,
  desc: `消耗 1 猎食点，对前方近处敌人造成 ${GLUTTON_HEAVY_DAMAGE} 倍攻击伤害（首领 ${GLUTTON_BOSS_HEAVY_DAMAGE} 倍），将可吞噬的残血或被咬杀目标直接吞噬；吞噬或重咬命中首领获得短时护甲。重咬不返还猎食点`,
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

export const ORIGIN_SKILL = {
  id: 'slime_shock', name: '黏液震荡', icon: '🫧', cooldown: 8,
  desc: '周围 120px 造成 1.5 倍攻击伤害并击退普通敌人；觉醒后保留',
  use(engine) {
    const ws = engine.weaponSystem, p = engine.player
    if (!ws) return false
    ws._explode(p.x, p.y, ws.damage * ws.levelMul * 1.5, null, 120)
    if (p.dead || engine.runFinished) return true
    repel(engine, 120, 36)
    engine.mapFeatures?.attackBarricades(p.x, p.y, 120)
    ws._ring?.(p.x, p.y, '#8cffc8', 120)
    if (p.shadowDecoyDuration > 0) {
      p._decoys.push({ x: p.x, y: p.y, radius: p.radius * 0.85,
        life: p.shadowDecoyDuration, maxLife: p.shadowDecoyDuration, flash: 0, isDecoy: true })
      if (p._decoys.length > 2) p._decoys.shift()
    }
    if (ws.isShadowLord || p.shadowBossStep) { p.stealthTimer = 1.5; p.guaranteedCrit = true }
    return true
  },
}

export const PET_SKILL = {
  id: 'companion_hunt', name: '协同狩猎', icon: '🐾', cooldown: 7,
  desc: '沿移动方向（静止沿朝向）指挥宠物突袭前方区域：岩甲范围震击，疾风强袭单体；无目标时回防减伤。全部倒地时不消耗冷却',
  use(engine) { return engine.weaponSystem?.petCombat?.command() || false },
}
