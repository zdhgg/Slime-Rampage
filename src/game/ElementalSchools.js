/**
 * Elemental Slime v2: Four independent mage/warlock specializations (fire / ice / lightning / poison),
 * cross-school cantrips (up to 2 per run), and 8 mid-game ascendancy branches.
 *
 * Shared numeric formulas live here so combat execution and card tooltips never drift.
 */
import { BASE_SPELL_PALETTES } from './SpellPalette.js'

export const MAX_CROSS_CANTRIPS = 2

export const ELEMENTAL_BUILD_RULES = Object.freeze({
  choicesBeforeBranch: 5,
  branchWave: 6,
  branchStage: 3,
  ultimateLevel: 14,
  ultimateWave: 10,
  ultimateStage: 5,
  ultimateInvestment: 4,
  ownedWeight: 1.28,
  routeWeight: 1.22,
  maxWeightBoost: 1.5,
  scholarBonusPerCantrip: 0.08,
})

export const ELEMENTAL_SCHOOL_IDS = Object.freeze(['fire', 'ice', 'lightning', 'poison'])

export const schoolToElement = id => (id === 'ice' ? 'water' : id)
export const elementToSchool = id => (id === 'water' ? 'ice' : id)
export const normalizeSpellSchool = id => {
  const mapped = elementToSchool(id)
  return ELEMENTAL_SCHOOL_IDS.includes(mapped) ? mapped : 'fire'
}

export const spellSchoolPower = level => {
  const n = Math.max(0, Math.floor(Number(level) || 0))
  return 1 + Math.min(3, n) * 0.2 + (n > 3 ? 0.35 * (1 - 0.82 ** (n - 3)) : 0)
}

export const spellMasteryHaste = level => Math.min(0.24, Math.max(0, Math.floor(Number(level) || 0)) * 0.03)

export const scholarDamageMultiplier = cantripCount =>
  1 + Math.min(MAX_CROSS_CANTRIPS, Math.max(0, Math.floor(Number(cantripCount) || 0))) * ELEMENTAL_BUILD_RULES.scholarBonusPerCantrip

// ==================== Shared School Formulas ====================

// Fire
export const fireVolleyCount = lv => 1 + Math.min(2, Math.ceil(Math.max(0, lv) / 2))
export const fireVolleyCompMul = count => 0.84 ** Math.max(0, count - 1)
export const fireSizeScale = lv => 1 + Math.max(0, lv) * 0.14
export const fireHotStreakRadius = lv => (lv > 0 ? 92 + Math.max(0, lv) * 6 : 78)
export const fireHotStreakDamageMul = lv => (lv > 0 ? Math.min(3.2, 2.05 + Math.max(0, lv) * 0.23) : 1.75)
export const fireHotStreakPity = lv => (lv > 0 ? Math.max(2, 5 - Math.ceil(Math.max(0, lv) / 2)) : 5)
export const fireIgniteDotMul = lv => 1 + Math.max(0, lv) * 0.22
export const fireIgniteVulnMul = lv => (lv > 0 ? 1 + Math.min(0.32, 0.08 + lv * 0.06) : 1)
export const fireIgniteSpreadRange = lv => 100 + Math.max(0, lv) * 20
export const fireIgniteSpreadTargets = lv => (lv >= 3 ? 2 : 1)
export const fireRainInterval = lv => Math.max(3.2, 5.6 - Math.max(0, lv) * 0.28)
export const fireRainRadius = lv => Math.min(188, 120 + Math.max(0, lv) * 8)
export const fireRainDuration = lv => Math.min(4.8, 3.0 + Math.max(0, lv) * 0.22)
export const fireRainMeteorCount = lv => 2 + (lv >= 5 ? 1 : 0)
export const fireRainMeteorDamageMul = lv => Math.min(1.45, 0.72 + Math.max(0, lv) * 0.09)
export const fireRainScorchCritBonus = lv => (lv > 0 ? 0.1 + lv * 0.08 : 0)
export const fireRainScorchSlow = lv => (lv > 0 ? 0.15 + lv * 0.05 : 0)
export const fireInfernalBurstScale = lv => 1 + Math.min(1.2, Math.max(0, lv) * 0.15)
export const fireInfernalAuraScale = lv => 1 + Math.min(1.12, Math.max(0, lv) * 0.14)
export const fireInfernalDurationBonus = lv => Math.min(4.0, Math.max(0, lv) * 0.5)
export const fireActiveCdReduction = lv => Math.min(0.28, Math.max(0, lv) * 0.035)
export const fireDestMeteorScale = lv => (lv > 0 ? 1 + Math.min(0.8, 0.16 + lv * 0.08) : 1)
export const fireDestImmolateVuln = lv => (lv > 0 ? Math.min(0.36, 0.12 + lv * 0.03) : 0)
export const fireDestImmolateRadiusBonus = lv => Math.min(64, Math.max(0, lv) * 8)
export const firePyroStreakScale = lv => (lv > 0 ? 1 + Math.min(0.7, 0.16 + lv * 0.08) : 1)
export const firePyroRefundChance = lv => (lv > 0 ? Math.min(0.35, 0.12 + lv * 0.035) : 0)
export const firePyroCombustDuration = lv => (lv > 0 ? 4.0 + Math.min(2.4, lv * 0.3) : 0)
export const firePyroCombustCrit = lv => (lv > 0 ? Math.min(0.5, 0.18 + lv * 0.04) : 0)
export const firePyroCombustHaste = lv => (lv > 0 ? Math.min(0.24, 0.08 + lv * 0.02) : 0)

