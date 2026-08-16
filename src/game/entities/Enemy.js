import { Entity } from '../core/Entity.js'
import { AssetManager } from '../AssetManager.js'

const TAU = Math.PI * 2

/** 敌方配色（人类六职 + 非人三族：战獒棕 / 魔像石蓝 / 怨灵幽绿） */
const PALETTES = {
  knight: ['#9db8e8', '#4a72b8', '#2c4a7d'],
  mage: ['#c9a6f0', '#8a5cc8', '#5a3680'],
  archer: ['#a8d8a0', '#5aa04f', '#34702f'],
  assassin: ['#e056fd', '#8854d0', '#3b1c6e'],
  priest: ['#ffffff', '#f1c40f', '#d35400'],
  berserker: ['#ff7675', '#d63031', '#2d3436'],
  hound: ['#d8a06a', '#8a5a2e', '#4a2f16'],
  golem: ['#a8c0d8', '#5d7d9a', '#2e4258'],
  wraith: ['#b8f0dd', '#4db89a', '#1e5c4a'],
}

// 共享渐变缓存：懒构建一次，所有敌人复用（本地坐标创建，随各自变换对齐）
const GRAD_CACHE = new Map()

function getBodyGrad(ctx, key) {
  let g = GRAD_CACHE.get(key)
  if (!g) {
    const [light, mid, dark] = PALETTES[key] || PALETTES.knight
    g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 16)
    g.addColorStop(0, light)
    g.addColorStop(0.55, mid)
    g.addColorStop(1, dark)
    GRAD_CACHE.set(key, g)
  }
  return g
}

/** 精英词缀光环配色（外侧虚线环，与金色精英环区分） */
const AFFIX_COLORS = {
  swift: '#e8f4ff', // 迅捷：白
  shielded: '#5ad8e8', // 护盾：青
  explosive: '#ff9d4a', // 自爆：橙
  summoner: '#c9a6f0', // 召唤：紫
}

/** 蒸汽减速系数：减速期间移动速度 ×0.6 */
const SLOW_MUL = 0.6

/** 取职业主色（供武器系统生成同色击杀粒子） */
export const getPaletteMid = (key) => (PALETTES[key] ? PALETTES[key][1] : PALETTES.knight[1])

/** 不可吞噬敌族：魔像是石造物、怨灵是无形亡魂——没有可供吞噬的血肉，
 *  残血也不会进入可吞噬状态（战獒是活物，仍可吞噬） */
const NO_DEVOUR_TYPES = new Set(['golem', 'wraith'])

/** 敌方数值表：人类六职 + 非人三族（战獒快袭 / 魔像重壁 / 怨灵吸血） */
const CLASSES = {
  knight: { hpMul: 1.6, speedMul: 0.85, radius: 14, range: 0, attackInterval: 1.0, sx: 1.18, sy: 0.96 },
  mage: { hpMul: 0.9, speedMul: 0.65, radius: 13, range: 340, attackInterval: 2.4, sx: 0.86, sy: 1.12 },
  archer: { hpMul: 0.7, speedMul: 1.15, radius: 13, range: 280, attackInterval: 1.9, sx: 0.94, sy: 0.96 },
  assassin: { hpMul: 0.65, speedMul: 1.45, radius: 12, range: 0, attackInterval: 1.6, sx: 0.9, sy: 0.95 },
  priest: { hpMul: 0.85, speedMul: 0.7, radius: 13, range: 320, attackInterval: 2.5, sx: 0.9, sy: 1.05 },
  berserker: { hpMul: 2.2, speedMul: 0.75, radius: 15, range: 0, attackInterval: 1.2, sx: 1.2, sy: 1.0 },
  hound: { hpMul: 0.55, speedMul: 1.55, radius: 11, range: 0, attackInterval: 0.75, sx: 1.24, sy: 0.82 },
  golem: { hpMul: 4.5, speedMul: 0.5, radius: 17, range: 0, attackInterval: 1.6, sx: 1.12, sy: 1.06 },
  wraith: { hpMul: 1.1, speedMul: 1.05, radius: 13, range: 0, attackInterval: 1.3, sx: 0.94, sy: 1.12 },
}

