/** Core base-pool upgrades, cross-school cantrips, shield upgrade, and endless arcane mastery. */
import {
  ELEMENTAL_SCHOOLS,
  CROSS_CANTRIP_LIST,
  spellSchoolPower,
  spellMasteryHaste,
  scholarDamageMultiplier,
  fireVolleyCount,
  fireVolleyCompMul,
  fireSizeScale,
  fireHotStreakRadius,
  fireHotStreakDamageMul,
  fireHotStreakPity,
  fireIgniteDotMul,
  fireIgniteVulnMul,
  fireIgniteSpreadRange,
  fireIgniteSpreadTargets,
  fireRainInterval,
  fireRainRadius,
  fireRainDuration,
  fireRainMeteorCount,
  fireRainMeteorDamageMul,
  fireRainScorchCritBonus,
  fireRainScorchSlow,
  fireInfernalBurstScale,
  fireInfernalAuraScale,
  fireInfernalDurationBonus,
  fireActiveCdReduction,
  iceArrowCount,
  iceMultiDamageMul,
  iceShatterCritChance,
  iceShatterRadius,
  iceShatterDamageMul,
  iceLanceDamageMul,
  iceFrostbiteSlow,
  iceFrostbiteDmgMul,
  iceBlizzardInterval,
  iceBlizzardRadius,
  iceBlizzardDuration,
  iceBlizzardTickMul,
  iceBlizzardCdrThreshold,
  iceBlizzardCdrCritMul,
  iceCometCount,
  iceCometScale,
  iceNovaRadiusBonus,
  litSolitaryBonusPerJump,
  litChainJumps,
  litChainReachScale,
  litChainDecayFloor,
  litOverloadChance,
  litOverloadScale,
  litOverloadPity,
  litMaelstromStun,
  litMaelstromThreshold,
  litMaelstromDamageMul,
  litThunderInterval,
  litThunderStrikes,
  litThunderDamageMul,
  litStormCloudRadiusBonus,
  litStormCloudBonusChain,
  litStormCloudVuln,
  litKeeperDurationBonus,
  litKeeperExtraStrikes,
  litKeeperDamageScale,
  poiAgonyCap,
  poiAgonyBoltCount,
  poiAgonyDuration,
  poiContagionRange,
  poiContagionTargets,
  poiContagionGenerations,
  poiContagionInherit,
  poiCurseVuln,
  poiCurseSlow,
  poiCurseMultiDotBonus,
  poiSeedInterval,
  poiSeedRadius,
  poiSeedTickMul,
  poiSeedExplosionMul,
  poiSeedBloomDamageScale,
  poiSeedBloomRadiusBonus,
  poiSeedBloomDurationBonus,
  poiRaptureScale,
} from './ElementalSchools.js'
import { getSoftRankMultiplier } from './SkillProgression.js'

const schoolPowerCaps = Object.freeze({ expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 })
const engineCaps = Object.freeze({ expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 })

const card = (school, id, name, icon, desc, maxLevel, stats, extra = {}) => {
  const def = ELEMENTAL_SCHOOLS[school]
  return {
    id,
    school,
    element: def.element,
    name,
    icon,
    desc,
    maxLevel,
    stats,
    spec: 'elemental',
    isElementalSkill: true,
    tier: extra.requires ? 2 : 1,
    color: def.color,
    tags: [def.short, extra.growthClass === 'core' ? '核心专精' : extra.requires ? '进阶协同' : '法术强化'],
    apply() {},
    ...extra,
  }
}