// Ice
export const iceArrowCount = lv => (lv >= 4 ? 3 : lv >= 2 ? 2 : 1)
export const iceMultiDamageMul = count => 0.84 ** Math.max(0, count - 1)
export const iceFanAngle = Math.PI / 28
export const iceShatterCritChance = lv => (lv > 0 ? Math.min(0.42, 0.12 + lv * 0.05) : 0.08)
export const iceShatterRadius = lv => (lv > 0 ? 65 + Math.max(0, lv) * 8 : 55)
export const iceShatterDamageMul = lv => (lv > 0 ? 0.85 + Math.max(0, lv) * 0.15 : 0.72)
export const iceLanceDamageMul = lv => (lv > 0 ? Math.min(3.0, 1.5 + Math.max(0, lv) * 0.25) : 1.25)
export const iceFrostbiteSlow = lv => (lv >= 3 ? 0.65 : lv === 2 ? 0.55 : lv === 1 ? 0.45 : 0.35)
export const iceFrostbiteDmgMul = lv => (lv > 0 ? 1 + [0, 0.12, 0.2, 0.28][Math.min(3, lv)] : 1)
export const iceBlizzardInterval = lv => Math.max(3.4, 5.8 - Math.max(0, lv) * 0.3)
export const iceBlizzardRadius = lv => Math.min(206, 130 + Math.max(0, lv) * 9.5)
export const iceBlizzardDuration = lv => Math.min(5.4, 3.4 + Math.max(0, lv) * 0.25)
export const iceBlizzardTickMul = lv => Math.min(1.15, 0.52 + Math.max(0, lv) * 0.08)
export const iceBlizzardCdrThreshold = lv => Math.max(2, 5 - Math.max(0, lv))
export const iceBlizzardCdrCritMul = lv => (lv > 0 ? [0, 0.15, 0.25, 0.35][Math.min(3, lv)] : 0)
export const iceCometCount = lv => 4 + Math.min(3, Math.floor((Math.max(0, lv) + 1) / 2))
export const iceCometScale = lv => 1 + Math.min(1.12, Math.max(0, lv) * 0.14)
export const iceNovaRadiusBonus = lv => Math.max(0, lv) * 10
export const iceStormHailHaste = lv => (lv > 0 ? Math.min(0.32, 0.08 + lv * 0.03) : 0)
export const iceStormHailDamageScale = lv => (lv > 0 ? 1 + Math.min(0.84, 0.2 + lv * 0.08) : 1)
export const iceStormVeinsDuration = lv => (lv > 0 ? 4.0 + Math.min(2.4, lv * 0.3) : 0)
export const iceStormVeinsHaste = lv => (lv > 0 ? Math.min(0.34, 0.14 + lv * 0.025) : 0)
export const iceShatterFlurryScale = lv => (lv > 0 ? 1 + Math.min(1.1, 0.22 + lv * 0.11) : 1)
export const iceShatterFlurryCadence = lv => Math.max(2, 5 - Math.floor(Math.max(0, lv) / 2))
export const iceShatterDeepCritMul = lv => (lv > 0 ? Math.min(0.85, 0.26 + lv * 0.08) : 0)

