import { Entity } from './core/Entity.js'
import { Gem } from './entities/Gem.js'
import { getElement } from './ElementSystem.js'

const MAGNET_ACC = 2400 // 吸附加速度（px/s²）：离玩家越远加速越久，形成「越近越快」的磁吸手感
const MAGNET_MAX_SPEED = 950 // 吸附速度上限（px/s），防止超远处宝石瞬移
const MAX_SP2 = MAGNET_MAX_SPEED * MAGNET_MAX_SPEED

const MERGE_CELL = 24 // 宝石合并网格单元（≥ 合并半径 16px）
const MERGE_R2 = 16 * 16 // 合并判定距离平方：同位置（<16px）宝石并入一颗
const MERGE_INTERVAL = 0.5 // 合并轮间隔（秒）：低频执行，O(n) 分桶不占热路径
const CORE_INTERACT_RADIUS = 82
export const ELEMENT_CORE_LIFETIME = 30
export const ELEMENT_CORE_WARNING = 5
export const MAX_ELEMENT_CORES = 36
export const MAX_EXP_GEMS = 180
const CORE_INTERACTION_GRACE = 1.25

const isElementCore = (g) => g.type !== 'exp' && g.type !== 'tome'

/**
 * 宝石管理器：掉落入池 → 磁力吸附 → 拾取结算
 *
 * 磁力吸附算法（update）：
 *  - idle → magnet：宝石与玩家距离平方 < pickupRadius² 时切换状态
 *    （平方比较免开方）；
 *  - magnet 移动：每帧把速度向量向「指向玩家的单位向量」方向叠加
 *    MAGNET_ACC × dt（加速度模型），并夹在速度上限内——宝石不是被
 *    Lerp 瞬移，而是真的「加速飞向」玩家；
 *  - 拾取：与玩家距离平方 < 玩家半径² → gainExp 结算 + O(1) 交换删除。
 *
 * 性能优化（长局大量掉落）：
 *  - ① 分帧检测：静止宝石每帧只检测 1/3（帧号轮转），吸附延迟最多
 *    3 帧（约 50ms）完全无感，检测量降 2/3；
 *  - ② magnet 状态是少数，移动与结算全量遍历无压力；
 *  - ③ 渲染前视口剔除：屏幕外宝石直接跳过；
 *  - ④ 数组删除用 swap-pop（与末位交换后 pop），O(1) 无数组搬迁；
 *  - 更进一步的方案（注释留档）：空间哈希网格——每帧 O(n) 插入、
 *    只查询玩家周围 3×3 网格，吸附检测从 O(n) 降为近 O(1)。
 */
export class GemManager extends Entity {
  constructor({ player }) {
    super()
    this.player = player
    this._gems = []
    this._frame = 0 // 分帧检测轮转计数
    this._mergeTimer = MERGE_INTERVAL // 合并轮计时（阶段十三）
    this._heldGem = null // 首融确认中持住的宝石（阶段十六）
    this._nearCore = null // 当前可主动吸收的最近元素核心
  }

  /** 当前场上宝石数量（HUD 显示用） */
  get count() {
    return this._gems.length
  }

  /** 敌人死亡时掉落：经验宝石（默认）或元素核心（type 指定） */
  spawn(x, y, value, type = 'exp') {
    const gem = new Gem(x, y, value, type)
    if (isElementCore(gem)) {
      gem.life = ELEMENT_CORE_LIFETIME
      gem.maxLife = ELEMENT_CORE_LIFETIME
    }
    this._gems.push(gem)
    if (isElementCore(gem)) this._trimElementCores()
    return gem
  }

  /**
   * 首融确认（阶段十六追加）：持住宝石（冻结状态）并交给引擎弹确认面板。
   * 主形态整局锁定不可逆，吃之前给玩家一次选择。
   */
  askFusion(g) {
    this._heldGem = g
    g.state = 'held'
    this.game.askFusionConfirm(g.type)
  }

  /**
   * 首融确认结果（引擎回调）：
   *  - accepted：移除宝石（随后由引擎执行 absorbElement 触发首融进化）；
   *  - 拒绝：吐回地上（随机弹开 80px + 2s 拾取冷却，防原地重复弹窗）。
   */
  resolveHeld(accepted) {
    const g = this._heldGem
    this._heldGem = null
    if (!g) return
    if (accepted) {
      const i = this._gems.indexOf(g)
      if (i >= 0) {
        this._gems[i] = this._gems[this._gems.length - 1]
        this._gems.pop()
      }
    } else {
      g.state = 'idle'
      g.vx = 0
      g.vy = 0
      g.x += (Math.random() * 2 - 1) * 80
      g.y += (Math.random() * 2 - 1) * 80
      g.rejectedUntil = this.game.elapsed + 2
      g.life = Math.max(g.life, ELEMENT_CORE_WARNING + 2)
    }
  }

