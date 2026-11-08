import { ORIGIN_RULES, getOriginGrowth, originInvestment } from './OriginBuild.js'

/**
 * 源质记忆（Origin Essence Memory）——原生黏液吸收 BOSS 源质后「重新长出来」的技能。
 *
 * 设计边界：
 *  - 只有 origin 血统拥有；不新增任何按键，只在「真正支付超载」后按轮换顺序自动释放一次。
 *  - 数据（等级、伤害预算、范围、BOSS 映射）全部集中在本文件，战斗层只读不写数值。
 *  - BOSS 映射使用稳定的实体类型（Boss.type = `boss-knight` / `boss-mage` / `boss-archer`，
 *    远征首领复用同一 archetype），不依赖显示名，避免本地化或改名后失效。
 *  - 源质技能是「原生化的」能力：伤害以原生当前武器伤害为基数，不复制 BOSS 原伤害。
 */

export const ORIGIN_SOURCE_RULES = Object.freeze({
  maxSlots: 3,
  maxLevel: 3,
  /** 破阵凝胶波推进速度（px/s）。 */
  breachSpeed: 620,
  /** 棘刺飞行速度缺省值（px/s）。 */
  huntSpeed: 560,
  /** 单次释放的棘刺硬上限：任何情况下都不允许无限弹体。 */
  spikeCap: 12,
  /** 异源共振余波：相对主技能单次伤害的上限比例与基础半径。 */
  echoShare: 0.25,
  echoRadius: 100,
  /** 源质技能只对普通敌人击退；首领免疫位移。 */
  bossKnockback: 0,
  /** 被动超载统一乘区：源质技能倍率换算到「超载口径」的基准系数。 */
  passiveDamageScale: 1.3,
})

/** 被动超载（OriginOverload 控制器）的触发参数。 */
export const ORIGIN_OVERLOAD_RULES = Object.freeze({
  /** 基础自动超载冷却（秒）。 */
  cooldown: 6,
  /** 异源共振路线的超载冷却（秒）。 */
  resonanceCooldown: 5.5,
  /** 启动表现时长：预约→确认释放之间的窗口，不扣能量。 */
  windup: 0.25,
  /** 无有效目标时重新判断的间隔（秒）。 */
  retryDelay: 0.5,
})

/**
 * 原生史莱姆先天具备的源质能力——「原质环流」。
 * 不是 BOSS 源质、不占记忆槽、不出现在奖励卡池；
 * 存在有效源质记忆时退出自动释放序列，但不被删除。
 */
export const ORIGIN_INNATE_SKILL = Object.freeze({
  id: 'primal_orbit',
  name: '原质环流',
  icon: '🫧',
  iconKey: 'orbit',
  color: '#8cffc8',
  exec: 'orbit',
  innate: true,
  castRange: 240,
  tags: ['原生', '被动超载'],
  desc: '身体中的原质核心分离出三枚液态原质球，环绕后追踪近距离敌人，命中产生小型液态爆裂。',
  trigger: '被动超载自动释放：原质球追踪并爆裂',
})
/** 原质环流数值（单档，不受记忆等级影响；成长来自路线/棱镜/秘典乘区）。 */
export const ORIGIN_ORBIT_STATS = Object.freeze({
  orbs: 3,
  duration: 1.2,
  damageMul: 1.0,
  splash: 0.35,
  splashRadius: 36,
  slow: 0.8,
})

/**
 * 三种源质技能。levels[i] 对应 Lv.(i+1)。
 * damageMul 是「原生武器伤害」的倍率预算：单次释放对单个目标的伤害不超过
 * 同一次超载震荡单体伤害的量级，三级成长主要买覆盖与追加效果，不是无限叠倍率。
 */