// Lightning
export const litSolitaryBonusPerJump = masteryLv => 0.12 + Math.max(0, masteryLv) * 0.02
export const litChainJumps = lv => 3 + Math.max(0, lv)
export const litChainReachScale = lv => 1 + Math.max(0, lv) * 0.18
export const litChainDecayFloor = lv => Math.min(0.92, 0.84 + Math.max(0, lv) * 0.02)
export const litOverloadChance = lv => (lv > 0 ? Math.min(0.72, 0.28 + lv * 0.07) : 0.18)
export const litOverloadScale = lv => (lv > 0 ? Math.min(1.05, 0.7 + lv * 0.05) : 0.6)
export const litOverloadPity = lv => (lv > 0 ? Math.max(2, 4 - Math.floor(Math.max(0, lv) / 3)) : 4)
export const litMaelstromStun = lv => (lv > 0 ? 0.18 + lv * 0.06 : 0)
export const litMaelstromThreshold = lv => Math.max(3, 6 - Math.floor(Math.max(0, lv) / 2))
export const litMaelstromDamageMul = lv => Math.min(3.4, 1.8 + Math.max(0, lv) * 0.4)
export const litThunderInterval = lv => Math.max(2.8, 5.2 - Math.max(0, lv) * 0.3)
export const litThunderStrikes = lv => 3 + Math.min(2, Math.floor(Math.max(0, lv) / 3))
export const litThunderDamageMul = lv => Math.min(2.1, 1.15 + Math.max(0, lv) * 0.12)
export const litStormCloudRadiusBonus = lv => [0, 15, 30, 45][Math.min(3, Math.max(0, lv))] || 0
export const litStormCloudBonusChain = lv => Math.min(3, Math.max(0, lv))
export const litStormCloudVuln = lv => (lv > 0 ? [0, 0.1, 0.16, 0.22][Math.min(3, lv)] : 0)
export const litKeeperDurationBonus = lv => Math.min(2.8, Math.max(0, lv) * 0.35)
export const litKeeperExtraStrikes = lv => Math.min(3, Math.floor((Math.max(0, lv) + 1) / 2))
export const litKeeperDamageScale = lv => 1 + Math.min(1.12, Math.max(0, lv) * 0.14)
export const litOverEchoScale = lv => (lv > 0 ? 1 + Math.min(0.56, 0.14 + lv * 0.0525) : 1)
export const litOverEchoSecondChance = lv => (lv > 0 ? Math.min(0.45, 0.13 + lv * 0.04) : 0)
export const litOverArcCritStep = lv => (lv > 0 ? Math.min(0.18, 0.04 + lv * 0.0175) : 0)
export const litSkyBarrageScale = lv => (lv > 0 ? 1 + Math.min(1.04, 0.24 + lv * 0.1) : 1)
export const litSkyBarrageExtra = lv => (lv > 0 ? Math.min(3, Math.ceil(lv / 3)) : 0)
export const litSkyTotemDuration = lv => (lv > 0 ? 5.0 + Math.min(2.4, lv * 0.3) : 0)
export const litSkyTotemDamageMul = lv => Math.min(2.1, 1.0 + Math.max(0, lv) * 0.14)

