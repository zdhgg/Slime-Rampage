import {
  PET_SKILL,
  RICOCHET_SKILL,
  ELEMENTAL_SKILL,
  SHADOW_SKILL,
  GLUTTON_SKILL,
} from './StrainSkills.js'
import { ORIGIN_SKILL } from './OriginCombat.js'
import { disableGluttonResource, resetGluttonResource } from './GluttonResource.js'

/**
 * 史莱姆血统 / 角色：开局身份（第三维 build 轴——专精管技能走向，基因管局外成长，
 * 血统管「你这团身体本身是什么」）。
 *
 * 阶段十九「角色化」：血统从「纯属性修正」升级为「角色身份」——
 *  - 五条角色血统各自绑定一棵专精树（roleSpec）：Lv.1~4 只开放本角色 T1 + 通用，
 *    Lv.5 由引擎自动觉醒（不弹四选一），彻底消除「选了贪噬、Lv.5 却点元素」的身份断裂；
 *  - 五条角色各有 空格 专属主动技能（见 StrainSkills.js）；
 *  - `origin` 为「祖细胞拟态」：roleSpec = null，Lv.1~4 三系 T1 自由混搭、
 *    Lv.5 五系血统任选拟态（获机制层不获属性），Lv.9 独占副专精，
 *    保留黏液震荡主动（拟态暴食/共生后换成签名技）。
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
    desc: '开局携带近战护卫岩甲团团；升级与 BOSS 秘典随机招募疾风、甘露和孢云伙伴，同时探索追猎、孢潮、守望三条路线。第 6 波／远征第 3 章后确认路线，后续路线进阶与伙伴契约继续随机出现。每种伙伴一只，最多四只，倒地 8 秒后恢复。空格释放共生鼓舞，提高全体伙伴的攻击力、攻速和移速；本体飞弹伤害降低 45%。',
    tint: 'rgba(237,196,121,0.25)', deco: null,
  },
  origin: {
    id: 'origin',
    name: '原生黏液',
    icon: '🫧',
    desc: '未分化的液态变异体。Lv.1~4 在原生核心、异源碎片与通用卡之间自由探索；Lv.5 三选一原生路线（原质扩张/基因同化/异源共振），Lv.9 五选一异源印记。空格始终是黏液震荡，路线决定震荡形态与超载主体，印记只提供轻量附加特征；不会获得任何职业主系统。异源能量达到 40 时本次震荡超载。',
    roleSpec: null,
  },
  glutton: {
    id: 'glutton',
    name: '暴食史莱姆',
    attackMode: 'melee',
    icon: '🍽️',
    desc: '自动咬击前方近处敌人，残血或被咬杀的血肉目标直接吞噬；吞线以下的猎物会被引力缓慢拖向口部，捕食与咬杀后短暂加速。每 5 次基础吞噬或 10 次近战普攻命中首领积累 1 猎食点（上限 2），空格 消耗 1 点发动暴食重咬，重咬出手向前小步扑进。捕食后获得持续 1.6 秒、抵挡 1 点伤害的护甲，每 2.5 秒最多获得一次。生命 +1，吞噬范围 +35%、吞噬线 +4%。',
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
    desc: '齐射飞弹 +1、弹速 +25%，开火间隔 ×1.2。前期随机混搭分裂、贯穿与折射；普通选卡满 5 次且第 6 波／远征第 3 章后确认路线，已得能力保留。后期随机获得路线专属终极，替换空格疾射。',
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
    desc: '开局使用原质飞弹，自带 1 点法术护盾，破盾后 8 秒重建。Lv.2 选择首系法术；随后随机发现元素与本系强化，可走单系极化、双系融合或多系轮转。第 6 波／远征第 3 章确认路线，中后期不再更改，互斥终极随机出现。暴击率 +8%，生命 −1。',
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
    desc: '近战影刃，刺击起手向目标小步突进；闪避率 15%，成功后虚化 0.2 秒。暴击后 60% 概率生影，最多 2 个、持续 4 秒、攻击 40%。分身诱导普通远程敌人并优先追击，每挡一发普通弹幕消耗 0.5 秒。本体击杀在原地留下短暂残影替身继续诱敌。空格 首击必暴并指挥夹击。暴击率 +12%、生命 −1。',
    roleSpec: 'assassin',
    critChance: 0.12,
    maxHp: -1,
    fireIntervalMul: 0.55,
    tint: 'rgba(255, 86, 86, 0.24)',
    deco: null,
  },
}

export const STRAIN_IDS = ['origin', 'glutton', 'ricochet', 'elemental', 'shadow', 'summoner']

/** 五名角色的 id（origin 是独立原生体系，不算角色） */
export const CHARACTER_IDS = ['glutton', 'ricochet', 'elemental', 'shadow', 'summoner']

/**
 * 空格 专属主动技能表（角色 id → 技能定义）。
 * 原生黏液保留唯一主动「黏液震荡」，任何路线/印记都不替换它。
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
 * 该角色能否吞噬敌人（按血统）。
 * 只有暴食史莱姆天生可以；origin 不通过任何路线/印记获得吞噬。
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
 * origin 保留元素权限，但不开放元素法术树；元素印记只把元素附着到震荡上。
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
