/** Elemental strain only. Origin retains the legacy elemental system. */
import { ELEMENTAL_SCHOOL_SKILLS } from './ElementalUpgrades.js'
import { BASE_SPELL_PALETTES, FUSION_SPELL_PALETTES } from './SpellPalette.js'
import { ELEMENTAL_MILESTONE_LEVELS } from './ElementalProgression.js'
export const SPELL_ELEMENTS = {
  fire: { id: 'fire', name: '火焰', icon: '🔥', color: '#ffae70', spell: '火球术', interval: 1.4, desc: '发射单颗火球，命中产生小范围爆炸；升级可变大、增多、附加燃烧。', upgrade: '融合裂焰', upgradeDesc: '火球保留飞行与爆炸，向附近敌人释放融合元素的裂焰。' },
  water: { id: 'water', name: '寒冰', icon: '❄️', color: '#94dbef', spell: '寒冰箭', interval: 1.1, desc: '冰箭穿透两个目标；升级可增加穿透，并逐步获得减速和冻结。', upgrade: '融合冰晶', upgradeDesc: '冰箭保留穿透路径，命中时释放融合冰晶。' },
  lightning: { id: 'lightning', name: '雷电', icon: '⚡', color: '#f0d588', spell: '闪电链', interval: 1.3, desc: '雷核短暂蓄亮，从本体释放电弧并连锁两个目标；升级增加跳跃、传导距离和麻痹。', upgrade: '融合雷弧', upgradeDesc: '雷系普攻保留传导，在融合标记目标附近释放额外冲击。' },
  poison: { id: 'poison', name: '毒素', icon: '☠️', color: '#a8d886', spell: '毒雾', interval: 3.4, desc: '向最近可攻击的敌人抛出毒囊，弧线落地后展开毒雾；升级可扩大范围、延长持续并附加中毒。', upgrade: '融合毒域', upgradeDesc: '毒雾缓慢追随目标，并逐步增加融合元素的区域脉冲。' },
}
export const SPELL_ELEMENT_IDS = Object.keys(SPELL_ELEMENTS)
for (const id of SPELL_ELEMENT_IDS) SPELL_ELEMENTS[id].color = BASE_SPELL_PALETTES[id].main
export const normalizeSpellElement = id => SPELL_ELEMENTS[id] ? id : 'fire'
export const SPELL_FUSIONS = [
  { id: 'steam', combo: ['fire', 'water'], name: '霜火碎裂', active: '霜火爆裂', evolved: '霜焰新星', color: '#c9cbff', desc: '火焰击中冰霜目标，引发霜火碎裂。', activeDesc: '在目标区域施加冰霜并引爆，冻结普通敌人。', evolution: '产生第二次霜火爆裂，覆盖更大范围。' },
  { id: 'gel', combo: ['lightning', 'water'], name: '雷霜传导', active: '雷霜风暴', evolved: '极寒雷暴', color: '#a8e5f1', desc: '闪电击中冰霜目标，强化传导并炸开冰晶。', activeDesc: '冻结目标区域的普通敌人，并释放连锁雷击。', evolution: '连续雷击并产生额外冰晶爆裂。' },
  { id: 'acid', combo: ['fire', 'poison'], name: '火毒爆燃', active: '爆燃领域', evolved: '灾炎领域', color: '#e2b275', desc: '火焰点燃毒雾，产生范围爆燃。', activeDesc: '在目标区域生成毒雾并立即引爆。', evolution: '爆燃后持续降下火雨，并留下毒雾。' },
  { id: 'venom', combo: ['lightning', 'poison'], name: '毒电连锁', active: '毒雷风暴', evolved: '瘟雷领域', color: '#bedc9a', desc: '闪电击中毒雾中的目标，释放毒电连锁。', activeDesc: '生成毒域，并在区域内发动雷击。', evolution: '毒域持续释放雷击，并扩大连锁范围。' },
  { id: 'corrode', combo: ['water', 'poison'], name: '寒疫侵蚀', active: '寒疫领域', evolved: '永冻瘟疫', color: '#9bddc5', desc: '毒雾对冰霜目标强化减速，并积累冰霜。', activeDesc: '生成寒疫毒域，迅速冻结区域内的普通敌人。', evolution: '寒疫领域扩大、延长，持续产生冰晶碎裂。' },
  { id: 'burst', combo: ['fire', 'lightning'], name: '雷火爆发', active: '雷火轰击', evolved: '天罚雷炎', color: '#ffd19a', desc: '闪电引爆燃烧标记，产生雷火爆发。', activeDesc: '集中轰击目标区域，同时施加燃烧与雷击。', evolution: '追加两次雷火轰击，强化首领爆发。' },
].map(f => ({ ...f, color: FUSION_SPELL_PALETTES[f.id].main, palette: FUSION_SPELL_PALETTES[f.id], mutation: f.id === 'burst' ? 'storm' : f.id, species: `${f.name}史莱姆` }))
// Reactions use basic elemental contact; burning/freezing remain optional school upgrades.
for (const f of SPELL_FUSIONS) {
  if (f.id === 'steam') f.desc = '火球与冰箭先后命中同一目标，产生霜火碎裂。'
  if (f.id === 'gel') f.desc = '闪电与冰箭先后命中同一目标，产生冰晶传导。'
  if (f.id === 'burst') { f.desc = '火球与闪电先后命中同一目标，产生雷火爆发；两套法术持续施放。'; f.activeDesc = '目标区域先爆开火焰，短促雷纹预告后空中劈下雷柱，并向附近敌人传导。' }
  if (f.id === 'gel') f.activeDesc = '先冻结目标区域的普通敌人，雷纹预告后劈下落雷，并向附近敌人传导。'
  if (f.id === 'venom') f.activeDesc = '先生成毒域，雷纹预告后空中落雷，命中后在敌人之间传导。'
  if (f.id === 'corrode') f.desc = '冰箭命中毒雾中的目标，或毒雾作用于冰箭标记目标，产生寒疫侵蚀。'
}
const REACTION_SPREAD = { steam: '第二级追加冰霜扩散。', gel: '第二级追加连锁雷击。', acid: '第二级可继续引爆附近另一片毒雾。', venom: '第二级增加毒电连锁目标。', corrode: '第二级向更远目标扩散冰霜。', burst: '第二级向周围扩散燃烧。' }
export const getSpellFusion = elements => SPELL_FUSIONS.find(f => f.combo.every(id => elements.has(id))) || null