// Poison
export const poiAgonyCap = (lv, branch = null) => 5 + Math.max(0, lv) + (branch === 'poi_affliction' ? 3 : 0)
export const poiAgonyBoltCount = lv => (lv >= 2 ? 2 : 1)
export const poiAgonyDuration = lv => 4.5 + Math.max(0, lv) * 0.5
export const poiContagionRange = lv => 120 + Math.max(0, lv) * 18
export const poiContagionTargets = (lv, branchSpread = 0) => 1 + Math.min(3, Math.ceil(Math.max(0, lv) / 2)) + (branchSpread > 0 ? 1 : 0)
export const poiContagionGenerations = (lv, branchSpread = 0) => (lv >= 4 ? 3 : lv >= 2 ? 2 : 1) + (branchSpread > 0 ? 1 : 0)
export const poiContagionInherit = (lv, branch = null) => {
  const base = Math.min(1.0, 0.7 + Math.max(0, lv) * 0.05)
  return branch === 'poi_pandemic' ? Math.max(0.9, base) : base
}
export const poiCurseVuln = lv => (lv > 0 ? Math.min(0.32, 0.08 + lv * 0.06) : 0)
export const poiCurseSlow = lv => (lv > 0 ? 0.12 + lv * 0.04 : 0)
export const poiCurseMultiDotBonus = lv => Math.max(0, lv) * 0.04
export const poiSeedInterval = lv => Math.max(3.0, 5.2 - Math.max(0, lv) * 0.28)
export const poiSeedRadius = lv => Math.min(182, 110 + Math.max(0, lv) * 9)
export const poiSeedTickMul = lv => Math.min(1.05, 0.45 + Math.max(0, lv) * 0.075)
export const poiSeedExplosionMul = lv => Math.min(2.6, 1.35 + Math.max(0, lv) * 0.16)
export const poiSeedBloomDamageScale = lv => (lv > 0 ? 1 + [0, 0.25, 0.45, 0.65][Math.min(3, lv)] : 1)
export const poiSeedBloomRadiusBonus = lv => [0, 20, 35, 50][Math.min(3, Math.max(0, lv))] || 0
export const poiSeedBloomDurationBonus = lv => [0, 1.0, 1.8, 2.6][Math.min(3, Math.max(0, lv))] || 0
export const poiRaptureScale = lv => 1 + Math.min(1.12, Math.max(0, lv) * 0.14)
export const poiPanBurstRadius = lv => 80 + Math.min(56, Math.max(0, lv) * 7)
export const poiPanBurstDamageMul = lv => Math.min(2.2, 0.95 + Math.max(0, lv) * 0.155)
export const poiPanSpreadDamageMul = lv => Math.min(1.1, 0.45 + Math.max(0, lv) * 0.08)
export const poiAffSiphonChance = lv => (lv > 0 ? Math.min(0.24, 0.08 + lv * 0.02) : 0)
export const poiAffSiphonShieldDmg = lv => (lv > 0 ? Math.min(0.36, 0.12 + lv * 0.03) : 0)
export const poiAffAgonyTickMul = lv => Math.min(1.5, 0.65 + Math.max(0, lv) * 0.105)
export const poiAffAgonyBossBonus = lv => (lv > 0 ? Math.min(0.72, 0.24 + lv * 0.06) : 0)

// ==================== School & Branch Catalogs ====================