/**
 * 敌人：人类勇者（骑士 / 法师 / 弓手 三职业）
 *
 * 追踪算法（每帧 update）：
 *  - Math.atan2(dy, dx) 计算面朝角；
 *  - 骑士：贴脸近战（距离 < 半径和 + 间隙时停止并挥砍）；
 *  - 法师/弓手：远程风筝——太远则靠近、太近则退避、射程内停下射击
 *    （通过 enemyManager.spawnBullet 发射直线弹幕）。
 *
 * 渲染：职业差异化外观（头盔+剑盾 / 尖帽+法杖+法袍 / 兜帽+弓），
 * 身体随 facing 旋转使武器始终指向玩家。
 */
export class Enemy extends Entity {
  constructor({
    x,
    y,
    speed,
    hp,
    rewardHp = hp,
    type = 'knight',
    elite = false,
    affix = null,
    affixes = null,
    attackTempo = 1,
  }) {
    super()
    this.x = x
    this.y = y
    this.type = type // 'knight' | 'mage' | 'archer'
    this.isElite = elite // 精英怪：属性 ×3、金色光环、必掉战利品
    this.affixes = Array.from(new Set((affixes || (affix ? [affix] : [])).filter(Boolean)))
    this.affix = this.affixes[0] || null // 兼容旧调用；新逻辑用 hasAffix 支持双词缀
    // 职业系数在此应用（速度/血量），spawn 只需传基础值
    this.speed = speed * CLASSES[type].speedMul * (elite ? 1.2 : 1) // px/s
    if (this.hasAffix('swift')) this.speed *= 1.5 // 迅捷词缀：移速再 ×1.5
    this.hp = Math.round(hp * CLASSES[type].hpMul * (elite ? 3 : 1)) // 生命值
    this.maxHp = this.hp // 记录满血（精英/Boss 血条用）
    this.expValue =
      Math.round(rewardHp * CLASSES[type].hpMul * (elite ? 3 : 1)) * 5 * (elite ? 3 : 1)
    this.radius = CLASSES[type].radius + (elite ? 3 : 0) // 碰撞半径
    this.range = CLASSES[type].range // 远程射程（骑士为 0 = 纯近战）
    this.attackInterval = CLASSES[type].attackInterval / Math.max(0.1, attackTempo)
    this.facing = 0 // 朝向玩家的角度（渲染用）
    this.paletteKey = type // 敌方配色即制服
    this.flash = 0 // 受击白闪计时（秒）
    this.damage = type === 'golem' ? 2 : 1 // 攻击伤害（魔像重击 2 点 / 其余 1 点）
    this.attackCd = Math.random() * 0.6 // 攻击冷却（秒），随机错峰开局

    // —— 吞噬系统（评审改造：残血可吞噬，吞噬是核心爽点） ——
    this.devourable = false // 残血（<25%）且非 Boss → 可被史莱姆吞噬
    this.devouring = false // 正在被吸入（动画中，不行动）
    // 击杀结算标记（阶段十二）：即时击杀/DOT 延迟死亡/吞噬 三方汇入
    // WeaponSystem._settleKill 后置位，防 EnemyManager 帧尾回收前重复结算
    this._settled = false

    // —— 状态效果（冰冻/燃烧/染毒/减速） ——
    this.freeze = 0 // 冻结剩余时间：期间完全定身
    this.slow = 0 // 蒸汽减速剩余时间（秒）：期间移动速度 ×0.6
    // 燃烧/中毒用「剩余跳数」而非时长：跳数在附加时锁定，总伤害恒定、帧率无关
    // 每跳伤害在附加时锁定（阶段十四调优：随武器伤害成长），同一状态取较大值
    this.burnHits = 0
    this._burnTick = 0.5
    this._burnDmg = 1
    this.poisonHits = 0
    this._poisonTick = 1
    this._poisonDmg = 1
    // 护盾词缀：吸收前 N 次伤害（DOT/溅射一并吸收，吞噬直接绕过——护盾怪的反制点）
    this.shieldHits = this.hasAffix('shielded') ? 2 : 0

    // —— 刺客专属状态机（阶段十七：新职业） ——
    this.assassinState = 'stalking' // 'stalking' | 'charging' | 'dashing' | 'cooldown'
    this._chargeTimer = 0
    this._dashTimer = 0
    this._dashCooldown = Math.random() * 0.8
    this._dashDir = { x: 0, y: 0 }
    this._shadowTrail = []
    this._dashHit = false

    // —— 圣职者牧师状态（阶段十七） ——
    this._healCd = 1.0 + Math.random() * 0.8
    this._healingTarget = null
    this._healBeamTimer = 0

    // —— 狂战士状态（阶段十七） ——
    this.isEnraged = false

    // —— 视觉增强（阶段十五美化） ——
    this._walkT = Math.random() * 10 // 走路相位（随机错开，弹跳不齐步）
    this._moving = false // 本帧是否移动（驱动弹跳/摇摆）
    this._spawnT = 0.28 // 出生弹入动画（easeOutBack）
    this._swingT = 0 // 骑士/狂战挥砍动画计时
    this._shootFlash = 0 // 法师射击闪光计时
  }

