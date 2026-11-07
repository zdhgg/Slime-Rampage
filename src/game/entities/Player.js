import { SHADOW_BASE_EVASION, SHADOW_MAX_EVASION } from '../ShadowSkills.js'
import { Entity } from '../core/Entity.js'
import { getActiveReactions, getElement } from '../ElementSystem.js'
import { ENDLESS_FORMATION_BREAK_SPEED_MUL } from '../EndlessMode.js'
import { AssetManager } from '../AssetManager.js'
import { renderSlimeFamilyBody, renderSlimeFamilyFace, paintSlimeFamilySilhouette, slimeFamilyBodyState, slimeFamilyFaceState } from '../SlimeFamilyArtRenderer.js'
import { getSlimeFamilyArt } from '../SlimeFamilyArt.js'
import { resetPrimalEnergy } from '../PrimalEnergy.js'
import { ORIGIN_ROUTES } from '../OriginBuild.js'
import { GLUTTON_FEAST_SPEED } from '../GluttonResource.js'

const TAU = Math.PI * 2

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)

/** 角度向目标平滑插值（取最短弧，避免跨 ±π 边界时反向旋转） */
const angleLerp = (current, target, k) =>
  current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * k

/** 元素附魔概率上限：等级累加封顶，避免高等级必中失去随机性 */
const ELEMENT_PROC_CHANCE_CAP = 0.6

/** 元素专精（主专精）改写：附魔封顶抬升到 85%——元素流的「把概率投满」有了去处 */
export const ELEMENTAL_SPEC_PROC_CAP = 0.85

/**
 * 副反应槽统一口径（P2 收口，单一计算入口 refreshReactionSlots）：
 *   槽位 = BASE_SECONDARY_SLOTS(2) + geneSlotBonus（局外基因） + 等级里程碑加成（Lv.4/Lv.8 各 +1），
 *   最终封顶 MAX_REACTION_SLOTS——反应表 6 种组合去掉主形态后恰好 5 种副反应，再多也无槽可填。
 * 叠加规则：两个来源加法叠加、无优先级冲突——基因加成由 applyGenes 幂等写入
 * geneSlotBonus（共鸣基因每级 +1、共鸣原核 +1，重开重算不累加）；等级加成由
 * getReactionSlotLevelBonus 按当前等级纯函数推导。baseSecondarySlots 只是
 * 「基础 + 基因」的派生展示值（黑市收益预览读取），不再是独立写入点。
 */
export const BASE_SECONDARY_SLOTS = 2
export const REACTION_SLOT_LEVELS = [4, 8]
export const MAX_REACTION_SLOTS = 5

/** 等级带来的槽位加成（升级面板与 HUD 共用同一口径，避免两处漂移）。 */
export function getReactionSlotLevelBonus(level) {
  return REACTION_SLOT_LEVELS.filter((milestone) => level >= milestone).length
}

export const STARTING_EXP_THRESHOLD = 40

// 开局放慢选择面板密度，随后逐级收敛到原有中期阈值。
const GUIDED_EXP_THRESHOLDS = {
  2: 55,
  3: 75,
  4: 100,
  5: 130,
  6: 170,
  7: 220,
  8: 290,
  9: 400,
}

/** 前期使用引导曲线，10 级后逐段减缓阈值膨胀，维持后半局升级反馈。 */
export function getNextExpThreshold(currentThreshold, nextLevel) {
  if (GUIDED_EXP_THRESHOLDS[nextLevel]) return GUIDED_EXP_THRESHOLDS[nextLevel]
  const growth = nextLevel >= 15 ? 1.28 : nextLevel >= 10 ? 1.32 : 1.4
  return Math.floor(currentThreshold * growth)
}



/** 异变形态渲染配置表（key 与 ElementSystem 的 mutation/元素 id 对应；shape 为剪影 id） */
const MUTATIONS = {
  base: { grad: ['#d2ff8a', '#8ae84a', '#2f9e3a'] },
  fire: { grad: ['#eaff9a', '#e8a83c', '#8a3a1a'], inner: 'fire', shape: 'fire' },
  water: { grad: ['#e8fbff', '#5ac8e8', '#2a6a9a'], alpha: 0.85, inner: 'water', shape: 'water' },
  poison: { grad: ['#eaffca', '#8ad84a', '#3a7a2a'], inner: 'poison', shape: 'poison' },
  lightning: { grad: ['#fff9c8', '#e8d84a', '#8a7a1a'], inner: 'lightning', shape: 'lightning' },
  acid: { grad: ['#eaff9a', '#b8d84a', '#7a9a2a'], inner: 'fire', alpha: 0.92, trail: true, core: true, shape: 'acid' },
  gel: { grad: ['#d8fbff', '#5ad8e8', '#2a8a9a'], inner: 'lightning', alpha: 0.82, ripple: true, shape: 'gel' },
  storm: { grad: ['#ffe9a8', '#e8a83c', '#8a5a1a'], inner: 'lightning', core: true, shape: 'storm' },
  corrode: { grad: ['#c8f7c8', '#6ad86a', '#2a8a5a'], inner: 'poison', alpha: 0.9, trail: true, shape: 'corrode' },
  steam: { grad: ['#f4fbff', '#cfe8f0', '#7fa8b8'], inner: 'water', alpha: 0.9, ripple: true, shape: 'steam' },
  venom: { grad: ['#f0ffd8', '#b8e85a', '#6a4aa0'], inner: 'poison', alpha: 0.92, core: true, arcs: true, shape: 'venom' },
}

/** 形态配置预合并缓存（{ ...cfg, key }）：_mutation 热路径返回同一对象，零分配 */
const MUTATION_VARIANTS = new Map(Object.entries(MUTATIONS).map(([k, cfg]) => [k, { ...cfg, key: k }]))

/**
 * 元素氛围粒子配置（阶段十五美化）：形态色微粒环绕/上浮，
 * 元素身份一眼可辨（火苗上浮/水泡/毒滴下沉/电弧快闪/蒸汽白雾…）
 */
const AURAS = {
  base: { colors: ['#b8e85a', '#8ae84a'], vy: 30, life: 0.8, r: 2.4 },
  fire: { colors: ['#ff9d4a', '#ff6b4a'], vy: -45, life: 0.7, r: 2.4 },
  water: { colors: ['#7fd4f7', '#b8ecff'], vy: -35, life: 0.9, r: 2.2 },
  poison: { colors: ['#7ce86a', '#4fae4a'], vy: 40, life: 0.8, r: 2.2 },
  lightning: { colors: ['#ffe98a', '#ffd166'], vy: -60, life: 0.35, r: 1.8 },
  acid: { colors: ['#c8e84a', '#eaff9a'], vy: -30, life: 0.8, r: 2.4 },
  gel: { colors: ['#8ae8f7', '#d8fbff'], vy: -40, life: 0.9, r: 2.4 },
  storm: { colors: ['#ffc166', '#ffd166'], vy: -55, life: 0.4, r: 2 },
  corrode: { colors: ['#6ad86a', '#a8f06a'], vy: 35, life: 0.8, r: 2.2 },
  steam: { colors: ['#eef7fb', '#ffffff'], vy: -25, life: 1, r: 2.6 },
  venom: { colors: ['#b8e85a', '#c9a6f0'], vy: -40, life: 0.8, r: 2.2 },
}

/**
 * 玩家：一只绿色 Q 弹史莱姆
 *
 * 渲染（纯 Canvas 程序化，零图片资源）：
 *  - 径向渐变身体（左上受光） + 底部内侧阴影 + 轮廓描边
 *  - 「挤压-拉伸」动画：待机时正弦呼吸式挤压；移动时沿运动方向拉伸（近似保体积）
 *  - 共用选择页造型，五官保持正向，面向角用于前探与咬击方向
 *
 * 移动：deltaTime 驱动，WASD / 方向键 8 方向，受世界边界约束
 */
