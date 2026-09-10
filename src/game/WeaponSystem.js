import { Entity } from './core/Entity.js'
import { Projectile } from './entities/Projectile.js'
import { Particle } from './effects/Particle.js'
import { getPaletteMid } from './entities/Enemy.js'
import { getDigestTier, getElement } from './ElementSystem.js'
import { CELL_SIZE, GRID_KEY_SCALE } from './EnemyManager.js' // 复用分离阶段的空间哈希（碰撞粗筛）
import { ENDLESS_FORMATION_BREAK_ATTACK_INTERVAL_MUL } from './EndlessMode.js'
import { resolveWeaponVisual, splitWeaponVisual, tintedWeaponVisual } from './WeaponVisuals.js'

const TAU = Math.PI * 2
export const COMMON_LOOT_CHANCE = 0.1

/**
 * 消化进度（吞噬 → 元素联动）：
 * 每吞噬一个敌人累积能量，满槽时把「吃下去的血肉」转化为一次元素等级爆发。
 * 普通怪 6 点 / 精英 14 点（抢吞精英同时加速元素成长，强化既有的高光决策），
 * 满槽后若无已吸收元素则保持满载等待——第一次吸收核心时立刻兑现，不浪费。
 */
export const DIGEST_CHARGE_MAX = 100
export const DIGEST_GAIN_NORMAL = 6
export const DIGEST_GAIN_ELITE = 14

export function getLootDropCount(enemy, random = Math.random) {
  if (enemy.isBoss) {
    if (enemy.isExpeditionStageBoss && !enemy.isExpeditionBoss) return 1
    if (enemy.isBossSquadMember) return Math.max(0, enemy.bossLootDrops ?? 1)
    return 3
  }
  if (enemy.isElite) return 1
  return random() < COMMON_LOOT_CHANCE ? 1 : 0
}

/**
 * 等级攻击力成长（阶段十二）：每次升级自动 ×1.08（乘算）。
 * 与「腐蚀性体液」技能（×1.2/级）独立相乘——等级是保底数值成长，
 * 技能是构筑向强化，两者叠加后后期依旧需要元素反应撑强度。
 */
const LEVEL_DMG_GROWTH = 1.08

/**
 * 武器系统：自动索敌 + 追踪弹发射 + 碰撞伤害结算 + 击杀粒子
 *
 * 自动索敌算法（_findNearest）：
 *  - 冷却 CD 归零时，单趟 O(n) 扫描所有存活敌人，用「距离平方」
 *    比较找出最近者——平方比较免去每帧开方（Math.hypot/sqrt 是
 *    热路径中最贵的操作之一）；
 *  - 若后续要「一次锁定多个目标」，只需对敌人列表做 top-k 选择
 *    或对最近者之外再跑一次排除最近者的扫描。
 *
 * 圆碰撞检测（_resolveCollisions）：
 *  - 空间哈希粗筛（阶段十三）：复用 EnemyManager 分离阶段每帧重建的网格，
 *    只检查飞弹所在 3×3 邻域内的敌人，把 O(飞弹×敌人) 全量扫描降为
 *    近 O(飞弹×局部密度)——满配齐射 + 分裂 + 300 敌时差距显著；
 *  - 网格内仍保留两阶段递进精筛：
 *    ① 绝对值粗筛：|dx| 或 |dy| 已大于半径和 → 不可能重叠（无乘法无开方）；
 *    ② 距离平方精判：dx² + dy² < rr² → 命中（平方对比，避免开方）。
 *  - 命中后飞弹销毁、敌人扣血，粒子在命中点炸开。
 */
export class WeaponSystem extends Entity {
  constructor({ player, enemyManager }) {
    super()
    this.player = player // 发射原点
    this.enemyManager = enemyManager // 索敌与碰撞的对象
    this.fireInterval = 1.0 // 攻击冷却 CD（秒）
    this.cooldown = 0.5 // 开局 0.5s 后打出第一发
    this.damage = 1 // 单发伤害（技能「攻击力+20%」会乘算放大）
    this.levelMul = 1 // 等级攻击力成长（每次升级 ×LEVEL_DMG_GROWTH，reset 归 1）
    this.projectileCount = 1 // 每次发射的飞弹数量（技能「飞弹+1」）
    this.projectileSpeed = 520 // 飞弹飞行速度（技能「弹速+15%」）
    // —— 特效概率（阶段七：技能等级驱动，fire 时注入每枚飞弹） ——
    this.splitChance = 0 // 分裂（= 基因基础值 + 技能叠加值）
    this.baseSplitChance = 0 // 分裂基因基础值（黑市永久被动）
    // 基础暴击 10%：让玩家开局就能看到金色暴击数字（反馈教学），
    // 「暴击腺体」技能覆盖提升至 15/30/45%
    this.critChance = 0.1
    this.freezeChance = 0 // 冰冻
    this.burnChance = 0 // 燃烧
    this.poisonChance = 0 // 染毒
    this.kills = 0 // 累计击杀（HUD 显示）
    this.devours = 0
    this.eliteKills = 0
    this.bossKills = 0
    // 连杀计数（阶段十二）：1.8s 窗口内连续击杀数，驱动击杀音高爬升
    this._combo = 0
    this._comboTimer = 0
    this.drops = { knight: 0, mage: 0, archer: 0, assassin: 0, priest: 0, berserker: 0, hound: 0, golem: 0, wraith: 0 } // 本局勇者掉落物计数
    this.berserkBuffTimer = 0 // 狂暴连击 BUFF（吞噬狂战士获得）

    // —— 专精系统字段（阶段十八：流派体系） ——
    this.reactionDmgMul = 1.0 // 元素共鸣：反应伤害倍率
    this.reactionShockwave = 0 // 元素过载：爆轰震荡波倍率
    this.plagueSpreadCount = 0 // 瘟疫传染：传染目标数
    this.isGatlingMother = false // 机枪：终极母体觉醒
    this.isChaosOrigin = false // 元素：终极混沌原质觉醒
    this.isShadowLord = false // 刺客：终极暗影无相觉醒
    this.critMul = 3.0 // 刺客：暴击伤害倍率
    this.executeCrit = false // 刺客共鸣：残血暴伤翻倍
    this.splitPierces = 0 // 机枪：分裂弹穿透数
    this.basePierces = 0 // 机枪共鸣：基础飞弹穿透数
    this.genePierces = 0 // 黑市动能原核：所有飞弹额外穿透
    this.geneReactionDmgMul = 1 // 黑市共鸣原核：与局内反应倍率独立乘算
    this.devourDamageMul = 1 // 黑市捕食原核：每次吞噬 +3% 攻击（封顶 2.0，本局内滚雪球）
    // —— 专精 → 元素联动（主专精改写元素玩法规则，不加数值） ——
    this.splitInherit = 0.5 // 分裂弹继承母弹附魔/暴击概率的比例（机枪主专精抬到 100%）
    this.critGuaranteesElement = false // 暴击必定触发元素附魔（刺客主专精：精准打击弱点）
    // —— 吞噬 → 元素联动：消化进度（吞噬累积 → 元素等级爆发） ——
    this.digestCharge = 0 // 当前消化能量（0 ~ digestChargeMax）
    this.digestChargeMax = DIGEST_CHARGE_MAX
    this.digestGainMul = 1 // 消化转化效率（暴食主专精：胃袋把血肉变成元素养分）
    this.digestBursts = 0 // 消化爆发次数（物种档案统计）
    this.visualTiers = { gluttony: 0, gatling: 0, elemental: 0, assassin: 0 }
    this._muzzleT = 0
    this._muzzleAngle = 0
    this._muzzleVisual = null
    this._weaponPulse = 0

    this._projectiles = []
    this._particles = []
    this._pools = [] // 酸液池（火+毒：区域污染 + 引爆）
    this._clouds = [] // 蒸汽云雾（火+水：区域减速）
    this._singularities = [] // 混沌原质：短时牵引场
    this._rings = [] // 死亡扩散环（阶段十五美化）
    this.stats = { maxChain: 0, explosions: 0, slowClouds: 0, venomStorms: 0 } // 代表行为统计（物种档案）
    // 全屏麻痹（雷+水）计时器：周期触发
    this._stormTimer = 5
    // 毒雷风暴（毒+雷）计时器：周期触发
    this._venomTimer = 6
  }