  hasAffix(id) {
    return this.affixes.includes(id)
  }

  /**
   * 分层吞噬线：普通怪更晚投降（门槛 -13pct），精英更早举白旗（+13pct）。
   * 白旗的稀缺感与「抢吞精英」的决策感都来自这条分层线；
   * 贪噬血统通过 strainDevourBonus 整体加宽两档。
   */
  _devourThresh() {
    const base = (this.game?.devourThreshold || 0.25) + (this.game?.strainDevourBonus || 0)
    return this.isElite ? base + 0.13 : Math.max(0.08, base - 0.13)
  }

  /**
   * 受击结算：扣血 + 白闪；effects 可选附加状态（DOT 跳伤不带，防无限刷新）；
   * 残血（≤25%）且非 Boss → 进入可吞噬状态（吞噬是核心爽点）
   */
  hit(damage, effects = null) {
    if (this.shieldHits > 0 && damage > 0) {
      this.shieldHits-- // 护盾吸收本次伤害
      damage = 0
    }
    this.hp -= damage
    this.flash = 0.12

    // 狂战士 50% 残血暴走判定
    if (this.type === 'berserker' && this.hp > 0 && this.hp <= this.maxHp * 0.5 && !this.isEnraged) {
      this.isEnraged = true
      this.freeze = 0
      this.slow = 0
      this.game?.enemyManager?.addText(this.x, this.y - 14, '🔥 狂暴!', null, '#ff3838', 14)
    }

    const devourHp = Math.max(1, Math.ceil(this.maxHp * this._devourThresh()))
    if (!this.isBoss && !NO_DEVOUR_TYPES.has(this.type) && this.hp > 0 && this.hp <= devourHp) {
      this.devourable = true
    }
    if (effects && (!this.isEnraged)) { // 狂战士狂暴状态免疫控制
      // 同类状态取较长剩余；时长换算成固定跳数
      if (effects.freeze) this.freeze = Math.max(this.freeze, effects.freeze)
      if (effects.burn) {
        this.burnHits = Math.max(this.burnHits, Math.ceil(effects.burn / 0.5))
        if (effects.burnDmg > 0) this._burnDmg = Math.max(this._burnDmg, effects.burnDmg)
      }
      if (effects.poison) {
        this.poisonHits = Math.max(this.poisonHits, Math.ceil(effects.poison / 1))
        if (effects.poisonDmg > 0) this._poisonDmg = Math.max(this._poisonDmg, effects.poisonDmg)
      }
    }
    if (this.hp <= 0) this.destroy()
  }

  /**
   * 状态机推进（受击闪/DOT/冻结/死亡判定）——Boss 等子类复用。
   * @returns {boolean} true = 本帧存活且未冻结，可继续行动
   */
  _tickStatus(dt) {
    this.flash = Math.max(0, this.flash - dt)
    if (this.freeze > 0) this.freeze -= dt
    this.slow = Math.max(0, this.slow - dt)
    this._spawnT = Math.max(0, this._spawnT - dt) // 出生弹入计时（Boss 继承复用）
    this._swingT = Math.max(0, this._swingT - dt)
    this._shootFlash = Math.max(0, this._shootFlash - dt)
    if (this.burnHits > 0) {
      this._burnTick -= dt
      if (this._burnTick <= 0) {
        this._burnTick = 0.5 // 每 0.5s 一跳
        this.burnHits--
        this.hit(this._burnDmg)
        this.game?.enemyManager?.addText(this.x, this.y - 10, String(this._burnDmg), null, '#ff9d4a', 12)
      }
    }
    if (this.poisonHits > 0) {
      this._poisonTick -= dt
      if (this._poisonTick <= 0) {
        this._poisonTick = 1 // 每 1s 一跳
        this.poisonHits--
        this.hit(this._poisonDmg)
        this.game?.enemyManager?.addText(this.x, this.y - 10, String(this._poisonDmg), null, '#7ce86a', 12)
      }
    }
    if (this.hp <= 0) {
      this.destroy()
      if (!this._settled) {
        this.game?.weaponSystem?.onDOTKill?.(this)
      }
      return false
    }
    return this.freeze <= 0
  }

