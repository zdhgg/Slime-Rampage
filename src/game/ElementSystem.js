/**
 * 元素系统：标签驱动反应表（评审 Day 1 核心改造）
 *
 * 原则：融合规则由数据表判断，不在技能/战斗代码里写
 * 「if fire && poison」这类两两硬编码。新增元素或生物标签时，
 * 只需向 ELEMENTS / REACTIONS 表追加条目，武器/形态/命名自动生效。
 *
 * 后续可自然扩展：例如加入「甲壳」生物标签后，
 * 「巨大化 + 火 = 熔岩巨胶」「分裂 + 毒 = 毒性孢子群」只需各加一行表项。
 */

/**
 * 元素定义：id / 图标 / 名称 / 生物标签（未来反应规则的扩展点）
 * proc：元素附魔（阶段十三：元素等级数值化；阶段十四调优：概率上调）——
 * 每级向命中附加对应状态，由 Player._refreshElements 按等级聚合
 * （同状态概率相加、时长取最长、封顶 60%）；DOT 跳伤随武器伤害成长。
 * 未激活反应时单元素吸收也有收益，重复核心不再是「死拾取」。
 */
export const ELEMENTS = {
  fire: { id: 'fire', icon: '🔥', name: '火焰', tags: ['heat'], proc: { status: 'burn', chance: 0.1, duration: 2 } },
  water: { id: 'water', icon: '💧', name: '水流', tags: ['fluid'], proc: { status: 'freeze', chance: 0.08, duration: 1.2 } },
  poison: { id: 'poison', icon: '☠️', name: '毒素', tags: ['corrosive'], proc: { status: 'poison', chance: 0.1, duration: 3 } },
  // 雷电：复用冻结视觉的短麻痹（0.6s），与水流同状态概率叠加
  lightning: { id: 'lightning', icon: '⚡', name: '雷电', tags: ['electric'], proc: { status: 'freeze', chance: 0.07, duration: 0.6 } },
}

/** 反应表：元素组合 → 融合结果（武器行为 / 形态 / 物种名 全部由此驱动） */
export const REACTIONS = [
  {
    id: 'acid',
    combo: ['fire', 'poison'],
    name: '爆炸酸液',
    species: '熔蚀爆浆史莱姆',
    mutation: 'acid',
    desc: '命中留酸液池，可被后续命中引爆',
  },
  {
    id: 'gel',
    combo: ['lightning', 'water'],
    name: '雷涌凝胶',
    species: '雷涡凝胶史莱姆',
    mutation: 'gel',
    desc: '命中连锁导电，积累后全屏麻痹',
  },
  {
    id: 'burst',
    combo: ['fire', 'lightning'],
    name: '爆裂',
    species: '爆雷史莱姆',
    mutation: 'storm',
    desc: '暴击率 +20%',
  },
  {
    id: 'corrode',
    combo: ['water', 'poison'],
    name: '腐蚀',
    species: '腐蚀凝胶史莱姆',
    mutation: 'corrode',
    desc: '燃烧/中毒持续翻倍',
  },
  {
    id: 'steam',
    combo: ['fire', 'water'],
    name: '蒸汽迷雾',
    species: '蒸汽迷雾史莱姆',
    mutation: 'steam',
    desc: '命中留下减速云雾，控制走位',
  },
  {
    id: 'venom',
    combo: ['poison', 'lightning'],
    name: '毒雷风暴',
    species: '毒雷风暴史莱姆',
    mutation: 'venom',
    desc: '周期全屏毒雷：中毒 + 麻痹',
  },
]

/** 当前激活的反应（elements 为 Map 或 Set，兼容 has 语义） */
export const getActiveReactions = (elements) =>
  REACTIONS.filter((r) => r.combo.every((el) => elements.has(el)))

/** 指定反应是否激活 */
export const hasReaction = (elements, id) => getActiveReactions(elements).some((r) => r.id === id)

/** 取元素定义（未知 id 返回 null） */
export const getElement = (id) => ELEMENTS[id] || null

/**
 * 元素消化表（元素等级 → 吞噬联动）：
 * 吞噬是四条成长轴的天然交汇点——这里把「已吸收元素的等级」翻译成吞噬时的即时效果，
 * 让重复核心的积累第一次产生行为质变，而不只是附魔概率的线性上涨。
 *
 * 两档解锁：Lv2 基础消化、Lv4 强化消化（刻意错开 Lv4 / Lv8 的槽位里程碑，
 * 让升级点的收益分散在不同系统上）。damageMul 相对当前武器伤害换算。
 */
export const DIGEST_EFFECTS = {
  fire: {
    id: 'fire',
    lv2: { name: '灼热消化', radius: 90, damageMul: 0.8, burn: 0 },
    lv4: { name: '熔核消化', radius: 130, damageMul: 1.3, burn: 2 },
  },
  water: {
    id: 'water',
    lv2: { name: '寒潮消化', radius: 110, slow: 2.4, freeze: 0 },
    lv4: { name: '冰封消化', radius: 150, slow: 3, freeze: 1.6 },
  },
  poison: {
    id: 'poison',
    lv2: { name: '腐蚀消化', radius: 55, poolDmg: 1, poolLife: 3 },
    lv4: { name: '剧毒消化', radius: 80, poolDmg: 2, poolLife: 4 },
  },
  lightning: {
    id: 'lightning',
    lv2: { name: '导电消化', damageMul: 0.7 },
    lv4: { name: '雷鸣消化', damageMul: 1.2 },
  },
}

/** 吞噬时该元素触发的消化档位（未达 Lv2 返回 null） */
export function getDigestTier(id, level) {
  const def = DIGEST_EFFECTS[id]
  if (!def || level < 2) return null
  return { elementId: id, tier: level >= 4 ? 4 : 2, ...(level >= 4 ? def.lv4 : def.lv2) }
}