export const ELEMENTAL_SCHOOLS = Object.freeze({
  fire: {
    id: 'fire',
    element: 'fire',
    name: '烈焰毁灭',
    short: '火系',
    icon: '🔥',
    color: BASE_SPELL_PALETTES.fire.main,
    palette: BASE_SPELL_PALETTES.fire,
    primarySpell: {
      name: '火球术',
      interval: 1.05,
      desc: '发射追踪火球命中产生范围爆炸并点燃目标，天生自带【炽热连击】雏形（暴击或保底满 2 层瞬发炎爆）；对首领自动聚火。',
    },
    activeSpell: {
      name: '召唤地狱火',
      cooldown: 11.0,
      desc: '天降陨石眩晕敌群并唤醒具备熔岩减伤护甲的地狱火傀儡：嘲讽普通敌人、展开献祭火环，到期或破碎时轰然殉爆；施放同时推进护盾重建 2 秒。',
    },
    shield: {
      name: '烈焰护体',
      desc: '破盾瞬间炸开烈焰环击退并点燃近敌，同时直接赠送炽热连击热力。',
    },
    engineSummary: '炽热连击（开局自带暴击瞬发炎爆）＋ 火焰雨智能锁敌洗地',
    branches: ['fire_destruction', 'fire_pyromancer'],
  },
  ice: {
    id: 'ice',
    element: 'water',
    name: '极寒御法',
    short: '冰系',
    icon: '❄️',
    color: BASE_SPELL_PALETTES.water.main,
    palette: BASE_SPELL_PALETTES.water,
    primarySpell: {
      name: '寒冰箭',
      interval: 0.9,
      desc: '高速直线穿透寒冰箭，叠加霜纹并在满 3 层时天生触发碎冰迸裂与追踪冰枪；对带霜纹首领/精英额外 +20% 碎冰穿透伤害。',
    },
    activeSpell: {
      name: '冰霜新星 · 极寒彗星',
      cooldown: 10.5,
      desc: '贴身释放冰霜新星冻结并推开近敌，同时召唤极寒彗星砸向敌群触发碎冰核爆；施放同时推进护盾重建 2 秒。',
    },
    shield: {
      name: '寒冰护体',
      desc: '重建冷却更短（−1 秒），破盾时炸开小型冰霜新星直接冻结贴身普通敌人。',
    },
    engineSummary: '碎冰·寒冰指（开局自带 3 层霜纹爆冰枪）＋ 暴风雪减速弹幕缩冷',
    branches: ['ice_storm', 'ice_shatter'],
  },
  lightning: {
    id: 'lightning',
    element: 'lightning',
    name: '雷霆过载',
    short: '电系',
    icon: '⚡',
    color: BASE_SPELL_PALETTES.lightning.main,
    palette: BASE_SPELL_PALETTES.lightning,
    primarySpell: {
      name: '闪电链',
      interval: 0.95,
      desc: '瞬发多跳高频电弧，天生自带 18% 基础【闪电过载】（4 次保底二连劈）；面对孤立首领自动转化剩余跳跃为高额单体聚焦增伤。',
    },
    activeSpell: {
      name: '风暴守护者',
      cooldown: 10.5,
      desc: '放出雷霆新星震退麻痹近敌并降下多道天雷，随后进入【风暴超载】窗口让闪电过载 100% 触发；施放同时推进护盾重建 2 秒。',
    },
    shield: {
      name: '闪电之盾',
      desc: '护盾存在时即周期电击贴近敌人；破盾反劈闪电链并获得 1.5 秒高额移速爆发。',
    },
    engineSummary: '闪电过载（开局自带基础连劈）＋ 漩涡聚怪与天罚雷暴',
    branches: ['lit_overdrive', 'lit_skyfury'],
  },
  poison: {
    id: 'poison',
    element: 'poison',
    name: '瘟疫灾厄',
    short: '毒系',
    icon: '☠️',
    color: BASE_SPELL_PALETTES.poison.main,
    palette: BASE_SPELL_PALETTES.poison,
    primarySpell: {
      name: '腐化箭',
      interval: 0.88,
      desc: '发射追踪暗绿毒箭叠加【痛楚】（满层再命中立即结算额外跳伤），染疫敌人阵亡天生向近邻初染扩散。',
    },
    activeSpell: {
      name: '灾厄狂欢',
      cooldown: 10.0,
      desc: '按全场敌人的痛楚层数与瘟疫种数同步引爆暗绿毒爆，且不消耗反刷新全额 DoT 计时，触发强制传染并推进护盾重建 2 秒。',
    },
    shield: {
      name: '灵魂榨取',
      desc: '瘟疫跳伤与染疫击杀持续缩短法术护盾重建时间，持续输出即续航。',
    },
    engineSummary: '瘟疫初染/双轨传染 ＋ 腐蚀之种（DoT 持续蓄能引爆）',
    branches: ['poi_pandemic', 'poi_affliction'],
  },
})

