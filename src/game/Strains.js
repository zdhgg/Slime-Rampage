import {
  PET_SKILL,
  ORIGIN_SKILL,
  RICOCHET_SKILL,
  ELEMENTAL_SKILL,
  SHADOW_SKILL,
  GLUTTON_SKILL,
} from './StrainSkills.js'
import { disableGluttonResource, resetGluttonResource } from './GluttonResource.js'

/**
 * 史莱姆血统 / 角色：开局身份（第三维 build 轴——专精管技能走向，基因管局外成长，
 * 血统管「你这团身体本身是什么」）。
 *
 * 阶段十九「角色化」：血统从「纯属性修正」升级为「角色身份」——
 *  - 五条角色血统各自绑定一棵专精树（roleSpec）：Lv.1~4 只开放本角色 T1 + 通用，
 *    Lv.5 由引擎自动觉醒（不弹四选一），彻底消除「选了贪噬、Lv.5 却点元素」的身份断裂；
 *  - 五条角色各有 空格 专属主动技能（见 StrainSkills.js）；
 *  - `origin` 保持「自由构筑」语义：roleSpec = null，Lv.1~4 四系 T1 全开放、
 *    Lv.5 仍是四选一，不参与吞噬独占，保留黏液震荡主动。
 *
 * 数值纪律（避免与 Lv.5 专精抢同一个参数）：
 *  - 血统只改「开局就生效」的机制口径与基础属性，且一律用加法/乘法叠加，
 *    绝不写死绝对值（否则会覆盖黑市基因与难度加成）；
 *  - 专精树真正占用的参数（devourThreshold / elementProcCap / reactionDmgMul /
 *    critMul / splitChance / splitInherit）血统一律不碰，见 SkillPool.js 各 apply。
 */
export const STRAINS = {
  summoner: {
    id: 'summoner', name: '共生史莱姆', icon: '🐾', roleSpec: 'symbiosis',
    bodyProjectileDamageMul: 0.55,
    desc: '开局携带岩甲团团，伙伴有独立生命，倒地 8 秒后恢复；护卫最多牵制三名普通敌人。空格定向指挥协同狩猎，无目标时回防。可成长为双伙伴；本体飞弹伤害降低 45%。',
    tint: 'rgba(237,196,121,0.25)', deco: null,
  },
  origin: {
    id: 'origin',
    name: '原生黏液',
    icon: '🫧',
    desc: '无修正的原始形态。Lv.1~4 三系技能全开放，Lv.5 自由觉醒主专精；空格释放黏液震荡解围。',
    roleSpec: null,
  },
  glutton: {
    id: 'glutton',
    name: '暴食史莱姆',
    attackMode: 'melee',
    icon: '🍽️',
    desc: '自动咬击前方近处敌人，残血或被咬杀的血肉目标直接吞噬。每 5 次基础吞噬或 10 次近战普攻命中首领积累 1 猎食点（上限 2），空格 消耗 1 点发动暴食重咬。捕食后获得持续 1.6 秒、抵挡 1 点伤害的护甲，每 2.5 秒最多获得一次。生命 +1，吞噬范围 +35%、吞噬线 +4%。',
    roleSpec: 'gluttony',
    // 暴食的独占机制在引擎侧（EnemyManager._checkDevour + Enemy.hit 的角色闸门），
    // 这里只补「吃得更稳」的口径，不重复实现独占。
    maxHp: 1,
    fireIntervalMul: 0.85,
    devourRadius: 1.35,
    devourBonus: 0.04,
    tint: 'rgba(150, 232, 120, 0.26)',
    deco: 'glutton',
  },
  ricochet: {
    id: 'ricochet',
    name: '弹射史莱姆',
    icon: '🔫',
    desc: '齐射飞弹 +1、弹速 +25%，开火间隔 ×1.2（弹幕重但节奏慢）。',
    roleSpec: 'gatling',
    projectileCount: 1,
    projectileSpeedMul: 1.25,
    fireIntervalMul: 1.2,
    tint: 'rgba(120, 216, 232, 0.26)',
    deco: null,
  },
  elemental: {
    id: 'elemental',
    name: '元素史莱姆',
    icon: '🔮',
    desc: '暴击率 +8%（反应触发更密），生命 −1（本体脆弱）。',
    roleSpec: 'elemental',
    critChance: 0.08,
    maxHp: -1,
    tint: 'rgba(162, 155, 254, 0.28)',
    deco: null,
  },
  shadow: {
    id: 'shadow',
    name: '暗影史莱姆',
    attackMode: 'melee',
    icon: '🗡️',
    desc: '近战影刃，闪避率 15%，成功后虚化 0.2 秒。暴击后 60% 概率生影，最多 2 个、持续 4 秒、攻击 40%。分身诱导普通远程敌人并优先追击，每挡一发普通弹幕消耗 0.5 秒。空格 首击必暴并指挥夹击。暴击率 +12%、生命 −1。',
    roleSpec: 'assassin',
    critChance: 0.12,
    maxHp: -1,
    fireIntervalMul: 0.55,
    tint: 'rgba(255, 86, 86, 0.24)',
    deco: null,
  },
}