  /** 激活狂暴连击攻速爆发（秒） */
  addBerserkBuff(duration = 3) {
    this.berserkBuffTimer = Math.max(this.berserkBuffTimer, duration)
  }

  /** 重置武器属性与弹幕（游戏重开时由引擎调用） */
  reset() {
    this.fireInterval = 1.0
    this.cooldown = 0.5
    this.damage = 1
    this.levelMul = 1 // 等级攻击力成长归 1（重开即全新曲线）
    this.projectileCount = 1
    this.projectileSpeed = 520
    this.splitChance = this.baseSplitChance // 基因基础分裂保留，技能叠加清零
    this.critChance = 0.1 // 基础暴击保留（技能覆盖值清零）
    this.freezeChance = 0
    this.burnChance = 0
    this.poisonChance = 0
    this.kills = 0
    this.devours = 0
    this.eliteKills = 0
    this.bossKills = 0
    this._combo = 0
    this._comboTimer = 0
    this.drops = { knight: 0, mage: 0, archer: 0, assassin: 0, priest: 0, berserker: 0, hound: 0, golem: 0, wraith: 0 }
    this.berserkBuffTimer = 0
    this.reactionDmgMul = 1.0
    this.reactionShockwave = 0
    this.plagueSpreadCount = 0
    this.isGatlingMother = false
    this.isChaosOrigin = false
    this.isShadowLord = false
    this.critMul = 3.0
    this.executeCrit = false
    this.splitPierces = 0
    this.basePierces = 0
    this.genePierces = 0
    this.geneReactionDmgMul = 1
    this.devourDamageMul = 1
    // 专精改写标记归位（元素专精的附魔封顶在 Player.resetRunState）
    this.splitInherit = 0.5
    this.critGuaranteesElement = false
    this.digestCharge = 0
    this.digestChargeMax = DIGEST_CHARGE_MAX
    this.digestGainMul = 1
    this.digestBursts = 0
    this.visualTiers = { gluttony: 0, gatling: 0, elemental: 0, assassin: 0 }
    this._muzzleT = 0
    this._muzzleAngle = 0
    this._muzzleVisual = null
    this._weaponPulse = 0
    this._projectiles.length = 0
    this._particles.length = 0
    this._pools.length = 0
    this._clouds.length = 0
    this._singularities.length = 0
    this._rings.length = 0
    this.stats = { maxChain: 0, explosions: 0, slowClouds: 0, venomStorms: 0 }
    this._stormTimer = 5
    this._venomTimer = 6
  }

  /**
   * 当前激活的元素反应检测（评审 Day 1：反应表驱动，不再硬编码组合）。
   * 阶段十三：改读玩家侧缓存集合（吸收元素时重建），热路径 O(1) 零分配。
   */
  _hasReaction(id) {
    return this.player._reactionIds.has(id)
  }

  /** 取激活反应定义（供强度缩放读取 combo 元素等级） */
  _getReaction(id) {
    return this.player._reactionMap.get(id) || null
  }

  /**
   * 反应强度（阶段十三：元素等级数值化）：取组合元素的最低等级。
   * 反应激活即各元素 ≥1 级，等级越高反应越强。
   */
  _reactionPower(r) {
    const els = this.player.elements
    let m = Infinity
    for (const id of r.combo) {
      const lv = els.get(id) || 0
      if (lv < m) m = lv
    }
    return m > 0 ? m : 1
  }

  /**
   * 玩家升级回调（Player.gainExp 触发）：等级攻击力成长。
   * 只随玩家等级增长，王级秘籍/免费面板不加成。
   */
  onLevelUp() {
    this.levelMul *= LEVEL_DMG_GROWTH
  }

  /** 自动索敌：返回距玩家最近的存活敌人（无则 null） */
  _findNearest() {
    const px = this.player.x
    const py = this.player.y
    let best = null
    let bestD2 = Infinity
    for (const e of this.enemyManager.enemies) {
      if (!e.active || e.devouring) continue // 死亡待回收/吞噬中的敌人不可作为目标
      const dx = e.x - px
      const dy = e.y - py
      const d2 = dx * dx + dy * dy // 距离平方：免开方
      if (d2 < bestD2) {
        bestD2 = d2
        best = e
      }
    }
    return best
  }

  /**
   * 飞弹辉光颜色（阶段十五：武器行为可视化）：
   * 主形态（第一个融合的反应）优先——飞弹颜色 = 物种身份；
   * 其次其他激活反应/单元素，默认黏液绿。
   */
  _glowColor() {
    const REACTION_GLOW = {
      venom: '#c9a6f0',
      acid: '#c8e84a',
      gel: '#8ae8f7',
      steam: '#dff4fb',
      corrode: '#a8f06a',
      burst: '#ffc166',
    }
    const primary = this.player._primaryReaction
    if (primary && this._hasReaction(primary) && REACTION_GLOW[primary]) return REACTION_GLOW[primary]
    for (const id of ['venom', 'acid', 'gel', 'steam', 'corrode', 'burst']) {
      if (this._hasReaction(id)) return REACTION_GLOW[id]
    }
    const ELEMENT_GLOW = { fire: '#ffb066', water: '#8cdcff', poison: '#9cff8c', lightning: '#ffe98a' }
    for (const [id, c] of Object.entries(ELEMENT_GLOW)) {
      if (this.player.elements.has(id)) return c
    }
    return '#8cffc8'
  }

  /** 记录专精技能链的最高层级，让数值成长同步改变武器轮廓。 */
  registerSkillEvolution(skill) {
    if (!skill?.spec || !(skill.spec in this.visualTiers)) return false
    if (this.game?.primarySpec && skill.spec !== this.game.primarySpec) return false
    const previous = this.visualTiers[skill.spec]
    const next = Math.max(previous, skill.isMilestone ? 1 : Number(skill.tier) || 0)
    if (next <= previous) return false
    this.visualTiers[skill.spec] = next
    this._muzzleVisual = this._visualProfile()
    this._weaponPulse = 0.7
    return true
  }

  _visualProfile() {
    const spec = this.game.primarySpec
    return resolveWeaponVisual({
      primaryReaction: this.player._primaryReaction,
      elements: this.player.elements.keys(),
      primarySpec: spec,
      tier: this.visualTiers[spec] || 0,
      chaos: this.isChaosOrigin,
    })
  }