export const ELEMENTAL_SPEC_INFO = {
  name: '万象法师', desc: '单系极化 · 双系融合 · 多系轮转',
  bonus: '法术伤害 +20% · 可在中期确认元素构筑路线',
  roadmap: ['Lv.2：发现首个自动法术', '探索期：随机发现新元素与本系强化', '第 6 波／第 3 章：确认单系、双系或多系路线', 'Lv.14＋路线投入：随机出现互斥终极'],
}

// Shared IDs keep legacy saves and origin behavior stable; role-specific resolution is explicit.
export const ELEMENTAL_SKILLS = [
  ...ELEMENTAL_SCHOOL_SKILLS,
  { id: 'spell_shield', name: '法术护盾', icon: '🛡️', tier: 1, maxLevel: 2, tags: ['元素·防御', '自动重建'],
    desc: '强化开局自带的法术护盾。护盾吸收敌人攻击，超出容量的伤害扣生命，破盾后自动重建。',
    stats: lv => lv === 0 ? '护盾容量 1 · 破盾重建 8 → 6 秒' : '护盾容量 1 → 2 · 破盾重建 6 秒',
    apply(game) { game.weaponSystem.spellCombat.shield.upgrade() } },
  { id: 'ele_overload', name: '融合超载', icon: '✦', tier: 2, maxLevel: 3, desc: '强化空格融合术伤害，缩短主动冷却。', stats: lv => `主动伤害 +${(lv + 1) * 20}% · 冷却 −${(lv + 1) * 5}%`, apply() {} },
].map(s => ({ ...s, spec: 'elemental', tags: s.tags || ['元素·法术', s.tier === 1 ? '基础' : '进阶'] }))

export function resolveElementalSkill(skill, game) {
  if (game?.startingStrain !== 'elemental') return skill
  const base = ELEMENTAL_SKILLS.find(s => s.id === skill.id) || skill
  const resolved = base.element ? { ...base, color: game.weaponSystem?.spellCombat?.palette(base.element).main || base.color } : base
  if (resolved.element !== 'lightning' || !game.weaponSystem?.spellCombat?.lightning?.storm) return resolved
  const desc = { spell_lightning_chain: '增加落雷命中后的传导目标，保留已学的连锁强化。', spell_lightning_reach: '扩大落雷命中后的传导距离，连接分散怪群。', spell_lightning_stun: '落雷与后续传导获得短暂麻痹；首领免疫，每个目标有独立再次麻痹间隔。' }[resolved.id]
  return { ...resolved, tags: ['雷电·雷暴落击', '法术改造'], desc: desc || resolved.desc }
}