export class Player extends Entity {
  constructor({ input }) {
    super()
    this.input = input

    // —— 移动参数 ——
    this.speed = 340 // px/s
    this.radius = 26 // 逻辑半径（阶段二碰撞检测用）
    this.x = 0
    this.y = 0
    this.facing = -Math.PI / 2 // 初始面朝上方
    this.moveBlend = 0 // 移动拉伸平滑系数 0~1（起步/刹车的缓冲）
    this._wasMoving = false
    this.elapsed = 0

    // —— 等级与经验（阶段四） ——
    this.level = 1
    this.exp = 0
    // 首级阈值 40：前期避免升级面板过密；10 级后降低复利增幅，
    // 让中后期仍能稳定获得构筑选择，而不是突然进入长时间空窗。
    this.maxExp = STARTING_EXP_THRESHOLD
    this.pickupRadius = 150 // 经验宝石磁力吸附范围（可被升级面板强化）

    // —— 生命与受击（阶段六） ——
    this.maxHp = 5
    this.hp = this.maxHp
    this.invincible = 0 // 无敌帧（秒）：受击后短暂免疫，配合闪烁反馈
    this.flash = 0 // 受击红闪计时
    this.dead = false

    // —— 元素吸收（阶段七：元素融合流派） ——
    // 评审 Day 2：Set → Map（元素 → 等级），重复吸收是「积累」而非「+5 经验」
    this.elements = new Map() // { 'fire' => 2, 'lightning' => 3 } 等级随吸收成长
    // 阶段十三：元素派生缓存（激活反应 / 附魔概率），吸收/重开时重建；
    // 热路径（每帧渲染形态、每次命中反应判定）只做 O(1) 缓存查询，零分配
    this._reactions = []
    this._reactionIds = new Set()
    this._reactionMap = new Map()
    this._procs = {}
    // 附魔概率封顶（专精 → 元素联动）：默认 60%，元素炼金主专精抬升到 85%
    this.elementProcCap = ELEMENT_PROC_CHANCE_CAP
    // 主形态（阶段十五设计改造）：第一个融合的反应锁定为「物种身份」——
    // 后续反应以副反应叠加生效，不再改变外形。进化是身份承诺，不是换肤。
    this._primaryReaction = null
    // 副反应槽位（阶段十六设计改造）：默认 2 个，黑市「共鸣基因」每级 +1；
    // 槽满后新组合触发替换面板——稀缺掉落 + 有限槽位 = 硬决策。
    // 基因加成唯一写入点是 geneSlotBonus（applyGenes 幂等维护）；
    // baseSecondarySlots 为派生展示值，最终槽位由 refreshReactionSlots 单点汇总。
    this.geneSlotBonus = 0
    this.baseSecondarySlots = BASE_SECONDARY_SLOTS
    this.secondarySlots = BASE_SECONDARY_SLOTS
    this._secondaryIds = new Set()
    // 异源能量（origin 独占资源）：归零初始化，获取/消耗口径见 PrimalEnergy.js
    resetPrimalEnergy(this)
    this.originMoveBuff = 0
    this.originMoveBuffTimer = 0
    this.originDr = 0
    this.originAdaptReduction = 0
    this.originFormDr = 0
    this._refreshElements()

    // —— 基因属性（阶段八：黑市局外成长，由 applyGenes 维护） ——
    this.expGainMul = 1 // 经验获取倍率（经验基因）
    this.regen = 0 // 每 10s 回复量（再生基因）
    this._regenTimer = 10
    this.geneDevourHeal = 0
    this.geneDevourExpMul = 1
    // 黑市通用基因（噬血/无敌帧）：阈值由基因写入，进度与冷却为局内运行态
    this.geneLeechKills = 0 // 噬血基因：击杀计数阈值（0 = 未习得）
    this.geneLeechKillsMul = 1 // 饕餮原核：阈值乘数
    this._leechProgress = 0
    this._leechHealCd = 0
    this.geneIFramesMul = 1 // 受击无敌帧倍率
    this.geneSiphonRate = 0 // 涌泉基因：经验阈值比例（0 = 未习得）
    this._siphonProgress = 0
    this.geneCocoon = 0 // 复苏茧：免死一次（每局刷新）
    this._cocoonUsed = false
    this.geneFuryPerMissing = 0 // 困兽基因：每缺失 1 点生命的伤害加成
    this.geneRerolls = 0 // 备选蓝图：本局选卡刷新次数
    this.geneExtraOptions = 0 // 扩容视界：选卡面板候选 +N
    this.geneMagnetAll = 0 // 全域磁感：拾取半径扩展为全屏
    this._huntRushTimer = 0 // 狩猎亢奋：击杀攻速窗口剩余秒数

    // —— 本体异变与软体反馈（评审改造） ——
    this._devourPulse = 0 // 吞噬膨胀脉冲（衰减）
    this._fireKick = 0 // 齐射后坐力（美术层用，0.2s 衰减）
    this._gazeAngle = 0 // 最近一次开火方向，开火后短暂看向目标
    this._gazeTimer = 0
    this._ripple = 0 // 受击内部波纹（扩散衰减）
    this._stopJitter = 0 // 急停抖动（过冲衰减）
    this._trail = [] // 酸液拖尾液滴（火+毒 / 水+毒 组合）
    this._trailTimer = 0

    // —— 空格 角色专属主动技能（阶段十九） ——
    // 冷却由 GameEngine._updateStrainSkill 推进，这里只持有状态；
    // 原生黏液使用基础震荡，所有角色共享单主动技能入口。
    // 暴食是唯一例外：它不使用 strainSkillCd（见 GluttonResource.js），
    // 而 resource 型分支由 GameEngine 依据「是否拥有猎食点」自动切换。
    this.strainSkillCd = 0 // 剩余冷却（秒）
    this.strainSkillMax = 0 // 当前技能冷却上限（HUD 进度条用）
    this.strainSkillReadyPulse = 0 // 施放瞬间的反馈脉冲（秒）
    // —— 暴食猎食点资源（暴食 空格 主动捕食） ——
    // 与「空格 冷却」是两套语义：暴食没有主冷却，只有资源 + 0.3s 再次释放锁。
    // 状态放在 Player 上（与 strainSkillCd 同层）：随 resetRunState 归零、
    // 由 applyStrain 决定本角色的启用与否，不新建通用 ResourceSystem。
    // 口径与读写函数在 GluttonResource.js；这里只持有数值。
    this.gluttonCharge = 0 // 当前猎食点（-1 = 该角色不拥有此资源）
    this.gluttonDevourProgress = 0 // 正常吞噬进度（满 5 → +1 点）
    this.gluttonBossHuntProgress = 0 // Boss 普攻猎食进度（默认满 10 → +1 点，觉醒满 8）
    this.gluttonRecastLock = 0 // 再次释放锁剩余（0.3s，防同帧/连点连扣两点）
    this.gluttonGuard = 0
    this.gluttonGuardTimer = 0
    this.gluttonGuardCooldown = 0
    this.gluttonGuardDuration = 1.6
    this.gluttonHealCooldown = 0
    this.gluttonLastGainPulse = 0 // 获得猎食点瞬间的 HUD 反馈脉冲（秒）
    this.gluttonFeastTimer = 0 // 吞噬惯性：捕食/咬杀后的短时移速剩余（秒）
    this.gluttonCowLevel = 0 // 饕甲路线卡「咬合震慑」等级：咬中的敌人出手减伤
    // —— 肾上腺素（通用技能：受击转机动） ——
    this.adrenalineSpeed = 0 // 受击后移速加成（0 = 未习得）
    this.adrenalineTimer = 0 // 剩余爆发时间（秒）

    // —— 移动增强 BUFF（吞噬刺客等） ——
    this.speedBuffTimer = 0

    // —— 专精流派特质（阶段十八：深潜专精体系） ——
    this.devourRadiusBonus = 1.0 // 暴食：吞噬吸附半径倍率
    this.thornsPulse = false // 暴食：受击震退反伤
    this.thornsDamage = 2 // 暴食：反震伤害（职业秘典可提高）
    this.gluttonRadiance = 0 // 暴食 BOSS 秘典：近身光辉倍率；0 = 未获得
    this._gluttonRadianceTimer = 4
    this.activeSkillCdMultiplier = 1
    this.geneActiveSkillCdMultiplier = 1
    this.gluttonHeavyLevel = 0
    this.volleyMoveTimer = 0
    this.devourAcidBurst = 0 // 暴食：近身酸液爆发等级
    this.isGluttonyLord = false // 暴食：终极觉醒（荒古吞噬领主）
    this.gluttonMireLevel = 0
    this.gluttonAftershockLevel = 0
    this.gluttonCounterLevel = 0
    this.gluttonJawUltimate = false
    this.gluttonShellUltimate = false
    this.gluttonCounterCooldown = 0
    this.devourHeal = false // 暴食共鸣：吞噬必回血
    this.devourDamageReduction = 0 // 暴食共鸣：吞噬减伤
    this.regenInterval = 0 // 通用：自愈周期
    this.frostFireAura = 0 // 元素共鸣：霜火光环周期
    this.elementalResonance = false // 元素 BOSS 秘典：元素血统专属共鸣强化
    this._frostFireTimer = 0
    this.shadowDecoyDuration = 0 // 刺客：替身假人持续时间
    this.shadowBossStep = false // 暗影 BOSS 秘典：主动技能后必暴
    this.shadowEvasionBonus = 0
    this.geneShadowEvasionBonus = 0
    this.geneShadowCloneLifeBonus = 0
    this.geneShadowClonePowerBonus = 0
    this.shadowCloneChanceLevel = 0
    this.shadowClonePowerLevel = 0
    this.shadowCloneLifeLevel = 0
    this.shadowCloneCapLevel = 0
    this.shadowCloneLord = false
    this.shadowAssaultClone = false
    this.evasionFlash = 0
    this.evasionCount = 0
    this._dodgedAttacks = new WeakSet()
    this.shadowCleaveLevel = 0 // 暗影 T2：暴击触发短距横斩。
    this.genePetDamageMul = 1
    this.genePetHpBonus = 0
    this.genePetRecoveryBonus = 0
    this._decoys = [] // 刺客：主动技能后留下的嘲讽替身
    this.killRushSpeed = 0 // 刺客共鸣：击杀后移速爆发
    this.killRushTimer = 0
    this.stealthTimer = 0 // 刺客：潜行隐匿时间
    this.guaranteedCrit = false // 刺客：下次攻击必暴击
    this.devourDamageReductionTimer = 0

    // —— 视觉增强（阶段十五美化） ——
    this._blinkT = 2 + Math.random() * 2.5 // 下次眨眼倒计时（随机错开）
    this._blink = 0 // 眨眼进度（>0 时闭眼）
    this._aura = [] // 元素氛围粒子
    this._auraTimer = 0
    this._shadowGrad = null // 软阴影渐变缓存（按半径重建）
    this._shadowKey = 0
  }