export const ELEMENTAL_CORE_SKILLS = [
  // ==================== 🔥 火系（7 张） ====================
  card('fire', 'fire_mastery', '烈焰精通', '🔥',
    '提高全部火系法术与点燃伤害、火系暴击率与施法急速；高难及无尽模式具备长跑道成长。', 8,
    lv => {
      const next = lv + 1
      return `火系伤害 +${Math.round((spellSchoolPower(next) - 1) * 100)}% · 火系暴击 +${Math.min(16, next * 2)}% · 施法急速 +${Math.round(spellMasteryHaste(next) * 100)}%`
    },
    { growthClass: 'core', rankCaps: schoolPowerCaps }),

  card('fire', 'fire_volley', '连珠火球', '☄️',
    '增加火球齐射数量并放大爆炸半径；对首领自动聚火，对普通敌人自动分摊覆盖。', 4,
    lv => {
      const next = lv + 1
      const count = fireVolleyCount(next)
      return `每轮火球 ${count} 颗 · 单颗倍率 ${Math.round(fireVolleyCompMul(count) * 100)}% · 爆炸范围 +${Math.round((fireSizeScale(next) - 1) * 100)}%`
    }),

  card('fire', 'fire_hot_streak', '炽热连击', '💥',
    '火系法术暴击积累热力（连续未暴击有保底）；满 2 层自动瞬发超大范围【炎爆术】并附加强力点燃。', 6,
    lv => {
      const next = lv + 1
      return `炎爆伤害 ${Math.round(fireHotStreakDamageMul(next) * 100)}% · 半径 ${fireHotStreakRadius(next)}px · ${fireHotStreakPity(next)} 次未暴击保底叠层`
    },
    { growthClass: 'core', isSignatureEngine: true, rankCaps: engineCaps }),

  card('fire', 'fire_ignite', '余烬蔓延', '🕯️',
    '强化点燃跳伤与炽燃易伤，并使燃烧敌人延迟 0.6 秒点燃近邻（传一代防递归）。', 4,
    lv => {
      const next = lv + 1
      return `点燃跳伤 +${Math.round((fireIgniteDotMul(next) - 1) * 100)}% · 对燃烧目标火伤 +${Math.round((fireIgniteVulnMul(next) - 1) * 100)}% · 蔓延 ${fireIgniteSpreadTargets(next)} 敌/${fireIgniteSpreadRange(next)}px`
    }),

  card('fire', 'fire_rain', '火焰雨', '🌋',
    '周期锁定最密集敌群降下持续流星火雨（上限 2 片），可触发暴击持续喂给炽热连击。', 8,
    lv => {
      const next = lv + 1
      return `每 ${fireRainInterval(next).toFixed(2)}s 降临 · 半径 ${fireRainRadius(next)}px · ${fireRainMeteorCount(next)} 颗火流星 ×${Math.round(fireRainMeteorDamageMul(next) * 100)}%`
    },
    { growthClass: 'core', isAutoAoE: true, rankCaps: engineCaps }),

  card('fire', 'fire_rain_scorch', '焦土烈焰', '🌡️',
    '火焰雨内敌人承受火系暴击率大幅提升，非首领敌人移速降低且持续刷新点燃。', 3,
    lv => {
      const next = lv + 1
      return `火雨内火系暴击 +${Math.round(fireRainScorchCritBonus(next) * 100)}% · 非首领减速 ${Math.round(fireRainScorchSlow(next) * 100)}% · 持续刷新点燃`
    },
    { requires: ['fire_rain'] }),

  card('fire', 'fire_infernal_pact', '地狱火契约', '👹',
    '全面强化空格【召唤地狱火】陨石与殉爆威力、献祭火环伤害、持续时间与冷却循环。', 8,
    lv => {
      const next = lv + 1
      return `陨石/殉爆 +${Math.round((fireInfernalBurstScale(next) - 1) * 100)}% · 献祭 +${Math.round((fireInfernalAuraScale(next) - 1) * 100)}% · 持续 +${fireInfernalDurationBonus(next).toFixed(1)}s · 冷却 −${Math.round(fireActiveCdReduction(next) * 100)}%`
    },
    { growthClass: 'core', isActivePact: true, rankCaps: engineCaps }),

  // ==================== ❄️ 冰系（7 张） ====================
  card('ice', 'ice_mastery', '极寒精通', '❄️',
    '提高全部冰系法术伤害、碎冰暴击伤害与施法急速；高难及无尽模式具备长跑道成长。', 8,
    lv => {
      const next = lv + 1
      return `冰系伤害 +${Math.round((spellSchoolPower(next) - 1) * 100)}% · 碎冰暴伤 +${Math.round(Math.min(0.96, next * 0.12) * 100)}% · 施法急速 +${Math.round(spellMasteryHaste(next) * 100)}%`
    },
    { growthClass: 'core', rankCaps: schoolPowerCaps }),

  card('ice', 'ice_lance_barrage', '多矢穿霜', '🏹',
    '增加寒冰箭直线穿透数量并扩展为扇形齐射；保留单目标每轮仅叠 1 层霜纹的纪律。', 4,
    lv => {
      const next = lv + 1
      const count = iceArrowCount(next)
      return `穿透 ${2 + next} 名敌人 · 每轮 ${count} 支齐射（单支 ${Math.round(iceMultiDamageMul(count) * 100)}%）`
    }),

  card('ice', 'ice_shatter_lance', '碎冰 · 寒冰指', '💠',
    '带霜纹/冻结目标触发碎冰高暴击；叠满 3 层霜纹触发冰晶迸裂并向其射出高伤追踪【冰枪术】（首领挂深冬标记同样吃冰枪）。', 6,
    lv => {
      const next = lv + 1
      return `碎冰暴击 +${Math.round(iceShatterCritChance(next) * 100)}% · 迸裂 ${iceShatterRadius(next)}px (${Math.round(iceShatterDamageMul(next) * 100)}%) · 冰枪 ${Math.round(iceLanceDamageMul(next) * 100)}%`
    },
    { growthClass: 'core', isSignatureEngine: true, rankCaps: engineCaps }),

  card('ice', 'ice_frostbite', '彻骨霜寒', '🥶',
    '深化寒霜减速与脆化增伤，冻结或带深冬标记敌人死亡时炸出 4 枚追踪碎晶收割周围。', 3,
    lv => {
      const next = lv + 1
      return `减速提至 ${Math.round(iceFrostbiteSlow(next) * 100)}% · 带霜纹冰伤 +${Math.round((iceFrostbiteDmgMul(next) - 1) * 100)}% · 死亡爆出 4 碎晶`
    }),

  card('ice', 'ice_blizzard', '暴风雪', '🌨️',
    '周期锁定最密集敌群降下持续暴风雪（上限 2 片），全域强减速并每 0.9 秒叠加霜纹冻结敌阵。', 8,
    lv => {
      const next = lv + 1
      return `每 ${iceBlizzardInterval(next).toFixed(2)}s 降临 · 半径 ${Math.round(iceBlizzardRadius(next))}px · 持续 ${iceBlizzardDuration(next).toFixed(1)}s · 跳伤 ${Math.round(iceBlizzardTickMul(next) * 100)}%`
    },
    { growthClass: 'core', isAutoAoE: true, rankCaps: engineCaps }),

  card('ice', 'ice_blizzard_cdr', '极寒缩冷', '⏳',
    '暴风雪命中敌人稳定缩短空格冷却（受节流防无限），同时提高暴风雪内敌人的碎冰暴伤。', 3,
    lv => {
      const next = lv + 1
      return `暴风雪每命中 ${iceBlizzardCdrThreshold(next)} 人次缩空格冷却 0.25s · 圈内碎冰暴伤 +${Math.round(iceBlizzardCdrCritMul(next) * 100)}%`
    },
    { requires: ['ice_blizzard'] }),

  card('ice', 'ice_comet_mastery', '极寒彗星', '☄️',
    '强化空格【冰霜新星 · 极寒彗星】的彗星数量、单颗伤害、冰环范围与冷却循环。', 8,
    lv => {
      const next = lv + 1
      return `彗星 ${iceCometCount(next)} 颗 · 伤害 +${Math.round((iceCometScale(next) - 1) * 100)}% · 冰环 +${iceNovaRadiusBonus(next)}px · 冷却 −${Math.round(fireActiveCdReduction(next) * 100)}%`
    },
    { growthClass: 'core', isActivePact: true, rankCaps: engineCaps }),

  // ==================== ⚡ 电系（7 张） ====================
  card('lightning', 'lit_mastery', '雷霆精通', '⚡',
    '提高全部雷系法术伤害、施法急速，并加强孤立目标（如单体首领）的剩余跳跃增伤补偿。', 8,
    lv => {
      const next = lv + 1
      return `雷系伤害 +${Math.round((spellSchoolPower(next) - 1) * 100)}% · 单体补偿 +${Math.round(litSolitaryBonusPerJump(next) * 100)}%/跳 · 施法急速 +${Math.round(spellMasteryHaste(next) * 100)}%`
    },
    { growthClass: 'core', rankCaps: schoolPowerCaps }),

  card('lightning', 'lit_chain_reach', '连锁跃迁', '↯',
    '大幅增加闪电链跳跃次数与传导距离，减缓远端伤害衰减，同时顺带拉高首领单体补偿基数。', 4,
    lv => {
      const next = lv + 1
      return `跳跃上限 ${litChainJumps(next)} 敌 · 传导距离 +${Math.round((litChainReachScale(next) - 1) * 100)}% · 每跳保留最低 ${Math.round(litChainDecayFloor(next) * 100)}%`
    }),

  card('lightning', 'lit_overload', '闪电过载', '🌩️',
    '施放闪电链或天罚落雷时按概率自动复制一道高亮过载闪电二连劈（严禁无限递归，带连续未触发保底）。', 6,
    lv => {
      const next = lv + 1
      return `过载触发率 ${Math.round(litOverloadChance(next) * 100)}%（${litOverloadPity(next)} 次保底）· 过载威力 ${Math.round(litOverloadScale(next) * 100)}%`
    },
    { growthClass: 'core', isSignatureEngine: true, rankCaps: engineCaps }),

  card('lightning', 'lit_maelstrom', '静电漩涡', '💫',
    '闪电命中附带短暂麻痹（首领免疫）；每触发多次过载，自动劈下带向心聚怪的必暴【漩涡震击】重创高血目标。', 4,
    lv => {
      const next = lv + 1
      return `麻痹 ${litMaelstromStun(next).toFixed(2)}s · 每 ${litMaelstromThreshold(next)} 次过载聚怪并劈出必暴漩涡雷 ${Math.round(litMaelstromDamageMul(next) * 100)}%`
    }),

  card('lightning', 'lit_thunderstorm', '天罚雷暴', '⛈️',
    '周期在视野敌群与精英头顶连续劈下多道天雷并向外弹出短链，每道天雷皆可独立触发闪电过载！', 8,
    lv => {
      const next = lv + 1
      return `每 ${litThunderInterval(next).toFixed(2)}s 降下 ${litThunderStrikes(next)} 道天雷 · 伤害 ${Math.round(litThunderDamageMul(next) * 100)}% + 外溢电链`
    },
    { growthClass: 'core', isAutoAoE: true, rankCaps: engineCaps }),

  card('lightning', 'lit_storm_cloud', '高压雷云', '🌩️',
    '扩大天罚落雷范围与外溢电链跳跃数，并给受击目标挂上 3 秒感电易伤。', 3,
    lv => {
      const next = lv + 1
      return `落雷半径 +${litStormCloudRadiusBonus(next)}px · 外溢短链 +${litStormCloudBonusChain(next)} 跳 · 感电易伤 +${Math.round(litStormCloudVuln(next) * 100)}%`
    },
    { requires: ['lit_thunderstorm'] }),

  card('lightning', 'lit_keeper_pact', '风暴灌注', '🔋',
    '延长空格【风暴守护者】100% 过载爆发窗、增加开场天雷数与伤害并缩短冷却。', 8,
    lv => {
      const next = lv + 1
      return `超载窗 +${litKeeperDurationBonus(next).toFixed(2)}s · 开场天雷 +${litKeeperExtraStrikes(next)} 道 · 伤害 +${Math.round((litKeeperDamageScale(next) - 1) * 100)}% · 冷却 −${Math.round(fireActiveCdReduction(next) * 100)}%`
    },
    { growthClass: 'core', isActivePact: true, rankCaps: engineCaps }),

  // ==================== ☠️ 毒系（7 张） ====================
  card('poison', 'poi_mastery', '灾厄精通', '☠️',
    '提高全部毒系与瘟疫持续伤害、施法急速，并解锁痛楚等 DoT 跳伤暴击！', 8,
    lv => {
      const next = lv + 1
      return `毒系与 DoT +${Math.round((spellSchoolPower(next) - 1) * 100)}% · DoT 暴击 · 施法急速 +${Math.round(spellMasteryHaste(next) * 100)}%`
    },
    { growthClass: 'core', rankCaps: schoolPowerCaps }),

  card('poison', 'poi_agony_bolt', '双生痛楚', '🧪',
    '提高【痛楚】最高叠层上限与持续时间（满层再命中立即结算额外跳伤）；2 级起腐化箭双发自动分摊或聚火。', 4,
    lv => {
      const next = lv + 1
      return `痛楚叠层上限 ${poiAgonyCap(next)} 层（满层即时跳伤）· 持续 ${poiAgonyDuration(next).toFixed(1)}s · 每次 ${poiAgonyBoltCount(next)} 枚`
    }),

  card('poison', 'poi_contagion', '瘟疫传染', '☣️',
    '染疫敌人在短暂延迟或阵亡瞬间，将全部在身 DoT 传染给附近未感染敌人（每帧预算受控防卡顿）。', 6,
    lv => {
      const next = lv + 1
      return `范围 ${poiContagionRange(next)}px · 每次传 ${poiContagionTargets(next)} 敌 · 最多 ${poiContagionGenerations(next)} 代 · 继承 ${Math.round(poiContagionInherit(next) * 100)}%`
    },
    { growthClass: 'core', isSignatureEngine: true, rankCaps: engineCaps }),

  card('poison', 'poi_curse', '衰弱诅咒', '🟣',
    '使染疫目标附带衰弱诅咒：减速、全易伤，且身上每多 1 种独立瘟疫（痛楚/腐蚀/诅咒/无常）毒伤再叠乘。', 4,
    lv => {
      const next = lv + 1
      return `全易伤 +${Math.round(poiCurseVuln(next) * 100)}% · 减速 ${Math.round(poiCurseSlow(next) * 100)}% · 每种 DoT 毒伤 +${Math.round(poiCurseMultiDotBonus(next) * 100)}%`
    }),

  card('poison', 'poi_seed', '腐蚀之种', '🫛',
    '周期向密集怪群抛掷腐蚀之种展开毒瘴（上限 3 片）施加独立腐蚀 DoT；区域内承伤达标或死亡时引发剧烈【种爆】！', 8,
    lv => {
      const next = lv + 1
      return `每 ${poiSeedInterval(next).toFixed(2)}s 播撒 · 半径 ${poiSeedRadius(next)}px · 跳伤 ${Math.round(poiSeedTickMul(next) * 100)}% · 种爆 ${Math.round(poiSeedExplosionMul(next) * 100)}%`
    },
    { growthClass: 'core', isAutoAoE: true, rankCaps: engineCaps }),

  card('poison', 'poi_seed_bloom', '连环种爆', '🌫️',
    '强化腐蚀之种的种爆伤害、爆炸半径与毒瘴持续时间，每片毒瘴额外多引爆 1 次种爆。', 3,
    lv => {
      const next = lv + 1
      return `种爆伤害 +${Math.round((poiSeedBloomDamageScale(next) - 1) * 100)}% · 半径 +${poiSeedBloomRadiusBonus(next)}px · 持续 +${poiSeedBloomDurationBonus(next).toFixed(1)}s（+1 次种爆）`
    },
    { requires: ['poi_seed'] }),

  card('poison', 'poi_rapture_pact', '灾厄深渊', '💀',
    '强化空格【灾厄狂欢】的多重 DoT 引爆倍率、引爆后的外溢强制传染波次与冷却循环。', 8,
    lv => {
      const next = lv + 1
      return `狂欢引爆 +${Math.round((poiRaptureScale(next) - 1) * 100)}% · 外溢强制传染 ${next >= 4 ? 2 : 1} 轮 · 冷却 −${Math.round(fireActiveCdReduction(next) * 100)}%`
    },
    { growthClass: 'core', isActivePact: true, rankCaps: engineCaps }),
]

