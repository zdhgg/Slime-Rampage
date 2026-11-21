/**
 * Elemental Slime v2 build progression:
 * - Lv.2 picks 1 of 4 independent schools (fire / ice / lightning / poison)
 * - Lv.3 guarantees at least 1 signature engine or auto-AoE unlock card
 * - Cross-school cantrips appear at most 1 per roll and max 2 per run (3rd stops appearing)
 * - Wave 6 / Stage 3 triggers a 2-choice branch ascendancy within the chosen school
 * - Lv.14 + Wave 10 / Stage 5 + investment >= 4 unlocks the branch's exclusive ultimate
 */
import { getEffectiveSkillMaxLevel } from './SkillProgression.js'
import {
  MAX_CROSS_CANTRIPS,
  ELEMENTAL_BUILD_RULES,
  ELEMENTAL_SCHOOLS,
  ELEMENTAL_BRANCHES,
  fireDestMeteorScale,
  fireDestImmolateVuln,
  fireDestImmolateRadiusBonus,
  firePyroStreakScale,
  firePyroRefundChance,
  firePyroCombustDuration,
  firePyroCombustCrit,
  firePyroCombustHaste,
  iceStormHailHaste,
  iceStormHailDamageScale,
  iceStormVeinsDuration,
  iceStormVeinsHaste,
  iceShatterFlurryScale,
  iceShatterFlurryCadence,
  iceShatterDeepCritMul,
  litOverEchoScale,
  litOverEchoSecondChance,
  litOverArcCritStep,
  litSkyBarrageScale,
  litSkyBarrageExtra,
  litSkyTotemDuration,
  litSkyTotemDamageMul,
  poiPanBurstRadius,
  poiPanBurstDamageMul,
  poiPanSpreadDamageMul,
  poiAffSiphonChance,
  poiAffSiphonShieldDmg,
  poiAffAgonyTickMul,
  poiAffAgonyBossBonus,
} from './ElementalSchools.js'
import { ELEMENTAL_ENDLESS_SKILL } from './ElementalUpgrades.js'
import { resolveElementalSkill } from './SpellRules.js'

export { ELEMENTAL_BUILD_RULES }

export const ELEMENTAL_ROUTES = ELEMENTAL_BRANCHES

const branchSkillCaps = Object.freeze({ expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 })

const branchSkill = (id, name, branchId, maxLevel, desc, stats, apply, extra = {}) => {
  const b = ELEMENTAL_BRANCHES[branchId]
  return {
    id,
    name,
    spec: 'elemental',
    school: b.school,
    route: branchId,
    branch: branchId,
    kind: 'advanced',
    maxLevel,
    desc,
    stats,
    isElementalSkill: true,
    growthClass: 'core',
    rankCaps: branchSkillCaps,
    tier: 3,
    weight: 0.88,
    icon: b.icon,
    color: b.color,
    tags: ['升华进阶', b.short],
    apply,
    ...extra,
  }
}

const branchUltimate = (branchId) => {
  const b = ELEMENTAL_BRANCHES[branchId]
  return {
    id: b.ultimate,
    name: `🌟 ${b.ultimateName}`,
    spec: 'elemental',
    school: b.school,
    route: branchId,
    branch: branchId,
    kind: 'ultimate',
    maxLevel: 1,
    isElementalSkill: true,
    isCapstone: true,
    isBranchUltimate: true,
    tier: 4,
    weight: 0.72,
    icon: b.icon,
    color: b.color,
    tags: ['互斥终极', b.ultimateName],
    desc: b.ultimateDesc,
    stats: () => `互斥终极 · ${b.name}完全体觉醒`,
    apply(game) {
      game.weaponSystem.spellCombat.branchUltimate = b.ultimate
    },
  }
}