  /** 以玩家位置为原点，向目标发射飞弹（多弹时并排扇形齐射） */
  fire(target) {
    const px = this.player.x
    const py = this.player.y
    const n = this.projectileCount
    // 基准角：指向目标的方向
    const base = Math.atan2(target.y - py, target.x - px)
    const visual = this._visualProfile()
    this.game.sound.shoot(visual.sound, Math.min(1.35, 0.8 + visual.tier * 0.1))
    this._muzzleT = 0.08
    this._muzzleAngle = base
    this._muzzleVisual = visual
    // 垂直基准方向（垂直于瞄准线）：多弹沿它并排偏移，出膛即可见多枚
    // （之前所有弹从同一点出发 + 高追踪强度，多枚完全重叠飞行，视觉上等于一枚）
    const perpX = Math.cos(base + Math.PI / 2)
    const perpY = Math.sin(base + Math.PI / 2)
    for (let i = 0; i < n; i++) {
      // 角度散布：第 i 枚围绕基准角 ±0.3rad（约 ±17°，评审反馈扇面偏窄已调大）
      const off = n > 1 ? (i - (n - 1) / 2) * 0.3 : 0
      const a = base + off
      // 位置散布：垂直方向并排拉开 12px（约等于飞弹直径）
      const spread = n > 1 ? (i - (n - 1) / 2) * 12 : 0
      this._projectiles.push(
        new Projectile({
          x: px + perpX * spread,
          y: py + perpY * spread,
          target,
          // 实际伤害 = 基础（技能叠加）× 等级成长 × 捕食原核吞噬加成（读实时值，非快照）
          damage: this.damage * this.levelMul * this.devourDamageMul,
          speed: this.projectileSpeed,
          vx: Math.cos(a) * this.projectileSpeed,
          vy: Math.sin(a) * this.projectileSpeed,
          // 追踪强度：单弹完全锁定；多弹降到 0.8，弧线聚拢更明显
          homing: this.isGatlingMother ? 1 : n > 1 ? 0.8 : 1,
          // 特效概率：按武器系统当前技能等级注入
          splitChance: this.splitChance,
          critChance: this.critChance,
          freezeChance: this.freezeChance,
          burnChance: this.burnChance,
          poisonChance: this.poisonChance,
          pierces: this.basePierces + this.genePierces,
          visual,
          life: this.isGatlingMother ? 5 : 2.5,
        })
      )
    }
  }

  update(dt) {
    // 玩家死亡（gameOver 已触发，仅本帧残差）：停止射击与结算，
    // 防止结算快照（击杀/掉落物）之后的数据继续变动
    if (this.player.dead) return

    // 连杀窗口倒计时：超时清零（仅游戏时间，暂停不消耗）
    if (this._comboTimer < 1.8) {
      this._comboTimer += dt
      if (this._comboTimer >= 1.8) this._combo = 0
    }

    // 狂暴连击 BUFF 倒计时
    if (this.berserkBuffTimer > 0) this.berserkBuffTimer -= dt
    if (this._muzzleT > 0) this._muzzleT -= dt
    if (this._weaponPulse > 0) this._weaponPulse -= dt
    this._updateDigestPulse(dt) // 消化能量过半时的心跳微粒（吞噬 → 元素联动的可见前兆）

    // 1) 冷却计时 → 自动索敌 → 发射
    this.cooldown -= dt
    if (this.cooldown <= 0) {
      const formationMul = this.game.endlessFormationBreakTimer > 0
        ? ENDLESS_FORMATION_BREAK_ATTACK_INTERVAL_MUL
        : 1
      const curInterval = this.fireInterval * (this.berserkBuffTimer > 0 ? 0.6 : 1) * formationMul
      this.cooldown += curInterval
      const target = this._findNearest()
      if (target) this.fire(target)
    }

    // 2) 飞弹移动（追踪目标）
    for (const p of this._projectiles) p.update(dt)

    // 3) 碰撞检测与伤害结算
    this._resolveCollisions()

    // 4) 回收失效飞弹（寿命耗尽 / 已命中）
    let hasDead = false
    for (const p of this._projectiles) {
      if (!p.active) {
        hasDead = true
        break
      }
    }
    if (hasDead) this._projectiles = this._projectiles.filter((p) => p.active)

    // 5) 粒子系统推进 + 回收
    for (const pt of this._particles) pt.update(dt)
    hasDead = false
    for (const pt of this._particles) {
      if (!pt.active) {
        hasDead = true
        break
      }
    }
    if (hasDead) this._particles = this._particles.filter((pt) => pt.active)

    // 6) 全屏麻痹（雷+水）：周期性雷击，冻结并伤害所有敌人
    if (this._hasReaction('gel')) {
      this._stormTimer -= dt
      if (this._stormTimer <= 0) {
        this._stormTimer = 5
        this._lightningStorm()
      }
    }

    // 6.5) 毒雷风暴（毒+雷，阶段十三）：周期性全屏毒雷（中毒 + 概率麻痹）
    const venomR = this._getReaction('venom')
    if (venomR) {
      this._venomTimer -= dt
      if (this._venomTimer <= 0) {
        this._venomTimer = 6
        this._venomStorm(venomR)
      }
    }

    // 7) 酸液池推进（火+毒）：池内敌人持续受蚀 + 寿命回收
    this._updatePools(dt)

    // 7.5) 蒸汽云雾推进（火+水，阶段十三）：云内敌人持续减速 + 寿命回收
    this._updateClouds(dt)
    this._updateSingularities(dt)

    // 8) 死亡扩散环推进（阶段十五美化）
    for (let i = this._rings.length - 1; i >= 0; i--) {
      this._rings[i].life -= dt
      if (this._rings[i].life <= 0) this._rings.splice(i, 1)
    }
  }

  /**
   * 全屏麻痹：金色粒子 + 全体冻结 0.8s + 雷击伤害。
   * 阶段十三：伤害随雷水组合等级成长（Lv1-4:1、Lv5-8:2、Lv9+:3）。
   */
  _lightningStorm() {
    const gel = this._getReaction('gel')
    const power = gel ? this._reactionPower(gel) : 1
    const dmg = 1 + (((power - 1) / 4) | 0)
    const enemies = this.enemyManager.enemies
    for (const e of enemies) {
      if (!e.active || e.devouring) continue
      e.hit(dmg, { freeze: 0.8 }) // 冻结 + 伤害（致死走统一击杀结算）
      this._burst(e.x, e.y, 'lightning', 4, true)
      if (!e.active) this._onKill(e)
    }
    this.game.sound.thunder()
    this.game.shakeScreen(3, 0.2) // 全屏雷击微震（阶段十五美化）
  }

  /**
   * 毒雷风暴（毒+雷，阶段十三）：全屏毒雷爆发——
   * 伤害/中毒时长随组合等级成长，15% 概率短麻痹 0.5s。
   */
  _venomStorm(venomR) {
    const power = this._reactionPower(venomR)
    const dmg = 1 + (((power - 1) / 3) | 0) // Lv1-3:1、Lv4-6:2、Lv7+:3（阈值提前）
    const poisonDur = Math.min(5, 2 + 0.5 * (power - 1))
    const enemies = this.enemyManager.enemies
    for (const e of enemies) {
      if (!e.active || e.devouring) continue
      e.hit(dmg, { poison: poisonDur, poisonDmg: dmg, freeze: Math.random() < 0.15 ? 0.5 : 0 })
      this._burst(e.x, e.y, 'poison', 5, true)
      if (!e.active) this._onKill(e)
    }
    this.stats.venomStorms++
    this.game.sound.venomStorm()
    this.game.shakeScreen(3, 0.25) // 毒雷爆发微震（阶段十五美化）
  }

