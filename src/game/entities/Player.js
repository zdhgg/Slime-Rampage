import { Entity } from '../core/Entity.js'
import { getActiveReactions, getElement } from '../ElementSystem.js'
import { ENDLESS_FORMATION_BREAK_SPEED_MUL } from '../EndlessMode.js'
import { AssetManager } from '../AssetManager.js'

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
 * 副反应槽的等级里程碑（等级 → 元素联动）：每次到达 +1 槽，上限 2 级加成。
 * 槽位 = 局外基因基础值 + 等级加成，最终封顶 MAX_REACTION_SLOTS——
 * 反应表 6 种组合去掉主形态后恰好 5 种副反应，再多也无槽可填。
 */
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

// —— 冲刺（阶段十三主动技能）：Space/Shift 触发 ——
const DASH_SPEED = 900 // 冲刺速度（px/s）
const DASH_TIME = 0.18 // 冲刺持续（秒）
const DASH_COOLDOWN = 1.2 // 冲刺冷却（秒）

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
 * 元素形态剪影（阶段十五设计改造）：
 * 每种元素拥有独立的轮廓语言，不再千篇一律的正圆——
 * 火有顶焰尖、水呈下坠水袋、雷是放射尖刺、毒是液泡凸起、凝胶微波边、
 * 风暴放射爆裂、酸液顶部气泡、腐蚀坑洼、蒸汽雾霭不规则、毒雷尖刺+液泡。
 * 剪影即身份：隔很远也能认出元素流派（配合颜色与氛围粒子）。
 * 点表：角度（度，0=右 90=下 180=左 270=上）+ 半径系数。
 */
const P = (arr) => arr.map(([a, k]) => ({ a: (a * Math.PI) / 180, k }))

const SHAPES = {
  fire: P([[0, 0.93], [45, 0.98], [90, 0.96], [135, 0.98], [180, 0.93], [225, 1.0], [270, 1.2], [315, 1.0]]),
  water: P([[0, 0.95], [45, 1.05], [90, 1.18], [135, 1.05], [180, 0.95], [225, 0.92], [270, 0.92], [315, 0.92]]),
  poison: P([[0, 1.0], [30, 0.93], [60, 1.06], [90, 0.95], [120, 1.06], [150, 0.93], [180, 1.0], [210, 0.93], [240, 1.06], [270, 0.95], [300, 1.06], [330, 0.93]]),
  lightning: P([[0, 0.95], [45, 1.18], [90, 0.95], [135, 1.18], [180, 0.95], [225, 1.18], [270, 0.95], [315, 1.18]]),
  acid: P([[0, 1.0], [30, 1.02], [60, 0.9], [90, 1.08], [120, 0.9], [150, 1.02], [180, 1.0], [210, 0.98], [240, 1.12], [270, 1.0], [300, 1.12], [330, 0.98]]),
  gel: P([[0, 1.0], [22.5, 0.96], [45, 1.04], [67.5, 0.96], [90, 1.04], [112.5, 0.96], [135, 1.04], [157.5, 0.96], [180, 1.0], [202.5, 0.96], [225, 1.04], [247.5, 0.96], [270, 1.04], [292.5, 0.96], [315, 1.04], [337.5, 0.96]]),
  storm: P([[0, 0.9], [45, 1.2], [90, 0.9], [135, 1.2], [180, 0.9], [225, 1.2], [270, 0.9], [315, 1.2]]),
  corrode: P([[0, 1.0], [40, 0.94], [80, 1.05], [100, 1.1], [120, 0.96], [160, 1.0], [200, 0.94], [240, 1.06], [270, 1.0], [300, 1.05], [330, 0.95]]),
  steam: P([[0, 1.0], [30, 0.97], [60, 1.05], [90, 0.96], [120, 1.04], [150, 0.96], [180, 1.0], [210, 0.97], [240, 1.05], [270, 0.97], [300, 1.04], [330, 0.96]]),
  venom: P([[0, 0.95], [45, 1.14], [90, 1.0], [135, 1.14], [180, 0.95], [225, 1.0], [270, 1.14], [315, 1.0]]),
}