export const ELEMENTAL_BRANCHES = Object.freeze({
  fire_destruction: {
    id: 'fire_destruction',
    school: 'fire',
    name: '毁灭术士',
    short: '毁灭',
    icon: '☄️',
    color: '#ff7b54',
    grantSkill: 'fire_rain',
    desc: '强化火焰雨铺场洗地与地狱火傀儡联动，将战场化作烈焰焦土。',
    bonus: '升华质变：未学【火焰雨】立刻免费获得 Lv.1（已学则火雨每波 +1 陨石）；地狱火落地脚下自动展开满效火焰雨，献祭火环半径 +30px、傀儡生命 +40%。',
    skills: ['焦炎倾泻', '深渊献祭'],
    ultimate: 'fire_dest_ultimate',
    ultimateName: '深渊浩劫',
    ultimateDesc: '召唤地狱火进化为「深渊领主」：开场连续砸下两颗错峰陨石，存在期间周期发射追踪流星雨，殉爆触发双层烈焰冲击。',
  },
  fire_pyromancer: {
    id: 'fire_pyromancer',
    school: 'fire',
    name: '烈焰大法师',
    short: '火法',
    icon: '🔥',
    color: '#ffb066',
    grantSkill: 'fire_hot_streak',
    desc: '专注暴击触发瞬发炎爆与燃烧窗口，打出高频率火法核爆循环。',
    bonus: '升华质变：未学【炽热连击】立刻免费获得 Lv.1；火系基础暴伤 +0.45×；每次炎爆命中留下 2.5 秒焦土火圈并缩短空格冷却 0.6 秒（1.2s 内冷）。',
    skills: ['烈焰连涌', '引燃爆裂'],
    ultimate: 'fire_pyro_ultimate',
    ultimateName: '燃世燃烧',
    ultimateDesc: '释放空格后进入 5.5 秒完全体【燃烧】：全火系法术 100% 必暴，炎爆命中立刻引爆目标剩余点燃总伤的 55%（不消耗点燃）。',
  },
  ice_storm: {
    id: 'ice_storm',
    school: 'ice',
    name: '极寒风暴',
    short: '暴风雪',
    icon: '🌨️',
    color: '#73d3f7',
    grantSkill: 'ice_blizzard',
    desc: '扩大暴风雪全域控场并高速刷取大招冷却，压制全屏怪潮与弹幕。',
    bonus: '升华质变：未学【暴风雪】立刻免费获得 Lv.1（已学则范围 +25px）；暴风雪上限 2 → 3 片，且暴风雪内敌方普通弹幕飞行速度 −30%。',
    skills: ['冰雹肆虐', '冰冷血脉'],
    ultimate: 'ice_storm_ultimate',
    ultimateName: '寒冰宝珠',
    ultimateDesc: '释放空格时同步推出一颗缓慢碾压敌阵 5 秒的【寒冰宝珠】，沿途高频喷射碎冰并连发免费冰枪，期间暴风雪缩冷效率翻倍。',
  },
  ice_shatter: {
    id: 'ice_shatter',
    school: 'ice',
    name: '碎冰狙杀',
    short: '碎冰',
    icon: '💎',
    color: '#a8ebff',
    grantSkill: 'ice_shatter_lance',
    desc: '专注寒冰指双发冰枪与深冬碎裂高额暴击伤害，极致单点斩杀首领。',
    bonus: '升华质变：未学【碎冰·寒冰指】立刻免费获得 Lv.1；触发寒冰指时发射双连发冰枪（副枪 70% 伤），冰枪穿透 +1 且对首领伤害 +20%。',
    skills: ['冰风暴连携', '深冬裂创'],
    ultimate: 'ice_shatter_ultimate',
    ultimateName: '冰川尖刺',
    ultimateDesc: '空格彗星收尾时凝聚一根横贯全屏的巨型【冰川尖刺】，优先锁定首领/精英贯穿造成 5.5× 必暴碎冰重击并爆出超大冰晶碎裂。',
  },
  lit_overdrive: {
    id: 'lit_overdrive',
    school: 'lightning',
    name: '元素过载',
    short: '过载',
    icon: '⚡',
    color: '#f5dc78',
    grantSkill: 'lit_overload',
    desc: '拉满闪电过载触发率与电弧跳跃数，用高频二连/三连劈撕裂整片战场。',
    bonus: '升华质变：未学【闪电过载】立刻免费获得 Lv.1（已学则基础过载率 +12%）；过载闪电额外 +1 跳且暴击率 +15%，每次过载缩短空格冷却 0.15 秒。',
    skills: ['超导连劈', '高压电弧'],
    ultimate: 'lit_over_ultimate',
    ultimateName: '超导雷网',
    ultimateDesc: '风暴超载期间三重过载触发率升至 100%，且命中 ≥3 敌的电链会在目标间留下持续 1.2 秒的残留高压电网切割敌人。',
  },
  lit_skyfury: {
    id: 'lit_skyfury',
    school: 'lightning',
    name: '风暴天罚',
    short: '天罚',
    icon: '🌩️',
    color: '#a9d3ff',
    grantSkill: 'lit_thunderstorm',
    desc: '呼唤高频天罚落雷、感电静电场与天怒图腾，轰炸密集怪群与首领。',
    bonus: '升华质变：未学【天罚雷暴】立刻免费获得 Lv.1（已学则冷却 −20%）；天罚落雷自动优先精英/首领并留下 1.5 秒减速静电场。',
    skills: ['雷霆万钧', '风暴图腾'],
    ultimate: 'lit_sky_ultimate',
    ultimateName: '苍穹雷狱',
    ultimateDesc: '天怒图腾进化为跟随玩家的【苍穹风暴核】（持续 6.5 秒），每秒向全屏 4 名敌人降下必过载链雷并刷新感电易伤。',
  },
  poi_pandemic: {
    id: 'poi_pandemic',
    school: 'poison',
    name: '灾厄瘟疫',
    short: '瘟疫',
    icon: '☣️',
    color: '#9ee86b',
    grantSkill: 'poi_seed',
    desc: '强化腐蚀之种、无衰减全屏瘟疫传染与疫骸连环殉爆，主打极致割草清屏。',
    bonus: '升华质变：未学【腐蚀之种】立刻免费获得 Lv.1（已学则毒瘴上限 3 → 4 片）；染疫敌人死亡原地炸开 80px 疫骸爆（0.85×），传染继承率保底 90%。',
    skills: ['疫骸爆裂', '大瘟疫蔓延'],
    ultimate: 'poi_pan_ultimate',
    ultimateName: '瘟疫天灾',
    ultimateDesc: '释放灾厄狂欢后 5.5 秒内，全场全部瘟疫跳伤速度翻倍（间隔 ×0.5），且染疫死亡必触发无衰减 130px 天灾殉爆。',
  },
  poi_affliction: {
    id: 'poi_affliction',
    school: 'poison',
    name: '噬魂诅咒',
    short: '诅咒',
    icon: '👁️',
    color: '#c18ef2',
    grantSkill: 'poi_contagion',
    desc: '堆叠高层痛楚、多重 DoT 诅咒与灵魂虹吸，召唤邪能黑眼融化首领血线。',
    bonus: '升华质变：未学【瘟疫传染】立刻免费获得 Lv.1；痛楚叠层上限额外 +3，腐化箭命中首领/精英直接叠 2 层痛楚，灵魂榨取效率 +50%。',
    skills: ['生命虹吸', '无常折磨'],
    ultimate: 'poi_aff_ultimate',
    ultimateName: '邪能黑眼',
    ultimateDesc: '释放灾厄狂欢时召唤持续 6 秒的【邪能黑眼】：立刻延长全场所有 DoT 4 秒，每秒凝视血量最高 3 名敌人使其全 DoT 额外放大 65% 立即跳伤。',
  },
})