// ==================== 跨系基础法术书（单局最多兼修 2 门） ====================
export const ELEMENTAL_CANTRIP_SKILLS = CROSS_CANTRIP_LIST.map(def => ({
  id: def.id,
  school: def.school,
  element: def.element,
  name: def.name,
  icon: def.icon,
  color: def.color,
  desc: def.desc,
  stats: def.stats,
  spec: 'elemental',
  isElementalSkill: true,
  isCantrip: true,
  tier: 1,
  maxLevel: 1,
  weight: 0.42,
  tags: ['跨系基础', ELEMENTAL_SCHOOLS[def.school].short],
  apply(game) {
    game.weaponSystem?.spellCombat?.learnCantrip?.(def.school)
  },
}))

// ==================== 共享护盾与无尽奥秘 ====================
export const ELEMENTAL_SHIELD_SKILL = {
  id: 'spell_shield',
  name: '法术护盾',
  icon: '🛡️',
  spec: 'elemental',
  isElementalSkill: true,
  tier: 1,
  maxLevel: 3,
  weight: 0.78,
  color: '#84d6e8',
  tags: ['元素·防御', '本系护盾'],
  desc: '强化当前主专精的专属法术护盾（烈焰护体 / 寒冰护体 / 闪电之盾 / 灵魂榨取）：缩短破盾重建并提升容量与破盾反制。',
  stats(lv) {
    const next = lv + 1
    if (next === 1) return '破盾重建 7.0 → 6.0 秒 · 全面强化本系护盾特效'
    if (next === 2) return '护盾容量 1 → 2 点 · 未满时每 10 秒回复 1 点'
    return '重建 6.0 → 5.0 秒 · 触发本系护盾满级强化特效'
  },
  apply(game) {
    game.weaponSystem?.spellCombat?.shield?.upgrade?.()
  },
}