export const ORIGIN_SOURCE_SKILLS = Object.freeze([
  {
    id: 'knight_breach',
    cardId: 'osrc_knight_breach',
    name: '破阵凝胶波',
    bossType: 'boss-knight',
    source: '骑士王',
    sourceBoss: '骑士王 加洛特',
    icon: '🌊',
    iconKey: 'waves',
    color: '#5ad1c8',
    exec: 'breach',
    castRange: 500,
    tags: ['源质记忆', '骑士王', '直线突破'],
    desc: '身体先压成一枚凝胶弹芯，再向最近敌人推出一道高速液态冲击波：沿途击退并撕开一道缺口。',
    trigger: '超载时自动释放：向最近敌人推出直线凝胶冲击波',
    levels: [
      { damageMul: 1.6, width: 56, distance: 540, knock: 70, text: '一道凝胶冲击波，沿途击退' },
      { damageMul: 2.0, width: 72, distance: 640, knock: 90, text: '波体更宽更长，击退更强' },
      {
        damageMul: 2.3, width: 84, distance: 700, knock: 105,
        burst: { damageMul: 0.45, radius: 96 },
        text: '末端追加一次较弱的液态爆发',
      },
    ],
  },
  {
    id: 'mage_collapse',
    cardId: 'osrc_mage_collapse',
    name: '奥术坍缩',
    bossType: 'boss-mage',
    source: '大法师',
    sourceBoss: '大法师 梅林',
    icon: '🕳️',
    iconKey: 'aperture',
    color: '#a29bfe',
    exec: 'collapse',
    castRange: 520,
    tags: ['源质记忆', '大法师', '延迟爆发'],
    desc: '在敌人最密集处凝出一枚凝胶化的奥术原核，先向内坍缩，再向外炸开成一圈液态冲击。',
    trigger: '超载时自动释放：在敌人密集处生成坍缩原核',
    levels: [
      { damageMul: 2.4, radius: 112, delay: 0.5, text: '单次坍缩，范围爆发' },
      { damageMul: 2.9, radius: 132, delay: 0.5, text: '范围与伤害提高' },
      {
        damageMul: 3.2, radius: 148, delay: 0.48,
        extra: { damageMul: 0.4, radius: 168, delay: 0.3 },
        text: '坍缩后追加一次较弱的扩散冲击',
      },
    ],
  },
  {
    id: 'archer_hunt',
    cardId: 'osrc_archer_hunt',
    name: '棘刺追猎雨',
    bossType: 'boss-archer',
    source: '弓王',
    sourceBoss: '弓王 罗宾',
    icon: '🦔',
    iconKey: 'multishot',
    color: '#ffd166',
    exec: 'hunt',
    castRange: 760,
    tags: ['源质记忆', '弓王', '多目标追踪'],
    desc: '体表凝出数枚凝胶棘刺弹射而出，各自追猎不同目标，命中后炸开一小片黏液。',
    trigger: '超载时自动释放：向不同目标射出追踪棘刺',
    levels: [
      { count: 3, damageMul: 1.7, splash: 0.3, splashRadius: 34, speed: 520, pierces: 0, text: '发射 3 枚追踪棘刺' },
      { count: 4, damageMul: 2.0, splash: 0.32, splashRadius: 38, speed: 560, pierces: 0, text: '数量与伤害提高' },
      { count: 5, damageMul: 2.2, splash: 0.35, splashRadius: 42, speed: 620, pierces: 1, text: '最多 5 枚，并提高追踪与穿透' },
    ],
  },
])

export const ORIGIN_SOURCE_BY_ID = Object.freeze(
  Object.fromEntries(ORIGIN_SOURCE_SKILLS.map(skill => [skill.id, skill]))
)
export const ORIGIN_SOURCE_BY_CARD = Object.freeze(
  Object.fromEntries(ORIGIN_SOURCE_SKILLS.map(skill => [skill.cardId, skill]))
)
/** 稳定类型 → 源质技能的显式映射（不允许按显示名匹配）。 */
export const ORIGIN_SOURCE_BOSS_TYPES = Object.freeze(
  Object.fromEntries(ORIGIN_SOURCE_SKILLS.map(skill => [skill.bossType, skill.id]))
)

