import { GLUTTON_VORTEX_COOLDOWN, GLUTTON_VORTEX_DAMAGE, GLUTTON_BOSS_VORTEX_DAMAGE, GLUTTON_VORTEX_PULL_RADIUS } from './GluttonCombat.js'
import { PET_RALLY_BASE, getPetRally } from './PetSkills.js'

const VOLLEY_SHOTS = 4

/** 暴食 · 深渊吸噬：聚怪引力漩涡 + 原地 360° 重咬吞噬，全游戏唯一反向拉怪主动技能。 */
export const GLUTTON_SKILL = {
  id: 'devour_pulse',
  name: '深渊吸噬',
  icon: '🌀',
  cooldown: GLUTTON_VORTEX_COOLDOWN,
  desc: `释放约 ${GLUTTON_VORTEX_PULL_RADIUS}px 引力漩涡将周围外围敌人拽入身前，立刻获得 1 层胃铠后闭颚 360° 重咬（普通 ${GLUTTON_VORTEX_DAMAGE} 倍 / 首领 ${GLUTTON_BOSS_VORTEX_DAMAGE} 倍）并吞噬可吞血肉目标。`,
  getDesc() { return this.desc },
  use(engine) {
    return engine.weaponSystem?.gluttonCombat?.useVortex() || false
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
  desc: '沿移动方向穿行（±22° 智能锁敌吸附并碎除沿途普通弹幕），起跳天生在原地留下分身，首个目标 1.6 倍攻击且必暴，其余沿途目标 0.8 倍；落地后 2 秒内 +20% 移速并随机提升 15%~40% 闪避率与 10%~30% 暴击率，命中敌人时缩短 1~2.5 秒影魄回血冷却及 1.2 秒影刃格挡冷却。三连影波可唤起分身加速共鸣，击杀残影消散或触敌时爆出碎斩。分身优先突袭后排、首领集中夹击造成 2 倍伤害；本体击杀返还一次 0.5 秒影袭冷却',
  getDesc(engine) {
    const shadow = engine.weaponSystem?.shadowCombat
    return shadow?.canFollowup
      ? '猎杀终极已就绪：再次按空格可免费追击一次，不刷新影袭冷却'
      : this.desc
  },
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

function petRallyDescription(level = 0) {
  const rally = getPetRally(level)
  return `战吼震退周围敌人，全队伙伴同步释放爆发绝技并鼓舞 ${rally.duration.toFixed(1)} 秒：攻击力 +${Math.round(rally.damage * 100)}%、攻速 +${Math.round(rally.haste * 100)}%、移速 +${Math.round(rally.move * 100)}%。全员倒地时可自发战吼或随路线进化`
}

export const PET_SKILL = {
  id: 'companion_hunt', name: '共生鼓舞', icon: '🐾', cooldown: PET_RALLY_BASE.cooldown,
  desc: petRallyDescription(),
  getDesc(engine) {
    return engine?.weaponSystem?.petCombat?.activeSkill?.getDesc?.(engine) || petRallyDescription(engine?.skillLevels?.pet_command || 0)
  },
  use(engine) { return engine.weaponSystem?.petCombat?.rally() || false },
}