  /**
   * 在命中点留下一团蒸汽云雾（火+水，阶段十三）：
   * 半径 +5px/级（60 → 100 封顶）、减速时长 1.2s +0.2s/级（封顶 2.4s），
   * 云内敌人移动 ×0.6——纯控制、零伤害，与酸液池的伤害定位区分。
   */
  _dropCloud(x, y) {
    const steam = this._getReaction('steam')
    const power = steam ? this._reactionPower(steam) : 1
    const r = Math.min(100, 60 + 5 * (power - 1))
    const slowDur = Math.min(2.4, 1.2 + 0.2 * (power - 1))
    this._clouds.push({ x, y, life: 2, r, slowDur, tick: 0.25, active: true })
    this.stats.slowClouds++
  }

  /** 蒸汽云雾推进：云内敌人每 0.25s 刷新减速；寿命耗尽回收 */
  _updateClouds(dt) {
    const list = this._clouds
    if (list.length === 0) return
    const enemies = this.enemyManager.enemies
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]
      if (!c.active) {
        list.splice(i, 1)
        continue
      }
      c.life -= dt
      c.tick -= dt
      if (c.tick <= 0) {
        c.tick = 0.25
        for (const e of enemies) {
          if (!e.active || e.devouring) continue
          const d2 = (e.x - c.x) ** 2 + (e.y - c.y) ** 2
          if (d2 < c.r * c.r) e.slow = Math.max(e.slow, c.slowDur)
        }
      }
      if (c.life <= 0) c.active = false
    }
  }

  _dropSingularity(x, y) {
    if (this._singularities.length >= 4) return
    this._singularities.push({ x, y, life: 1.4, maxLife: 1.4, r: 120 })
  }

  _updateSingularities(dt) {
    const list = this._singularities
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.life -= dt
      if (s.life <= 0) {
        list.splice(i, 1)
        continue
      }
      for (const e of this.enemyManager.enemies) {
        if (!e.active || e.devouring || e.isBoss) continue
        const dx = s.x - e.x
        const dy = s.y - e.y
        const d2 = dx * dx + dy * dy
        if (d2 > s.r * s.r || d2 < 1) continue
        const d = Math.sqrt(d2)
        const pull = Math.min(d, 220 * dt)
        e.x += (dx / d) * pull
        e.y += (dy / d) * pull
      }
    }
  }

  /**
   * 连锁导电（雷涌凝胶，评审 Day 6 行为差异：扩散 + 控制）：
   * 命中后电弧跳向附近（90px 内）其他敌人，每跳 40% 伤害；
   * 阶段十三：跳数与麻痹率随雷水组合等级成长（Lv1-2:2跳 → 封顶 5 跳；
   * 麻痹率 15% +5%/级 → 封顶 40%）；记录最长连锁（物种档案行为统计）。
   */
  _chainLightning(origin, damage) {
    const gel = this._getReaction('gel')
    const power = gel ? this._reactionPower(gel) : 1
    const maxHops = Math.min(5, 2 + (((power - 1) / 2) | 0))
    const paralyzeChance = Math.min(0.4, 0.15 + 0.05 * (power - 1))
    const visited = new Set([origin])
    let current = origin
    let chain = 0
    for (let hop = 0; hop < maxHops; hop++) {
      let next = null
      let bestD2 = 90 * 90
      for (const e of this.enemyManager.enemies) {
        if (!e.active || e.devouring || visited.has(e)) continue
        const d2 = (e.x - current.x) ** 2 + (e.y - current.y) ** 2
        if (d2 < bestD2) {
          bestD2 = d2
          next = e
        }
      }
      if (!next) break
      visited.add(next)
      chain++
      const hopDamage = Math.max(1, Math.round(damage * 0.4))
      next.hit(hopDamage, Math.random() < paralyzeChance ? { freeze: 0.8 } : null)
      this._burst(next.x, next.y, 'lightning', 4, true)
      if (!next.active) this._onKill(next)
      current = next
    }
    if (chain > 0) this.stats.maxChain = Math.max(this.stats.maxChain, chain)
  }

  /** 酸液池推进：池内敌人每 0.5s 受一次腐蚀跳伤（伤害随池强度成长）；寿命耗尽回收 */
  _updatePools(dt) {
    const list = this._pools
    if (list.length === 0) return
    const enemies = this.enemyManager.enemies
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      if (!p.active) {
        list.splice(i, 1)
        continue
      }
      p.life -= dt
      p.tick -= dt
      if (p.tick <= 0) {
        p.tick = 0.5
        for (const e of enemies) {
          if (!e.active || e.devouring) continue
          const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
          if (d2 < p.r * p.r) {
            e.hit(p.dmg) // 跳伤随酸液池强度（元素等级）成长
            if (!e.active) this._onKill(e)
          }
        }
      }
      if (p.life <= 0) p.active = false
    }
  }

  /**
   * 在命中点留下一滩酸液池（火+毒：区域污染）。
   * 阶段十三：半径 +8px/级（45 → 100 封顶）、跳伤 Lv1-2:1 / Lv3-4:2 / Lv5+:3，
   * 随火毒组合最低等级成长（阶段十四调优：阈值提前，低等级即可见成长）。
   */
  _dropPool(x, y) {
    const acid = this._getReaction('acid')
    const power = acid ? this._reactionPower(acid) : 1
    const r = Math.min(100, 45 + 8 * (power - 1))
    const dmg = 1 + (((power - 1) / 2) | 0)
    this._pools.push({ x, y, life: 3, r, dmg, tick: 0.5, active: true })
  }

  /** 引爆酸液池（火+毒：延迟爆炸 + 连环）：爆炸伤害 = 池跳伤 +1 + 清除池 */
  _ignitePool(pool) {
    this._explode(pool.x, pool.y, (pool.dmg || 1) + 1)
    pool.active = false
    this.stats.explosions++
    this.game.sound.kill() // 爆炸闷响
    this.game.shakeScreen(4, 0.2) // 爆炸震动（阶段十五美化）
  }

  /**
   * 爆炸酸液（火+毒）：命中点范围溅射伤害；effects 可选附加状态（元素消化用），
   * radius 默认沿用反应版 70px（消化档位会按元素等级放大半径）。
   */
  _explode(x, y, splashDamage, effects = null, radius = 70) {
    const enemies = this.enemyManager.enemies
    const R2 = radius * radius
    for (const e of enemies) {
      if (!e.active || e.devouring) continue
      const dx = e.x - x
      const dy = e.y - y
      if (dx * dx + dy * dy < R2) {
        e.hit(splashDamage, effects)
        this._burst(e.x, e.y, e.paletteKey, 6, true)
        if (!e.active) this._onKill(e)
      }
    }
    this.game.sound.kill() // 爆炸闷响（复用击杀音效）
  }

  /**
   * 即时击杀入口：施加伤害当帧发现死亡 → 走统一结算。
   * （所有施伤点：飞弹/连锁/酸液池/爆炸/雷击）
   */
  _onKill(e) {
    this._settleKill(e)
  }

  /**
   * DOT 致死入口（阶段十二修复）：燃烧/中毒跳伤在 Enemy 内部定时触发，
   * 施伤方无法即时感知（延迟死亡），由 Enemy._tickStatus 在致死时回调本方法，
   * 与即时击杀走同一结算通道——击杀计数 / 宝石掉落 / 战利品 / Boss 大爆不再被跳过。
   */
  onDOTKill(e) {
    this._settleKill(e)
  }

  /** 死亡扩散环（阶段十五美化）：击杀瞬间荡开的制服色圆环 */
  _ring(x, y, color, r1 = 26) {
    this._rings.push({ x, y, r0: 4, r1, life: 0.3, maxLife: 0.3, color })
  }

  /** 击杀结算唯一汇聚点：计数 + 连杀 + 音效 + 掉落（Boss 大爆 / 精英必掉 / 普通概率） */
  _settleKill(e) {
    // _settled 防重复结算：吞噬中（onDevoured 已结算）或 DOT 已结算的敌人
    // 再被飞弹/雷击/酸液命中致死时，不再重复发放击杀数/宝石/战利品
    if (e._settled) return
    e._settled = true
    this.kills++
    if (e.isBoss) this.bossKills++
    else if (e.isElite) this.eliteKills++
    this.game.worldEvents?.onEnemyDefeated(e)
    this.player.triggerKillRush?.(2)
    // 死亡扩散环（阶段十五美化）：Boss 金色大环，普通怪制服色小环
    this._ring(e.x, e.y, e.isBoss ? '#ffd166' : getPaletteMid(e.paletteKey), e.isBoss ? 48 : 26)
    // 连杀窗口内递增 → 击杀音高爬升（清屏叠加爽感）；窗口外重新起数
    this._combo = this._comboTimer < 1.8 ? this._combo + 1 : 1
    this._comboTimer = 0
    this.game.sound.kill(this._combo)

    if (e.isBoss) {
      this.game.dialogue?.sayBoss(e, 'defeat')
      const chapterGuardian = e.isExpeditionStageBoss && !e.isExpeditionBoss
      const squadMember = e.isBossSquadMember
      const squadLast = squadMember &&
        this.game.enemyManager.activeBossCount === 0 &&
        this.game.enemyManager.pendingBossCount === 0
      // 每关守将采用轻量战利品，避免连续 Boss 的秘籍与核心把成长曲线推爆；
      // 首领编队按整队共享旧单 Boss 预算，秘籍只由最后一名成员掉落。
      const gemCount = chapterGuardian
        ? 3
        : squadMember ? squadLast ? Math.max(2, 8 - e.bossGroupSize * 2) : 2 : 6
      const coreCount = chapterGuardian
        ? 1
        : squadMember ? squadLast ? Math.max(1, 4 - e.bossGroupSize) : 1 : 3
      const v = Math.max(5, Math.round(e.expValue / gemCount))
      for (let i = 0; i < gemCount; i++) this.game.gemManager.spawn(e.x, e.y, v)
      const els = ['fire', 'water', 'poison', 'lightning']
      for (let i = 0; i < coreCount; i++) {
        this.game.gemManager.spawn(e.x, e.y, 0, els[(Math.random() * 4) | 0])
      }
      if (!chapterGuardian && (!squadMember || squadLast)) {
        this.game.gemManager.spawn(e.x, e.y, 0, 'tome')
      }
      this.game.sound.bossDeath()
      this.game.shakeScreen(8, 0.45) // Boss 阵亡大震动（阶段十五美化）
    } else {
      this.game.gemManager.spawn(e.x, e.y, e.expValue) // 经验宝石
      // 元素核心（阶段十六经济重设计）：击杀仅精英掉落——
      // 核心回归「狩猎精英/Boss」的战利品定位（Boss 大爆 3 个在 Boss 分支）；
      // 吞噬路径（法师/精英必掉、其他 25%）仍是主动获取核心的技巧型途径
      if (e.isElite) {
        const els = ['fire', 'water', 'poison', 'lightning']
        this.game.gemManager.spawn(e.x, e.y, 0, els[(Math.random() * els.length) | 0])
      }
    }

    // 勇者物品（黑市货币，按职业计数）：单 Boss 3、编队共享至多 3、精英必掉、普通 10%。
    const dropKey = e.isBoss ? e.dropType || e.type.slice(5) : e.type // 复合 Boss 使用指定职业战利品
    const dropCount = getLootDropCount(e)
    if (dropCount > 0) {
      this.drops[dropKey] = (this.drops[dropKey] || 0) + dropCount
    }

    // 精英词缀死亡特效（阶段十三）：吞噬路径（onDevoured）不经过这里——
    // 把残血怪「安全吃掉」是克制自爆/召唤词缀的手段
    if (!e.isBoss && (e.hasAffix?.('explosive') || e.affix === 'explosive')) {
      // 自爆：死亡时炸伤附近玩家（90px 内 1 点，无敌帧兜底）
      const p = this.game.player
      const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2
      if (d2 < 90 * 90) p.hit(1)
      this._burst(e.x, e.y, 'mage', 14, true) // 金色爆屑
      this.game.sound.kill()
    }
    if (!e.isBoss && (e.hasAffix?.('summoner') || e.affix === 'summoner')) {
      // 召唤：死亡时召唤 2 名骑士（spawnAt 已复用波次成长公式）
      const em = this.game.enemyManager
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * TAU
        em.spawnAt(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, 'knight')
      }
    }

    // 元素流：瘟疫传染（死者身上的燃烧/中毒/冰冻传染给周围目标）
    if (this.plagueSpreadCount > 0 && (e.burnHits > 0 || e.poisonHits > 0 || e.freeze > 0)) {
      let spreadLeft = this.plagueSpreadCount
      for (const target of this.enemyManager.enemies) {
        if (!target.active || target === e || target.devouring) continue
        const d2 = (target.x - e.x) ** 2 + (target.y - e.y) ** 2
        if (d2 <= 220 * 220) {
          target.hit(1, {
            burn: e.burnHits > 0 ? 2 : 0,
            burnDmg: e._burnDmg || 1,
            poison: e.poisonHits > 0 ? 3 : 0,
            poisonDmg: e._poisonDmg || 1,
            freeze: e.freeze > 0 ? 1.2 : 0,
          })
          this._burst(target.x, target.y, 'poison', 4, true)
          spreadLeft--
          if (spreadLeft <= 0) break
        }
      }
    }
    if (e.isBoss) this.game.handleBossDefeated?.(e)
  }

  /** 飞弹 × 敌人 圆碰撞检测与伤害结算（空间哈希粗筛 + 两阶段精筛） */
  _resolveCollisions() {
    const grid = this.enemyManager.grid
    const procs = this.player._procs // 元素附魔缓存（等级聚合，命中时 O(1) 读取）
    // 反应强度：每次碰撞结算前读取一次（2 元素组合常数级），命中循环内不再重复计算
    const burstR = this._getReaction('burst')
    const burstBonus = burstR ? Math.min(0.5, 0.2 + 0.06 * (this._reactionPower(burstR) - 1)) : 0
    const corrodeR = this._getReaction('corrode')
    const dotMul = corrodeR ? Math.min(4, 2 + 0.3 * (this._reactionPower(corrodeR) - 1)) : 1
    const acidR = this._getReaction('acid')
    const gelR = this._getReaction('gel')
    const steamR = this._getReaction('steam')

    for (const p of this._projectiles) {
      if (!p.active) continue
      // 飞弹所在网格：只查 3×3 邻域（CELL_SIZE=64 ≥ 最大半径和 42，跨格碰撞不可能漏检）
      const pcx = (p.x / CELL_SIZE) | 0
      const pcy = (p.y / CELL_SIZE) | 0
      hitScan: for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get((pcx + ox) * GRID_KEY_SCALE + (pcy + oy))
          if (!bucket) continue
          for (const e of bucket) {
            if (!e.active || e.devouring || p.hitTargets?.has(e)) continue // 穿透弹不可重复命中同一目标
            const rr = p.radius + e.radius
            const dx = e.x - p.x
            // ① 绝对值粗筛（无乘法、无开方）
            if (dx > rr || dx < -rr) continue
            const dy = e.y - p.y
            if (dy > rr || dy < -rr) continue
            // ② 距离平方精判
            if (dx * dx + dy * dy >= rr * rr) continue

            // —— 命中：飞弹销毁，敌人扣血 ——
            const critChance = p.critChance + burstBonus
            const isCrit = (critChance > 0 && Math.random() < critChance) || this.player.guaranteedCrit
            if (this.player.guaranteedCrit) this.player.guaranteedCrit = false

            let critMultiplier = isCrit ? (this.critMul || 3.0) : 1.0
            if (isCrit && this.executeCrit && e.hp <= e.maxHp * 0.5) {
              critMultiplier *= 2.0
            }
            let damage = p.damage * critMultiplier

            // 刺客：暗影无相主宰 暴击瞬发影分身斩
            if (isCrit && this.isShadowLord) {
              damage *= 1.5
              this._burst(e.x, e.y, 'assassin', 14, true)
              this.enemyManager.addText(e.x, e.y - 18, '⚡ 影分身斩!', null, '#ff3838', 15)
            }

            const rMul = (this.reactionDmgMul || 1.0) * (this.geneReactionDmgMul || 1.0)
            const tickDmg = Math.max(1, Math.round(damage * 0.4 * rMul))
            const effects = {}
            if (p.freezeChance > 0 && Math.random() < p.freezeChance) effects.freeze = 1.5
            if (p.burnChance > 0 && Math.random() < p.burnChance) {
              effects.burn = 2 * dotMul
              effects.burnDmg = tickDmg
            }
            if (p.poisonChance > 0 && Math.random() < p.poisonChance) {
              effects.poison = 3 * dotMul
              effects.poisonDmg = tickDmg
            }
            if (procs.burn?.chance && (this.critGuaranteesElement && isCrit || Math.random() < procs.burn.chance)) {
              effects.burn = Math.max(effects.burn || 0, procs.burn.duration * dotMul)
              effects.burnDmg = Math.max(effects.burnDmg || 0, tickDmg)
            }
            if (procs.freeze?.chance && (this.critGuaranteesElement && isCrit || Math.random() < procs.freeze.chance)) {
              effects.freeze = Math.max(effects.freeze || 0, procs.freeze.duration)
            }
            if (procs.poison?.chance && (this.critGuaranteesElement && isCrit || Math.random() < procs.poison.chance)) {
              effects.poison = Math.max(effects.poison || 0, procs.poison.duration * dotMul)
              effects.poisonDmg = Math.max(effects.poisonDmg || 0, tickDmg)
            }

            // 元素：四象混沌原质 终极觉醒
            if (this.isChaosOrigin) {
              effects.freeze = 1.5
              effects.burn = 3
              effects.burnDmg = Math.max(2, Math.round(damage * 0.5))
              effects.poison = 4
              effects.poisonDmg = Math.max(2, Math.round(damage * 0.5))
              this._dropPool(e.x, e.y)
              this._dropCloud(e.x, e.y)
              this._chainLightning(e, damage * rMul)
              this._explode(e.x, e.y, Math.round(damage * 1.5 * rMul))
              this._dropSingularity(e.x, e.y)
            }

            if (p.hitTargets) p.hitTargets.add(e)
            const penetrates = p.pierces > 0
            if (penetrates) p.pierces--
            else p.destroy()
            e.hit(damage, effects)
            this._burstColor(e.x, e.y, p.visual.impact, isCrit ? 14 : p.visual.impactCount, isCrit)
            this.game.sound.hit(p.visual.sound)

            this.game.enemyManager.addText(
              e.x,
              e.y,
              String(Math.round(damage * 10) / 10),
              null,
              isCrit ? '#ffd166' : '#ffffff',
              isCrit ? 26 : 14
            )
            if (!e.active) this._onKill(e)

            // 元素反应
            if (gelR) this._chainLightning(e, damage * rMul)
            if (acidR) {
              const pool = this._pools.find(
                (pl) => pl.active && (pl.x - e.x) ** 2 + (pl.y - e.y) ** 2 < pl.r * pl.r
              )
              if (pool) this._ignitePool(pool)
              else this._dropPool(e.x, e.y)
            }
            if (steamR) this._dropCloud(e.x, e.y)

            // 元素过载爆轰
            if (this.reactionShockwave > 0 && (gelR || acidR || steamR || this.isChaosOrigin)) {
              this._explode(e.x, e.y, Math.round(damage * this.reactionShockwave))
            }

            // 机枪：有丝分裂
            if (p.splitChance > 0 && !p.isSplit && Math.random() < p.splitChance) {
              this._split(e, p)
            }
            if (!penetrates) break hitScan // 飞弹已销毁，直接进入下一枚
          }
        }
      }
    }
  }

  /** 吞噬结算（评审核心爽点）：分层收益——普通怪经验×1.5 + 概率核心；精英经验×3 + 必掉核心 */
  onDevoured(e) {
    if (e._settled) return // 防御：已结算的敌人不再重复发放（_checkDevour 已过滤，双保险）
    e._settled = true // 吞噬路径独立结算，标记防止与 DOT/即时路径重复
    this.kills++
    this.devours++
    if (e.isElite) this.eliteKills++
    this.game.worldEvents?.onEnemyDefeated(e)
    this.player.triggerKillRush?.(2)
    this.player.triggerDevourGuard?.(3)
    this._ring(e.x, e.y, '#8ae84a', 30) // 吞噬绿环（阶段十五美化）
    this.game.sound.devour()

    // 暴食共鸣：吞噬自愈
    if (this.player.devourHeal || this.player.geneDevourHeal > 0) {
      this.player.heal(Math.max(1, this.player.geneDevourHeal || 0))
    }

    // 捕食原核（黑市终点）：每次吞噬攻击永久 +3%，封顶 +100%——
    // 精英吞噬算双倍成长：抢吞精英是捕食体路线的高光决策
    if (this.player.geneDevourDamage > 0) {
      this.devourDamageMul = Math.min(
        2,
        this.devourDamageMul + this.player.geneDevourDamage * (e.isElite ? 2 : 1)
      )
    }

    // 暴食：胃酸喷涌
    if (this.player.devourAcidSpray > 0) {
      const count = this.player.devourAcidSpray
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU
        this._projectiles.push(
          new Projectile({
            x: e.x,
            y: e.y,
            damage: this.damage * 1.5,
            speed: 420,
            vx: Math.cos(a) * 420,
            vy: Math.sin(a) * 420,
            homing: 0.6,
            poisonChance: 1.0,
            visual: tintedWeaponVisual('#7ce86a'),
          })
        )
      }
    }

    // 经验宝石（分层倍率：普通怪 ×1.5、精英 ×3）
    const mul = e.isElite ? 3 : 1.5
    this.game.gemManager.spawn(e.x, e.y, Math.round(e.expValue * mul * (this.player.geneDevourExpMul || 1)))

    // 元素核心：法师必掉火/雷、精英必掉随机、其他 12%（普通怪吞噬的核心收益收敛为小概率彩头）
    let coreType = null
    if (e.type === 'mage' || e.isElite || Math.random() < 0.12) {
      const pool = e.type === 'mage' ? ['fire', 'lightning'] : ['fire', 'water', 'poison', 'lightning']
      coreType = pool[(Math.random() * pool.length) | 0]
      this.game.gemManager.spawn(e.x, e.y, 0, coreType)
    }

    // 消化进度（吞噬 → 元素联动）：猎物血肉转化为元素养分，满槽爆发元素成长
    this.addDigestCharge(e.isElite ? DIGEST_GAIN_ELITE : DIGEST_GAIN_NORMAL)

    // 战利品必掉（黑市货币）
    this.drops[e.type] = (this.drops[e.type] || 0) + 1

    // 职业吞噬特有即时增益：
    if (e.type === 'assassin') {
      this.player.addSpeedBuff?.(2.5)
    } else if (e.type === 'priest') {
      this.player.heal?.(1)
    } else if (e.type === 'berserker') {
      this.addBerserkBuff?.(3)
    }

    // 提示文本：吞噬对象 + 提取素材
    const names = {
      knight: '见习骑士',
      mage: '见习火法师',
      archer: '见习弓手',
      assassin: '暗影潜行者',
      priest: '圣职牧师',
      berserker: '巨斧狂战士',
      hound: '王室战獒',
      golem: '王朝魔像',
      wraith: '陵墓怨灵',
    }
    const label = e.isElite ? `精英${names[e.type] || '勇者'}` : names[e.type] || '勇者'
    const CORE_NAMES = { fire: '火焰', water: '水流', poison: '毒素', lightning: '雷电' }
    const GENES = {
      knight: '甲壳碎片',
      mage: '魔力',
      archer: '神经反射',
      assassin: '暗影匿迹',
      priest: '神圣净化',
      berserker: '嗜血战意',
    }
    const digest = this._digestDevour(e)
    const extract =
      e.type === 'assassin'
        ? '⚡ 暗影疾行 +25% 移速 (2.5s)'
        : e.type === 'priest'
        ? '💚 圣疗治愈 生命恢复 +1'
        : e.type === 'berserker'
        ? '🪓 狂暴连击 +50% 攻速 (3s)'
        : coreType
        ? `提取：${CORE_NAMES[coreType]}基因 +1`
        : `提取：${GENES[e.type] || '基因碎片'} +1`
    const sub = digest ? `${extract} ／ ${digest}` : extract
    this.game.enemyManager.addText(e.x, e.y, `吞噬：${label}`, sub, '#ffd166')
  }

  /**
   * 元素消化（元素等级 → 吞噬联动）：吞噬按已吸收元素等级产生差异化即时效果。
   * 这是「元素」与「吞噬」两条成长轴的咬合点——同一次吞噬，
   * 火系胃囊炸开缺口、水系胃囊冻住追兵、毒系留下酸池、雷系电弧跳向人群。
   * 伤害与飞弹同口径（基础 × 等级成长 × 捕食原核），保证后期不衰减成废效果。
   * @returns {string} 本次触发的消化摘要（供飘字第二行；无触发时为空串）
   */
  _digestDevour(e) {
    const els = this.player.elements
    if (!els || els.size === 0) return ''
    const damage = this.damage * this.levelMul * this.devourDamageMul
    const triggered = []
    for (const [id, lv] of els) {
      const tier = getDigestTier(id, lv)
      if (!tier) continue
      triggered.push(tier.name)
      if (id === 'fire') {
        this._explode(
          e.x,
          e.y,
          Math.max(1, Math.round(damage * tier.damageMul)),
          tier.burn > 0 ? { burn: tier.burn, burnDmg: Math.max(1, Math.round(damage * 0.4)) } : null,
          tier.radius
        )
        this._ring(e.x, e.y, '#ff9d4a', tier.radius)
      } else if (id === 'water') {
        this._frostNova(e.x, e.y, tier)
      } else if (id === 'poison') {
        this._pools.push({
          x: e.x,
          y: e.y,
          life: tier.poolLife,
          r: tier.radius,
          dmg: Math.max(1, tier.poolDmg),
          tick: 0.5,
          active: true,
        })
      } else if (id === 'lightning') {
        this._chainLightning(e, Math.max(1, damage * tier.damageMul))
      }
    }
    return triggered.join(' + ')
  }

  /** 寒潮消化（水系）：吞噬点周围减速，Lv4 附加短冻结 */
  _frostNova(x, y, tier) {
    const enemies = this.enemyManager.enemies
    const r2 = tier.radius * tier.radius
    for (const e of enemies) {
      if (!e.active || e.devouring) continue
      const dx = e.x - x
      const dy = e.y - y
      if (dx * dx + dy * dy >= r2) continue
      e.slow = Math.max(e.slow, tier.slow)
      if (tier.freeze > 0) e.hit(0, { freeze: tier.freeze })
      this._burstColor(e.x, e.y, '#73cfea', 4)
    }
    this._ring(x, y, '#73cfea', tier.radius)
  }

  /**
   * 消化累积（吞噬 → 元素联动）：每次吞噬注入消化能量。
   * 满槽时若已吸收元素则立即爆发（随机一种已吸收元素 +1 级）；
   * 尚未吸收元素时保持满载等待——玩家吃下第一颗核心的瞬间即兑现，不让进度空转。
   * @returns {boolean} 本次是否触发了消化爆发
   */
  addDigestCharge(amount) {
    this.digestCharge = Math.min(
      this.digestChargeMax,
      this.digestCharge + Math.max(0, amount) * this.digestGainMul
    )
    if (this.digestCharge < this.digestChargeMax) return false
    const els = this.player.elements
    if (!els || els.size === 0) return false // 满载待命：等第一颗元素核心
    const ids = Array.from(els.keys())
    const id = ids[(Math.random() * ids.length) | 0]
    this.digestCharge = 0
    this.digestBursts++
    this.player.absorbElement(id)
    const el = getElement(id)
    this._ring(this.player.x, this.player.y, el?.color || '#ffd166', 64)
    this.game.enemyManager.addText(
      this.player.x,
      this.player.y - 52,
      `🧬 消化爆发 · ${el?.icon || ''} ${el?.name || id} +1`,
      `累计消化 ${this.digestBursts} 次`,
      '#ffd166',
      16
    )
    this.game.sound.elementUp?.()
    return true
  }

  /**
   * 消化能量的可见心跳（每帧）：给玩家一个「快满了」的期待感。
   * 有已吸收元素且能量过半时，玩家身上周期性冒出对应元素的氛围微粒。
   */
  _updateDigestPulse(dt) {
    const els = this.player.elements
    if (!els || els.size === 0) return
    const ratio = this.digestCharge / this.digestChargeMax
    if (ratio < 0.5) return
    this._digestPulseT = (this._digestPulseT || 0) - dt
    if (this._digestPulseT > 0) return
    this._digestPulseT = 0.4 - ratio * 0.24 // 越接近满槽冒得越密
    const ids = Array.from(els.keys())
    const id = ids[(Math.random() * ids.length) | 0]
    const el = getElement(id)
    // 粒子形状与 Player._aura 的推进约定一致（缺 vx/vy 会让位置更新成 NaN）
    this.player._aura?.push?.({
      x: this.player.x + (Math.random() - 0.5) * 34,
      y: this.player.y + (Math.random() - 0.5) * 34,
      vx: (Math.random() - 0.5) * 14,
      vy: -18 - Math.random() * 14,
      r: 3 + ratio * 4,
      life: 0.7,
      maxLife: 0.7,
      color: el?.color || '#ffd166',
    })
  }

  /** 在命中点炸开粒子（普通命中带火花；暴击迸发金色星芒） */
  _burst(x, y, paletteKey, count = 10, isCrit = false) {
    this._burstColor(x, y, getPaletteMid(paletteKey), count, isCrit)
  }

  _burstColor(x, y, color, count = 10, isCrit = false) {
    const resolvedColor = isCrit ? '#ffd166' : color
    const sparkCount = isCrit ? 4 : 2
    for (let i = 0; i < count; i++) {
      this._particles.push(new Particle(x, y, resolvedColor, i < sparkCount))
    }
  }

  /**
   * 分裂：从命中点迸出 2 枚小弹，各自锁定一个其他存活敌人（homing 追踪）。
   * 小弹伤害为母弹 50%、按 splitInherit 比例继承母弹的暴击/元素附魔概率
   * （机枪×元素/刺客协同的通路；机枪主专精把继承率抬到 100%，分裂不再稀释附魔），
   * isSplit 标记防二次分裂。
   */
  _split(origin, parent) {
    const inherit = this.splitInherit ?? 0.5
    let spawned = 0
    for (const t of this.enemyManager.enemies) {
      if (!t.active || t === origin || t.devouring) continue
      const a = Math.random() * TAU // 随机出膛角
      this._projectiles.push(
        new Projectile({
          x: origin.x,
          y: origin.y,
          target: t,
          speed: 420,
          damage: Math.max(1, Math.round(parent.damage * 0.5)),
          life: 1.2,
          radius: 4,
          splitChance: 0,
          critChance: (parent.critChance || 0) * inherit,
          freezeChance: (parent.freezeChance || 0) * inherit,
          burnChance: (parent.burnChance || 0) * inherit,
          poisonChance: (parent.poisonChance || 0) * inherit,
          isSplit: true,
          pierces: this.splitPierces + this.genePierces,
          visual: splitWeaponVisual(parent.visual),
          vx: Math.cos(a) * 420,
          vy: Math.sin(a) * 420,
          homing: 0.95,
        })
      )
      if (++spawned >= 2) break
    }
  }

  /**
   * 暴食冲撞撞击结算（腐蚀重碾/荒古领主共用）：附带当前元素附魔
   * （冲撞不再纯白字，与元素流协同），击杀走统一结算（掉宝石/战利品）。
   */
  dashImpact(e, damage) {
    const corrodeR = this._getReaction('corrode')
    const dotMul = corrodeR ? Math.min(4, 2 + 0.3 * (this._reactionPower(corrodeR) - 1)) : 1
    const rMul = (this.reactionDmgMul || 1.0) * (this.geneReactionDmgMul || 1.0)
    const tickDmg = Math.max(1, Math.round(damage * 0.4 * rMul))
    const procs = this.player._procs
    const effects = {}
    if (this.freezeChance > 0 && Math.random() < this.freezeChance) effects.freeze = 1.5
    if (this.burnChance > 0 && Math.random() < this.burnChance) {
      effects.burn = 2 * dotMul
      effects.burnDmg = tickDmg
    }
    if (this.poisonChance > 0 && Math.random() < this.poisonChance) {
      effects.poison = 3 * dotMul
      effects.poisonDmg = tickDmg
    }
    if (procs.burn?.chance && Math.random() < procs.burn.chance) {
      effects.burn = Math.max(effects.burn || 0, procs.burn.duration * dotMul)
      effects.burnDmg = Math.max(effects.burnDmg || 0, tickDmg)
    }
    if (procs.freeze?.chance && Math.random() < procs.freeze.chance) {
      effects.freeze = Math.max(effects.freeze || 0, procs.freeze.duration)
    }
    if (procs.poison?.chance && Math.random() < procs.poison.chance) {
      effects.poison = Math.max(effects.poison || 0, procs.poison.duration * dotMul)
      effects.poisonDmg = Math.max(effects.poisonDmg || 0, tickDmg)
    }
    e.hit(damage, effects)
    if (!e.active) this._onKill(e)
  }

  _renderWeaponFeedback(ctx) {
    const visual = this._muzzleVisual
    if (this._weaponPulse > 0) {
      const progress = 1 - this._weaponPulse / 0.7
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - progress))
      ctx.strokeStyle = visual?.color || '#8cffc8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(this.player.x, this.player.y, 24 + progress * 34, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (this._muzzleT <= 0 || !visual) return
    const strength = Math.max(0, this._muzzleT / 0.08)
    ctx.save()
    ctx.translate(this.player.x, this.player.y)
    ctx.rotate(this._muzzleAngle)
    ctx.globalAlpha = strength
    ctx.fillStyle = visual.middle
    ctx.beginPath()
    ctx.moveTo(10, -5)
    ctx.lineTo(25 + visual.tier * 2, 0)
    ctx.lineTo(10, 5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = visual.core
    ctx.beginPath()
    ctx.arc(12, 0, 2.5, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  render(ctx) {
    // 蒸汽云雾（火+水，阶段十三）：半透明白雾，轻微脉动
    const t = this.game.elapsed
    for (const c of this._clouds) {
      if (!c.active) continue
      const pulse = 0.85 + 0.15 * Math.sin(t * 3 + c.x)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = '#dff4fb'
      ctx.beginPath()
      ctx.ellipse(0, 0, c.r * pulse, c.r * 0.6 * pulse, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(0, -4, c.r * 0.7, c.r * 0.45, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    // 混沌奇点：紧凑的牵引核心与结构环，不遮挡敌人轮廓。
    for (const s of this._singularities) {
      const fade = Math.min(1, s.life / 0.25, (s.maxLife - s.life) / 0.18 + 0.2)
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.globalAlpha = 0.16 * fade
      ctx.fillStyle = '#8876e8'
      ctx.beginPath()
      ctx.arc(0, 0, s.r * 0.72, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.68 * fade
      ctx.strokeStyle = '#c9bfff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, s.r * (0.66 + Math.sin(t * 8 + s.x) * 0.05), 0, TAU)
      ctx.stroke()
      ctx.fillStyle = '#3d315f'
      ctx.beginPath()
      ctx.arc(0, 0, 9, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    // 酸液池（火+毒）：半透明黄绿污染区，轻微脉动
    for (const p of this._pools) {
      if (!p.active) continue
      const pulse = 0.85 + 0.15 * Math.sin(t * 3 + p.x)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.globalAlpha = 0.32
      ctx.fillStyle = '#b8e84a'
      ctx.beginPath()
      ctx.ellipse(0, 0, p.r * pulse, p.r * 0.62 * pulse, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.18
      ctx.fillStyle = '#8ac83a'
      ctx.beginPath()
      ctx.ellipse(0, 4, p.r * 0.75, p.r * 0.45, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    // 死亡扩散环（阶段十五美化）：淡出扩散的圆环
    for (const ring of this._rings) {
      const k = 1 - ring.life / ring.maxLife
      ctx.globalAlpha = (1 - k) * 0.7
      ctx.strokeStyle = ring.color
      ctx.lineWidth = 2.5 * (1 - k) + 0.5
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, ring.r0 + (ring.r1 - ring.r0) * k, 0, TAU)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    this._renderWeaponFeedback(ctx)
    // 先粒子后飞弹：炸裂特效叠在飞弹之下，视觉更自然
    for (const pt of this._particles) pt.render(ctx)
    for (const p of this._projectiles) p.render(ctx)
  }
}