export function originSourceForBossType(bossType) {
  const id = ORIGIN_SOURCE_BOSS_TYPES[bossType]
  return id ? ORIGIN_SOURCE_BY_ID[id] : null
}

/** 一组首领类型里所有可映射的源质定义（去重、保持传入顺序）。 */
export function originSourcesForBossTypes(bossTypes) {
  const list = Array.isArray(bossTypes) ? bossTypes : [bossTypes]
  const out = []
  const seen = new Set()
  for (const type of list) {
    const def = originSourceForBossType(type)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    out.push(def)
  }
  return out
}

export function originSourceLevel(def, level) {
  if (!def) return null
  const index = Math.max(0, Math.min(ORIGIN_SOURCE_RULES.maxLevel, Math.floor(Number(level) || 0)) - 1)
  return def.levels[Math.max(0, index)] || def.levels[0]
}

/** 原始记忆数组清洗：去重、过滤未知 id、等级夹在 1~3、最多 3 槽。 */
export function originMemories(game) {
  const raw = game?.originSourceMemories
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const entry of raw) {
    const id = typeof entry === 'string' ? entry : entry?.id
    const def = ORIGIN_SOURCE_BY_ID[id]
    if (!def || seen.has(id)) continue
    seen.add(id)
    const level = Math.max(1, Math.min(ORIGIN_SOURCE_RULES.maxLevel, Math.floor(Number(entry?.level) || 1)))
    out.push({ id, level })
    if (out.length >= ORIGIN_SOURCE_RULES.maxSlots) break
  }
  return out
}

export function originMemoryLevel(game, id) {
  return originMemories(game).find(entry => entry.id === id)?.level || 0
}

export function originMemoryCursor(game) {
  const list = originMemories(game)
  if (!list.length) return 0
  const cursor = Math.floor(Number(game?.originSourceCursor) || 0)
  if (!Number.isFinite(cursor) || cursor < 0) return 0
  return cursor % list.length
}

/** 下一次超载将释放的源质技能（HUD 预告与释放轮换共用同一判定）。 */
export function nextOriginMemory(game) {
  const list = originMemories(game)
  if (!list.length) return null
  const index = originMemoryCursor(game)
  const entry = list[index]
  const def = ORIGIN_SOURCE_BY_ID[entry.id]
  return def ? { ...entry, def, index } : null
}

/**
 * 被动超载的「下一次释放」统一判定：
 * 有源质记忆 → 当前轮换位；没有 → 默认技能「原质环流」。
 */
export function nextOriginCast(game) {
  const memory = nextOriginMemory(game)
  if (memory) return memory
  return { id: ORIGIN_INNATE_SKILL.id, level: 1, def: ORIGIN_INNATE_SKILL, index: -1, innate: true }
}

export function advanceOriginMemoryCursor(game) {
  const list = originMemories(game)
  game.originSourceCursor = list.length ? (originMemoryCursor(game) + 1) % list.length : 0
  return game.originSourceCursor
}

export function resetOriginSourceMemories(game) {
  if (!game) return
  game.originSourceMemories = []
  game.originSourceCursor = 0
  game.originSourceLastCast = null
}

/**
 * 学习/升级一张源质记忆卡。
 * 返回 { ok, id, level, upgraded } 或 null（不可学习）。
 * 槽位已满且是全新技能时直接失败——绝不自动覆盖已有记忆。
 */
export function learnOriginMemory(game, memoryId) {
  const def = ORIGIN_SOURCE_BY_ID[memoryId]
  if (!def || game?.startingStrain !== 'origin') return null
  if (!Array.isArray(game.originSourceMemories)) game.originSourceMemories = []
  const list = originMemories(game)
  game.originSourceMemories = list
  const index = list.findIndex(entry => entry.id === memoryId)
  if (index >= 0) {
    if (list[index].level >= ORIGIN_SOURCE_RULES.maxLevel) return null
    list[index].level += 1
    return { ok: true, id: memoryId, level: list[index].level, upgraded: true }
  }
  if (list.length >= ORIGIN_SOURCE_RULES.maxSlots) return null
  list.push({ id: memoryId, level: 1 })
  game.originSourceMemories = list
  return { ok: true, id: memoryId, level: 1, upgraded: false }
}