/** 按剪影点表构建平滑闭合身体路径（二次贝塞尔过中点，有机轮廓零尖角） */
const blobPath = (ctx, r, points) => {
  const n = points.length
  const px = []
  for (const pt of points) px.push({ x: Math.cos(pt.a) * r * pt.k, y: Math.sin(pt.a) * r * pt.k })
  ctx.beginPath()
  ctx.moveTo((px[0].x + px[n - 1].x) / 2, (px[0].y + px[n - 1].y) / 2)
  for (let i = 0; i < n; i++) {
    const p = px[i]
    const q = px[(i + 1) % n]
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
  }
  ctx.closePath()
}

/** 构建身体路径：shape 为空时用经典正圆（基础形态保持原汁原味） */
const drawBody = (ctx, r, shape) => {
  const pts = shape ? SHAPES[shape] : null
  if (pts) blobPath(ctx, r, pts)
  else {
    ctx.beginPath()
    ctx.ellipse(0, 0, r, r, 0, 0, TAU)
  }
}

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
 *  - 面向角平滑转向，眼睛、腮红、微笑、光泽全部随身体形变
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
    // 基础值由局外基因写入（applyGenes），等级加成在 refreshReactionSlots 里叠加。
    this.baseSecondarySlots = 2
    this.secondarySlots = 2
    this._secondaryIds = new Set()
    this._refreshElements()

    // —— 基因属性（阶段八：黑市局外成长，由 applyGenes 维护） ——
    this.expGainMul = 1 // 经验获取倍率（经验基因）
    this.regen = 0 // 每 10s 回复量（再生基因）
    this._regenTimer = 10
    this.geneDevourHeal = 0
    this.geneDevourExpMul = 1
    this.geneDashCdMultiplier = 1

    // —— 本体异变与软体反馈（评审改造） ——
    this._bodyGrads = {} // 形态渐变缓存（按异变形态 key）
    this._devourPulse = 0 // 吞噬膨胀脉冲（衰减）
    this._ripple = 0 // 受击内部波纹（扩散衰减）
    this._stopJitter = 0 // 急停抖动（过冲衰减）
    this._trail = [] // 酸液拖尾液滴（火+毒 / 水+毒 组合）
    this._trailTimer = 0

    // —— 冲刺（阶段十三主动技能） ——
    this.dashCd = 0 // 冲刺冷却（秒）
    this._dashT = 0 // 冲刺剩余时间（秒）
    this._dashDir = { x: 0, y: 0 } // 冲刺方向（单位向量缓存）
    this._dashHitTargets = new Set() // 单次冲刺已命中目标集合（防多帧重复结算）
    // —— F 角色专属主动技能（阶段十九） ——
    // 冷却由 GameEngine._updateStrainSkill 推进，这里只持有状态；
    // origin（无角色身份）没有技能，冷却恒为 0、HUD 不渲染技能条。
    // 暴食是唯一例外：它不使用 strainSkillCd（见 GluttonResource.js），
    // 而 resource 型分支由 GameEngine 依据「是否拥有猎食点」自动切换。
    this.strainSkillCd = 0 // 剩余冷却（秒）
    this.strainSkillMax = 0 // 当前技能冷却上限（HUD 进度条用）
    this.strainSkillReadyPulse = 0 // 施放瞬间的反馈脉冲（秒）
    // —— 暴食猎食点资源（暴食 F 主动捕食） ——
    // 与「F 冷却」是两套语义：暴食没有主冷却，只有资源 + 0.3s 再次释放锁。
    // 状态放在 Player 上（与 strainSkillCd 同层）：随 resetRunState 归零、
    // 由 applyStrain 决定本角色的启用与否，不新建通用 ResourceSystem。
    // 口径与读写函数在 GluttonResource.js；这里只持有数值。
    this.gluttonCharge = 0 // 当前猎食点（-1 = 该角色不拥有此资源）
    this.gluttonDevourProgress = 0 // 正常吞噬进度（满 5 → +1 点）
    this.gluttonBossHuntProgress = 0 // Boss 普攻猎食进度（默认满 10 → +1 点，觉醒满 8）
    this.gluttonRecastLock = 0 // 再次释放锁剩余（0.3s，防同帧/连点连扣两点）
    this.gluttonLastGainPulse = 0 // 获得猎食点瞬间的 HUD 反馈脉冲（秒）
    // —— 肾上腺素（通用技能：受击转机动） ——
    this.adrenalineSpeed = 0 // 受击后移速加成（0 = 未习得）
    this.adrenalineTimer = 0 // 剩余爆发时间（秒）

    // —— 移动增强 BUFF（吞噬刺客等） ——
    this.speedBuffTimer = 0

    // —— 专精流派特质（阶段十八：深潜专精体系） ——
    this.devourRadiusBonus = 1.0 // 暴食：吞噬吸附半径倍率
    this.thornsPulse = false // 暴食：受击震退反伤
    this.dashCdMultiplier = 1.0 // 暴食/刺客：冲刺冷却倍率
    this.dashImpactDmg = 0 // 暴食：冲撞伤害倍率
    this.devourAcidSpray = 0 // 暴食：吞噬喷酸弹数
    this.isGluttonyLord = false // 暴食：终极觉醒（荒古吞噬领主）
    this.devourHeal = false // 暴食共鸣：吞噬必回血
    this.devourDamageReduction = 0 // 暴食共鸣：吞噬减伤
    this.regenInterval = 0 // 通用：自愈周期
    this.frostFireAura = 0 // 元素共鸣：霜火光环周期
    this._frostFireTimer = 0
    this.shadowDecoyDuration = 0 // 刺客：替身假人持续时间
    this._decoys = [] // 刺客：冲刺后留下的嘲讽替身
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

  /** 清理所有只应在单局内存在的技能与临时状态。 */
  resetRunState() {
    this.speedBuffTimer = 0
    this.devourRadiusBonus = 1
    this.thornsPulse = false
    this.dashCdMultiplier = 1
    this.dashImpactDmg = 0
    this.devourAcidSpray = 0
    this.isGluttonyLord = false
    this.devourHeal = false
    this.devourDamageReduction = 0
    this.devourDamageReductionTimer = 0
    this.regenInterval = 0
    this._regenTimer = 10
    this.frostFireAura = 0
    this._frostFireTimer = 0
    this.shadowDecoyDuration = 0
    this._decoys.length = 0
    this.killRushSpeed = 0
    this.killRushTimer = 0
    this.stealthTimer = 0
    this.guaranteedCrit = false
    this.adrenalineSpeed = 0
    this.adrenalineTimer = 0
    this._dashHitTargets.clear()
    this.strainSkillCd = 0 // F 角色技能冷却归位（角色身份随 applyStrain 重建）
    this.strainSkillMax = 0
    this.strainSkillReadyPulse = 0
    // 暴食猎食点资源归零（新局/重开不得残留；非暴食角色随后由 applyStrain 置 -1 关闭）
    this.gluttonCharge = 0
    this.gluttonDevourProgress = 0
    this.gluttonBossHuntProgress = 0
    this.gluttonRecastLock = 0
    this.gluttonLastGainPulse = 0
    this.elementProcCap = ELEMENT_PROC_CHANCE_CAP // 专精改写的附魔封顶归位
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
    if (this.dead) return // 死亡帧残差：不再吸收（防进化演出与结算面板叠加）
    // 元素权限（第三批角色化）：暴食/弹射/暗影不使用元素系统。
    // 这是防御性兜底闸门——上游（核心生成、E 交互、吞噬消化）已按同一权限
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
   * 重算副反应槽位（等级 → 元素联动）：
   *  - 槽位 = 局外基因基础值 + 等级里程碑加成（Lv.4 / Lv.8 各 +1，封顶 MAX_REACTION_SLOTS）；
   *  - 槽位扩张时，把「元素已经满足但当初因满槽被挤掉」的反应自动接入——
   *    升级本身就成为一次元素构筑的兑现，而不是只加数值。
   * @returns {Array} 本次自动接入的反应（供调用方播放提示；无变化时为空数组）
   */
  refreshReactionSlots() {
    const base = this.baseSecondarySlots ?? 2
    this.secondarySlots = Math.min(
      MAX_REACTION_SLOTS,
      base + getReactionSlotLevelBonus(this.level)
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
    this.exp += Math.round(amount * this.expGainMul) // 经验基因倍率
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
  hit(damage) {
    if (this.invincible > 0 || this.dead) return // 无敌帧内免疫（含死亡后）
    if (this.devourDamageReductionTimer > 0 && this.devourDamageReduction > 0) {
      damage = Math.max(1, Math.round(damage * (1 - this.devourDamageReduction)))
    }
    this.hp -= damage
    this.invincible = 0.5 // 0.5 秒无敌：仍防贴脸每帧连击，但持续受压会稳定掉血——走位有收益
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
          e.hit(2)
        }
      }
      this.game.weaponSystem._ring(this.x, this.y, '#ff9f43', 160)
    }

    if (this.hp <= 0) {
      this.hp = 0
      this.dead = true
      this.game.gameOver() // 引擎暂停 + 回调 Vue 弹结算面板
    }
  }

  update(dt) {
    if (this.dead) return // 死亡后不再更新（引擎随即暂停）
    this.invincible = Math.max(0, this.invincible - dt)
    this.flash = Math.max(0, this.flash - dt)
    this.dashCd = Math.max(0, this.dashCd - dt) // 冲刺冷却递减
    if (this.stealthTimer > 0) this.stealthTimer -= dt
    if (this.killRushTimer > 0) this.killRushTimer -= dt
    if (this.devourDamageReductionTimer > 0) this.devourDamageReductionTimer -= dt
    this.elapsed += dt

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

    // 荒古吞噬领主：把附近残血敌人持续拉入吞噬范围。
    if (this.isGluttonyLord && this.game.enemyManager) {
      for (const e of this.game.enemyManager.enemies) {
        if (!e.active || e.isBoss || e.devouring || !e.devourable) continue
        const dx = this.x - e.x
        const dy = this.y - e.y
        const d2 = dx * dx + dy * dy
        if (d2 > 260 * 260 || d2 < 1) continue
        const d = Math.sqrt(d2)
        const pull = Math.min(d, 420 * dt)
        e.x += (dx / d) * pull
        e.y += (dy / d) * pull
      }
    }

    // 软体反馈计时衰减
    this._devourPulse = Math.max(0, this._devourPulse - dt * 1.2)
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
    const wasDashing = this._dashT > 0
    if (this.adrenalineTimer > 0) this.adrenalineTimer -= dt // 肾上腺素计时与移动状态无关，统一衰减

    // —— 冲刺（阶段十三主动技能：Space/Shift） ——
    if (this._dashT > 0) {
      // 冲刺中：高速位移 + 残影拖尾，期间无敌帧已在触发时注入
      this._dashT -= dt
      this.x += this._dashDir.x * DASH_SPEED * dt
      this.y += this._dashDir.y * DASH_SPEED * dt
      this._trailTimer -= dt
      if (this._trailTimer <= 0) {
        this._trailTimer = 0.03
        this._trail.push({
          x: this.x,
          y: this.y + this.radius * 0.6,
          life: 0.35,
          r: this.radius * 0.18,
          dash: true,
        })
        if (this._trail.length > 24) this._trail.shift()
      }

      // 暴食冲撞撞击 / 荒古领主冲刺秒杀吞噬（单次冲刺内对同一目标仅结算一次）
      if ((this.dashImpactDmg > 0 || this.isGluttonyLord) && this.game.enemyManager) {
        for (const e of this.game.enemyManager.enemies) {
          if (!e.active || e.devouring || this._dashHitTargets.has(e)) continue
          const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2
          const hitR = this.radius + e.radius + 12
          if (d2 <= hitR * hitR) {
            this._dashHitTargets.add(e)
            if (this.isGluttonyLord && !e.isBoss && e.hp <= e.maxHp * 0.5) {
              this.game.weaponSystem?.onDevoured?.(e)
              e.destroy()
            } else if (this.dashImpactDmg > 0 && this.game.weaponSystem) {
              // 冲撞伤害随等级成长（levelMul）与捕食吞噬加成，并附带元素附魔 + 统一击杀结算
              const ws = this.game.weaponSystem
              ws.dashImpact(e, ws.damage * ws.levelMul * ws.devourDamageMul * this.dashImpactDmg)
            }
          }
        }
      }
      if (this._dashT <= 0) this._dashHitTargets.clear()
    } else if (this.input.consumeDash() && this.dashCd <= 0) {
      // 触发冲刺：方向 = 当前移动方向，静止时朝面朝方向
      this._dashHitTargets.clear()
      if (this.shadowDecoyDuration > 0) {
        this._decoys.push({
          x: this.x,
          y: this.y,
          radius: this.radius * 0.85,
          life: this.shadowDecoyDuration,
          maxLife: this.shadowDecoyDuration,
          flash: 0,
          isDecoy: true,
        })
        if (this._decoys.length > 2) this._decoys.shift()
      }
      this.dashCd = DASH_COOLDOWN * (this.dashCdMultiplier || 1) * (this.geneDashCdMultiplier || 1)
      this._dashT = DASH_TIME
      if (moving) {
        this._dashDir.x = dir.x
        this._dashDir.y = dir.y
      } else {
        this._dashDir.x = Math.cos(this.facing)
        this._dashDir.y = Math.sin(this.facing)
      }
      this.invincible = Math.max(this.invincible, this.isGluttonyLord ? 0.45 : 0.25)
      this.moveBlend = 1
      this.game.sound.dash()

      // 刺客：潜行与必暴
      if (this.game.weaponSystem?.isShadowLord) {
        this.stealthTimer = 1.5
        this.guaranteedCrit = true
      }
    } else if (moving) {
      if (this.speedBuffTimer > 0) this.speedBuffTimer -= dt
      const rushBonus = this.killRushTimer > 0 ? this.killRushSpeed : 0
      const adrenaline = this.adrenalineTimer > 0 ? this.adrenalineSpeed : 0
      const terrainMul = this.game.mapFeatures?.speedMultiplierAt(this.x, this.y, 'player') || 1
      const formationMul = this.game.endlessFormationBreakTimer > 0
        ? ENDLESS_FORMATION_BREAK_SPEED_MUL
        : 1
      const curSpeed = this.speed * (this.speedBuffTimer > 0 ? 1.25 : 1) *
        (1 + rushBonus + adrenaline) * terrainMul * formationMul
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
    // 急停抖动：拉伸系数骤降时触发过冲 wobble（软体反馈）
    if (prevBlend - this.moveBlend > 0.35) this._stopJitter = 0.18

    // 拖尾液滴衰减
    for (let i = this._trail.length - 1; i >= 0; i--) {
      this._trail[i].life -= dt
      if (this._trail[i].life <= 0) this._trail.splice(i, 1)
    }

    // 世界边界约束（大地图模式：夹在世界边缘，而非视口）
    const { worldWidth, worldHeight } = this.game
    this.x = clamp(this.x, this.radius, worldWidth - this.radius)
    this.y = clamp(this.y, this.radius, worldHeight - this.radius)
    this.game.mapFeatures?.resolvePlayerMovement(this, previousX, previousY, wasDashing)
  }

  render(ctx) {
    const r = this.radius
    const t = this.elapsed
    const mut = this._mutation()
    let baseAlpha = mut.alpha ?? 1
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
      ctx.fillStyle = p.dash ? 'rgba(255, 255, 255, 0.45)' : '#c8e84a'
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

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.facing) // 面向角：+x 轴即移动方向
    ctx.scale(sx, sy) // 形变作用于整个身体（含五官）

    const assets = AssetManager.getInstance()

    // 进化外显配件（背面层：角/甲壳）
    if (this.elements.has('lightning') || mut.arcs) {
      assets.draw(ctx, 'prop_lightning_horns', 0, -r * 0.5, r * 1.8, r * 1.8)
    }
    if (this.elements.has('fire') || mut.inner === 'fire' || mut.key === 'acid') {
      assets.draw(ctx, 'prop_magma_plates', 0, -r * 0.4, r * 1.6, r * 1.6)
    }
    if (this.elements.has('poison') || mut.inner === 'poison') {
      assets.draw(ctx, 'prop_poison_bubbles', 0, -r * 0.4, r * 1.6, r * 1.6)
    }

    // 身体径向渐变（按异变形态缓存，懒构建）
    let g = this._bodyGrads[mut.key]
    if (!g) {
      g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.15)
      g.addColorStop(0, mut.grad[0])
      g.addColorStop(0.45, mut.grad[1])
      g.addColorStop(1, mut.grad[2])
      this._bodyGrads[mut.key] = g
    }

    // 身体（阶段十五设计改造：元素形态剪影差异化）
    drawBody(ctx, r, mut.shape)
    ctx.fillStyle = g
    ctx.fill()

    // 血统染色（先天属性的可视标识）：岩壳石纹 / 电光弧光 / 贪噬口器
    if (this.strainTint) {
      ctx.save()
      ctx.clip()
      ctx.fillStyle = this.strainTint
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.05, 0, TAU)
      ctx.fill()
      if (this.strainDeco === 'stone') {
        ctx.fillStyle = 'rgba(202, 216, 230, 0.5)'
        for (const [dx, dy, br] of [[-0.35, -0.2, 0.13], [0.3, 0.16, 0.16], [-0.05, 0.42, 0.1]]) {
          ctx.beginPath()
          ctx.arc(dx * r, dy * r, br * r, 0, TAU)
          ctx.fill()
        }
      } else if (this.strainDeco === 'volt') {
        ctx.strokeStyle = 'rgba(190, 240, 255, 0.75)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.72, -2.2, -0.9)
        ctx.stroke()
      } else if (this.strainDeco === 'glutton') {
        ctx.strokeStyle = 'rgba(120, 232, 100, 0.8)'
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.ellipse(0, r * 0.18, r * 0.34, r * 0.22, 0, 0, TAU)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 菲涅尔边缘内发光（Fresnel Rim Light · 果冻晶莹通透感核心）
    ctx.save()
    ctx.clip()
    const rimG = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r)
    rimG.addColorStop(0, 'rgba(255, 255, 255, 0)')
    rimG.addColorStop(0.8, 'rgba(255, 255, 255, 0.18)')
    rimG.addColorStop(1, 'rgba(255, 255, 255, 0.48)')
    ctx.fillStyle = rimG
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.1, 0, TAU)
    ctx.fill()
    ctx.restore()

    // 底部内侧阴影（裁剪进身体轮廓，营造果冻立体感）
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(10, 40, 20, 0.28)'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.42, r * 0.82, r * 0.5, 0, 0, TAU)
    ctx.fill()
    ctx.restore()

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

    // 轮廓描边（跟随形态剪影）
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(15, 90, 26, 0.55)'
    drawBody(ctx, r, mut.shape)
    ctx.stroke()

    // 边缘柔光
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 1.5
    drawBody(ctx, r + 1, mut.shape)
    ctx.stroke()

    // 动态表情判断（平时/愤怒/受击/吞噬/濒死/眨眼）
    let faceState = 'idle'
    if (this.flash > 0 || (this.invincible > 0 && Math.floor(this.invincible * 10) % 2 === 0)) {
      faceState = 'hurt'
    } else if (this._devourPulse > 0.03) {
      faceState = 'devour'
    } else if (this._dashT > 0 || this.moveBlend > 0.65) {
      faceState = 'angry'
    } else if (this.hp <= this.maxHp * 0.3) {
      faceState = 'lowhp'
    } else if (this._blink > 0) {
      faceState = 'blink'
    }

    // 绘制高清面部表情精灵
    assets.draw(ctx, `slime_face_${faceState}`, 0, 0, r * 1.5, r * 1.5)

    // 顶部水润多层高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.22, r * 0.11, -0.6, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.beginPath()
    ctx.arc(-r * 0.12, -r * 0.5, r * 0.07, 0, TAU)
    ctx.fill()

    // 受击红闪（叠在全身之上）
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 80, 80, ${((this.flash / 0.25) * 0.45).toFixed(2)})`
      drawBody(ctx, r, mut.shape)
      ctx.fill()
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