export const CROSS_CANTRIPS = Object.freeze({
  cantrip_fire: {
    id: 'cantrip_fire',
    school: 'fire',
    element: 'fire',
    name: '基础：火球术',
    icon: '🔥',
    color: BASE_SPELL_PALETTES.fire.main,
    interval: 2.2,
    desc: '跨系修习火系基础火球：自动发射火球爆开 54px 范围并点燃敌人，使其 3 秒内承受主系法术暴击率 +6%。',
    stats: () => '2.2s 发射 · 54px 爆炸 0.95× · 主系暴击 +6% · 主系伤害 +8%',
  },
  cantrip_ice: {
    id: 'cantrip_ice',
    school: 'ice',
    element: 'water',
    name: '基础：寒冰箭',
    icon: '❄️',
    color: BASE_SPELL_PALETTES.water.main,
    interval: 2.0,
    desc: '跨系修习冰系基础寒冰箭：射出穿透 3 名敌人的冰箭减速 35%，并使目标 3 秒内承受主系法术伤害 +6%。',
    stats: () => '2.0s 发射 · 穿透 3 敌 0.85× · 减速 35%＋主系 +6% · 主系伤害 +8%',
  },
  cantrip_lightning: {
    id: 'cantrip_lightning',
    school: 'lightning',
    element: 'lightning',
    name: '基础：闪电链',
    icon: '⚡',
    color: BASE_SPELL_PALETTES.lightning.main,
    interval: 2.0,
    desc: '跨系修习电系基础闪电链：瞬发弹跳 3 名敌人的电弧，命中立刻为下一次主系施法缩短冷却 0.15 秒。',
    stats: () => '2.0s 瞬发 · 3 跳电弧 0.80× · 导流缩主施法 0.15s · 主系伤害 +8%',
  },
  cantrip_poison: {
    id: 'cantrip_poison',
    school: 'poison',
    element: 'poison',
    name: '基础：腐化箭',
    icon: '☠️',
    color: BASE_SPELL_PALETTES.poison.main,
    interval: 1.9,
    desc: '跨系修习毒系基础腐化箭：追踪敌人附加中毒并使其 3.5 秒内承受你的主系法术伤害 +10%。',
    stats: () => '1.9s 追踪 · 0.60× + 3s 中毒 · 主系易伤 +10% · 主系伤害 +8%',
  },
})

export const ELEMENTAL_BRANCH_IDS = Object.freeze(Object.keys(ELEMENTAL_BRANCHES))
export const CROSS_CANTRIP_LIST = Object.freeze(Object.values(CROSS_CANTRIPS))