  /** 远程职业射击：向玩家方向发射一枚弹幕 */
  _shoot() {
    this.game.enemyManager.spawnBullet(this.x, this.y, this.facing, this.type)
    this.game.sound.enemyShoot()
    this._shootFlash = 0.12 // 射击闪光
  }

  _hitTarget(target, player, damage) {
    if (target.isDecoy) player.hitDecoy(target, damage)
    else player.hit(damage)
  }

  update(dt) {
    if (this.devouring) return // 正在被史莱姆吸入：不行动
    if (!this._tickStatus(dt)) return
    const player = this.game.player
    const target = player.getEnemyTarget?.(this) || player
    const targetRadius = target.radius || player.radius
    const dx = target.x - this.x
    const dy = target.y - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 默认面朝玩家
    if (this.assassinState !== 'dashing') {
      this.facing = Math.atan2(dy, dx)
    }

    // —— 职业行为 ——
    const ux = dx / (dist || 1)
    const uy = dy / (dist || 1)
    const spd = this.speed * (this.slow > 0 ? SLOW_MUL : 1)
    this._moving = false

    if (
      this.type === 'knight' ||
      this.type === 'hound' ||
      this.type === 'golem' ||
      this.type === 'wraith'
    ) {
      // 近战突进：骑士贴脸 / 战獒快袭 / 魔像重压（2 点伤害）/ 怨灵索命（命中吸血）
      const stopDist = this.radius + targetRadius + 4
      if (dist > stopDist) {
        this.x += ux * spd * dt
        this.y += uy * spd * dt
        this._moving = true
      } else {
        this.attackCd -= dt
        if (this.attackCd <= 0) {
          this.attackCd = this.attackInterval
          this._swingT = this.type === 'golem' ? 0.3 : 0.22 // 魔像重砸前摇更长
          this._hitTarget(target, player, this.damage)
          // 怨灵吸血：命中回复 30% 生命——本体不可吞噬，克制手段只有爆发输出
          if (this.type === 'wraith' && this.hp > 0 && this.hp < this.maxHp) {
            const drain = Math.max(1, Math.round(this.maxHp * 0.3))
            this.hp = Math.min(this.maxHp, this.hp + drain)
            this.game?.enemyManager?.addText(this.x, this.y - 12, `+${drain} 吸取`, null, '#7ce8c8', 12)
          }
        }
      }
    } else if (this.type === 'assassin') {
      // 刺客：暗影潜行逼近 → 0.4s 蓄力红线预警 → 超高速暗影突刺（880px/s） → 0.6s 硬直
      if (this._dashCooldown > 0) this._dashCooldown -= dt

      if (this.assassinState === 'dashing') {
        this._dashTimer -= dt
        this.x += this._dashDir.x * 880 * dt
        this.y += this._dashDir.y * 880 * dt
        this._moving = true
        // 冲刺残影
        this._shadowTrail.push({ x: this.x, y: this.y, life: 0.22, maxLife: 0.22 })
        // 伤害碰撞检测（突刺 2 点伤害）
        const pDist2 = (target.x - this.x) ** 2 + (target.y - this.y) ** 2
        if (!this._dashHit && pDist2 < (this.radius + targetRadius + 6) ** 2) {
          this._hitTarget(target, player, 2)
          this._dashHit = true
        }
        if (this._dashTimer <= 0) {
          this.assassinState = 'cooldown'
          this._dashCooldown = 1.1 // 突刺后硬直
        }
      } else if (this.assassinState === 'charging') {
        this._chargeTimer -= dt
        this._moving = false
        this.facing = Math.atan2(dy, dx)
        if (this._chargeTimer <= 0) {
          this.assassinState = 'dashing'
          this._dashTimer = 0.18
          this._dashHit = false
          const angle = this.facing
          this._dashDir = { x: Math.cos(angle), y: Math.sin(angle) }
          this.game.sound.enemyShoot?.()
        }
      } else if (this.assassinState === 'cooldown') {
        if (this._dashCooldown <= 0.5) {
          this.x += ux * spd * 0.7 * dt
          this.y += uy * spd * 0.7 * dt
          this._moving = true
        } else {
          this._moving = false
        }
        if (this._dashCooldown <= 0) {
          this.assassinState = 'stalking'
        }
      } else {
        // 'stalking': 高速潜行
        this.x += ux * spd * dt
        this.y += uy * spd * dt
        this._moving = true
        if (dist <= 240 && this._dashCooldown <= 0) {
          this.assassinState = 'charging'
          this._chargeTimer = 0.4 // 0.4s 显形预警
        }
      }

      // 残影寿命衰减
      for (let i = this._shadowTrail.length - 1; i >= 0; i--) {
        this._shadowTrail[i].life -= dt
        if (this._shadowTrail[i].life <= 0) this._shadowTrail.splice(i, 1)
      }
    } else if (this.type === 'berserker') {
      // 狂战士：前排重坦近战，狂暴后移速/攻速激增，免疫冰冻与减速
      if (this.isEnraged) {
        this.freeze = 0
        this.slow = 0
      }
      const curSpd = spd * (this.isEnraged ? 1.6 : 1.0)
      const stopDist = this.radius + targetRadius + 4
      if (dist > stopDist) {
        this.x += ux * curSpd * dt
        this.y += uy * curSpd * dt
        this._moving = true
      } else {
        this.attackCd -= dt
        const curInterval = this.isEnraged ? this.attackInterval * 0.5 : this.attackInterval
        if (this.attackCd <= 0) {
          this.attackCd = curInterval
          this._swingT = 0.22
          this._hitTarget(target, player, this.isEnraged ? 2 : 1)
        }
      }
    } else if (this.type === 'priest') {
      // 圣职者：后排站位（保持 280~360px 距离），为附近伤员引导圣光治疗
      this._healCd -= dt
      this._healBeamTimer = Math.max(0, this._healBeamTimer - dt)

      const retreat = 280
      const keepDist = 360
      if (dist < retreat) {
        this.x -= ux * spd * 0.85 * dt
        this.y -= uy * spd * 0.85 * dt
        this._moving = true
      } else if (dist > keepDist) {
        this.x += ux * spd * 0.85 * dt
        this.y += uy * spd * 0.85 * dt
        this._moving = true
      }

      // 治疗冷却完毕，寻找 280px 范围内的重伤友军（血量比例最低）
      if (this._healCd <= 0) {
        let lowestHpRatio = 0.99
        let healTarget = null
        for (const ally of this.game.enemyManager._enemies) {
          if (!ally.active || ally === this || ally.hp >= ally.maxHp) continue
          const adx = ally.x - this.x
          const ady = ally.y - this.y
          if (adx * adx + ady * ady <= 280 * 280) {
            const ratio = ally.hp / ally.maxHp
            if (ratio < lowestHpRatio) {
              lowestHpRatio = ratio
              healTarget = ally
            }
          }
        }

        if (healTarget) {
          this._healingTarget = healTarget
          this._healBeamTimer = 0.7
          this._healCd = 2.5
          const healAmt = Math.max(1, Math.round(healTarget.maxHp * 0.2))
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmt)
          healTarget.flash = 0.15
          const devourHp = Math.max(1, Math.ceil(healTarget.maxHp * healTarget._devourThresh()))
          if (healTarget.hp > devourHp) healTarget.devourable = false
          this.game?.enemyManager?.addText(healTarget.x, healTarget.y - 12, `+${healAmt} 圣光`, null, '#ffd32a', 13)
        } else {
          this._healCd = 0.6
        }
      }
    } else {
      // 远程：法师 / 弓手
      const range = this.range
      const retreat = range * 0.55
      if (dist > range) {
        this.x += ux * spd * dt
        this.y += uy * spd * dt
        this._moving = true
      } else if (dist < retreat) {
        this.x -= ux * spd * 0.8 * dt
        this.y -= uy * spd * 0.8 * dt
        this._moving = true
      } else {
        this.attackCd -= dt
        if (this.attackCd <= 0) {
          this.attackCd = this.attackInterval
          this._shoot()
        }
      }
    }
    if (this._moving) this._walkT += dt * 9
  }

  render(ctx) {
    const r = this.radius
    const assets = AssetManager.getInstance()

    // 地面软阴影（悬浮单位更淡更散）
    const floating = this.type === 'mage' || this.type === 'priest' || this.type === 'wraith'
    ctx.fillStyle = floating ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.26)'

    // 牧师圣光治疗光束（世界空间）
    if (this.type === 'priest' && this._healBeamTimer > 0 && this._healingTarget && this._healingTarget.active) {
      ctx.save()
      const tx = this._healingTarget.x
      const ty = this._healingTarget.y
      // 粗金色外光晕
      ctx.strokeStyle = 'rgba(255, 211, 42, 0.45)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(this.x, this.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      // 亮白核心光束
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(this.x, this.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      // 目标脚底金色圣疗光环
      ctx.strokeStyle = '#ffd32a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tx, ty, this._healingTarget.radius + 4, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    // 刺客冲刺残影（世界空间）
    if (this.type === 'assassin' && this._shadowTrail.length > 0) {
      for (const p of this._shadowTrail) {
        ctx.save()
        ctx.globalAlpha = (p.life / p.maxLife) * 0.4
        ctx.fillStyle = '#6c5ce7'
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.9, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    }

    // 刺客蓄力宽幅危险光道预警（世界空间，极度清晰醒目）
    if (this.type === 'assassin' && this.assassinState === 'charging') {
      const ang = this.facing
      const len = 300
      ctx.save()
      ctx.translate(this.x, this.y)
      ctx.rotate(ang)

      // 宽幅半透明红色危险区（18px 宽）
      const beamG = ctx.createLinearGradient(0, 0, len, 0)
      beamG.addColorStop(0, 'rgba(255, 56, 56, 0.45)')
      beamG.addColorStop(0.7, 'rgba(255, 56, 56, 0.22)')
      beamG.addColorStop(1, 'rgba(255, 56, 56, 0)')
      ctx.fillStyle = beamG
      ctx.fillRect(0, -9, len, 18)

      // 危险区边缘亮光线
      ctx.strokeStyle = 'rgba(255, 75, 75, 0.75)'
      ctx.lineWidth = 1
      ctx.strokeRect(0, -9, len, 18)

      // 核心高亮虚线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(len, 0)
      ctx.stroke()
      ctx.setLineDash([])

      // 沿光道动态流动的警戒箭头 >>>
      ctx.fillStyle = '#ffffff'
      const arrowOffset = (this.game.elapsed * 380) % 60
      for (let d = 30 + arrowOffset; d < len - 30; d += 60) {
        ctx.beginPath()
        ctx.moveTo(d + 8, 0)
        ctx.lineTo(d, -5)
        ctx.lineTo(d + 2.5, 0)
        ctx.lineTo(d, 5)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()

      // 刺客头顶警告标识
      ctx.save()
      ctx.font = 'bold 12px sans-serif'
      ctx.fillStyle = '#ff3838'
      ctx.textAlign = 'center'
      ctx.fillText('⚡ 突刺锁定!', this.x, this.y - r - 16)
      ctx.restore()
    }

    ctx.save()
    // 走路弹跳与悬浮（法师/牧师/怨灵离地漂浮）
    const bob = this._moving ? Math.sin(this._walkT * 2) * 1.4 : 0
    const float =
      this.type === 'mage' || this.type === 'priest' || this.type === 'wraith'
        ? Math.sin(this.game.elapsed * 3 + this._walkT) * 2 - 2.5
        : 0
    ctx.translate(this.x, this.y + bob + float)

    // 刺客幽影光环与蓄力光辉（本地坐标系）
    if (this.type === 'assassin') {
      if (this.assassinState === 'stalking') {
        ctx.globalAlpha = 0.9
        const auraPulse = 0.5 + 0.5 * Math.sin(this.game.elapsed * 8 + this._walkT)
        ctx.strokeStyle = `rgba(224, 86, 253, ${0.5 + auraPulse * 0.5})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, r + 3 + auraPulse * 2, 0, TAU)
        ctx.stroke()
      } else if (this.assassinState === 'charging') {
        ctx.shadowColor = '#ff3838'
        ctx.shadowBlur = 12
      } else if (this.assassinState === 'cooldown') {
        ctx.save()
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = '#f1c40f'
        ctx.textAlign = 'center'
        ctx.fillText('💫 破绽', 0, -r - 12)
        ctx.restore()
      }
    } else if (this.type === 'berserker' && this.isEnraged) {
      // 狂战士狂暴暗红烈焰气场
      const rageP = 0.5 + 0.5 * Math.sin(this.game.elapsed * 12 + this._walkT)
      ctx.strokeStyle = `rgba(235, 47, 6, ${0.6 + rageP * 0.4})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(0, 0, r + 3 + rageP * 3, 0, TAU)
      ctx.stroke()
    } else if (this.type === 'priest') {
      // 圣职者脚底微弱圣光环
      ctx.strokeStyle = 'rgba(255, 211, 42, 0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, r + 2, 0, TAU)
      ctx.stroke()
    }

    // 左右朝向翻转：人形勇者始终脚踩地面、头朝上站立，面向玩家左右翻转
    const facingRight = Math.cos(this.facing) >= 0
    if (!facingRight) {
      ctx.scale(-1, 1)
    }

    // 出生弹入动画（easeOutBack）
    if (this._spawnT > 0) {
      const t = 1 - this._spawnT / 0.28
      const c1 = 1.70158
      const c3 = c1 + 1
      const s = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
      ctx.scale(s, s)
    }

    // 精灵帧与动作判定
    let frame = Math.floor(((this._walkT % (TAU * 1.2)) / (TAU * 1.2)) * 4) % 4
    if (this.type === 'knight' && this._swingT > 0) {
      frame = 4 // 攻击斩击帧
    } else if (this.type === 'berserker' && this._swingT > 0) {
      frame = 4 // 狂战重劈帧
    } else if (this.type === 'assassin' && this.assassinState === 'dashing') {
      frame = 4 // 刺客突刺帧
    } else if (this.type === 'priest' && this._healBeamTimer > 0) {
      frame = 4 // 圣职者祈祷治疗帧
    } else if (this.type === 'mage' && (this._shootFlash > 0 || (this.attackCd > 0 && this.attackCd < 0.35))) {
      frame = 4 // 施法蓄力/发射帧
    } else if (this.type === 'archer' && (this.attackCd > 0 && this.attackCd < 0.45)) {
      frame = 4 // 拉弓蓄力帧
    }

    // 法师脚下奥术法阵（施法蓄力与开火时旋转展开）
    if (this.type === 'mage' && (this._shootFlash > 0 || (this.attackCd > 0 && this.attackCd < 0.5))) {
      ctx.save()
      ctx.scale(1, 0.45)
      ctx.rotate(this.game.elapsed * 4)
      assets.draw(ctx, 'vfx_magic_circle', 0, 0, r * 2.8, r * 2.8)
      ctx.restore()
    }

    // 绘制高精度职业精灵
    assets.draw(ctx, `char_${this.type}_${frame}`, 0, 0, r * 2.9, r * 2.9)

    // 骑士挥剑半透明银弧刀光（Slash Arc 特效）
    if (this.type === 'knight' && this._swingT > 0) {
      const swingProg = 1 - this._swingT / 0.22
      ctx.save()
      ctx.translate(r * 0.7, 0)
      ctx.rotate((swingProg - 0.5) * 1.5)
      assets.draw(ctx, 'vfx_slash_arc', 0, 0, r * 3.2, r * 3.2)
      ctx.restore()
    }

    // 精英怪：金色光环脉动
    if (this.isElite) {
      const ep = 0.5 + 0.5 * Math.sin(this.game.elapsed * 4 + this._walkT)
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.5 + ep * 0.4})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(0, 0, r + 2 + ep * 1.5, r + 2 + ep * 1.5, 0, 0, TAU)
      ctx.stroke()
    }

    // 精英词缀光环
    if (this.affixes.length) {
      for (let i = 0; i < this.affixes.length; i++) {
        ctx.strokeStyle = AFFIX_COLORS[this.affixes[i]] || '#ffffff'
        ctx.lineWidth = i === 0 ? 2 : 1.5
        ctx.setLineDash(i === 0 ? [5, 4] : [2, 5])
        ctx.beginPath()
        ctx.ellipse(0, 0, r + 6 + i * 4, r + 6 + i * 4, 0, 0, TAU)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // 可吞噬标记：呼吸环 + 投降旗——普通怪白色，精英金色高价值标识
    // （分层吞噬的视觉信号：金旗 = 经验×3 / 必掉核心 / 原核双倍，值得冲刺去抢）
    if (this.devourable) {
      const gold = this.isElite
      const pulse = 0.5 + 0.5 * Math.sin(this.game.elapsed * 6)
      ctx.strokeStyle = gold
        ? `rgba(255, 209, 102, ${(0.45 + pulse * 0.45).toFixed(2)})`
        : `rgba(255, 255, 255, ${(0.35 + pulse * 0.4).toFixed(2)})`
      ctx.lineWidth = gold ? 2.5 : 2
      ctx.beginPath()
      ctx.ellipse(0, 0, r + 4 + pulse * 3, r + 4 + pulse * 3, 0, 0, TAU)
      ctx.stroke()
      // 投降旗（精英金旗略大 / 普通白旗）
      const poleTop = -r * (gold ? 1.75 : 1.6)
      const flagTip = r * (gold ? 1.05 : 0.9)
      ctx.strokeStyle = gold ? 'rgba(255, 214, 110, 0.95)' : 'rgba(230, 230, 230, 0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(r * 0.2, -r * 0.5)
      ctx.lineTo(r * 0.2, poleTop)
      ctx.stroke()
      const wave = Math.sin(this.game.elapsed * 8 + this._walkT) * 1.5
      ctx.fillStyle = gold ? 'rgba(255, 209, 102, 0.95)' : 'rgba(255, 255, 255, 0.92)'
      ctx.beginPath()
      ctx.moveTo(r * 0.2, poleTop)
      ctx.lineTo(flagTip, poleTop + r * 0.15 + wave)
      ctx.lineTo(r * 0.2, poleTop + r * 0.35 + wave)
      ctx.closePath()
      ctx.fill()
    }

    // 精英词缀装备化标识
    if (this.hasAffix('shielded')) {
      ctx.strokeStyle = 'rgba(90, 216, 232, 0.8)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(0, 0, r + 3, -Math.PI * 0.4, Math.PI * 0.4)
      ctx.stroke()
    }
    if (this.hasAffix('explosive')) {
      const ep = 0.5 + 0.5 * Math.sin(this.game.elapsed * 6 + this._walkT)
      ctx.fillStyle = 'rgba(255, 157, 74, 0.85)'
      ctx.beginPath()
      ctx.arc(r * 0.25, r * 0.25, r * 0.22 + ep * r * 0.08, 0, TAU)
      ctx.fill()
    }
    if (this.hasAffix('swift')) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(-r * 1.35, s * r * 0.28)
        ctx.lineTo(-r * 0.72, s * r * 0.28)
        ctx.stroke()
      }
    }
    if (this.hasAffix('summoner')) {
      const sy2 = Math.sin(this.game.elapsed * 3 + this._walkT) * 2
      ctx.save()
      ctx.translate(0, -r * 1.3 + sy2)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#c9a6f0'
      ctx.fillRect(-3.5, -3.5, 7, 7)
      ctx.restore()
    }

    // 受击白闪
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${((this.flash / 0.12) * 0.75).toFixed(2)})`
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 1.1, r * 1.1, 0, 0, TAU)
      ctx.fill()
    }

    // 状态着色：冻结蓝 / 燃烧橙 / 中毒绿 / 减速青
    if (this.freeze > 0) {
      ctx.fillStyle = 'rgba(120, 200, 255, 0.42)'
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r, 0, 0, TAU)
      ctx.fill()
    }
    if (this.slow > 0) {
      ctx.fillStyle = 'rgba(160, 220, 255, 0.22)'
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r, 0, 0, TAU)
      ctx.fill()
    }
    if (this.burnHits > 0) {
      ctx.fillStyle = 'rgba(255, 140, 60, 0.35)'
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r, 0, 0, TAU)
      ctx.fill()
    }
    if (this.poisonHits > 0) {
      ctx.fillStyle = 'rgba(120, 255, 120, 0.3)'
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r, 0, 0, TAU)
      ctx.fill()
    }

    ctx.restore()

    // 状态图标
    let icon = ''
    if (this.freeze > 0) icon += '❄️'
    if (this.burnHits > 0) icon += '🔥'
    if (this.poisonHits > 0) icon += '☠️'
    if (this.slow > 0) icon += '🌀'
    if (icon) {
      const ib = Math.sin(this.game.elapsed * 5 + this._walkT) * 1.5
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(icon, this.x, this.y - r - 11 + ib)
    }
  }
}