function coreCard(id, name, desc, stats, extra = {}) {
  return { id, name, desc, stats, icon: '◆', color: '#b6a4ff', isSpellCore: true, ...extra }
}

/** Former boss-core shapes now share the ordinary random pool, with the same prerequisites. */
export function ordinarySpellCoreSkills(game) {
  const s = game.weaponSystem?.spellCombat
  if (!s?.available) return []
  const claims = Math.max(s.cores, Object.values(game.bossSkillLevels || {}).reduce((a, b) => a + b, 0))
  if (claims < 1) return []
  const cards = []
  const add = (key, name, desc, maxLevel, element = null) => {
    const rank = s.rank(key)
    if (rank >= maxLevel) return
    cards.push({ id: `spell_core_${key}`, name, desc, spec: 'elemental', tier: 2,
      kind: 'core', isSpellCoreUpgrade: true, isElementalSkill: true, maxLevel,
      level: rank, element, color: element ? SPELL_ELEMENTS[element].color : '#b6a4ff',
      iconKey: element ? { fire: 'fire', water: 'water', poison: 'poison', lightning: 'lightning' }[element] : 'git_merge',
      tags: ['元素·法术改造', '随机成长'],
      stats: key === 'lightning_storm' ? '将雷系自动普攻转为空中落雷；已学强化保留'
        : key === 'reaction' ? `反应共鸣 Lv.${rank} → ${rank + 1} · 伤害+25%${rank === 1 ? ' · 扩散进化' : rank === 2 ? ' · 范围扩大' : ''}`
        : `法术改造 Lv.${rank} → ${rank + 1} · 本系伤害+12%`,
      apply(engine) {
        const spells = engine.weaponSystem.spellCombat
        spells.upgrades[key] = Math.min(maxLevel, spells.rank(key) + 1)
        engine.skillLevels[`spell_core_${key}`] = spells.rank(key)
        spells.syncElements()
      },
    })
  }
  for (const element of s.activeElements) add(`shape_${element}`, SPELL_ELEMENTS[element].upgrade,
    SPELL_ELEMENTS[element].upgradeDesc, 3, element)
  if (s.fusion && (!s.route || s.route === 'fusion')) {
    add('reaction', `${s.fusion.name} · 共鸣`, `强化已掌握的融合反应。${REACTION_SPREAD[s.fusion.id]}`, 3)
    if (s.activeElements.includes('lightning') && claims >= 3 && !s.lightning.storm)
      add('lightning_storm', '雷暴转化', '雷系自动普攻改为空中落雷；保留传导、另一系法术与融合。', 1, 'lightning')
  }
  return cards
}

/** These rewards replace the normal upgrade at the corresponding level. */
export function spellMilestoneReward(combat) {
  if (!combat.available) return null
  const level = combat.player.level
  if (!combat.elements.size && level >= ELEMENTAL_MILESTONE_LEVELS.first) {
    return { stage: 'first', source: `Lv.${ELEMENTAL_MILESTONE_LEVELS.first}`, options: SPELL_ELEMENT_IDS.map(id => {
      const el = SPELL_ELEMENTS[id]
      const desc = { fire: '火球命中小范围爆炸。升级可变大、增多或燃烧。', water: '冰箭穿透两个目标。升级可获得减速和冻结。', lightning: '从本体释放闪电，连锁打击两个目标。', poison: '向近敌抛出毒囊，落地形成持续伤害区域。' }[id]
      return coreCard(`spell_learn_${id}`, el.spell, desc, '替换原质飞弹 · 自动施放', {
        element: id, kind: 'learn', icon: el.icon, color: el.color,
        label: { fire: '爆炸伤害 · 推荐初次体验', water: '直线穿透 · 升级可冻结', lightning: '连锁打击', poison: '持续区域伤害' }[id],
      })
    }) }
  }
  // Legacy direct callers may still request the old milestone preview. The
  // live upgrade flow no longer forces these stages; it uses random discovery.
  if (combat.elements.size === 1 && level >= ELEMENTAL_MILESTONE_LEVELS.fusion) {
    return { stage: 'fusion', source: `Lv.${ELEMENTAL_MILESTONE_LEVELS.fusion}`, options: spellFusionOptions(combat) }
  }
  if (combat.fusion && !combat.milestoneEvolved && level >= ELEMENTAL_MILESTONE_LEVELS.evolution) {
    const fusion = combat.fusion
    return { stage: 'evolution', source: `Lv.${ELEMENTAL_MILESTONE_LEVELS.evolution}`, options: [
      coreCard('spell_milestone_evolution', fusion.evolved, fusion.evolution,
        '主动基础伤害 +75% · 基础冷却 10 → 8.8 秒 · 范围与演出进化',
        { kind: 'evolution', isEvolution: true, color: fusion.color, icon: '✦' }),
    ] }
  }
  return null
}