  /** 获得移速增益（秒） */
  addSpeedBuff(duration = 2.5) {
    this.speedBuffTimer = Math.max(this.speedBuffTimer, duration)
  }

  /** 击杀触发的短时移速爆发。 */
  triggerKillRush(duration = 2) {
    if (this.killRushSpeed > 0) this.killRushTimer = Math.max(this.killRushTimer, duration)
  }

  /** 吞噬触发的短时减伤。 */
  triggerDevourGuard(duration = 3) {
    if (this.devourDamageReduction > 0) {
      this.devourDamageReductionTimer = Math.max(this.devourDamageReductionTimer, duration)
    }
  }

  /** 普通敌人优先攻击附近的暗影替身；Boss 始终锁定本体。 */
  getEnemyTarget(enemy) {
    const pet = this.game?.weaponSystem?.petCombat?.lureTarget(enemy)
    if (pet) return pet
    const clone = this.game?.weaponSystem?.shadowCombat?.clones.lureTarget(enemy)
    if (clone) return clone
    if (!enemy || enemy.isBoss || this._decoys.length === 0) return this
    let best = null
    let bestD2 = 420 * 420
    for (const decoy of this._decoys) {
      if (decoy.life <= 0) continue
      const dx = decoy.x - enemy.x
      const dy = decoy.y - enemy.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestD2) {
        bestD2 = d2
        best = decoy
      }
    }
    return best || this
  }

  hitDecoy(decoy, damage = 1) {
    if (!decoy || decoy.life <= 0) return
    decoy.life = Math.max(0, decoy.life - 0.45 * damage)
    decoy.flash = 0.12
  }

  /** 旧字段兼容：primalEnergy 与 originEnergy 共用同一份状态。 */
  get primalEnergy() { return this.originEnergy }
  set primalEnergy(value) { this.originEnergy = Number(value) || 0 }

  /** 清理所有只应在单局内存在的技能与临时状态。 */
  resetRunState() {
    this.speedBuffTimer = 0
    this.devourRadiusBonus = 1
    this.thornsPulse = false
    this.thornsDamage = 2
    this.gluttonRadiance = 0
    this._gluttonRadianceTimer = 4
    this.activeSkillCdMultiplier = 1
    this.geneActiveSkillCdMultiplier = 1
    this.gluttonHeavyLevel = 0
    this.volleyMoveTimer = 0
    this.devourAcidBurst = 0
    this.isGluttonyLord = false
    this.gluttonMireLevel = 0
    this.gluttonAftershockLevel = 0
    this.gluttonCounterLevel = 0
    this.gluttonJawUltimate = false
    this.gluttonShellUltimate = false
    this.gluttonCounterCooldown = 0
    this.devourHeal = false
    this.devourDamageReduction = 0
    this.devourDamageReductionTimer = 0
    this.regenInterval = 0
    this._regenTimer = 10
    this.frostFireAura = 0
    this.elementalResonance = false
    this._frostFireTimer = 0
    this.shadowDecoyDuration = 0
    this.shadowBossStep = false
    this.shadowEvasionBonus = 0
    this.geneShadowEvasionBonus = 0
    this.geneShadowCloneLifeBonus = 0
    this.geneShadowClonePowerBonus = 0
    this.shadowCloneChanceLevel = 0
    this.shadowClonePowerLevel = 0
    this.shadowCloneLifeLevel = 0
    this.shadowCloneCapLevel = 0
    this.geneLeechKills = 0
    this.geneLeechKillsMul = 1
    this._leechProgress = 0
    this._leechHealCd = 0
    this.geneIFramesMul = 1
    this.geneSiphonRate = 0
    this._siphonProgress = 0
    this.geneCocoon = 0
    this._cocoonUsed = false
    this.geneFuryPerMissing = 0
    this.geneRerolls = 0
    this.geneExtraOptions = 0
    this.geneMagnetAll = 0
    this._huntRushTimer = 0
    this.shadowCloneLord = false
    this.shadowAssaultClone = false
    this.evasionFlash = 0
    this._fireKick = 0
    this._gazeTimer = 0
    this.evasionCount = 0
    this._dodgedAttacks = new WeakSet()
    this.shadowCleaveLevel = 0
    this.genePetDamageMul = 1
    this.genePetHpBonus = 0
    this.genePetRecoveryBonus = 0
    this._decoys.length = 0
    this.killRushSpeed = 0
    this.killRushTimer = 0
    this.stealthTimer = 0
    this.guaranteedCrit = false
    this.game?.weaponSystem?.shadowCombat?.reset()
    this.adrenalineSpeed = 0
    this.adrenalineTimer = 0
    this.strainSkillCd = 0 // 空格 角色技能冷却归位（角色身份随 applyStrain 重建）
    this.strainSkillMax = 0
    this.strainSkillReadyPulse = 0
    // 暴食猎食点资源归零（新局/重开不得残留；非暴食角色随后由 applyStrain 置 -1 关闭）
    this.gluttonCharge = 0
    this.gluttonDevourProgress = 0
    this.gluttonBossHuntProgress = 0
    this.gluttonRecastLock = 0
    this.gluttonGuard = 0
    this.gluttonGuardTimer = 0
    this.gluttonGuardCooldown = 0
    this.gluttonGuardDuration = 1.6
    this.gluttonHealCooldown = 0
    this.gluttonLastGainPulse = 0
    this.gluttonFeastTimer = 0
    this.gluttonCowLevel = 0
    this.elementProcCap = ELEMENT_PROC_CHANCE_CAP // 专精改写的附魔封顶归位
    resetPrimalEnergy(this) // 异源能量/超载/同化/印记运行态归零
    this.originMoveBuff = 0
    this.originMoveBuffTimer = 0
    this.originDr = 0
    this.originAdaptReduction = 0
    this.originFormDr = 0
  }

  /** 回复生命值 */
  heal(amount = 1) {
    if (this.dead) return
    const prev = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    if (this.hp > prev) {
      this.game?.enemyManager?.addText(this.x, this.y - 18, `+${this.hp - prev} HP`, '圣疗治愈', '#2ecc71', 14)
    }
  }

  /**
   * 重建元素派生缓存（吸收/重开时调用）：
   *  - _reactions / _reactionIds / _reactionMap：激活反应（形态渲染与武器行为查询）；
   *  - _procs：元素附魔（阶段十三：每级概率叠加 → 状态效果；同状态概率相加、
   *    时长取最长、概率封顶 ELEMENT_PROC_CHANCE_CAP）。
   * 热路径零分配：所有查询直接读缓存，不重复扫反应表。
   */
  _refreshElements() {
    const spells = this.game?.weaponSystem?.spellCombat
    if (spells?.enabled) {
      const fusion = spells.fusion
      this._reactions = fusion ? [fusion] : []
      this._reactionIds = new Set(this._reactions.map(r => r.id))
      this._reactionMap = new Map(this._reactions.map(r => [r.id, r]))
      this._procs = {}
      return
    }
    // 激活 = 元素满足 且（主形态 或 已占用副反应槽位）——槽位经济（阶段十六）：
    // 未入槽的组合不产生任何反应效果（元素附魔仍按等级生效）
    const satisfied = getActiveReactions(this.elements)
    const active = satisfied.filter(
      (r) => r.id === this._primaryReaction || this._secondaryIds.has(r.id)
    )
    this._reactions = active
    this._reactionIds = new Set(active.map((r) => r.id))
    this._reactionMap = new Map(active.map((r) => [r.id, r]))
    const procs = {}
    for (const [id, lv] of this.elements) {
      const el = getElement(id)
      const p = el?.proc
      if (!p || lv <= 0) continue
      let cur = procs[p.status]
      if (!cur) {
        cur = { chance: 0, duration: 0 }
        procs[p.status] = cur
      }
      cur.chance += p.chance * lv
      cur.duration = Math.max(cur.duration, p.duration)
    }
    for (const key of Object.keys(procs)) {
      procs[key].chance = Math.min(procs[key].chance, this.elementProcCap)
    }
    this._procs = procs
  }

  /** 元素异变形态：主形态锁定优先（第一个融合的反应），其次单元素，渲染配置查缓存表（零分配） */
  _mutation() {
    // 主形态（阶段十五设计改造）：外形稳定，副反应叠加不再换肤
    if (this._primaryReaction) {
      const pr = this._reactionMap.get(this._primaryReaction)
      if (pr) {
        const v = MUTATION_VARIANTS.get(pr.mutation)
        if (v) return v
      }
    }
    for (const r of this._reactions) {
      const v = MUTATION_VARIANTS.get(r.mutation)
      if (v) return v
    }
    for (const id of ['fire', 'water', 'poison', 'lightning']) {
      if (this.elements.has(id)) return MUTATION_VARIANTS.get(id)
    }
    return MUTATION_VARIANTS.get('base')
  }

  /**
   * 吸收元素核心（评审 Day 2：进度积累 + 进化事件）：
   *  - 元素等级 +1（重复吸收是积累，HUD 显示 💧2 ⚡3）；
   *  - 新反应激活时触发「进化事件」：引擎暂停 0.9s + 全屏演出，
   *    让玩家明确知道「刚才发生了一件重要的事」。
   */
  absorbElement(type) {
    if (this.game?.weaponSystem?.spellCombat?.enabled) return
    if (this.dead) return // 死亡帧残差：不再吸收（防进化演出与结算面板叠加）
    // 元素权限（第三批角色化）：暴食/弹射/暗影不使用元素系统。
    // 这是防御性兜底闸门——上游（核心生成、自动吸收、吞噬消化）已按同一权限
    // 拦截，这里保证任何未来新增的调用路径都不会绕过权限白拿到元素。
    if (this.game?.canUseElements === false) return
    const beforeSat = new Set(getActiveReactions(this.elements).map((r) => r.id)) // 吸收前满足的组合
    const lv = (this.elements.get(type) || 0) + 1
    this.elements.set(type, lv)
    this.game.sound.absorb()
    if (lv > 1) this.game.sound.elementUp() // 元素等级提升：吸收音上叠加钟鸣（💧1→💧2）

    const satisfied = getActiveReactions(this.elements) // 吸收后满足的所有组合
    const newly = satisfied.filter((r) => !beforeSat.has(r.id))
    if (newly.length === 0) {
      this._refreshElements() // 仅等级变化 → 重建附魔缓存
      return
    }

    // —— 主形态（阶段十五）：第一个融合的组合 = 物种身份（首次融合必恰好 1 个） ——
    if (!this._primaryReaction) {
      this._primaryReaction = newly[0].id
      this._refreshElements()
      const [a, b] = newly[0].combo
      const ea = getElement(a)
      const eb = getElement(b)
      this.game.evolutionEvent(
        `融合进化：${newly[0].name}！`,
        `${ea.icon} ${ea.name} + ${eb.icon} ${eb.name} → ${newly[0].species}`,
        newly[0].mutation,
        newly[0].desc
      )
      return
    }

    // —— 副反应（阶段十六槽位经济）：候选入槽 → 满槽弹替换面板 ——
    const candidates = newly.filter((r) => r.id !== this._primaryReaction)
    const fitting = []
    for (const r of candidates) {
      if (this._secondaryIds.size < this.secondarySlots) {
        this._secondaryIds.add(r.id)
        fitting.push(r)
      } else break
    }
    this._refreshElements()
    if (fitting.length > 0) {
      const subLines = fitting.map((r) => {
        const [ca, cb] = r.combo
        const ga = getElement(ca)
        const gb = getElement(cb)
        return `${ga.icon} ${ga.name} + ${gb.icon} ${gb.name} → ${r.species}`
      })
      this.game.evolutionEvent(
        `副反应激活：${fitting[0].name}！`,
        subLines.join(' ／ '),
        fitting[0].mutation,
        fitting.map((r) => r.desc).join('；') + '（叠加生效，不改变主形态）'
      )
    }
    // 槽满且还有候选：暂停 + 回调 Vue 弹替换面板（第一个候选）
    const overflow = candidates.slice(fitting.length)
    if (overflow.length > 0) {
      this.game.reactionSlotsFull(overflow[0].id)
    }
  }

  /** 副反应替换（阶段十六）：替换面板选择后由引擎调用；replacedId 为 null 表示放弃新反应 */
  resolveSecondarySwap(newId, replacedId) {
    if (replacedId) {
      this._secondaryIds.delete(replacedId)
      this._secondaryIds.add(newId)
      this._refreshElements()
    }
  }

  /**
   * 重算副反应槽位（等级 → 元素联动）——全项目唯一的槽位计算入口：
   *  - 槽位 = BASE_SECONDARY_SLOTS + geneSlotBonus + 等级里程碑加成（Lv.4 / Lv.8 各 +1），
   *    封顶 MAX_REACTION_SLOTS；
   *  - 旧字段读取路径：若基因加成只存在于旧字段 baseSecondarySlots（旧档/旧代码写入，
   *    geneSlotBonus 未设置），按旧规则（base − 2）折算并入——已获得的槽位不静默丢失；
   *  - 槽位扩张时，把「元素已经满足但当初因满槽被挤掉」的反应自动接入——
   *    升级本身就成为一次元素构筑的兑现，而不是只加数值。
   * @returns {Array} 本次自动接入的反应（供调用方播放提示；无变化时为空数组）
   */
  refreshReactionSlots() {
    if (this.game?.weaponSystem?.spellCombat?.enabled) { this.secondarySlots = 0; return [] }
    const geneBonus = Math.max(
      this.geneSlotBonus ?? 0,
      // 旧档兜底：基因加成只存在于旧字段 baseSecondarySlots 时按旧规则折算并入。
      // 取大者而非 ?? 短路——构造函数把 geneSlotBonus 初始化为 0，?? 会让旧档
      // （只有 baseSecondarySlots=4）永远进不了折算分支；新档两处同值，取大者不双算。
      Math.max(0, (this.baseSecondarySlots ?? BASE_SECONDARY_SLOTS) - BASE_SECONDARY_SLOTS)
    )
    this.geneSlotBonus = geneBonus
    this.baseSecondarySlots = BASE_SECONDARY_SLOTS + geneBonus
    this.secondarySlots = Math.min(
      MAX_REACTION_SLOTS,
      this.baseSecondarySlots + getReactionSlotLevelBonus(this.level)
    )
    const equipped = []
    if (this._secondaryIds.size < this.secondarySlots) {
      for (const r of getActiveReactions(this.elements)) {
        if (this._secondaryIds.size >= this.secondarySlots) break
        if (r.id === this._primaryReaction || this._secondaryIds.has(r.id)) continue
        this._secondaryIds.add(r.id)
        equipped.push(r)
      }
      if (equipped.length > 0) this._refreshElements()
    }
    return equipped
  }

  /**
   * 吃下该核心是否需要确认（阶段十六追加）：
   *  - 第一颗元素：元素永久入体不可移除，且决定后续融合方向；
   *  - 首次融合：主形态整局锁定不可逆。
   * 同款升级与后续元素无需确认（后续组合的选择权在槽位/替换面板）。
   */
  shouldConfirmElement(type) {
    if (this.elements.size === 0) return true // 第一颗元素
    return this.wouldFuseFirst(type)
  }

  /**
   * 吃下该核心是否会触发首次融合（阶段十六追加：主形态锁定不可逆，吃前确认）。
   * 条件：尚无主形态 + 该元素是新增元素 + 吃下后出现首个满足的组合。
   */
  wouldFuseFirst(type) {
    if (this._primaryReaction || this.elements.has(type)) return false
    const test = new Map(this.elements)
    test.set(type, 1)
    return getActiveReactions(test).length > 0
  }

  /**
   * 获得经验：溢出保留，阈值递增；达标时通知引擎触发升级流程
   * （引擎会暂停主循环并回调 Vue 弹出升级面板，选择技能后 resume）
   * @returns {boolean} 本调用是否触发了升级（供拾取循环中断，防一帧连升多级）
   */
  gainExp(amount) {
    if (this.dead) return false // 死亡帧残差：不再结算经验/升级（防面板叠加、暂停锁失衡）
    const gained = Math.round(amount * this.expGainMul) // 经验基因倍率
    this.exp += gained
    // 涌泉基因：累计吸收经验达当前升级阈值比例时回血
    // （阈值随等级膨胀自动缩放；满血不计数，与噬血共用 5 秒回复间隔）
    if (this.geneSiphonRate > 0 && this.hp < this.maxHp) {
      this._siphonProgress += gained
      if (this._leechHealCd <= 0 && this._siphonProgress >= this.maxExp * this.geneSiphonRate) {
        this._siphonProgress = 0
        this._leechHealCd = 5
        this.heal(1)
      }
    }
    if (this.exp >= this.maxExp) {
      this.settleLevelUp()
      return true
    }
    return false
  }

  /**
   * 结算一级升级：扣经验、等级 +1、阈值递增、攻击成长，并通知引擎弹面板。
   * 与 gainExp 分离，供引擎 resume 的「连升」检查复用——升级必须是
   * 「扣经验 + 弹面板」的原子操作（否则剩余经验只弹面板不结算，
   * 大额经验时升级面板无限循环、等级卡死不涨）。
   */
  settleLevelUp() {
    this.exp -= this.maxExp
    this.level++
    this.maxExp = getNextExpThreshold(this.maxExp, this.level)
    this.game.weaponSystem.onLevelUp() // 等级攻击力成长（每级 ×1.08）
    // 等级里程碑：槽位扩张 + 自动接入被挤掉的反应（Lv.4 / Lv.8 各 +1 槽）
    const unlocked = this.refreshReactionSlots()
    if (unlocked.length > 0) {
      this.game.enemyManager?.addText?.(
        this.x,
        this.y - 42,
        `🧬 副反应槽扩展 ${this._secondaryIds.size}/${this.secondarySlots}`,
        `自动接入：${unlocked.map((r) => r.name).join('、')}`,
        '#9c8ad4',
        15
      )
    }
    this.game.triggerLevelUp() // 暂停 + 生成 3 个技能选项 + onLevelUp 回调
  }

  /** 王级秘籍（Boss 掉落）：免费技能选择，不消耗升级次数 */
  gainFreeSkill() {
    if (this.dead) return // 死亡帧残差：不再弹面板
    this.game.openFreeSkillPanel()
  }

  attach(game) {
    super.attach(game)
    // 出生点：世界中心（大地图模式，相机首帧自动居中）
    this.x = game.worldWidth / 2
    this.y = game.worldHeight / 2
  }

  /**
   * 受击结算：无敌帧免疫 → 扣血 + 红闪 + 音效；hp 归零 → 死亡并触发游戏结束
   */
  /**
   * 受击结算：无敌帧免疫 → 扣血 + 红闪 + 音效；hp 归零 → 死亡并触发游戏结束
   */
  get evasionChance() {
    return this.game?.startingStrain === 'shadow'
      ? Math.min(SHADOW_MAX_EVASION, SHADOW_BASE_EVASION + this.shadowEvasionBonus + (this.geneShadowEvasionBonus || 0) + (this.shadowBossStep ? 0.1 : 0)) : 0
  }

  hit(damage, attack = null) {
    if (this.dead || this.game?.runFinished || !(damage > 0)) return false
    // 区域灼烧（zoneBurn）不吃受击无敌帧：0.5s 节奏 DoT 会被 0.5s 无敌帧吞掉一半
    if (this.invincible > 0 && !attack?.zoneBurn) return false // 无敌帧内免疫（含结算后）
    // Only explicit enemy attack tokens are eligible; costs/events retain their old semantics.
    if (attack?.enemyAttack && this.evasionChance > 0) {
      // The existing 0.2-second virtual-body visual is also the protection window.
      // It neither refreshes on hits nor shields non-attack costs/events.
      if (this.evasionFlash > 0) return false
      if (this._dodgedAttacks.has(attack)) return false
      this._dodgedAttacks.add(attack)
      if (Math.random() < this.evasionChance) {
        this.evasionFlash = this.game?.bossTomes?.onEvade() ?? 0.2
        this.evasionCount++
        this.game.enemyManager.addText(this.x, this.y - 38, '闪避', null, '#d0baff', 16)
        return false
      }
    }
    if (this.devourDamageReductionTimer > 0 && this.devourDamageReduction > 0) {
      damage = Math.max(1, Math.round(damage * (1 - this.devourDamageReduction)))
    }
    const petRouteReduction = this.game?.weaponSystem?.petCombat?.playerDamageReduction || 0
    if (petRouteReduction > 0) damage = Math.max(1, Math.round(damage * (1 - petRouteReduction)))
    // 基因同化：层数提供少量减伤（OriginCombat 每帧写入 originDr）。
    if (this.originDr > 0 && damage > 0) damage = Math.max(1, Math.round(damage * (1 - this.originDr)))
    // 适应性膜：只在超载窗口内生效。
    if (this.overloadState?.active && this.originAdaptReduction > 0 && damage > 0) {
      damage = Math.max(1, Math.round(damage * (1 - this.originAdaptReduction)))
    }
    // 局部形态重组：超载后的短时形变减伤。
    if (this.originFormDr > 0 && damage > 0) damage = Math.max(1, Math.round(damage * (1 - this.originFormDr)))
    if (attack?.enemyAttack) this.game?.bossTomes?.onHurt()
    if (this.gluttonGuard > 0 && this.gluttonGuardTimer > 0 && damage > 0) {
      damage = Math.max(0, damage - this.gluttonGuard)
      this.gluttonGuard = 0
      this.gluttonGuardTimer = 0
      this.game.weaponSystem._ring(this.x, this.y, '#d1efa0', this.radius + 14)
      this.game.weaponSystem.gluttonCombat?.onGuardBlocked?.()
      if (damage <= 0) {
        this.invincible = 0.18
        return
      }
    }
    // 暴食印记/碎片：原生护甲（只挡 1 点，不触发暴食路线反击）。
    if (this.originGuard > 0 && this.originGuardTimer > 0 && damage > 0) {
      damage = Math.max(0, damage - this.originGuard)
      this.originGuard = 0
      this.originGuardTimer = 0
      this.game.weaponSystem._ring(this.x, this.y, '#ffb36b', this.radius + 12)
      if (damage <= 0) {
        this.invincible = 0.18
        return
      }
    }
    // 共生印记/碎片：支援泡泡吸收伤害（rank 2 可叠 2 点）。
    if ((this.markState?.bubble || 0) > 0 && damage > 0) {
      const absorbed = Math.min(this.markState.bubble, damage)
      this.markState.bubble -= absorbed
      damage -= absorbed
      this.game.weaponSystem._ring(this.x, this.y, '#edc479', this.radius + 16)
      if (damage <= 0) {
        this.invincible = 0.18
        return
      }
    }
    damage = this.game?.bossTomes?.absorb(damage, attack) ?? damage
    const shield = this.game?.weaponSystem?.spellCombat?.shield
    damage = shield ? shield.absorb(damage, attack) : damage
    if (damage <= 0) { this.invincible = .18; return false }
    this.hp -= damage
    this.invincible = 0.5 * (this.geneIFramesMul || 1) // 0.5 秒无敌（饕餮原核可延长）：仍防贴脸每帧连击，但持续受压会稳定掉血——走位有收益
    this.flash = 0.25 // 受击红闪
    this._ripple = 0.5 // 受击内部波纹（软体反馈）
    this.game.sound.hurt()
    this.game.shakeScreen(3, 0.15) // 受击屏幕震动（阶段十五美化）
    // 肾上腺素（通用技能）：受击触发移速爆发——把「挨打」转化为走位资源
    if (this.adrenalineSpeed > 0) this.adrenalineTimer = 3

    // 暴食：硬化甲壳反震波
    if (this.thornsPulse && this.game.enemyManager) {
      for (const e of this.game.enemyManager.enemies) {
        if (!e.active) continue
        const dx = e.x - this.x
        const dy = e.y - this.y
        const d2 = dx * dx + dy * dy
        if (d2 <= 160 * 160) {
          const d = Math.sqrt(d2) || 1
          e.x += (dx / d) * 45
          e.y += (dy / d) * 45
          e.hit(this.thornsDamage || 2)
        }
      }
      this.game.weaponSystem._ring(this.x, this.y, '#ff9f43', 160)
    }

    if (this.hp <= 0) {
      // 复苏茧（黑市）：每局一次，致命伤害转为 1 点生命 + 2 秒无敌
      if (this.geneCocoon && !this._cocoonUsed) {
        this._cocoonUsed = true
        this.hp = 1
        this.invincible = 2
        this.game.weaponSystem?._ring?.(this.x, this.y, '#7fe08c', 150)
        this.game.enemyManager?.addText?.(this.x, this.y - 42, '🥚 复苏茧', null, '#7fe08c', 18)
        this.game.sound?.levelUp?.()
        return true
      }
      this.hp = 0
      this.dead = true
      this.game.gameOver() // 引擎暂停 + 回调 Vue 弹结算面板
    }
    return true
  }

  update(dt) {
    if (this.dead) return // 死亡后不再更新（引擎随即暂停）
    this.invincible = Math.max(0, this.invincible - dt)
    this._leechHealCd = Math.max(0, this._leechHealCd - dt)
    this.flash = Math.max(0, this.flash - dt)
    this.evasionFlash = Math.max(0, this.evasionFlash - dt)
    this.volleyMoveTimer = Math.max(0, this.volleyMoveTimer - dt)
    if (this.stealthTimer > 0) this.stealthTimer -= dt
    if (this.killRushTimer > 0) this.killRushTimer -= dt
    this._huntRushTimer = Math.max(0, this._huntRushTimer - dt)
    if (this.devourDamageReductionTimer > 0) this.devourDamageReductionTimer -= dt
    this.gluttonGuardTimer = Math.max(0, this.gluttonGuardTimer - dt)
    this.gluttonGuardCooldown = Math.max(0, this.gluttonGuardCooldown - dt)
    this.gluttonCounterCooldown = Math.max(0, this.gluttonCounterCooldown - dt)
    this.gluttonHealCooldown = Math.max(0, this.gluttonHealCooldown - dt)
    this.gluttonFeastTimer = Math.max(0, this.gluttonFeastTimer - dt)
    if (this.gluttonGuardTimer <= 0) this.gluttonGuard = 0
    this.elapsed += dt

    // 暴食 BOSS 秘典：周期性的近身光辉，强化贴脸和吞噬节奏。
    if (this.gluttonRadiance > 0 && this.game.enemyManager) {
      this._gluttonRadianceTimer -= dt
      if (this._gluttonRadianceTimer <= 0) {
        this._gluttonRadianceTimer = 4
        const radius = 150
        const damage = Math.max(1, Math.round(this.game.weaponSystem.damage * this.game.weaponSystem.levelMul * this.gluttonRadiance))
        for (const e of this.game.enemyManager.enemies) {
          if (!e.active || e.devouring) continue
          if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 <= radius * radius) {
            e.hit(damage, { burn: 2, burnDmg: Math.max(1, Math.round(damage * 0.35)) })
            if (!e.active) this.game.weaponSystem._onKill(e)
          }
        }
        this.game.weaponSystem._ring(this.x, this.y, '#ffd166', radius)
      }
    }

    for (let i = this._decoys.length - 1; i >= 0; i--) {
      const decoy = this._decoys[i]
      decoy.life -= dt
      decoy.flash = Math.max(0, (decoy.flash || 0) - dt)
      if (decoy.life <= 0) this._decoys.splice(i, 1)
    }

    // 再生基因 / 再生核心：周期自动回复生命
    if (this.regen > 0 || this.regenInterval > 0) {
      const interval = this.regenInterval > 0 ? this.regenInterval : 10
      this._regenTimer -= dt
      if (this._regenTimer <= 0) {
        this._regenTimer = interval
        this.heal(1)
      }
    }

    // 元素共鸣：霜火光环
    if (this.frostFireAura > 0 && this.game.enemyManager) {
      this._frostFireTimer -= dt
      if (this._frostFireTimer <= 0) {
        this._frostFireTimer = this.frostFireAura
        for (const e of this.game.enemyManager.enemies) {
          if (!e.active) continue
          const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2
          if (d2 <= 140 * 140) {
            e.hit(1, { freeze: 1.5, burn: 2, burnDmg: 1 })
          }
        }
        this.game.weaponSystem._ring(this.x, this.y, '#00d2d3', 140)
      }
    }

    // 软体反馈计时衰减
    this._devourPulse = Math.max(0, this._devourPulse - dt * 1.2)
    const ws = this.game.weaponSystem
    const kick = ws?.muzzleKick || 0
    this._fireKick = Math.max(kick, this._fireKick - dt * 5)
    if (kick > 0) { this._gazeAngle = ws.muzzleAngle; this._gazeTimer = 0.45 } else this._gazeTimer = Math.max(0, this._gazeTimer - dt)
    this._ripple = Math.max(0, this._ripple - dt * 2.2)
    this._stopJitter = Math.max(0, (this._stopJitter || 0) - dt)

    // 随机眨眼（阶段十五美化）：闭合 0.12s，让软体有「活物感」
    this._blinkT -= dt
    if (this._blinkT <= 0) {
      this._blinkT = 2 + Math.random() * 2.5
      this._blink = 0.12
    }
    this._blink = Math.max(0, this._blink - dt)

    // 元素氛围粒子（阶段十五美化）：形态色微粒环绕/上浮，元素身份一眼可辨
    const auraCfg = AURAS[this._mutation().key] || AURAS.base
    this._auraTimer -= dt
    if (this._auraTimer <= 0) {
      this._auraTimer = 0.14
      const a = Math.random() * TAU
      const d = this.radius * (0.5 + Math.random() * 0.6)
      this._aura.push({
        x: this.x + Math.cos(a) * d,
        y: this.y + Math.sin(a) * d,
        vx: (Math.random() - 0.5) * 16,
        vy: auraCfg.vy + (Math.random() - 0.5) * 20,
        life: auraCfg.life,
        maxLife: auraCfg.life,
        r: auraCfg.r * (0.8 + Math.random() * 0.4),
        color: auraCfg.colors[(Math.random() * auraCfg.colors.length) | 0],
      })
      if (this._aura.length > 16) this._aura.shift()
    }
    for (let i = this._aura.length - 1; i >= 0; i--) {
      const pa = this._aura[i]
      pa.life -= dt
      pa.x += pa.vx * dt
      pa.y += pa.vy * dt
      if (pa.life <= 0) this._aura.splice(i, 1)
    }

    const dir = this.input.getMoveVector()
    const moving = dir.x !== 0 || dir.y !== 0
    const previousX = this.x
    const previousY = this.y
    if (this.adrenalineTimer > 0) this.adrenalineTimer -= dt // 肾上腺素计时与移动状态无关，统一衰减
    if (this.originMoveBuffTimer > 0) this.originMoveBuffTimer = Math.max(0, this.originMoveBuffTimer - dt)

    // 影袭独占位移，其余技能不打断普通移动。
    const shadowMoving = this.game.weaponSystem?.shadowCombat?.updateMovement(dt)
    if (shadowMoving) {
      // 影袭自己处理分段移动、碰撞与穿行伤害，避免同时普通移动。
    } else if (moving) {
      if (this.speedBuffTimer > 0) this.speedBuffTimer -= dt
      const rushBonus = this.killRushTimer > 0 ? this.killRushSpeed : 0
      const adrenaline = this.adrenalineTimer > 0 ? this.adrenalineSpeed : 0
      const feast = this.gluttonFeastTimer > 0 ? GLUTTON_FEAST_SPEED : 0
      const originFlow = this.originMoveBuffTimer > 0 ? (this.originMoveBuff || 0) : 0
      const terrainMul = this.game.mapFeatures?.speedMultiplierAt(this.x, this.y, 'player') || 1
      const formationMul = this.game.endlessFormationBreakTimer > 0
        ? ENDLESS_FORMATION_BREAK_SPEED_MUL
        : 1
      const curSpeed = this.speed * (this.speedBuffTimer > 0 ? 1.25 : 1) *
        (1 + rushBonus + adrenaline + feast + originFlow) * terrainMul * formationMul * (this.volleyMoveTimer > 0 ? 1.2 : 1) * (this.game?.bossTomes?.moveMultiplier || 1)
      this.x += dir.x * curSpeed * dt
      this.y += dir.y * curSpeed * dt
      // 面朝方向平滑转向（dt 归一化，帧率无关）
      this.facing = angleLerp(this.facing, Math.atan2(dir.y, dir.x), Math.min(1, dt * 12))
      // 酸液拖尾（火+毒 / 水+毒 组合）：移动时留下腐蚀液滴
      if (this._mutation().trail) {
        this._trailTimer -= dt
        if (this._trailTimer <= 0) {
          this._trailTimer = 0.1
          this._trail.push({ x: this.x, y: this.y + this.radius * 0.6, life: 0.5, r: this.radius * 0.14 })
          if (this._trail.length > 10) this._trail.shift()
        }
      }
    }

    // 拉伸系数缓动，让起步/急停有「果冻惯性」
    const prevBlend = this.moveBlend
    this.moveBlend += ((moving ? 1 : 0) - this.moveBlend) * Math.min(1, dt * 8)
    const arenaOrigin = this.strainId === 'origin' && this.game?.gameplayId === 'arena'
    if (arenaOrigin) {
      if (this._wasMoving && !moving) this._stopJitter = 0.18
      this._wasMoving = moving
    } else if (prevBlend - this.moveBlend > 0.35) {
      this._stopJitter = 0.18
    }

    // 拖尾液滴衰减
    for (let i = this._trail.length - 1; i >= 0; i--) {
      this._trail[i].life -= dt
      if (this._trail[i].life <= 0) this._trail.splice(i, 1)
    }

    // 世界边界约束（大地图模式：夹在世界边缘，而非视口）
    const { worldWidth, worldHeight } = this.game
    this.x = clamp(this.x, this.radius, worldWidth - this.radius)
    this.y = clamp(this.y, this.radius, worldHeight - this.radius)
    if (!shadowMoving) this.game.mapFeatures?.resolvePlayerMovement(this, previousX, previousY)
  }

  render(ctx) {
    const r = this.radius
    const t = this.elapsed
    const isArenaOrigin = this.strainId === 'origin' && this.game?.gameplayId === 'arena'
    const mut = this._mutation()
    const look = getSlimeFamilyArt(this.strainId)
    // Elemental wears its chosen elements as orbs and body tint; other strains ignore this.
    const familyElements = this.strainId === 'elemental' && this.elements ? [...this.elements.keys()] : []
    let baseAlpha = mut.alpha ?? 1
    const shadowPose = this.game?.weaponSystem?.shadowCombat?.pose
    if (shadowPose) baseAlpha *= shadowPose.alpha
    if (this.evasionFlash > 0) baseAlpha *= 0.45
    if (this.stealthTimer > 0) baseAlpha *= 0.45 // 刺客潜行半透明

    // 暗影替身：低饱和紫色剪影，保持安静但能清楚解释敌人转火。
    for (const decoy of this._decoys) {
      const k = Math.max(0, decoy.life / decoy.maxLife)
      ctx.save()
      ctx.translate(decoy.x, decoy.y)
      ctx.globalAlpha = (decoy.flash > 0 ? 0.62 : 0.34) * Math.min(1, k * 2)
      ctx.fillStyle = '#7d6bd8'
      ctx.beginPath()
      ctx.ellipse(0, 0, decoy.radius, decoy.radius * 0.82, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = 'rgba(225, 218, 255, 0.72)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.beginPath()
      ctx.arc(-decoy.radius * 0.28, -2, 2.4, 0, TAU)
      ctx.arc(decoy.radius * 0.28, -2, 2.4, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    // ---- 荒古吞噬领主：常驻吞噬引力黑洞光环 ----
    if (this.isGluttonyLord) {
      ctx.save()
      ctx.translate(this.x, this.y)
      const vp = 0.5 + 0.5 * Math.sin(t * 6)
      const grad = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.2 + vp * 6)
      grad.addColorStop(0, 'rgba(255, 159, 67, 0.35)')
      grad.addColorStop(0.7, 'rgba(238, 82, 83, 0.15)')
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, r * 2.2 + vp * 6, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    // 无敌帧闪烁（与异变透明度叠加）
    const blink = this.invincible > 0 && Math.floor(this.invincible * 14) % 2 === 0
    ctx.globalAlpha = blink ? baseAlpha * 0.45 : baseAlpha

    // ---- 酸液拖尾（世界空间，半透明液滴；dash 为冲刺白色残影） ----
    for (const p of this._trail) {
      ctx.globalAlpha = (p.life / 0.5) * 0.4
      ctx.fillStyle = p.dash ? 'rgba(255, 255, 255, 0.45)' : look.body
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = blink ? baseAlpha * 0.45 : baseAlpha

    // ---- 元素氛围粒子（身体后方环绕，阶段十五美化） ----
    for (const pa of this._aura) {
      ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife) * 0.7
      ctx.fillStyle = pa.color
      ctx.beginPath()
      ctx.arc(pa.x, pa.y, pa.r, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = blink ? baseAlpha * 0.45 : baseAlpha

    // ---- 地面阴影（软阴影：径向渐变，比平涂椭圆更柔和） ----
    ctx.save()
    ctx.translate(this.x, this.y + r * 0.85)
    ctx.scale(1, 0.32)
    if (this._shadowKey !== r) {
      const sh = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r)
      sh.addColorStop(0, 'rgba(0, 0, 0, 0.32)')
      sh.addColorStop(1, 'rgba(0, 0, 0, 0)')
      this._shadowGrad = sh
      this._shadowKey = r
    }
    ctx.fillStyle = this._shadowGrad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
    ctx.restore()

    // ---- 挤压-拉伸：Q 弹动画核心 ----
    const idleSquash = Math.sin(t * 3.4) * 0.05 // 待机果冻呼吸
    const stretch = this.moveBlend * 0.14 // 移动拉伸
    let sx = 1 + stretch - idleSquash
    let sy = 1 - stretch * 0.55 + idleSquash * 1.2 // 与 sx 近似保体积
    if (isArenaOrigin && this._ripple > 0) {
      const progress = 1 - Math.min(1, this._ripple / 0.5)
      const recoil = Math.cos(progress * TAU) * Math.exp(-progress * 4)
      sx *= 1 - recoil * 0.055
      sy *= 1 + recoil * 0.055
    }

    const bite = this.game?.weaponSystem?.gluttonCombat.pose || shadowPose || this.game?.weaponSystem?.spellCombat?.pose
    if (bite) {
      const horizontal = Math.cos(bite.angle) ** 2
      sx *= bite.sx * horizontal + bite.sy * (1 - horizontal)
      sy *= bite.sy * horizontal + bite.sx * (1 - horizontal)
    }
    // 猎食点脉冲按资源归属而非血统名判定：origin 拟态暴食后同样反馈
    const chargePulse = this.gluttonCharge >= 0 ? this.gluttonLastGainPulse / 0.6 : 0
    if (chargePulse > 0) { sx *= 1 + chargePulse * 0.07; sy *= 1 + chargePulse * 0.07 }

    // 吞噬膨胀脉冲（吞咽瞬间果冻鼓起）
    if (this._devourPulse > 0) sx *= 1 + this._devourPulse * 0.35
    if (this._devourPulse > 0) sy *= 1 + this._devourPulse * 0.35

    // 急停抖动：保体积过冲 wobble
    if (this._stopJitter > 0) {
      const j = this._stopJitter / 0.18
      const wob = 1 + Math.sin(t * 55) * 0.07 * j
      sx *= wob
      sy /= wob
    }

    // 当前软体受击弹簧：冲击压缩 -> 弹性回弹 -> 稳定，复用 flash 计时器（0.25s）
    if (this.flash > 0) {
      const hp = 1 - this.flash / 0.25
      const spring = Math.exp(-hp * 5.5) * Math.cos(hp * Math.PI * 4)
      sx *= 1 + spring * 0.18
      sy *= 1 - spring * 0.2
    }

    ctx.save()
    const moveBounce = isArenaOrigin ? Math.sin(t * 11) * this.moveBlend * r * 0.035 : 0
    ctx.translate(this.x, this.y - moveBounce)
    // Keep the portrait upright; facing drives a small lean and the attack lunge.
    ctx.rotate(Math.cos(bite?.angle ?? this.facing) * this.moveBlend * 0.06)
    if (bite) ctx.translate(Math.cos(bite.angle) * r * bite.offset, Math.sin(bite.angle) * r * bite.offset) // 纯动画前探，不改变碰撞位置和冲刺朝向。
    ctx.scale(sx, sy) // 形变作用于整个身体（含五官）

    const assets = AssetManager.getInstance()

    // 进化外显配件（背面层：角/甲壳）；元素史莱姆用自身的元素球表达元素，不再叠加配件
    const elementProps = this.strainId !== 'elemental'
    if ((elementProps && this.elements.has('lightning')) || mut.arcs) {
      assets.draw(ctx, 'prop_lightning_horns', 0, -r * 0.5, r * 1.8, r * 1.8)
    }
    if ((elementProps && this.elements.has('fire')) || mut.inner === 'fire' || mut.key === 'acid') {
      assets.draw(ctx, 'prop_magma_plates', 0, -r * 0.4, r * 1.6, r * 1.6)
    }
    if ((elementProps && this.elements.has('poison')) || mut.inner === 'poison') {
      assets.draw(ctx, 'prop_poison_bubbles', 0, -r * 0.4, r * 1.6, r * 1.6)
    }

    // The same layered vector artwork as the selection portrait, cached offscreen.
    const paintSilhouette = options => paintSlimeFamilySilhouette(ctx, this.strainId, r, options)

    // 面部朝向：攻击/开火时看向目标，移动时看向前进方向，静止回中；按游戏时间平滑，避免跳变
    const gazing = !!bite || this._gazeTimer > 0
    const gazeAngle = bite ? bite.angle : gazing ? this._gazeAngle : this.facing
    const gazeAmount = gazing ? 1 : this.moveBlend
    const gazeK = Math.min(1, Math.max(0, t - (this._lookT ?? t)) * 14)
    this._lookT = t
    this._lookX = (this._lookX || 0) + (Math.cos(gazeAngle) * gazeAmount - (this._lookX || 0)) * gazeK
    this._lookY = (this._lookY || 0) + (Math.sin(gazeAngle) * gazeAmount - (this._lookY || 0)) * gazeK

    renderSlimeFamilyBody(ctx, this.strainId, r, slimeFamilyBodyState(t, {
      bite: bite ? 1 : 0,
      swallowing: this._devourPulse > 0.03 ? 1 : 0,
      elements: familyElements,
      hitJolt: Math.max(0, this.flash / 0.25),
      recoil: this.strainId === 'ricochet' ? this._fireKick : 0,
      coreGlow: this.strainId === 'elemental' ? Math.min(1, (this.game?.weaponSystem?.spellCombat?.castPulse || 0) / 0.25) : 0,
    }))
    // Evolution adds material and effects while retaining the selected character.
    if (mut.key !== 'base') {
      ctx.save()
      ctx.globalAlpha *= 0.28
      paintSilhouette({ fill: mut.grad[1] })
      ctx.restore()
    }

    // 原生路线：用一层很淡的路线色剪影表达“液态变异方向”，不换身体。
    const originRoute = this.strainId === 'origin' ? ORIGIN_ROUTES[this.game?.originRoute] : null
    if (originRoute) {
      ctx.save()
      ctx.globalAlpha *= 0.2 + (this.overloadState?.active ? 0.12 : 0)
      paintSilhouette({ fill: originRoute.color })
      ctx.restore()
    }

    // ---- 元素异变体内纹理 ----
    if (mut.inner === 'fire') {
      // 橙红流体气泡（浮动）
      for (let i = 0; i < 2; i++) {
        const ph = t * 1.6 + i * 2.1
        const bx = Math.sin(ph) * r * 0.28
        const by = Math.cos(ph * 1.3) * r * 0.22 - r * 0.12
        const br = r * (0.09 + Math.sin(ph * 2) * 0.03)
        ctx.fillStyle = 'rgba(255, 110, 50, 0.6)'
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, TAU)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(255, 200, 120, 0.25)'
      ctx.beginPath()
      ctx.ellipse(-r * 0.15, -r * 0.1, r * 0.5, r * 0.38, 0.3, 0, TAU)
      ctx.fill()
    }
    if (mut.inner === 'lightning' || mut.arcs) {
      // 体内电弧
      ctx.strokeStyle = 'rgba(255, 250, 180, 0.9)'
      ctx.lineWidth = Math.max(1.5, r * 0.06)
      ctx.lineCap = 'round'
      for (let a = 0; a < 2; a++) {
        ctx.beginPath()
        const x0 = -r * 0.35 + a * r * 0.5
        ctx.moveTo(x0, -r * 0.25)
        let x = x0
        for (let i = 0; i < 4; i++) {
          x += r * 0.16
          const y = (i % 2 === 0 ? 1 : -1) * r * 0.14 + Math.sin(t * 28 + a * 3 + i * 1.7) * r * 0.05
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    if (mut.inner === 'poison') {
      // 边缘滴落的腐蚀液滴
      ctx.fillStyle = 'rgba(140, 255, 120, 0.5)'
      for (let i = 0; i < 3; i++) {
        const ph = t * 2 + i * 2.1
        const dx = (i - 1) * r * 0.35
        const dy = r * 0.55 + Math.sin(ph) * r * 0.12
        ctx.beginPath()
        ctx.arc(dx, dy, r * 0.1, 0, TAU)
        ctx.fill()
      }
    }
    if (mut.inner === 'water' || mut.ripple) {
      // 水流波纹
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 2; i++) {
        const ph = t * 2 + i * 1.5
        ctx.beginPath()
        ctx.ellipse(0, 0, r * (0.7 + Math.sin(ph) * 0.08), r * (0.5 + Math.cos(ph) * 0.06), 0, 0, TAU)
        ctx.stroke()
      }
    }
    if (mut.core) {
      // 不稳定核心
      const pulse = 0.5 + 0.5 * Math.sin(t * 5)
      ctx.fillStyle = `rgba(255, 60, 40, ${(0.3 + pulse * 0.3).toFixed(2)})`
      ctx.beginPath()
      ctx.arc(0, 0, r * (0.3 + pulse * 0.12), 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 220, 150, 0.6)'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.14, 0, TAU)
      ctx.fill()
    }

    // 动态表情判断（平时/愤怒/受击/吞噬/濒死/眨眼）
    let faceState = 'idle'
    if (this.flash > 0 || (this.invincible > 0 && Math.floor(this.invincible * 10) % 2 === 0)) {
      faceState = 'hurt'
    } else if (this._devourPulse > 0.03) {
      faceState = 'devour'
    } else if (isArenaOrigin && this.hp <= this.maxHp * 0.3) {
      faceState = 'lowhp'
    } else if (isArenaOrigin && this._blink > 0) {
      faceState = 'blink'
    } else if (this.moveBlend > 0.65) {
      faceState = 'angry'
    } else if (this.hp <= this.maxHp * 0.3) {
      faceState = 'lowhp'
    } else if (this._blink > 0) {
      faceState = 'blink'
    }

    renderSlimeFamilyFace(ctx, this.strainId, r, slimeFamilyFaceState(t, {
      hurt: faceState === 'hurt', blink: faceState === 'blink',
      devour: faceState === 'devour', angry: faceState === 'angry',
      lowhp: faceState === 'lowhp', bite: !!this.game?.weaponSystem?.gluttonCombat.pose,
      elements: familyElements, lookX: this._lookX, lookY: this._lookY,
    }))
    if (chargePulse > 0) {
      paintSilhouette({
        stroke: `rgba(255, 214, 190, ${chargePulse * 0.8})`, width: 2,
      })
    }

    // 受击红闪（叠在全身之上）
    if (this.flash > 0) {
      paintSilhouette({
        fill: `rgba(255, 80, 80, ${((this.flash / 0.25) * 0.45).toFixed(2)})`,
      })
    }

    // 受击内部波纹
    if (this._ripple > 0) {
      const k = 1 - this._ripple / 0.5
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.55 * (1 - k)).toFixed(2)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, r * (0.3 + k * 0.65), r * (0.2 + k * 0.55), 0, 0, TAU)
      ctx.stroke()
    }

    ctx.restore()
    ctx.globalAlpha = 1 // 恢复透明度
  }
}