/** 一次超载的乘区预算硬上限（不含 passiveDamageScale 基准系数）。 */
export const ORIGIN_OVERLOAD_BUDGET = Object.freeze({
  /** 一次超载：路线 × 棱镜 × 调谐 × 同化/共振 合计伤害乘区 ≤ 1.8。 */
  damageCap: 1.8,
  /** 一次超载：范围乘区合计 ≤ 1.35。 */
  areaCap: 1.35,
})

/**
 * 被动超载的统一乘区计算：技能倍率之外的全部加成在这里收口。
 *   最终伤害 = 技能倍率 × passiveDamageScale × mods.damage（合计 ≤1.8）
 *   最终范围 = 技能半径/宽度 × mods.area（合计 ≤1.35）
 * 组成：路线专属 × 超载棱镜 × 源质调谐(秘典) × 同化层数/共振回路加成。
 * 返回的 consumeStacks / consumeCircuits 供执行器在释放后统一消费路线资源，
 * 保证「读快照 → 结算 → 再消耗」的顺序。
 */
export function originSourceCastMods(game, snapshot = null) {
  const growth = getOriginGrowth(game)
  const tuneRank = Math.max(0, Math.min(3, Math.floor(Number(game?.bossSkillLevels?.boss_origin_aftershock) || 0)))
  const route = game?.originRoute || null
  const stacks = Math.max(0, Math.floor(Number(snapshot?.stacks) || 0))
  const circuits = Math.max(0, Math.floor(Number(snapshot?.circuits) || 0))

  let damage = growth.overloadDamageMul * (1 + [0, 0.08, 0.12, 0.15][tuneRank])
  let area = growth.overloadRangeMul * (1 + (tuneRank >= 2 ? 0.05 : 0))
  let echo = false
  let consumeStacks = false
  let consumeCircuits = false

  if (route === 'expansion') {
    const investment = originInvestment(game, 'expansion')
    area *= Math.min(1.15, 1.1 + 0.01 * investment)
  } else if (route === 'assimilation') {
    if (stacks > 0 && stacks >= (growth.maxStacks || Infinity)) {
      // 满层兑现：消耗全部层数换「局部形态重组」的爆发加成，范围 +15%。
      damage *= 1 + growth.empoweredDamageBonus
      area *= 1.15
      consumeStacks = true
    } else {
      // 未满层：每层读 stackDamageBonus（2.5%~4%），合计封顶 20%。
      damage *= 1 + Math.min(0.2, growth.stackDamageBonus * stacks)
    }
  } else if (route === 'resonance') {
    // 共振核心+超载爆发的回路增伤作用于源质技能（合计封顶 30%）；
    // 单次伤害整体 ×0.9 换更高超载频率。
    damage *= 0.9 * (1 + Math.min(0.3, (growth.circuitDamage + growth.overloadBurstBonus) * circuits))
    if (circuits >= ORIGIN_RULES.resonanceMaxCircuits) {
      echo = true
      consumeCircuits = true
    }
  }

  return {
    route,
    damage: Math.min(ORIGIN_OVERLOAD_BUDGET.damageCap, damage),
    area: Math.min(ORIGIN_OVERLOAD_BUDGET.areaCap, area),
    echo,
    stacks,
    circuits,
    consumeStacks,
    consumeCircuits,
  }
}

/** 卡面数值串：当前等级 → 下一级（满级只展示当前）。 */
export function originMemoryStats(def, level) {
  if (!def) return ''
  const cur = Math.max(0, Math.min(ORIGIN_SOURCE_RULES.maxLevel, Math.floor(Number(level) || 0)))
  const next = cur + 1
  const describe = (lv) => {
    const row = originSourceLevel(def, lv)
    return row?.text || ''
  }
  if (cur >= ORIGIN_SOURCE_RULES.maxLevel) return `已满级 · ${describe(cur)}`
  return cur === 0
    ? `获得 Lv.1 · ${describe(1)}`
    : `Lv.${cur} → Lv.${next} · ${describe(next)}`
}