export const ELEMENTAL_BRANCH_SKILLS = [
  // 🔥 火系分支 A：毁灭术士
  branchSkill('fire_dest_cataclysm', '焦炎倾泻', 'fire_destruction', 8,
    '火焰雨上限升至 3 片且提升流星伤害；火雨内敌人阵亡有概率在死处追加一枚小流星（不递归）。',
    lv => {
      const next = lv + 1
      return `火雨上限 3 片 · 流星伤害 +${Math.round((fireDestMeteorScale(next) - 1) * 100)}% · 45% 概率死处追击流星`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('fire_dest_immolate', '深渊献祭', 'fire_destruction', 8,
    '地狱火献祭环给圈内敌人施加火焰易伤，地狱火击杀敌人可延长存在并放大殉爆半径。',
    lv => {
      const next = lv + 1
      return `火环内火伤 +${Math.round(fireDestImmolateVuln(next) * 100)}% · 每 4 杀延寿 0.6s · 殉爆半径 +${fireDestImmolateRadiusBonus(next)}px`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // 🔥 火系分支 B：烈焰大法师
  branchSkill('fire_pyro_streak', '烈焰连涌', 'fire_pyromancer', 8,
    '大幅强化炎爆术威力；炎爆触发暴击时有概率立刻返还 1 层热力迸发，形成连续二连炎爆。',
    lv => {
      const next = lv + 1
      return `炎爆伤害 +${Math.round((firePyroStreakScale(next) - 1) * 100)}% · 炎爆暴击 ${Math.round(firePyroRefundChance(next) * 100)}% 返还热力`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('fire_pyro_combust', '引燃爆裂', 'fire_pyromancer', 8,
    '释放空格地狱火后获得持续数秒的【微燃】爆发窗，期间火系暴击率与施法急速大幅提升。',
    lv => {
      const next = lv + 1
      return `微燃窗 ${firePyroCombustDuration(next).toFixed(1)}s：火系暴击 +${Math.round(firePyroCombustCrit(next) * 100)}% · 施法间隔 −${Math.round(firePyroCombustHaste(next) * 100)}%`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ❄️ 冰系分支 A：极寒风暴
  branchSkill('ice_storm_hail', '冰雹肆虐', 'ice_storm', 8,
    '加快暴风雪跳伤频率并提高单跳伤害；每片暴风雪消散瞬间在全圈引爆一次寒冰新星迸裂。',
    lv => {
      const next = lv + 1
      return `跳伤频率 +${Math.round(iceStormHailHaste(next) * 100)}% · 单跳伤害 +${Math.round((iceStormHailDamageScale(next) - 1) * 100)}% · 消散爆裂`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('ice_storm_veins', '冰冷血脉', 'ice_storm', 8,
    '释放空格后开启【冰冷血脉】，大幅缩短全部自动法术的施放间隔并提升移动速度。',
    lv => {
      const next = lv + 1
      return `冰冷血脉 ${iceStormVeinsDuration(next).toFixed(1)}s：施法间隔 −${Math.round(iceStormVeinsHaste(next) * 100)}% · 移速 +15%`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ❄️ 冰系分支 B：碎冰狙杀
  branchSkill('ice_shatter_flurry', '冰风暴连携', 'ice_shatter', 8,
    '全面提升冰枪术与冰晶迸裂伤害；寒冰箭每数轮额外免费附赠 1 枚追踪冰枪。',
    lv => {
      const next = lv + 1
      return `冰枪/迸裂伤害 +${Math.round((iceShatterFlurryScale(next) - 1) * 100)}% · 每 ${iceShatterFlurryCadence(next)} 轮寒冰箭附赠冰枪`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('ice_shatter_deep', '深冬裂创', 'ice_shatter', 8,
    '大幅提高对冻结与深冬标记目标的碎冰暴伤；彗星命中冻结或深冬目标时触发额外 75px 碎冰震波。',
    lv => {
      const next = lv + 1
      return `碎冰暴伤再 +${Math.round(iceShatterDeepCritMul(next) * 100)}% · 彗星命中碎冰触发 75px 二次震波`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ⚡ 电系分支 A：元素过载
  branchSkill('lit_over_echo', '超导连劈', 'lit_overdrive', 8,
    '提高过载闪电威力，且触发过载时有概率追加第二道 60% 威力的超导余震（深度封顶 2，绝不无限递归）。',
    lv => {
      const next = lv + 1
      return `过载威力 +${Math.round((litOverEchoScale(next) - 1) * 100)}% · ${Math.round(litOverEchoSecondChance(next) * 100)}% 概率追加三重超导余震`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('lit_over_arc', '高压电弧', 'lit_overdrive', 8,
    '电链每跳跃一次递增暴伤（孤立单体按剩余跳数同步折算）；电弧击杀目标时在死处释放 75px 静电爆。',
    lv => {
      const next = lv + 1
      return `每跳暴伤递增 +${Math.round(litOverArcCritStep(next) * 100)}%（单体同享）· 击杀炸开 75px 静电爆`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ⚡ 电系分支 B：风暴天罚
  branchSkill('lit_sky_barrage', '雷霆万钧', 'lit_skyfury', 8,
    '大幅提高天罚雷暴落雷伤害并增加每次落雷道数；落雷命中感电目标时炸开 90px 雷爆余波。',
    lv => {
      const next = lv + 1
      return `落雷伤害 +${Math.round((litSkyBarrageScale(next) - 1) * 100)}% · 每次额外 +${litSkyBarrageExtra(next)} 道 · 感电目标炸开 90px 余波`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('lit_sky_totem', '风暴图腾', 'lit_skyfury', 8,
    '释放空格时立起【天怒图腾】，提升光环内法术暴伤与施法急速，并每隔 1.2 秒自动劈下 2 道过载天雷。',
    lv => {
      const next = lv + 1
      return `图腾存在 ${litSkyTotemDuration(next).toFixed(1)}s · 圈内暴伤 +35%＋急速 +15% · 每 1.2s 劈 2 道 ${Math.round(litSkyTotemDamageMul(next) * 100)}% 过载雷`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ☠️ 毒系分支 A：灾厄瘟疫
  branchSkill('poi_pan_burst', '疫骸爆裂', 'poi_pandemic', 8,
    '放大染疫敌人阵亡时的疫骸爆裂范围与伤害，且每次疫骸爆裂击杀缩短灾厄狂欢冷却。',
    lv => {
      const next = lv + 1
      return `疫骸爆裂 ${poiPanBurstRadius(next)}px · 伤害 ${Math.round(poiPanBurstDamageMul(next) * 100)}% · 击杀缩空格 CD 0.12s`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('poi_pan_spread', '大瘟疫蔓延', 'poi_pandemic', 8,
    '传染最大代数 +1、每次目标数 +1，且瘟疫传染的幽绿飞丝对路径触碰敌人造成暗影割伤。',
    lv => {
      const next = lv + 1
      return `传染代数 +1 · 每次目标 +1 · 传染路径暗影割伤 ${Math.round(poiPanSpreadDamageMul(next) * 100)}%`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // ☠️ 毒系分支 B：噬魂诅咒
  branchSkill('poi_aff_siphon', '生命虹吸', 'poi_affliction', 8,
    '瘟疫跳伤有概率凝聚灵魂碎片，攒满 25 枚恢复 1 点生命或补满 1 层护盾；护盾存在时提高毒系伤害。',
    lv => {
      const next = lv + 1
      return `跳伤 ${Math.round(poiAffSiphonChance(next) * 100)}% 凝魂回血/补盾（12s 内冷）· 有盾期间毒伤 +${Math.round(poiAffSiphonShieldDmg(next) * 100)}%`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill1Level = level }),

  branchSkill('poi_aff_agony', '无常折磨', 'poi_affliction', 8,
    '对痛楚 ≥5 层的敌人自动附加独立第三 DoT【痛苦无常】，且灾厄狂欢对首领与精英伤害剧增。',
    lv => {
      const next = lv + 1
      return `附加痛苦无常每跳 ${Math.round(poiAffAgonyTickMul(next) * 100)}% · 狂欢对首领/精英伤害 +${Math.round(poiAffAgonyBossBonus(next) * 100)}%`
    },
    (game, level) => { game.weaponSystem.spellCombat.branchSkill2Level = level }),

  // 8 互斥终极
  branchUltimate('fire_destruction'),
  branchUltimate('fire_pyromancer'),
  branchUltimate('ice_storm'),
  branchUltimate('ice_shatter'),
  branchUltimate('lit_overdrive'),
  branchUltimate('lit_skyfury'),
  branchUltimate('poi_pandemic'),
  branchUltimate('poi_affliction'),
]

export const ELEMENTAL_ROUTE_SKILLS = ELEMENTAL_BRANCH_SKILLS
export const ELEMENTAL_ROUTE_SKILL_BY_ID = Object.fromEntries(ELEMENTAL_BRANCH_SKILLS.map(skill => [skill.id, skill]))

const branchSkillIds = Object.freeze({
  fire_destruction: ['fire_rain', 'fire_infernal_pact', 'fire_dest_cataclysm', 'fire_dest_immolate'],
  fire_pyromancer: ['fire_hot_streak', 'fire_infernal_pact', 'fire_pyro_streak', 'fire_pyro_combust'],
  ice_storm: ['ice_blizzard', 'ice_comet_mastery', 'ice_storm_hail', 'ice_storm_veins'],
  ice_shatter: ['ice_shatter_lance', 'ice_comet_mastery', 'ice_shatter_flurry', 'ice_shatter_deep'],
  lit_overdrive: ['lit_overload', 'lit_keeper_pact', 'lit_over_echo', 'lit_over_arc'],
  lit_skyfury: ['lit_thunderstorm', 'lit_keeper_pact', 'lit_sky_barrage', 'lit_sky_totem'],
  poi_pandemic: ['poi_seed', 'poi_rapture_pact', 'poi_pan_burst', 'poi_pan_spread'],
  poi_affliction: ['poi_contagion', 'poi_rapture_pact', 'poi_aff_siphon', 'poi_aff_agony'],
})

export function elementalRouteInvestment(game, branch = game.weaponSystem?.spellCombat?.branch) {
  return (branchSkillIds[branch] || []).reduce((sum, id) => sum + (game.skillLevels?.[id] || 0), 0)
}

export function elementalProgressReady(game, ultimate = false) {
  const rules = ELEMENTAL_BUILD_RULES
  return game.runSelection?.mode === 'expedition'
    ? (game.expeditionStage || 1) >= (ultimate ? rules.ultimateStage : rules.branchStage)
    : (game.enemyManager?.wave || 1) >= (ultimate ? rules.ultimateWave : rules.branchWave)
}

export function elementalRouteReady(game) {
  const state = game.weaponSystem?.spellCombat
  return game.startingStrain === 'elemental' && !!state?.school && !state?.branch &&
    (state?.normalChoices || 0) >= ELEMENTAL_BUILD_RULES.choicesBeforeBranch && elementalProgressReady(game, false)
}

export function elementalRouteOptions(game) {
  const schoolId = game.weaponSystem?.spellCombat?.school || 'fire'
  const school = ELEMENTAL_SCHOOLS[schoolId] || ELEMENTAL_SCHOOLS.fire
  return school.branches.map(branchId => {
    const branch = ELEMENTAL_BRANCHES[branchId]
    return {
      ...branch,
      id: `ele_route_${branch.id}`,
      route: branch.id,
      branch: branch.id,
      school: school.id,
      schoolName: school.name,
      spec: 'elemental',
      tier: 2,
      isMilestone: true,
      isElementalRoute: true,
      milestoneType: 'elemental',
      locked: false,
      investment: elementalRouteInvestment(game, branch.id),
    }
  })
}

export function elementalBuildNote(game) {
  const state = game.weaponSystem?.spellCombat
  const school = ELEMENTAL_SCHOOLS[state?.school]
  const branch = ELEMENTAL_BRANCHES[state?.branch]
  if (!school) return 'Lv.2 从火、冰、电、毒四条专精中选择本局主修方向。'
  if (!branch) {
    return `${school.name} · 选卡满 ${ELEMENTAL_BUILD_RULES.choicesBeforeBranch} 次且第 ${ELEMENTAL_BUILD_RULES.branchWave} 波／远征第 ${ELEMENTAL_BUILD_RULES.branchStage} 章确认本系升华分支。`
  }
  if (state.branchUltimate) {
    return `${school.name} · ${branch.name}已锁定 · 终极【${branch.ultimateName}】已觉醒`
  }
  const ready = (game.player?.level || 1) >= ELEMENTAL_BUILD_RULES.ultimateLevel && elementalProgressReady(game, true)
  return `${school.name} · ${branch.name} · 投入 ${elementalRouteInvestment(game)}/${ELEMENTAL_BUILD_RULES.ultimateInvestment} · ${ready ? '互斥终极已进入随机池' : '终极需 Lv.14＋第 10 波／远征第 5 章'}`
}

export function elementalSkillAvailable(game, skill) {
  const state = game.weaponSystem?.spellCombat
  if (!skill || game.startingStrain !== 'elemental' || skill.originOnly) return false
  const level = game.skillLevels?.[skill.id] || 0
  const role = skill.kind === 'common' || skill.isCantrip ? 'common'
    : skill.kind === 'ultimate' || skill.growthClass === 'core' ? 'primary' : 'common'
  if (!skill.isEndlessMastery && level >= getEffectiveSkillMaxLevel(game, skill, role)) return false
  if (skill.isEndlessMastery) return game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25
  if (skill.kind === 'common') return true
  if (skill.id === 'spell_shield') return true
  if (!state?.school) return false
  if (skill.isCantrip) {
    return skill.school !== state.school &&
      !state.crossCantrips.includes(skill.school) &&
      state.crossCantrips.length < MAX_CROSS_CANTRIPS &&
      level === 0
  }
  if (skill.kind === 'ultimate') {
    return state.branch === skill.branch &&
      (game.player?.level || 1) >= ELEMENTAL_BUILD_RULES.ultimateLevel &&
      elementalProgressReady(game, true) &&
      elementalRouteInvestment(game) >= ELEMENTAL_BUILD_RULES.ultimateInvestment &&
      !ELEMENTAL_BRANCH_SKILLS.some(entry => entry.isCapstone && (game.skillLevels?.[entry.id] || 0) > 0)
  }
  if (skill.kind === 'advanced') {
    return !!state.branch && skill.branch === state.branch
  }
  if (skill.school && skill.school !== state.school) return false
  if (skill.requires?.length && !skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0)) return false
  return true
}

export function elementalSkillOptions(game, elementSkills, commonSkills, count = 3, random = Math.random) {
  if (count <= 0) return []
  if (elementalRouteReady(game)) return elementalRouteOptions(game)
  const state = game.weaponSystem?.spellCombat
  const levels = game.skillLevels || {}
  const seenIds = new Set()
  const pool = [
    ...elementSkills,
    ...commonSkills.filter(skill => !skill.originOnly).map(skill => ({ ...skill, kind: 'common' })),
    ELEMENTAL_ENDLESS_SKILL,
  ].filter(skill => {
    if (!skill?.id || seenIds.has(skill.id)) return false
    seenIds.add(skill.id)
    return elementalSkillAvailable(game, skill)
  })

  if (state?.branch) {
    pool.push(...ELEMENTAL_BRANCH_SKILLS.filter(skill => elementalSkillAvailable(game, skill)))
  }

  const weight = skill => (skill.weight || 1) * Math.min(
    ELEMENTAL_BUILD_RULES.maxWeightBoost,
    (levels[skill.id] ? ELEMENTAL_BUILD_RULES.ownedWeight : 1) *
    (state?.branch && skill.branch === state.branch ? ELEMENTAL_BUILD_RULES.routeWeight : 1)
  )

  const toCard = skill => {
    const resolved = resolveElementalSkill(skill, game)
    const level = levels[resolved.id] || 0
    const role = resolved.kind === 'common' || resolved.isCantrip || resolved.growthClass !== 'core' ? 'common' : 'primary'
    return {
      ...resolved,
      level,
      role,
      progressionRole: role,
      maxLevel: getEffectiveSkillMaxLevel(game, resolved, role),
      stats: typeof resolved.stats === 'function' ? resolved.stats(level, game) : resolved.stats || '',
      buildNote: elementalBuildNote(game),
    }
  }

  const choices = []
  let hasCantrip = false
  const limitOneCantrip = count <= 6
  while (pool.length && choices.length < count) {
    const eligible = limitOneCantrip && hasCantrip ? pool.filter(s => !s.isCantrip) : pool
    if (!eligible.length) break
    let ticket = random() * eligible.reduce((sum, skill) => sum + weight(skill), 0)
    let index = 0
    while (index < eligible.length - 1 && (ticket -= weight(eligible[index])) > 0) index++
    const picked = eligible[index]
    pool.splice(pool.indexOf(picked), 1)
    if (picked.isCantrip) hasCantrip = true
    choices.push(toCard(picked))
  }

  // Periodic shield candidate on Lv.3, 8, 13... without clobbering Lv.3 engine guarantee.
  if ((game.player?.level || 0) % 5 === 3 && !choices.some(skill => skill.id === 'spell_shield')) {
    const shield = elementSkills.find(skill => skill.id === 'spell_shield' && elementalSkillAvailable(game, skill))
    if (shield && choices.length) {
      const replaceIdx = [...choices].reverse().findIndex(c => !c.isSignatureEngine && !c.isAutoAoE)
      const targetIdx = replaceIdx >= 0 ? choices.length - 1 - replaceIdx : choices.length - 1
      choices[targetIdx] = toCard(shield)
    }
  }

  // Lv.3 guarantee: first normal upgrade after picking a school guarantees at least 1 core engine or auto-AoE card.
  if (state?.school && (state.normalChoices || 0) === 0 && !state.branch && choices.length > 0 &&
      !choices.some(c => c.isSignatureEngine || c.isAutoAoE)) {
    const engineCandidates = pool.filter(s => s.isSignatureEngine || s.isAutoAoE)
    if (engineCandidates.length) {
      const guaranteed = engineCandidates[Math.min(engineCandidates.length - 1, Math.floor(random() * engineCandidates.length))]
      const slotIdx = choices.findIndex(c => c.id !== 'spell_shield')
      choices[slotIdx >= 0 ? slotIdx : 0] = toCard(guaranteed)
    }
  }

  return choices
}

export function elementalRouteSkillIds(branch) {
  return branchSkillIds[branch] || []
}