export const STRAIN_IDS = ['origin', 'glutton', 'ricochet', 'elemental', 'shadow', 'summoner']

/** 五名角色的 id（origin 是自由构筑，不算角色） */
export const CHARACTER_IDS = ['glutton', 'ricochet', 'elemental', 'shadow', 'summoner']

/**
 * 空格 专属主动技能表（角色 id → 技能定义）。
 * 原生黏液保留自由构筑，并拥有基础解围技能。
 */
export const STRAIN_SKILLS = {
  summoner: PET_SKILL,
  origin: ORIGIN_SKILL,
  glutton: GLUTTON_SKILL,
  ricochet: RICOCHET_SKILL,
  elemental: ELEMENTAL_SKILL,
  shadow: SHADOW_SKILL,
}

/** 取某角色的 空格 技能（未知 id 返回 null） */
export function getStrainSkill(strainId) {
  return STRAIN_SKILLS[strainId] || null
}

/**
 * 该角色能否吞噬敌人。
 * 只有暴食史莱姆可以；origin（自由构筑）与其余角色一律不能——
 * 独占是角色差异的骨架，不能因为「origin 没有身份」就给它全部权限。
 */
export function canDevour(strainId) {
  return strainId === 'glutton'
}

/**
 * 该角色是否拥有猎食点资源（暴食 空格 主动捕食的弹药）。
 * 与 canDevour 同源但语义不同：这是「资源归属」，不是「吞噬权限」。
 * 单独导出是为了让 HUD / 引擎分支读同一个事实，而不是各自比较角色 id。
 */
export function hasGluttonCharge(strainId) {
  return strainId === 'glutton'
}

/**
 * 该角色能否使用元素系统（第三批角色化）。
 * 只有元素史莱姆与 origin 可以：吸收核心、累积元素等级、触发融合反应。
 * 暴食/弹射/暗影不使用元素——它们各自的专精树本来就不含元素技能，
 * 元素对它们只是「能捡但捡不起来」的空资源。
 *
 * `origin` 之所以保留权限：它的 roleSpec 为 null，Lv.5 四选一时仍可能主动
 * 选择元素树；保留权限才不会让那棵树的技能变成死机制。
 */
export function canUseElements(strainId) {
  return strainId === 'elemental' || strainId === 'origin'
}

/**
 * 应用血统修正（引擎 reset 末尾调用，叠加在基因与难度加成之上）：
 * 速度取整防浮点漂移；生命修正在改 maxHp 后回满（开局语义）；
 * 攻击/射速乘在武器基础值上，后续成长性升级自然叠加。
 *
 * 顺序要求（GameEngine.reset 已保证）：weaponSystem.reset → applyGenes → 本函数。
 * 因此这里的乘法一定叠在基因之上，且不会被任何子系统的 reset 冲掉。
 */
export function applyStrain(engine, id) {
  const strain = STRAINS[id] || STRAINS.origin
  const p = engine.player
  const ws = engine.weaponSystem

  engine.startingStrain = strain.id
  engine.roleSpec = strain.roleSpec || null // 角色 → 专属技能树（origin 为 null = 自由构筑）

  p.strainId = strain.id
  p.strainTint = strain.tint || null
  p.strainDeco = strain.deco || null
  // 吞噬吸附半径：角色血统值与专精加成分开存，热路径相乘（Player.update /
  // EnemyManager._checkDevour 读同两个字段，避免两处口径漂移）
  if (strain.devourRadius) p.devourRadiusBonus *= strain.devourRadius
  engine.strainDevourBonus = strain.devourBonus || 0

  // 猎食点资源归属（暴食 空格）：只有暴食拥有它，且每次建立身份时都从 0 点 / 0 进度开始。
  // 非暴食角色显式置 -1（无此资源）——既保证切换角色不残留暴食数值，
  // 也让 HUD 与 空格 分支只需读一个字段就能判断「该不该显示/该不该走资源型释放」。
  if (hasGluttonCharge(strain.id)) {
    resetGluttonResource(p)
  } else {
    disableGluttonResource(p)
  }

  if (strain.maxHp) p.maxHp = Math.max(1, p.maxHp + strain.maxHp)
  if (strain.speedMul) p.speed = Math.round(p.speed * strain.speedMul)
  if (strain.damageMul) ws.damage *= strain.damageMul
  if (strain.projectileSpeedMul) ws.projectileSpeed *= strain.projectileSpeedMul
  if (strain.projectileCount) ws.projectileCount += strain.projectileCount
  if (strain.fireIntervalMul) ws.fireInterval *= strain.fireIntervalMul
  if (strain.critChance) ws.critChance += strain.critChance

  p.hp = p.maxHp
}
