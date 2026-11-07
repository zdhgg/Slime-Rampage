import { BOSS_TOMES, rollBossTomes } from './BossTomes.js'
import { PET_SPEC_INFO, PET_SKILLS, PET_PARTNER_SKILLS } from './PetSkills.js'
import { setCritSource } from './CritSources.js'
import { ELEMENTAL_SKILLS, ELEMENTAL_SPEC_INFO, resolveElementalSkill } from './SpellRules.js'
import { spellSkillAvailable, prioritizeSpellChoices } from './ElementalUpgrades.js'
import { SHADOW_EXTRA_SKILLS, SHADOW_SKILL_VARIANTS, SHADOW_SPEC_INFO, resolveShadowSkill } from './ShadowSkills.js'
import { SHADOW_ROUTES, getShadowSkill, rollShadowSkills } from './ShadowBuild.js'
import { getOriginActiveGrowth, getPrimalOverloadProfile } from './PrimalEnergy.js'
import { rollRicochetSkills, RICOCHET_SPEC_INFO, RICOCHET_ROUTES } from './RicochetRules.js'
import { CORE_SKILL_RANK_CAPS, getEffectiveSkillMaxLevel, getSoftRankMultiplier, applyRankMultiplier } from './SkillProgression.js'
import { ENDLESS_SKILLS } from './EndlessSkills.js'
import { GLUTTON_ROUTES, rollGluttonSkills } from './GluttonBuild.js'
import { rollSymbiosisSkills } from './SymbiosisBuild.js'
import { elementalSkillOptions } from './ElementalBuild.js'
/**
 * 技能池：流派化专精技能体系（阶段式里程碑觉醒架构）
 *
 * 核心升级节奏：
 *  - Lv. 1 ~ 4【初生自由探索期】：三系 T1 基础技能 + 通用生存技能全部开放，自由混搭尝试，绝不锁定流派；
 *  - Lv. 5【主专精觉醒里程碑】：触发「主专精觉醒仪式」——角色血统自动觉醒本树，
 *    origin（祖细胞拟态）五系血统并排陈列，拟态选定后获得该血统机制层；
 *  - Lv. 6 ~ 8【主专精深潜期】：主专精解锁 T2、T3 进阶技能，通用池持续兜底；
 *  - Lv. 9【副专精共鸣里程碑】：原生从其余四系选择副专精，立即获得一项基础共鸣；
 *  - Lv. 10+【深潜与终极觉醒】：主专精开放 T4 终极质变大招（Capstone），副专精开放专属共鸣挂件。
 */

/**
 * 加特林母体觉醒的射速乘数（乘算语义，取值来自固定快照消融实验）。
 * 间隔 = 觉醒前间隔 × 0.40（即"缩短 60%"），弹体吞吐跃迁约 2.7×。
 * 刻意保持为「乘数」而非目标间隔：任何前期射速投入（血统 ×1.2 惩罚、
 * gat_multishot 每级 ×0.85）都会以同等比例延续到觉醒之后。
 */
export const GATLING_CAPSTONE_RATE = 0.4

/**
 * 觉醒文案里「缩短 X%」的唯一派生来源。
 * desc / stats / roadmap 三处都必须经它取值——否则以后调整 GATLING_CAPSTONE_RATE
 * 时，写死的那几处会静默漂移（本常量上一版就踩过这个坑）。
 */
export const getGatlingCapstoneCutPercent = () => Math.round((1 - GATLING_CAPSTONE_RATE) * 100)