export const ELEMENTAL_ENDLESS_SKILL = {
  id: 'ele_endless_arcane',
  name: '无尽奥秘',
  icon: '∞',
  spec: 'elemental',
  isElementalSkill: true,
  isEndlessMastery: true,
  growthClass: 'endless',
  kind: 'common',
  tier: 3,
  maxLevel: Infinity,
  weight: 0.42,
  color: '#c9b4ff',
  tags: ['无尽精通', '奥秘法强'],
  desc: '无尽模式专属成长：每级强化全法术（含主系、大法术、召唤物、DoT 与跨系基础）伤害，收益平滑趋近软上限。',
  stats(lv) {
    const total = (getSoftRankMultiplier(lv + 1, 0.045, 5, 1.5) - 1) * 100
    return `累计全法术伤害 +${total.toFixed(1)}%（上限趋近 +50%）`
  },
  apply() {},
}

export const ELEMENTAL_ALL_BASE_SKILLS = [
  ...ELEMENTAL_CORE_SKILLS,
  ...ELEMENTAL_CANTRIP_SKILLS,
  ELEMENTAL_SHIELD_SKILL,
  ELEMENTAL_ENDLESS_SKILL,
]

export const ELEMENTAL_SKILL_BY_ID = Object.fromEntries(ELEMENTAL_ALL_BASE_SKILLS.map(s => [s.id, s]))

export { spellSchoolPower, scholarDamageMultiplier }

export function prioritizeSpellChoices(candidates = []) {
  return candidates
}

export function spellSkillAvailable(skill, game) {
  const combat = game.weaponSystem?.spellCombat
  if (!skill) return false
  if (skill.isCantrip) {
    return !!combat?.school && skill.school !== combat.school && !combat.crossCantrips.includes(skill.school)
  }
  if (skill.school && combat?.school && skill.school !== combat.school) return false
  return !skill.requires || skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0)
}