function spellFusionOptions(combat) {
  return SPELL_ELEMENT_IDS.filter(id => !combat.elements.has(id)).map(id => {
    const el = SPELL_ELEMENTS[id], fusion = getSpellFusion(new Set([...combat.elements, id]))
    return coreCard(`spell_fuse_${id}`, el.name, el.desc, `融合：${fusion.name} · 空格：${fusion.active}`, { element: id, color: fusion.color, icon: el.icon, fusion, kind: 'fusion', preview: `${fusion.activeDesc} 配色：${fusion.palette.name}。` })
  })
}

export function spellCoreOptions(combat) {
  if (!combat.elements.size) return []
  const options = []
  if (!combat.fusion) {
    for (const id of combat.activeElements) {
      const element = SPELL_ELEMENTS[id], rank = combat.rank(`shape_${id}`)
      if (rank < 3) options.push(coreCard(`shape_${id}`, element.upgrade, element.upgradeDesc,
        `法术改造 ${rank} → ${rank + 1} · 伤害 +12%`, { kind: 'shape', element: id, level: rank, icon: element.icon, color: element.color }))
    }
    for (const [id, name, stats] of [['power', '施法凝聚', '自动法术伤害 +8%'], ['activePower', '原质凝聚', '空格法术伤害 +10%']]) {
      if (options.length < 3) options.push(coreCard(id, name, '继续深化当前元素构筑。', stats, { kind: 'power', level: combat.rank(id) }))
    }
    if (options.length < 3) options.push(coreCard('shield_core', '护盾回充', '恢复法术护盾并缩短重建时间。', '护盾立即恢复 · 重建冷却 −1 秒', { kind: 'shield', icon: '🛡️' }))
    return options.slice(0, 3).map(option => ({ ...option, color: combat.palette().main }))
  }
  const conversion = combat.elements.has('lightning') && combat.cores >= 3 && !combat.lightning.storm
    ? coreCard('lightning_storm', '雷暴转化', '将雷系自动普攻改为空中落雷，优先选择射程内的怪群或精英。命中后继续传导；已学雷系强化、融合与另一系法术全部保留。', '替换雷系普攻形态 · 不增加技能位', { kind: 'form', element: 'lightning', color: SPELL_ELEMENTS.lightning.color, icon: '⚡' }) : null
  for (const id of combat.elements) {
    const el = SPELL_ELEMENTS[id], rank = combat.rank(`shape_${id}`)
    if (rank < 3) options.push(coreCard(`shape_${id}`, el.upgrade, el.upgradeDesc, `融合改造 ${rank} → ${rank + 1} · 每级法术伤害 +12%`, { kind: 'shape', element: id, level: rank, color: el.color, icon: el.icon }))
  }
  const reaction = combat.rank('reaction')
  if (reaction < 3) options.push(coreCard('reaction', `${combat.fusion.name} · 共鸣`, `提高融合伤害与反应频率。${REACTION_SPREAD[combat.fusion.id]}第三级扩大反应范围。`, `共鸣 ${reaction} → ${reaction + 1} · 每级反应伤害 +25%`, { kind: 'reaction', level: reaction }))
  // Core rewards strengthen existing spells and reactions; route ultimates stay in the random level-up pool.
  const shapes = options.filter(s => s.kind === 'shape')
  const selected = [conversion && (combat.cores % 2 === 1 || !shapes.length) ? conversion : shapes.length ? shapes[combat.cores % shapes.length] : null, options.find(s => s.kind === 'reaction')].filter(Boolean)
  if (conversion) options.push(conversion)
  for (const option of options) if (selected.length < 3 && !selected.includes(option)) selected.push(option)
  for (const [id, name, stats] of [['power', '施法凝聚', '自动法术伤害 +8%'], ['reactionPower', '融合凝聚', '融合反应伤害 +10%'], ['activePower', '原质凝聚', '空格法术伤害 +10%']]) {
    if (selected.length < 3) selected.push(coreCard(id, name, '继续深化当前双元素构筑。', stats, { kind: 'power', level: combat.rank(id) }))
  }
  return selected.map(option => ({ ...option, color: combat.palette().main }))
}