/** 生成一张奖励候选卡（只由引擎内部调用，UI 只负责展示与回传 id）。 */
export function originMemoryCard(game, def) {
  if (!def) return null
  const level = originMemoryLevel(game, def.id)
  return {
    id: def.cardId,
    memoryId: def.id,
    name: `${def.source}源质·${def.name}`,
    icon: def.icon,
    iconKey: def.iconKey,
    color: def.color,
    spec: 'origin',
    route: 'memory',
    desc: def.desc,
    trigger: def.trigger,
    sourceBoss: def.sourceBoss,
    level,
    maxLevel: ORIGIN_SOURCE_RULES.maxLevel,
    isOriginMemory: true,
    isBossSkill: false,
    tags: [...def.tags, '超载释放'],
    stats: originMemoryStats(def, level),
    buildNote: '击败首领吸收的源质：超载时自动释放 · 不占用普通升级次数',
  }
}

/**
 * 现有 BOSS 奖励流程的唯一接入点：本次首领是否应该「强制」给一张源质卡。
 * 已满级 / 槽位已满（未来扩展）时返回 null，恢复普通秘典候选。
 *
 * bossTypes 支持单个类型或「本场遭遇出现过的全部类型」：
 * 编队不再只看最后一名成员，而是按 未学 → 等级最低 → 已满级(跳过) 的口径挑一个，
 * 避免「王国双锋」的 50/50 让玩家永远见不到弓王源质。
 */
export function rollOriginMemoryCard(game, bossTypes) {
  if (game?.startingStrain !== 'origin') return null
  const types = Array.isArray(bossTypes) ? bossTypes : [bossTypes]
  let best = null
  let bestLevel = Infinity
  for (const def of originSourcesForBossTypes(types)) {
    const level = originMemoryLevel(game, def.id)
    if (level >= ORIGIN_SOURCE_RULES.maxLevel) continue
    // 槽位已满时不能再「新占」一格，但已学过的仍可升级。
    if (level === 0 && originMemories(game).length >= ORIGIN_SOURCE_RULES.maxSlots) continue
    if (level < bestLevel) { best = def; bestLevel = level }
  }
  return best ? originMemoryCard(game, best) : null
}

/** HUD 快照：三个槽位、当前轮换位、下一次释放预告、最近一次释放（用于高亮）。 */
export function originMemoryHud(game) {
  if (game?.startingStrain !== 'origin') return null
  const list = originMemories(game)
  const cursor = originMemoryCursor(game)
  const next = nextOriginMemory(game)
  const last = game.originSourceLastCast || null
  return {
    known: list.length > 0,
    cap: ORIGIN_SOURCE_RULES.maxSlots,
    maxLevel: ORIGIN_SOURCE_RULES.maxLevel,
    cursor,
    slots: list.map((entry, index) => {
      const def = ORIGIN_SOURCE_BY_ID[entry.id]
      return {
        id: entry.id,
        cardId: def?.cardId || entry.id,
        name: def?.name || entry.id,
        icon: def?.icon || '🫧',
        iconKey: def?.iconKey || null,
        color: def?.color || '#8cffc8',
        level: entry.level,
        next: index === cursor,
        total: def?.source || '',
      }
    }),
    nextId: next?.id || ORIGIN_INNATE_SKILL.id,
    nextName: next?.def?.name || ORIGIN_INNATE_SKILL.name,
    nextLevel: next?.level || 1,
    nextInnate: !next,
    lastId: last?.id || null,
    lastName: last?.name || null,
    lastLevel: last?.level || 0,
    lastAge: last ? Math.max(0, (game.elapsed || 0) - (last.at || 0)) : Infinity,
  }
}