export const SPEC_INFO = {
  symbiosis: PET_SPEC_INFO,
  gluttony: {
    key: 'gluttony',
    name: '暴食巨兽',
    icon: '🦖',
    color: '#ff9f43',
    desc: '近战冲撞 · 胃袋吞噬 · 自愈肉盾',
    bonus: '👑 觉醒赋能：吞噬阈值提升至 28% · 生命上限 +1',
    roadmap: [
      'T1: 深渊胃囊 (吞噬与猎食点强化) / 硬化甲壳 (生命与捕食护甲)',
      'T2: 腐蚀重碾 (主动技能冷却大幅缩短 & 重咬伤害与范围强化)',
      'T3: 胃酸迸发 (吞噬触发近身酸液爆发)',
      '🌟 终极觉醒: 荒古吞噬领主 (体型+30% · 咬击范围/伤害+25% · 重咬与冲撞吞噬半血猎物)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【坚韧肉壁(生命上限)】与【消化代谢(吞噬恢复+减伤)】',
  },
  gatling: {
    key: 'gatling',
    name: '机枪风暴',
    icon: '🌪️',
    color: '#00d2d3',
    desc: '全屏弹幕 · 极速连射 · 有丝分裂',
    bonus: '👑 觉醒赋能：齐射飞弹 +1 · 基础射速 +15%',
    roadmap: [
      'T1: 多重喷射腔 (齐射弹数) / 喷射增压 (弹速伤害)',
      'T2: 有丝分裂 (命中 100% 分裂 2 枚小弹)',
      'T3: 连锁弹射 (分裂微弹穿透弹射 2 次)',
      `🌟 终极觉醒: 加特林风暴母体 (射击间隔 -${getGatlingCapstoneCutPercent()}% · 齐射 +2 · 全屏飞弹强力追踪)`,
    ],
    subBonus: '🥈 副专精共鸣：解锁【增压副弹夹(弹数+1/弹速+75%)】与【动能穿透(穿透+2)】',
  },
  elemental: {
    key: 'elemental',
    name: '元素炼金',
    icon: '🔮',
    color: '#a29bfe',
    desc: '四系附魔 · 反应扩散 · 传染核爆',
    bonus: '👑 觉醒赋能：四系附魔概率 +20% · 反应伤害 +35%',
    roadmap: [
      'T1: 四象亲和 (四系附魔概率) / 反应共鸣 (复合反应增伤)',
      'T2: 瘟疫传染 (死者异常状态 100% 扩散给周围 8 个目标)',
      'T3: 元素过载 (反应额外引发爆轰震荡波)',
      '🌟 终极觉醒: 四象混沌原质 (命中同时触发四系全反应 · 召唤混沌引力黑洞)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【元素共鸣体(反应伤害+90%)】与【霜火护体(自动冻结引燃贴脸怪)】',
  },
  assassin: {
    key: 'assassin',
    name: '暗影刺客',
    icon: '🗡️',
    color: '#ff3838',
    desc: '5倍暴击 · 瞬身假人 · 影分身斩',
    bonus: '👑 觉醒赋能：暴击率提升至 25% · 暴击伤害倍率提升至 3.5x',
    roadmap: [
      'T1: 致命锋芒 (暴击率 55%) / 暗影疾行 (移速与主动技能冷却)',
      'T2: 穿心绞杀 (暴击倍率提升至 5.0 倍) / 裂影横斩 (暗影血统：暴击近身群攻)',
      'T3: 残影替身 (主动技能留下暗影假人嘲讽怪海 2.5 秒)',
      '🌟 终极觉醒: 暗影无相主宰 (暴击召唤暗影分身交叉斩 · 主动隐匿且下次必暴)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【弱点洞悉(残血暴伤翻倍)】与【影袭连环(击杀移速爆发)】',
  },
}

export const SKILL_DATABASE = {
  symbiosis: PET_SKILLS,
  // ==========================================
  // 1. 暴食巨兽流 (Gluttony)
  // ==========================================
  gluttony: {
    primary: [
      {
        id: 'glut_maw',
        spec: 'gluttony',
        tier: 1,
        name: '深渊胃囊',
        icon: '🕳️',
        desc: '提高吞噬线与吸附范围，加快吞噬和近战命中首领的猎食点获取',
        tags: ['暴食·T1', '吞噬'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv, game) {
          const rank = lv + 1
          const threshold = Math.min(40, 24 + rank * 4)
          const radius = Math.min(3, 1 + rank * 0.2)
          const charge = Math.min(150, rank * 20)
          // 首领充能走近战普攻命中——拟态 origin 无普攻咬击，该通道不生效，不承诺。
          const bossPart = game?.startingStrain === 'origin' ? '' : ` · 首领充能 +${Math.min(200, Math.round(rank * 100 / 3))}%`
          return `吞噬阈值 ${threshold}% · 吸附 +${Math.round((radius - 1) * 100)}% · 吞噬充能 +${charge}%${bossPart}`
        },
        apply(game, lv) {
          game.devourThreshold = Math.min(0.4, 0.24 + lv * 0.04)
          game.player.devourRadiusBonus = Math.min(3, 1 + lv * 0.2)
        },
      },
      {
        id: 'glut_bulk',
        spec: 'gluttony',
        tier: 1,
        name: '硬化甲壳',
        icon: '🛡️',
        desc: '增加生命上限，延长吞噬或重咬命中首领后的一层护甲；护甲抵挡 1 点伤害，每 2.5 秒最多获得一次',
        tags: ['暴食·T1', '体魄'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv, game) {
          return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1} · 捕食护甲 ${Math.min(4.8, 1.6 + (lv + 1) * 0.4).toFixed(1)} 秒`
        },
        apply(game) {
          game.player.maxHp += 1
          game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1)
          game.player.gluttonGuardDuration = Math.min(4.8, game.player.gluttonGuardDuration + 0.4)
        },
      },
      {
        id: 'glut_ram',
        spec: 'gluttony',
        // 裂颚路线的种子入口：与深渊胃囊、硬化甲壳同级开放，保证 Lv.1~4 探索期
        // 三条路线都摸得到 seed。进阶门槛留给胃酸迸发等 T3 技能，不压在入口上。
        tier: 1,
        name: '腐蚀重碾',
        icon: '🚜',
        desc: '强化重咬的伤害与范围',
        tags: ['暴食·T1', '重咬'], maxLevel: 3, growthClass: 'core',
        stats(lv) { const rank = lv + 1; return `重咬伤害 +${rank * 15}% · 范围 +${rank * 10}%` },
        apply(game, lv) { game.player.gluttonHeavyLevel = lv },
      },
      {
        id: 'glut_eruption',
        spec: 'gluttony',
        tier: 3,
        requires: ['glut_ram'],
        name: '胃酸迸发',
        icon: '🧪',
        desc: '吞噬或重咬命中首领后，在身边爆发酸液并减速普通敌人；密集触发合并，每 0.4 秒最多一次',
        tags: ['暴食·T3', '酸液'],
        maxLevel: 2,
        stats(lv) {
          return `近身酸爆 ${[100, 110][lv]}px · 伤害 ×${[1, 1.35][lv]} · 减速 0.7 秒`
        },
        apply(game, lv) {
          game.player.devourAcidBurst = lv
        },
      },
      {
        id: 'glut_capstone',
        spec: 'gluttony',
        tier: 4,
        isCapstone: true,
        requires: ['glut_eruption'],
        name: '🌟 荒古吞噬领主',
        icon: '👑',
        desc: '体型增大 30%，咬击延伸范围与伤害 +25%；重咬将命中后半血以下的血肉敌人直接吞噬，首领充能加快！',
        tags: ['终极觉醒', '暴食领主'],
        maxLevel: 1,
        stats() {
          return '咬击范围/伤害 +25% · 重咬半血吞噬 · 首领充能 8 次'
        },
        apply(game) {
          game.player.isGluttonyLord = true
          game.player.radius *= 1.3
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 荒古吞噬领主 觉醒!', null, '#ff9f43', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'glut_sub_armor',
        spec: 'gluttony',
        name: '坚韧肉壁',
        icon: '🧱',
        desc: '生命上限 +1 并立即回满生命',
        tags: ['暴食共鸣', '生命'],
        maxLevel: 3,
        stats(lv, game) {
          return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1}`
        },
        apply(game) {
          game.player.maxHp += 1
          game.player.hp = game.player.maxHp
        },
      },
      {
        id: 'glut_sub_digest',
        spec: 'gluttony',
        name: '消化代谢',
        icon: '🍖',
        desc: '吞噬恢复 1 点生命（与其他吞噬恢复共用 4 秒间隔），并获得 3 秒减伤',
        tags: ['暴食共鸣', '自愈'],
        maxLevel: 2,
        stats(lv) {
          return `吞噬回血 +1（4 秒间隔）· 减伤 ${lv === 0 ? 15 : 25}%`
        },
        apply(game, lv) {
          game.player.devourHeal = true
          game.player.devourDamageReduction = lv === 1 ? 0.15 : 0.25
        },
      },
    ],
  },

  // ==========================================
  // 2. 机枪风暴流 (Gatling)
  // ==========================================
  gatling: {
    primary: [
      {
        id: 'gat_multishot',
        spec: 'gatling',
        tier: 1,
        name: '多重喷射腔',
        icon: '🔱',
        desc: '额外喷射黏液飞弹，并缩短射击间隔',
        tags: ['机枪·T1', '弹幕'],
        maxLevel: 3,
        stats(lv, game) {
          const n = game.weaponSystem.projectileCount
          return `弹数 ${n} → ${n + 1} · 射速 +15%`
        },
        apply(game) {
          game.weaponSystem.projectileCount += 1
          game.weaponSystem.fireInterval *= 0.85
        },
      },
      {
        id: 'gat_velocity',
        spec: 'gatling',
        tier: 1,
        name: '喷射增压',
        icon: '💨',
        desc: '飞弹速度与伤害协同提升',
        tags: ['机枪·T1', '弹速'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv, game) {
          const v = Math.round(game.weaponSystem.projectileSpeed)
          const speedRatio = getSoftRankMultiplier(lv + 1, 0.2, 3, 2.1) / getSoftRankMultiplier(lv, 0.2, 3, 2.1)
          const damageRatio = getSoftRankMultiplier(lv + 1, 0.15, 3, 1.9) / getSoftRankMultiplier(lv, 0.15, 3, 1.9)
          return `弹速 ${v} → ${Math.round(v * speedRatio)} · 伤害 ×${damageRatio.toFixed(2)}`
        },
        apply(game, lv) {
          applyRankMultiplier(game.weaponSystem, 'projectileSpeed', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.2, 3, 2.1))
          applyRankMultiplier(game.weaponSystem, 'damage', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.15, 3, 1.9))
        },
      },
      {
        id: 'gat_split',
        spec: 'gatling',
        tier: 2,
        requires: ['gat_multishot', 'gat_velocity'],
        name: '有丝分裂',
        icon: '💥',
        desc: '飞弹命中敌人后必定迸发分裂小弹追踪临近目标',
        tags: ['机枪·T2', '分裂'],
        maxLevel: 3,
        stats(lv) {
          const rate = [40, 70, 100][lv] || 100
          return `分裂概率 ${rate}%`
        },
        apply(game, lv) {
          game.weaponSystem.splitChance = [0.4, 0.7, 1.0][lv - 1] + game.weaponSystem.baseSplitChance
        },
      },
      {
        id: 'gat_chain',
        spec: 'gatling',
        tier: 3,
        requires: ['gat_split'],
        name: '连锁弹射矩阵',
        icon: '⚡',
        desc: '分裂出的微弹命中后可额外穿透/弹射',
        tags: ['机枪·T3', '穿透'],
        maxLevel: 2,
        stats(lv) {
          const p = [1, 2][lv] || 2
          return `分裂弹穿透 +${p} 次`
        },
        apply(game, lv) {
          game.weaponSystem.splitPierces = [1, 2][lv - 1]
        },
      },
      {
        id: 'gat_capstone',
        spec: 'gatling',
        tier: 4,
        isCapstone: true,
        requires: ['gat_chain'],
        name: '🌟 加特林风暴母体',
        icon: '👑',
        desc: `射击间隔缩短 ${getGatlingCapstoneCutPercent()}%，额外 +2 齐射飞弹，全屏飞弹自动强力追踪！`,
        tags: ['终极觉醒', '加特林'],
        maxLevel: 1,
        stats() {
          return `母体觉醒 · 射击间隔 -${getGatlingCapstoneCutPercent()}% · 齐射 +2 · 全屏追踪`
        },
        /**
         * 终极觉醒：射速按**乘算**强化，而不是把 fireInterval 写成固定值。
         *
         * 早期实现是 `fireInterval = 0.12`（绝对覆盖），实测有三个问题：
         *  ① 抹平一切前期射速投入——血统的 ×1.2 惩罚、gat_multishot 每级的 ×0.85
         *     全部被丢弃，任何 Build 都被压到同一个终点（origin 与弹射两条真实路径的
         *     间隔比值 0.833 会归零到 1.000，即"谁堆过射速都一样"）；
         *  ② 吞吐跃迁达 4.6×，是本表最强的单点放大节点；
         *  ③ 与其它来源的关系不连续，无法与后续任何射速调整共存。
         * 改为乘算后，间隔比值恒等于觉醒前的比值（保留 Build 差异），
         * 弹体吞吐跃迁收敛到约 2.7×。倍率取值来自固定快照消融实验。
         */
        apply(game) {
          game.weaponSystem.isGatlingMother = true
          game.weaponSystem.fireInterval *= GATLING_CAPSTONE_RATE
          game.weaponSystem.projectileCount += 2
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 加特林风暴母体 觉醒!', null, '#00d2d3', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'gat_sub_mag',
        spec: 'gatling',
        name: '增压副弹夹',
        icon: '🔋',
        desc: '齐射飞弹数 +1，弹速提升 25%',
        tags: ['机枪共鸣', '齐射'],
        maxLevel: 3,
        stats(lv, game) {
          return `齐射数 +1 · 弹速 +${(lv + 1) * 25}%`
        },
        apply(game) {
          game.weaponSystem.projectileCount += 1
          game.weaponSystem.projectileSpeed *= 1.25
        },
      },
      {
        id: 'gat_sub_pierce',
        spec: 'gatling',
        name: '动能穿透',
        icon: '🏹',
        desc: '所有飞弹获得额外穿透目标能力',
        tags: ['机枪共鸣', '穿透'],
        maxLevel: 2,
        stats(lv) {
          return `穿透目标数 +${lv + 1}`
        },
        apply(game, lv) {
          game.weaponSystem.basePierces = [1, 2][lv - 1]
        },
      },
    ],
  },

  // ==========================================
  // 3. 元素炼金流 (Elemental)
  // ==========================================
  elemental: {
    primary: [
      {
        id: 'ele_affinity',
        spec: 'elemental',
        tier: 1,
        name: '四象亲和',
        icon: '🔮',
        desc: '大幅提升火、水、雷、毒附魔概率与状态跳伤',
        tags: ['元素·T1', '附魔'],
        maxLevel: 3,
        stats(lv) {
          const p = [15, 30, 45][lv] || 45
          return `附魔概率 +${p}% · 状态伤害 +${p * 2}%`
        },
        apply(game, lv) {
          const b = [0.15, 0.3, 0.45][lv - 1]
          game.weaponSystem.freezeChance += b
          game.weaponSystem.burnChance += b
          game.weaponSystem.poisonChance += b
        },
      },
      {
        id: 'ele_resonance',
        spec: 'elemental',
        tier: 1,
        name: '反应共鸣',
        icon: '🌀',
        desc: '复合元素反应（蒸汽/酸池/麻痹/毒雷）伤害与范围提升',
        tags: ['元素·T1', '反应'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv) {
          const rank = lv + 1
          const multiplier = rank <= 3 ? [0, 1.35, 1.7, 2][rank] : 2 + (rank - 3) * 0.28
          return `反应伤害 ×${multiplier.toFixed(2)}`
        },
        apply(game, lv) {
          game.weaponSystem.reactionDmgMul = lv <= 3 ? [0, 1.35, 1.7, 2][lv] : 2 + (lv - 3) * 0.28
        },
      },
      {
        id: 'ele_spread',
        spec: 'elemental',
        tier: 2,
        requires: ['ele_affinity', 'ele_resonance'],
        name: '瘟疫传染',
        icon: '☣️',
        desc: '带有燃烧/中毒/麻痹状态的敌人死亡时，将状态传染扩散给周围敌人',
        tags: ['元素·T2', '扩散'],
        maxLevel: 3,
        stats(lv) {
          const n = [3, 5, 8][lv] || 8
          return `传染扩散至周围 ${n} 个目标`
        },
        apply(game, lv) {
          game.weaponSystem.plagueSpreadCount = [3, 5, 8][lv - 1]
        },
      },
      {
        id: 'ele_overload',
        spec: 'elemental',
        tier: 3,
        requires: ['ele_spread'],
        name: '元素过载爆轰',
        icon: '🎆',
        desc: '任何元素反应触发时，在目标脚底额外炸开强力震荡波',
        tags: ['元素·T3', '爆轰'],
        maxLevel: 2,
        stats(lv) {
          return `爆轰震荡波伤害 ×${[1.5, 2.5][lv] || 2.5}`
        },
        apply(game, lv) {
          game.weaponSystem.reactionShockwave = [1.5, 2.5][lv - 1]
        },
      },
      {
        id: 'ele_capstone',
        spec: 'elemental',
        tier: 4,
        isCapstone: true,
        requires: ['ele_overload'],
        name: '🌟 四象混沌原质',
        icon: '👑',
        desc: '飞弹命中必定同时触发四系全反应（蒸汽+酸池+麻痹+毒雷），并生成牵引怪海的【混沌奇点】！',
        tags: ['终极觉醒', '混沌原质'],
        maxLevel: 1,
        stats() {
          return '原质觉醒 · 四系全反应全开 · 混沌黑洞'
        },
        apply(game) {
          game.weaponSystem.isChaosOrigin = true
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 四象混沌原质 觉醒!', null, '#5f27cd', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'ele_sub_boost',
        spec: 'elemental',
        name: '元素共鸣体',
        icon: '💠',
        desc: '全元素附魔概率 +20%，反应伤害提升',
        tags: ['元素共鸣', '附魔'],
        maxLevel: 3,
        stats(lv) {
          return `反应伤害 +${(lv + 1) * 30}%`
        },
        apply(game, lv) {
          game.weaponSystem.reactionDmgMul = (game.weaponSystem.reactionDmgMul || 1) + 0.3
        },
      },
      {
        id: 'ele_sub_aura',
        spec: 'elemental',
        name: '霜火护体',
        icon: '❄️',
        desc: '周期性自动冻结并引燃贴脸 140px 内的近战敌人',
        tags: ['元素共鸣', '控场'],
        maxLevel: 2,
        stats(lv) {
          return `每 ${lv === 0 ? 3 : 2} 秒自动爆发霜火光环`
        },
        apply(game, lv) {
          game.player.frostFireAura = lv === 1 ? 3 : 2
        },
      },
    ],
  },

  // ==========================================
  // 4. 暗影刺客流 (Assassin)
  // ==========================================
  assassin: {
    primary: [
      {
        id: 'ass_lethal',
        spec: 'assassin',
        tier: 1,
        name: '致命锋芒',
        icon: '🎯',
        desc: '大幅提高暴击概率',
        tags: ['刺客·T1', '暴击率'],
        maxLevel: 3,
        stats(lv) {
          const rate = [25, 40, 55][lv] || 55
          return `暴击率提升至 ${rate}%`
        },
        apply(game, lv) {
          setCritSource(game, 'lethal', { chance: [0.15, 0.3, 0.45][lv - 1] })
        },
      },
      {
        id: 'ass_stride',
        spec: 'assassin',
        tier: 1,
        name: '暗影疾行',
        icon: '👟',
        desc: '移动速度与主动技能冷却全面强化',
        tags: ['刺客·T1', '机动'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv, game) {
          const s = Math.round(game.player.speed)
          const speedRatio = getSoftRankMultiplier(lv + 1, 0.15, 3, 1.9) / getSoftRankMultiplier(lv, 0.15, 3, 1.9)
          const cdRatio = getSoftRankMultiplier(lv + 1, -0.15, 3, 0.42) / getSoftRankMultiplier(lv, -0.15, 3, 0.42)
          return `移速 ${s} → ${Math.round(s * speedRatio)} · 主动冷却 ×${cdRatio.toFixed(2)}`
        },
        apply(game, lv) {
          applyRankMultiplier(game.player, 'speed', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.15, 3, 1.9))
          game.player.activeSkillCdMultiplier ||= 1
          applyRankMultiplier(game.player, 'activeSkillCdMultiplier', lv - 1, lv, rank => getSoftRankMultiplier(rank, -0.15, 3, 0.42))
        },
      },
      {
        id: 'ass_execute',
        spec: 'assassin',
        tier: 2,
        requires: ['ass_lethal', 'ass_stride'],
        name: '穿心绞杀',
        icon: '🗡️',
        desc: '暴击伤害倍率由 3 倍大幅提升',
        tags: ['刺客·T2', '暴伤'],
        maxLevel: 3,
        growthClass: 'core',
        stats(lv) {
          const rank = lv + 1
          const mul = rank <= 3 ? [0, 0.5, 1.2, 2][rank] : 2 + (rank - 3) * 0.22
          return `暴击倍率 +${mul}（保留觉醒与秘典加成）`
        },
        apply(game, lv) {
          const multiplier = lv <= 3 ? [0, 0.5, 1.2, 2][lv] : 2 + (lv - 3) * 0.22
          setCritSource(game, 'execute', { multiplier })
        },
      },
      {
        id: 'ass_cleave',
        spec: 'assassin',
        tier: 2,
        requires: ['ass_lethal', 'ass_stride'],
        requiresStrain: 'shadow',
        name: '裂影横斩',
        icon: '⚔️',
        desc: '暴击命中后，在目标两侧扫出短距影刃，伤害最多 4 名其他敌人。横斩不能暴击或连续触发自身。',
        tags: ['刺客·T2', '近身群攻'],
        maxLevel: 2,
        stats(lv) { return lv === 0 ? '横斩伤害 0.85 倍攻击 · 触发间隔 0.9 秒' : '横斩伤害 1.2 倍攻击 · 范围扩大 · 触发间隔 0.65 秒' },
        apply(game, lv) { if (game.startingStrain === 'shadow') game.player.shadowCleaveLevel = lv },
      },
      {
        id: 'ass_decoy',
        spec: 'assassin',
        tier: 3,
        requires: ['ass_execute'],
        name: '残影替身',
        icon: '👤',
        desc: '释放主动技能后在原地留下暗影假人嘲讽吸引周围敌人',
        tags: ['刺客·T3', '替身'],
        maxLevel: 2,
        stats(lv) {
          const t = [1.5, 2.5][lv] || 2.5
          return `假人嘲讽持续 ${t} 秒`
        },
        apply(game, lv) {
          game.player.shadowDecoyDuration = [1.5, 2.5][lv - 1]
        },
      },
      {
        id: 'ass_capstone',
        spec: 'assassin',
        tier: 4,
        isCapstone: true,
        requires: ['ass_decoy'],
        name: '🌟 暗影无相主宰',
        icon: '👑',
        desc: '暴击时在目标身旁瞬间召唤【暗影分身交叉斩击】；释放主动技能获得 1.5 秒潜行且下一次攻击必暴击！',
        tags: ['终极觉醒', '暗影主宰'],
        maxLevel: 1,
        stats() {
          return '主宰觉醒 · 暴击影分身连斩 · 主动隐匿必暴'
        },
        apply(game) {
          game.weaponSystem.isShadowLord = true
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 暗影无相主宰 觉醒!', null, '#ff3838', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'ass_sub_insight',
        spec: 'assassin',
        name: '弱点洞悉',
        icon: '👁️',
        desc: '暴击率提升，对生命值低于 50% 的敌人暴伤额外翻倍',
        tags: ['刺客共鸣', '斩杀'],
        maxLevel: 3,
        stats(lv) {
          return `暴击率 +${(lv + 1) * 15}% · 残血暴伤翻倍`
        },
        apply(game, lv) {
          setCritSource(game, 'insight', { chance: 0.15 * lv })
          game.weaponSystem.executeCrit = true
        },
      },
      {
        id: 'ass_sub_rush',
        spec: 'assassin',
        name: '影袭连环',
        icon: '⚡',
        desc: '击杀任何敌人后获得 2 秒移速与暴击率加成',
        tags: ['刺客共鸣', '爆发'],
        maxLevel: 2,
        stats(lv) {
          return `击杀后 +${lv === 0 ? 25 : 40}% 移速爆发`
        },
        apply(game, lv) {
          game.player.killRushSpeed = lv === 1 ? 0.25 : 0.4
        },
      },
    ],
  },

  // ==========================================
  // 5. 通用生存池 (Common)
  // ==========================================
  common: [
    {
      id: 'com_vital',
      name: '细胞增殖',
      icon: '❤️',
      desc: '生命上限 +1 并立即回复 1 点生命',
      tags: ['通用', '生命'],
      maxLevel: 5,
      stats(lv, game) {
        return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1}`
      },
      apply(game) {
        game.player.maxHp += 1
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1)
      },
    },
    {
      id: 'com_swift',
      name: '流体滑行',
      icon: '🌊',
      desc: '移动速度提升 12%，走位更灵动',
      tags: ['通用', '移速'],
      maxLevel: 5,
      growthClass: 'endless',
      stats(lv, game) {
        const rank = lv + 1
        const before = getSoftRankMultiplier(lv, 0.12, 3, 1.7623)
        const after = getSoftRankMultiplier(rank, 0.12, 3, 1.7623)
        const s = Math.round(game.player.speed)
        return `移速 ${s} → ${Math.round(s * after / before)}`
      },
      apply(game, lv) {
        applyRankMultiplier(game.player, 'speed', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.12, 3, 1.7623))
      },
    },
    {
      id: 'com_magnet',
      name: '引力细胞',
      icon: '🧲',
      desc: '经验宝石与道具吸附半径提升 25%',
      tags: ['通用', '磁力'],
      maxLevel: 5,
      growthClass: 'endless',
      stats(lv, game) {
        const rank = lv + 1
        const before = getSoftRankMultiplier(lv, 0.25, 3, 3.0518)
        const after = getSoftRankMultiplier(rank, 0.25, 3, 3.0518)
        const r = Math.round(game.player.pickupRadius)
        return `拾取半径 ${r} → ${Math.round(r * after / before)}`
      },
      apply(game, lv) {
        applyRankMultiplier(game.player, 'pickupRadius', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.25, 3, 3.0518))
      },
    },
    {
      id: 'com_regen',
      name: '再生核心',
      icon: '🌱',
      desc: '每 8 秒自动缓慢修复 1 点生命值',
      tags: ['通用', '自愈'],
      maxLevel: 3,
      stats(lv) {
        return `自愈周期 ${[8, 6, 4][lv] || 4} 秒`
      },
        apply(game, lv) {
          game.player.regenInterval = [8, 6, 4][lv - 1]
          game.player._regenTimer = game.player.regenInterval
        },
    },
    {
      id: 'com_shock',
      name: '震荡扩能',
      icon: '🫧',
      // 原生主动成长：Lv.5 拟态后转为重咬伤害/范围，或鼓舞攻击加成/时长。
      // 实际技能按等级实时读取，不在觉醒时反复叠加属性。
      originOnly: true,
      desc: '强化原生主动；拟态暴食后强化重咬，拟态共生后强化鼓舞，已有等级自动继承',
      tags: ['通用', '主动技'],
      maxLevel: 3,
      stats(lv, game) {
        const growth = getOriginActiveGrowth(game, lv + 1)
        if (game?.primarySpec === 'symbiosis') return `鼓舞攻击加成额外 +${Math.round(growth.rallyDamage * 100)}% · 持续时间 +${growth.rallyDuration} 秒`
        return `${game?.primarySpec === 'gluttony' ? '重咬' : '震荡'}伤害 +${(lv + 1) * 10}% · 范围 +${(lv + 1) * 8}px`
      },
      apply() {},
    },
    {
      id: 'origin_flux',
      name: '异源校准',
      icon: '🔄',
      originOnly: true,
      desc: '让不同伤害来源之间的拟态能量轮换更高效；同源收益不变，异源收益递减封顶',
      tags: ['原生·充能', '拟态能量'],
      maxLevel: 6,
      growthClass: 'core',
      stats(lv, game) {
        const previous = getOriginActiveGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_flux: lv } }).foreignBonus
        const next = getOriginActiveGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_flux: lv + 1 } }).foreignBonus
        return `异源充能额外 +${previous.toFixed(1)} → +${next.toFixed(1)}（上限 +3）`
      },
      apply() {},
    },
    {
      id: 'origin_overload',
      name: '超载棱镜',
      icon: '🔆',
      originOnly: true,
      desc: '强化下一次有效主动的超载倍率；效果只在支付拟态能量后生效，并带硬上限',
      tags: ['原生·超载', '有限增幅'],
      maxLevel: 6,
      growthClass: 'core',
      stats(lv, game) {
        const before = getOriginActiveGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_overload: lv } })
        const g = getOriginActiveGrowth({ ...game, skillLevels: { ...(game?.skillLevels || {}), origin_overload: lv + 1 } })
        return `超载伤害 ×${before.overloadDamageMul.toFixed(2)} → ×${g.overloadDamageMul.toFixed(2)} · 范围 ×${before.overloadRangeMul.toFixed(2)} → ×${g.overloadRangeMul.toFixed(2)}`
      },
      apply() {},
    },
    {
      id: 'origin_concord',
      name: '双相协鸣',
      icon: '🔗',
      originOnly: true,
      desc: '让主专精决定超载形态，副专精追加一次有限回响；不生成第二套终极',
      tags: ['原生·协同', '主副共鸣'],
      maxLevel: 3,
      growthClass: 'core',
      stats(lv, game) {
        const profileAt = rank => getPrimalOverloadProfile({
          ...game,
          skillLevels: { ...(game?.skillLevels || {}), origin_concord: rank },
        }, true)
        const before = profileAt(lv), after = profileAt(lv + 1)
        if (game?.primarySpec === 'gatling') return `超载追加齐射 ${before.volleyBonus} → ${after.volleyBonus} 轮`
        if (game?.primarySpec === 'elemental') return `震荡附魔扩散 +${Math.round(before.elementalSpreadBonus * 100)}% → +${Math.round(after.elementalSpreadBonus * 100)}%`
        if (game?.primarySpec === 'assassin') return `超载隐匿 ${before.assassinStealth.toFixed(2)} → ${after.assassinStealth.toFixed(2)} 秒`
        if (game?.primarySpec === 'gluttony') return `重咬增幅 ×${before.biteDamageMul.toFixed(2)}/×${before.biteRangeMul.toFixed(2)} → ×${after.biteDamageMul.toFixed(2)}/×${after.biteRangeMul.toFixed(2)}`
        if (game?.primarySpec === 'symbiosis') return `鼓舞额外延长 ${before.rallyDuration.toFixed(2)} → ${after.rallyDuration.toFixed(2)} 秒 · 攻击加成 +${Math.round(before.rallyDamage * 100)}% → +${Math.round(after.rallyDamage * 100)}%`
        return `主专精超载回响 ${Math.min(3, lv)} → ${Math.min(3, lv + 1)} 层`
      },
      apply() {},
    },
    {
      id: 'com_adrenaline',
      name: '肾上腺素',
      icon: '⚡',
      desc: '受击时触发移速爆发——把「挨打」转化为走位资源，越危险越灵活',
      tags: ['通用', '机动'],
      maxLevel: 3,
      stats(lv) {
        const b = [30, 45, 60][lv] || 60
        return `受击后移速 +${b}%（持续 3 秒）`
      },
      apply(game, lv) {
        game.player.adrenalineSpeed = [0.3, 0.45, 0.6][lv - 1]
      },
    },
  ],
}

// Only these audited tracks receive extra high-difficulty ranks. Discrete
// proc/count/evolution skills retain their authored cap to avoid runaway chains.
const CORE_GROWTH_IDS = new Set([
  'glut_maw', 'glut_bulk', 'glut_ram', 'gat_velocity', 'ele_resonance',
  'ass_stride', 'ass_execute', 'pet_power', 'pet_vitality', 'pet_haste',
  'origin_flux', 'origin_overload', 'origin_concord',
])
for (const [treeKey, tree] of Object.entries(SKILL_DATABASE)) {
  const entries = [...(tree.primary || []), ...(tree.secondary || []), ...(Array.isArray(tree) ? tree : [])]
  for (const skill of entries) if (CORE_GROWTH_IDS.has(skill.id)) {
    skill.growthClass = 'core'
    skill.rankCaps = CORE_SKILL_RANK_CAPS[skill.id]
  }
}
for (const skill of SKILL_DATABASE.common) {
  if (skill.id === 'com_swift' || skill.id === 'com_magnet') skill.growthClass = 'endless'
  else if (skill.originOnly && skill.id !== 'com_shock') {
    skill.growthClass = 'core'
    skill.rankCaps = CORE_SKILL_RANK_CAPS[skill.id]
  }
  else skill.growthClass = 'common'
}

// Shared IDs retain origin behavior; the shadow role resolves both effects and presentation.
SKILL_DATABASE.assassin.primary.push(...SHADOW_EXTRA_SKILLS)
for (const skill of SKILL_DATABASE.assassin.primary) {
  const originalApply = skill.apply
  skill.apply = (game, lv) => {
    const variant = game.startingStrain === 'shadow' && SHADOW_SKILL_VARIANTS[skill.id]
    return (variant?.apply || originalApply)?.(game, lv)
  }
}

export { resolveShadowSkill }
export function getSpecInfo(spec, game) {
  if (spec === 'gatling' && (game?.startingStrain || game?.strainId) === 'ricochet') {
    const route = game?.weaponSystem?.ricochetCombat?.route || game?.ricochet?.route
    const r = route && RICOCHET_ROUTES[route]
    return r ? { ...RICOCHET_SPEC_INFO, name: r.name, icon: r.icon, desc: `${r.desc} ${r.bonus}` } : RICOCHET_SPEC_INFO
  }
  if (spec === 'gluttony' && (game?.startingStrain || game?.strainId) === 'glutton') {
    const route = game?.weaponSystem?.gluttonCombat?.route || game?.glutton?.route
    const r = route && GLUTTON_ROUTES[route]
    return r ? { ...SPEC_INFO.gluttony, name: r.name, icon: r.icon, desc: `${r.desc} ${r.bonus}` } : SPEC_INFO.gluttony
  }
  if (spec === 'assassin' && (game?.startingStrain || game?.strainId) === 'shadow') {
    const route = game?.weaponSystem?.shadowCombat?.route
    const r = route && SHADOW_ROUTES[route]
    return r ? { ...SHADOW_SPEC_INFO, name: r.name, icon: r.icon, desc: `${r.desc} ${r.bonus}` } : SHADOW_SPEC_INFO
  }
  const info = SPEC_INFO[spec]
  if (spec === 'elemental' && (game?.startingStrain || game?.strainId) === 'elemental') return { ...info, ...ELEMENTAL_SPEC_INFO }
  return spec === 'assassin' && (game?.startingStrain || game?.strainId) === 'shadow' ? { ...info, ...SHADOW_SPEC_INFO } : info
}

/** Bounded, starting-identity tome pools; ordinary skill ranks stay separate. */
export const BOSS_SKILL_DATABASE = {
  origin: BOSS_TOMES.origin, gluttony: BOSS_TOMES.glutton, gatling: BOSS_TOMES.ricochet,
  elemental: BOSS_TOMES.elemental, assassin: BOSS_TOMES.shadow, symbiosis: BOSS_TOMES.summoner,
}
export const rollBossSkills = rollBossTomes

/**
 * 技能的「角色权限」前提（第四批）：把依赖独占能力的技能标出来，
 * 由候选池与里程碑统一过滤，避免把死技能摆到玩家面前。
 *
 * 只列真正完全无效的技能——部分有效的技能
 * 一律保留，宁可少过滤也不误伤。
 */
const SKILL_CAPABILITY = {
  // 只在「吞噬」发生时生效 → 仅 canDevour 的角色可用
  glut_eruption: 'devour',
  glut_sub_digest: 'devour',
  // 元素共鸣挂件按「元素权限」开放：元素史莱姆与原生黏液（元素进化体）可用；
  // 共生/暴食/弹射/暗影无元素权限，仍然拿不到。
  ele_sub_boost: 'element',
  ele_sub_aura: 'element',
}

/** 该技能在当前角色权限下是否有实际效果 */
function skillUsable(skill, canDevour, canUseElements, isElementalStrain = true, strainId = null) {
  if (skill.requiresStrain && skill.requiresStrain !== strainId) return false
  const need = SKILL_CAPABILITY[skill.id]
  if (!need) return true
  if (need === 'devour') return canDevour
  if (need === 'element') return canUseElements
  return isElementalStrain
}

/**
 * 某专精的主树是否可以呈现给当前角色。
 * 暴食主树整棵依赖「能吞噬」：pool 里的 glut_maw（拿攻击换吞噬线）对不能吞噬的
 * 角色是纯负面，glut_eruption / glut_capstone 也不可达 → 整树排除，
 * 不做逐技能白名单（origin 因此保留 gatling / elemental / assassin + 通用）。
 */
function specPrimaryUsable(specKey, canDevour) {
  if (specKey === 'gluttony') return canDevour
  return true
}

/**
 * origin 拟态觉醒附注（祖细胞拟态）：暴食/共生两棵树的拟态会在觉醒时补发
 * 机制层（吞噬+猎食点+重咬 / 首只伙伴+鼓舞），这是里程碑选项的真实内容，
 * 必须写进卡里——否则玩家不知道这次觉醒还送独占机制。
 */
const MIMICRY_AWAKENING_NOTES = {
  gluttony: '🧬 拟态授予：解锁吞噬 · 猎食点 · 空格变暴食重咬（普攻仍为远程飞弹）；继承震荡扩能与拟态超载',
  symbiosis: '🧬 拟态授予：岩甲团团即刻到场 · 空格变共生鼓舞（本体伤害不减）；继承震荡扩能与拟态超载',
}

const SECONDARY_STARTERS = {
  gluttony: 'glut_sub_armor', gatling: 'gat_sub_mag', elemental: 'ele_sub_aura',
  assassin: 'ass_sub_insight', symbiosis: 'sym_sub_echo',
}

/** 某专精的 secondary 技能在当前权限下还剩哪些可用 */
function secondarySkills(specKey, canDevour = true, canUseElements = true, isElementalStrain = true) {
  return (SKILL_DATABASE[specKey]?.secondary || []).filter((s) =>
    skillUsable(s, canDevour, canUseElements, isElementalStrain)
  )
}

/** 里程碑预览与实际授予共用一项合法共鸣；已满级时回退到本系其余可用项。 */
export function getSecondaryStarter(game, specKey) {
  const skills = secondarySkills(specKey, game.canDevour !== false, game.canUseElements !== false, game.startingStrain === 'elemental')
    .filter(s => (game.skillLevels?.[s.id] || 0) < getEffectiveSkillMaxLevel(game, s, 'secondary'))
  return skills.find(s => s.id === SECONDARY_STARTERS[specKey]) || skills[0] || null
}

/** 该专精是否还有可用的 secondary（用于 Lv.9 里程碑候选过滤） */
function specSecondaryUsable(specKey, canDevour, canUseElements, isElementalStrain) {
  return secondarySkills(specKey, canDevour, canUseElements, isElementalStrain).length > 0
}

/**
 * 智能抽取算法（支持里程碑觉醒机制）
 */
export function rollSkills(game, count = 3) {
  if (game.startingStrain === 'ricochet') return rollRicochetSkills(game, count)
  if (game.startingStrain === 'glutton') {
    const gluttonTree = SKILL_DATABASE.gluttony
    return rollGluttonSkills(game, count, gluttonTree.primary, SKILL_DATABASE.common)
  }
  if (game.startingStrain === 'summoner') {
    const symbiosisTree = SKILL_DATABASE.symbiosis
    return rollSymbiosisSkills(game, count, symbiosisTree.primary, SKILL_DATABASE.common)
  }
  if (game.startingStrain === 'shadow') {
    const baseSkills = SKILL_DATABASE.assassin.primary.map(skill => resolveShadowSkill(skill, game))
    return rollShadowSkills(game, count, baseSkills, SKILL_DATABASE.common)
  }
  if (game.startingStrain === 'elemental') {
    return elementalSkillOptions(game, ELEMENTAL_SKILLS, SKILL_DATABASE.common, count)
  }
  const pLevel = game.player?.level || 1
  const levels = game.skillLevels || {}
  const primarySpec = game.primarySpec
  const secondarySpec = game.secondarySpec
  // 角色身份（阶段十九）：四名角色在 Lv.1~4 只开放本角色 T1；
  // origin（roleSpec = null）保留三系 T1 自由探索 + Lv.5 五系拟态。
  const roleSpec = game.roleSpec || null
  // 角色权限（第三/第四批）：技能池必须与独占能力对齐，否则会把死技能摆到玩家面前。
  // 引擎侧是 getter（布尔）；测试桩缺省按「有权限」处理，与本文件其它桩口径一致。
  const canDevour = game.canDevour !== false
  const canUseElements = game.canUseElements !== false
  const isElementalStrain = game.startingStrain === 'elemental'
  const isOrigin = game.startingStrain === 'origin'
  // 拟态血统（祖细胞拟态）：origin 选了暴食/共生后，requiresStrain 按拟态血统判定——
  // 否则共生树全员 requiresStrain:'summoner' 会把自己锁死。引擎 getter 缺省（测试桩）
  // 时退化为 startingStrain，行为与旧版完全一致。
  const effectiveStrain = game.mimicryStrain || game.startingStrain
  // 里程碑口径「选了觉醒就拿到机制」：origin 的 Lv.5 五系全可选（拟态授予机制层）。
  const isMilestoneOffered = (k) =>
    (k !== 'symbiosis' || effectiveStrain === 'summoner' || isOrigin) &&
    (specPrimaryUsable(k, canDevour) || (k === 'gluttony' && isOrigin))
  // 早期池口径「现在就能用」：暴食/共生 T1 对未拟态的 origin 是死卡，不进 Lv.1~4 池。
  const isT1Offered = (k) => (k !== 'symbiosis' || effectiveStrain === 'summoner') && specPrimaryUsable(k, canDevour)
  const isSecondarySpecOffered = (k) => specSecondaryUsable(k, canDevour, canUseElements, isElementalStrain) && !!getSecondaryStarter(game, k)

  // ===================================================
  // 1. Lv. 5 里程碑：主专精觉醒仪式（origin 五系拟态陈列；角色血统只列本树，按权限过滤）
  // ===================================================
  if (pLevel >= 5 && !primarySpec) {
    return Object.keys(SKILL_DATABASE)
      .filter((k) => k !== 'common' && isMilestoneOffered(k))
      .map((k) => {
        const info = SPEC_INFO[k]
        const mimicryNote = isOrigin ? MIMICRY_AWAKENING_NOTES[k] : null
        // 「已投入 X 级」徽标：早期自由混搭的沉淀在里程碑上可见，
        // 觉醒哪条系一眼有数（配合卡池收敛，雏形与觉醒自然衔接）。
        const invested = (SKILL_DATABASE[k].primary || []).reduce((n, s) => n + (levels[s.id] || 0), 0)
        const bonus = [mimicryNote, info.bonus, invested > 0 ? `已投入 ${invested} 级` : null]
          .filter(Boolean).join(' ／ ')
        return {
          id: `milestone_pri_${k}`,
          spec: k,
          isMilestone: true,
          milestoneType: 'primary',
          name: `确立【${info.name}】`,
          icon: info.icon,
          color: info.color,
          desc: info.desc,
          bonus,
          roadmap: info.roadmap,
          tags: ['👑 主专精觉醒', info.name],
          stats: bonus,
        }
      })
  }

  // ===================================================
  // 2. Lv. 9 里程碑：其余四系陈列；立即授予基础共鸣，后续升级继续强化。
  // ===================================================
  if (pLevel >= 9 && primarySpec && !secondarySpec && !roleSpec) {
    return Object.keys(SKILL_DATABASE)
      .filter((k) => k !== 'common' && k !== primarySpec && isSecondarySpecOffered(k))
      .map((k) => {
        const info = SPEC_INFO[k]
        // 共鸣预览只承诺本角色实际拿得到的部分：某条共鸣技能被权限过滤掉时，
        // 不得在面板上继续宣告它（否则是「文案承诺了却永远拿不到」）。
        const keptSkills = secondarySkills(k, canDevour, canUseElements, isElementalStrain)
        const partial = keptSkills.length < SKILL_DATABASE[k].secondary.length
        const starter = getSecondaryStarter(game, k)
        const starterLevel = levels[starter.id] || 0
        const starterStats = typeof starter.stats === 'function' ? starter.stats(starterLevel, game) : starter.stats
        const instantBonus = `立即获得【${starter.name}】Lv.${starterLevel + 1}：${starterStats}`
        return {
          id: `milestone_sec_${k}`,
          spec: k,
          isMilestone: true,
          milestoneType: 'secondary',
          name: `确立【${info.name}】`,
          icon: info.icon,
          color: info.color,
          desc: starter.desc,
          bonus: instantBonus,
          roadmap: partial
            ? [keptSkills.map((s) => `${s.icon} ${s.name}`).join(' ／ ')]
            : [info.subBonus],
          tags: ['🥈 副专精共鸣', info.name],
          stats: instantBonus,
        }
      })
  }

  // ===================================================
  // 3. 常规升级抽取
  // ===================================================
  const candidatePool = []

  // 通用池技能
  for (const s of SKILL_DATABASE.common) {
    const curLv = levels[s.id] || 0
    const maxLevel = getEffectiveSkillMaxLevel(game, s, 'common')
    if (curLv >= maxLevel) continue
    // 震荡扩能服务原生的所有主动形态，拟态后继续提供对应强化。
    if (s.originOnly && (game.startingStrain !== 'origin' || !primarySpec)) continue
    candidatePool.push({ ...s, role: 'common', level: curLv, maxLevel })
  }
  if (game.runSelection?.mode === 'endless' && (game.enemyManager?.wave || 1) >= 25) {
    for (const s of ENDLESS_SKILLS) {
      const level = levels[s.id] || 0
      candidatePool.push({ ...s, role: 'common', level, maxLevel: Infinity })
    }
  }

  // 流派技能
  for (const [specKey, tree] of Object.entries(SKILL_DATABASE)) {
    if (specKey === 'common') continue

    const primarySkills = (specKey === 'elemental' && isElementalStrain ? ELEMENTAL_SKILLS : tree.primary).map(s => resolveElementalSkill(resolveShadowSkill(s, game), game))
      .filter(s => skillUsable(s, canDevour, canUseElements, isElementalStrain, effectiveStrain))
      .filter(s => !isElementalStrain || game.weaponSystem?.spellCombat?.fusion || !['ele_resonance', 'ele_overload'].includes(s.id))
      .filter(s => !isElementalStrain || specKey !== 'elemental' || spellSkillAvailable(s, game))

    // 尚未确立主专精（Lv.1~4）：
    //  - 角色血统（roleSpec）：只开放本角色 T1——Lv.5 会自动觉醒，不需要玩家再选一次；
    //  - origin（roleSpec = null）：保留三系 T1 自由探索，但**排除暴食/共生树**
    //    （拟态前无吞噬、无伙伴，那些 T1 是死卡；Lv.5 里程碑才放宽成五系可选）。
    // 注意这里刻意不带 tier 过滤之外的放宽条件：T2/T3 仍必须等 primarySpec 确立
    // （GameEngine._ensureRoleAwakening）后才会进入候选池，不会因为角色绑定而提前。
    if (!primarySpec) {
      if (roleSpec) {
        if (specKey !== roleSpec) continue
        for (const s of primarySkills.filter((sk) => sk.tier === 1)) {
          const curLv = levels[s.id] || 0
          const maxLevel = getEffectiveSkillMaxLevel(game, s, 'role_t1')
          if (curLv < maxLevel) candidatePool.push({ ...s, role: 'role_t1', level: curLv, maxLevel })
        }
      } else {
        if (!isT1Offered(specKey)) continue
        for (const s of primarySkills.filter((sk) => sk.tier === 1)) {
          const curLv = levels[s.id] || 0
          const maxLevel = getEffectiveSkillMaxLevel(game, s, 't1_free')
          if (curLv < maxLevel) candidatePool.push({ ...s, role: 't1_free', level: curLv, maxLevel })
        }
      }
    } else if (specKey === primarySpec) {
      // 当前是【主专精】：按 T1~T4 深度阶梯展开
      for (const s of primarySkills) {
        const curLv = levels[s.id] || 0
        const maxLevel = getEffectiveSkillMaxLevel(game, s, 'primary')
        if (curLv >= maxLevel) continue
        if (!skillUsable(s, canDevour, canUseElements, isElementalStrain, effectiveStrain)) continue
        if (s.excludes?.some(id => (levels[id] || 0) > 0)) continue

        // 终极觉醒需要构筑深度和战局进度同时达标，防止单次经验暴涨或慢打
        // 单独提前大招；远征用关卡进度替代计时波次。
        if (s.isCapstone) {
          const pLevel = game.player?.level || 1
          const wave = game.enemyManager?.wave || 1
          const expedition = game.runSelection?.mode === 'expedition'
          const progressReady = expedition ? (game.expeditionStage || 1) >= 5 : wave >= 10
          if (pLevel < 14 || !progressReady) continue
        }

        // 检查前置条件
        let reqMet = true
        if (s.requires && s.requires.length > 0) {
          reqMet = s.requires.some((reqId) => (levels[reqId] || 0) > 0)
          // T2 深潜门槛：任一 T1 点 1 级即解锁会让「深潜期」名不副实——
          // 额外要求本树累计投入 ≥2 级（前置本身的 1 级计入，即最多再补 1 级）。
          // 只作用带前置的 T2：招募位（requires 为空）、T3/T4 的链式前置、
          // 副专精共鸣与里程碑觉醒均不受影响。投入按解析后主树统计
          // （暗影变体 id 稳定；元素血统的法术树只含本系卡，口径一致）。
          if (reqMet && s.tier === 2) {
            const invested = primarySkills.reduce((n, sk) => n + (levels[sk.id] || 0), 0)
            reqMet = invested >= 2
          }
        }

        if (reqMet) {
          candidatePool.push({ ...s, role: 'primary', level: curLv, maxLevel })
        }
      }
    } else if (secondarySpec && specKey === secondarySpec) {
      // 当前是【副专精】：开放副专精共鸣技能（按权限过滤掉对本角色无效的共鸣）
      for (const s of tree.secondary) {
        const curLv = levels[s.id] || 0
        const maxLevel = getEffectiveSkillMaxLevel(game, s, 'secondary')
        if (curLv >= maxLevel) continue
        // 第四批：glut_sub_digest 仅在 canDevour 时可用；ele_sub_boost 仅在 canUseElements 时可用。
        // 角色（非 origin）的 secondary 与角色绑定，天然只会看到本树，过滤对它们是恒等变换。
        if (!skillUsable(s, canDevour, canUseElements, isElementalStrain)) continue
        candidatePool.push({ ...s, role: 'secondary', level: curLv, maxLevel })
      }
    }
  }

  // 觉醒时先选第一位搭档，后续升级仍可招募其余伙伴。
  // effectiveStrain：origin 拟态共生后同样先招募（岩甲团团随 enabled 自动到场，
  // 但三选一招募位是共生树的组队入口，不能只靠常驻位）。
  if (effectiveStrain === 'summoner' && primarySpec === 'symbiosis' &&
      !PET_PARTNER_SKILLS.some(id => (levels[id] || 0) > 0)) {
    const choices = PET_PARTNER_SKILLS.map(id => candidatePool.find(skill => skill.id === id)).filter(Boolean)
    if (choices.length === PET_PARTNER_SKILLS.length) return choices.slice(0, count)
  }

  // 洗牌算法
  // 投入收敛（自由探索期治「散落」）：已投入系 / 已点过的卡加权排前——
  // Lv.1~4 的混搭会自然长成雏形，Lv.5 觉醒有土壤，而不是三次各开一门。
  // 元素血统沿用均匀洗牌（法术优先级抽取有自己的口径）。
  if (!isElementalStrain) {
    const specInvestment = {}
    for (const [specKey, tree] of Object.entries(SKILL_DATABASE)) {
      if (specKey === 'common' || !tree.primary) continue
      specInvestment[specKey] = tree.primary.reduce((sum, s) => sum + (levels[s.id] || 0), 0)
    }
    // 已点过 +50%/级；同系自由技能再按全树投入 +75%/级（只作用未觉醒探索期）
    const weightOf = (s) =>
      1 + 0.5 * (levels[s.id] || 0) +
      ((s.role === 't1_free' || s.role === 'role_t1') ? 0.75 * (specInvestment[s.spec] || 0) : 0)
    const rest = candidatePool.slice()
    candidatePool.length = 0
    while (rest.length) {
      let total = 0
      for (const s of rest) total += weightOf(s)
      let roll = Math.random() * total
      let idx = 0
      for (; idx < rest.length - 1; idx++) {
        roll -= weightOf(rest[idx])
        if (roll <= 0) break
      }
      candidatePool.push(rest.splice(idx, 1)[0])
    }
  } else {
    for (let i = candidatePool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]]
    }
  }

  if (game.startingStrain !== 'shadow') {
    candidatePool.sort((a, b) => {
      if (a.isCapstone) return -1
      if (b.isCapstone) return 1
      return 0
    })
  }
  const selected = isElementalStrain ? prioritizeSpellChoices(candidatePool, game, count) : candidatePool.slice(0, count)
  return selected.map((s) => ({
    ...s,
    stats: typeof s.stats === 'function' ? s.stats(s.level, game) : s.stats || '',
  }))
}