  /** 重置宝石池（游戏重开时由引擎调用） */
  reset() {
    this._gems.length = 0
    this._frame = 0
    this._mergeTimer = MERGE_INTERVAL
    this._heldGem = null
    this._nearCore = null
  }

  _removeGem(gem) {
    const i = this._gems.indexOf(gem)
    if (i < 0) return false
    this._gems[i] = this._gems[this._gems.length - 1]
    this._gems.pop()
    if (this._nearCore === gem) this._nearCore = null
    return true
  }

  /** 元素核心为主动构筑选择，但不能无限占据场地：临期回收，贴近玩家时短暂保留。 */
  _updateCoreLifetimes(dt) {
    const list = this._gems
    const px = this.player.x
    const py = this.player.y
    const interactR2 = CORE_INTERACT_RADIUS * CORE_INTERACT_RADIUS
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i]
      if (!isElementCore(g) || g.state === 'held') continue
      const dx = px - g.x
      const dy = py - g.y
      if (dx * dx + dy * dy < interactR2 && g.life <= CORE_INTERACTION_GRACE) {
        g.life = CORE_INTERACTION_GRACE
        continue
      }
      g.life -= dt
      if (g.life > 0) continue
      if (this._nearCore === g) this._nearCore = null
      list[i] = list[list.length - 1]
      list.pop()
    }
  }

  /** 超限时保护玩家附近和确认面板中的核心，再按剩余寿命、距离选择回收目标。 */
  _trimElementCores() {
    const px = this.player.x
    const py = this.player.y
    const interactR2 = CORE_INTERACT_RADIUS * CORE_INTERACT_RADIUS
    const cores = this._gems.filter(isElementCore)
    if (cores.length <= MAX_ELEMENT_CORES) return
    cores.sort((a, b) => {
      const aHeld = a.state === 'held'
      const bHeld = b.state === 'held'
      if (aHeld !== bHeld) return aHeld ? 1 : -1
      const adx = px - a.x
      const ady = py - a.y
      const bdx = px - b.x
      const bdy = py - b.y
      const ad2 = adx * adx + ady * ady
      const bd2 = bdx * bdx + bdy * bdy
      const aNear = ad2 < interactR2 ? 1 : 0
      const bNear = bd2 < interactR2 ? 1 : 0
      return aNear - bNear || a.life - b.life || bd2 - ad2
    })
    let excess = cores.length - MAX_ELEMENT_CORES
    for (const core of cores) {
      if (excess <= 0 || core.state === 'held') break
      if (this._removeGem(core)) excess--
    }
  }

  /** 查找并主动吸收最近的元素核心；经验与秘籍仍使用自动磁吸。 */
  _updateCoreInteraction() {
    const list = this._gems
    // 元素权限（第三批角色化）：非元素角色 E 不进行元素交互，
    // 也不点亮「E」提示气泡（_nearCore 保持 null）。
    if (this.game?.canUseElements === false) {
      this.player.input.consumeInteract?.() // 消费掉按键，避免队列残留
      this._nearCore = null
      return false
    }
    const px = this.player.x
    const py = this.player.y
    let best = null
    let bestD2 = CORE_INTERACT_RADIUS * CORE_INTERACT_RADIUS
    for (const g of list) {
      if (g.type === 'exp' || g.type === 'tome' || g.state === 'held') continue
      const dx = px - g.x
      const dy = py - g.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestD2) {
        bestD2 = d2
        best = g
      }
    }
    this._nearCore = best

    if (!this.player.input.consumeInteract?.() || !best) return false
    if (best.rejectedUntil > 0 && this.game.elapsed < best.rejectedUntil) return false
    if (this.player.shouldConfirmElement(best.type)) {
      this.askFusion(best)
      return true
    }

    this.player.absorbElement(best.type)
    const el = getElement(best.type)
    if (el) {
      this.game.enemyManager.addText(
        this.player.x,
        this.player.y - 26,
        `${el.icon} ${el.name} +1`,
        null,
        best.color,
        15
      )
    }
    const i = list.indexOf(best)
    if (i >= 0) {
      list[i] = list[list.length - 1]
      list.pop()
    }
    this._nearCore = null
    return !this.game.running
  }

  /**
   * 同位置经验宝石合并（阶段十三）：每 0.5s 一轮，距离 <16px 的 exp 宝石
   * 并入一颗（经验值累加、尺寸颜色重新分级）。空间哈希分桶，一轮 O(n)，
   * 千颗宝石也只在低频执行——缓解长局宝石膨胀与视觉杂乱。
   */
  _mergeGems() {
    const list = this._gems
    if (list.length < 2) return
    // 分桶：仅 exp 宝石参与合并
    const grid = new Map()
    for (const g of list) {
      if (g.type !== 'exp' || g.merged) continue
      const key = ((g.x / MERGE_CELL) | 0) * 100000 + ((g.y / MERGE_CELL) | 0)
      let bucket = grid.get(key)
      if (!bucket) {
        bucket = []
        grid.set(key, bucket)
      }
      bucket.push(g)
    }
    // 3×3 邻域内配对合并（跨格边界的近距离对不遗漏）
    let changed = false
    for (const g of list) {
      if (g.type !== 'exp' || g.merged) continue
      const cx = (g.x / MERGE_CELL) | 0
      const cy = (g.y / MERGE_CELL) | 0
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get((cx + ox) * 100000 + (cy + oy))
          if (!bucket) continue
          for (const h of bucket) {
            if (h === g || h.type !== 'exp' || h.merged) continue
            const dx = g.x - h.x
            const dy = g.y - h.y
            if (dx * dx + dy * dy < MERGE_R2) {
              g.value += h.value
              h.merged = true
              changed = true
            }
          }
        }
      }
      if (changed && !g.merged) g.setExpValue(g.value)
    }
    // 回收被吸收的宝石（倒序 swap-pop：O(1) 删除、无数组搬迁）。
    // 倒序是正确性的前提，因此删除后不需要原地复查：
    //  - 与末位交换时，换入的元素下标更大、本轮已被访问过且未标记 merged，
    //    所以搬过来就是干净的；i 继续向前即可；
    //  - i 恰好是末位时交换退化为自赋值，pop 后由 for 自身的 i-- 正常回退。
    // 旧实现把 i-- 写在 else 分支里：末位元素 merged 时 pop 后 i 不回退，
    // 下一轮 i === list.length → list[i] === undefined → 读 .merged 抛 TypeError。
    if (changed) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].merged) {
          list[i] = list[list.length - 1]
          list.pop()
        }
      }
    }
  }

  /**
   * 经验宝石超过预算时，把最远的一批压缩到其中离玩家最近的一颗。
   * 只减少对象数量，经验总值严格守恒，也不会把远处经验凭空送到玩家脚下。
   */
  _compactExpGems() {
    const px = this.player.x
    const py = this.player.y
    const exp = this._gems.filter((g) => g.type === 'exp')
    if (exp.length <= MAX_EXP_GEMS) return
    exp.sort((a, b) => {
      const adx = px - a.x
      const ady = py - a.y
      const bdx = px - b.x
      const bdy = py - b.y
      return bdx * bdx + bdy * bdy - (adx * adx + ady * ady)
    })

    const compactCount = exp.length - MAX_EXP_GEMS + 1
    const anchor = exp[compactCount - 1]
    let total = 0
    let wasMagnetized = false
    for (let i = 0; i < compactCount; i++) {
      total += exp[i].value
      wasMagnetized ||= exp[i].state === 'magnet'
      if (exp[i] !== anchor) exp[i].merged = true
    }
    anchor.setExpValue(total)
    if (wasMagnetized) anchor.state = 'magnet'

    for (let i = this._gems.length - 1; i >= 0; i--) {
      if (!this._gems[i].merged) continue
      this._gems[i] = this._gems[this._gems.length - 1]
      this._gems.pop()
    }
  }

  update(dt) {
    // 玩家死亡（gameOver 已触发，仅本帧残差）：停止拾取结算，
    // 防死亡帧经验/元素/秘籍继续触发升级面板（面板叠加 + 暂停锁失衡）
    if (this.player.dead) return
    const list = this._gems
    if (list.length === 0) {
      this._nearCore = null
      this.player.input.consumeInteract?.()
      return
    }
    const px = this.player.x
    const py = this.player.y
    const pickupR2 = this.player.pickupRadius * this.player.pickupRadius
    const absorbR2 = this.player.radius * this.player.radius
    this._pickupSoundCd = Math.max(0, (this._pickupSoundCd || 0) - dt)

    this._updateCoreLifetimes(dt)

    // 元素核心是构筑选择：靠近后按 E 主动吸收，不再自动磁吸。
    if (this._updateCoreInteraction()) return

    // ⓪ 同位置宝石合并（阶段十三）：低频轮询，缓解长局宝石膨胀
    this._mergeTimer -= dt
    if (this._mergeTimer <= 0) {
      this._mergeTimer = MERGE_INTERVAL
      this._mergeGems()
      this._compactExpGems()
    }

    // ① 分帧 idle → magnet 检测（每帧 1/3，降低全量距离检测开销）
    const offset = this._frame % 3
    this._frame++
    for (let i = offset; i < list.length; i += 3) {
      const g = list[i]
      if (g.state !== 'idle') continue
      if (g.type !== 'exp' && g.type !== 'tome') continue
      const dx = px - g.x
      const dy = py - g.y
      if (dx * dx + dy * dy < pickupR2) g.state = 'magnet'
    }

    // ② magnet 移动 + 拾取结算（吸附中的宝石数量少，全量遍历）
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i]
      if (g.state !== 'magnet') continue
      const dx = px - g.x
      const dy = py - g.y
      const d2 = dx * dx + dy * dy

      // 拾取判定：距离极近（< 玩家半径）→ 结算并销毁
      if (d2 < absorbR2) {
        if (g.type === 'exp') {
          // 经验宝石：结算经验（复用阶段四的升级判定）
          const leveled = this.player.gainExp(g.value)
          list[i] = list[list.length - 1] // swap-pop：O(1) 删除，无数组搬迁
          list.pop()
          // 拾取音效节流：一群宝石同时入体时只响一次（60ms 窗口）
          if (this._pickupSoundCd <= 0) {
            this._pickupSoundCd = 0.06
            this.game.sound.pickup()
          }
          // 升级后引擎已暂停（triggerLevelUp）：本帧立即停止继续拾取——
          // 剩余磁吸宝石留待玩家选完技能、引擎恢复后下一帧再结算。
          // （否则同一帧连续拾取会连升多级：Lv.1 → Lv.5 跳级 bug）
          if (leveled) break
          continue
        } else if (g.type === 'tome') {
          // 王级秘籍（Boss 掉落）：免费获得一次技能选择（不消耗升级次数）。
          // 面板弹出即暂停引擎——本帧停止继续拾取，否则同帧再拾 exp/元素
          // 核心会重复 pause（暂停锁失衡）+ 覆盖秘籍面板（跳级 bug 同类路径）
          this.player.gainFreeSkill()
          this.game.sound.levelUp()
          list[i] = list[list.length - 1] // swap-pop：O(1) 删除，无数组搬迁
          list.pop()
          break
        } else {
          // 元素核心（阶段十六追加）：首颗元素 / 首次融合不可逆——先确认再吃；
          // 刚被吐掉的核心进入 2s 冷却：本帧不拾取（防原地重复弹窗、防误吸）
          if (g.rejectedUntil > 0 && this.game.elapsed < g.rejectedUntil) continue
          if (this.player.shouldConfirmElement(g.type)) {
            this.askFusion(g)
            break // 确认面板打开（引擎暂停），本帧停止继续拾取
          }
          // 非首融核心：直接吸收（重复吸收 → 元素等级成长）
          this.player.absorbElement(g.type)
          // 吸收反馈（阶段十五）：头顶浮现「💧 水流 +1」，等级积累可见
          const el = getElement(g.type)
          if (el) {
            this.game.enemyManager.addText(
              this.player.x,
              this.player.y - 26,
              `${el.icon} ${el.name} +1`,
              null,
              g.color,
              15
            )
          }
          list[i] = list[list.length - 1] // swap-pop：O(1) 删除，无数组搬迁
          list.pop()
          // 新反应激活时引擎已暂停（进化演出 0.9s）：本帧不再继续拾取，
          // 防暂停锁失衡（与 exp 升级后的 break 同理）
          if (!this.game.running) break
          continue
        }
      }

      // 加速度模型：速度向玩家方向累积，带上限
      const d = Math.sqrt(d2) || 1
      g.vx += (dx / d) * MAGNET_ACC * dt
      g.vy += (dy / d) * MAGNET_ACC * dt
      const sp2 = g.vx * g.vx + g.vy * g.vy
      if (sp2 > MAX_SP2) {
        const k = MAGNET_MAX_SPEED / Math.sqrt(sp2)
        g.vx *= k
        g.vy *= k
      }
      g.x += g.vx * dt
      g.y += g.vy * dt
    }
  }

  render(ctx) {
    const cam = this.game.camera
    const { width, height } = this.game
    // 相机视口剔除：可见范围（含 24px 余量）之外的宝石不绘制
    const vx0 = cam.x - 24
    const vy0 = cam.y - 24
    const vx1 = cam.x + width + 24
    const vy1 = cam.y + height + 24
    const t = this.game.elapsed // 全局时钟：所有宝石共用同一闪烁节奏源
    for (const g of this._gems) {
      if (g.x < vx0 || g.x > vx1 || g.y < vy0 || g.y > vy1) continue
      g.render(ctx, t, ELEMENT_CORE_WARNING)
    }

    if (this._nearCore && this._nearCore.state !== 'held') {
      const g = this._nearCore
      const pulse = 1 + Math.sin(t * 7) * 0.08
      ctx.save()
      ctx.translate(g.x, g.y - 24)
      ctx.scale(pulse, pulse)
      ctx.fillStyle = 'rgba(8, 13, 10, 0.82)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-12, -10, 24, 20, 5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('E', 0, 0)
      ctx.restore()
    }
  }
}
