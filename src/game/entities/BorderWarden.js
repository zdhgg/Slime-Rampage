import { ExpeditionBoss } from './ExpeditionBoss.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const MOVES = {
  shield: { name: '盾缘横扫', reach: 148, spread: 1.05, tell: .52 },
  thrust: { name: '长枪突刺', reach: 245, spread: .25, tell: .64 },
  charge: { name: '举盾冲锋', width: 58, tell: .72 },
}

// 机制强化参数（普通档启用，困难/地狱加码；简单档完全保持现状）。
// 跟人走：盾扫/枪刺在预警期按限速转向玩家，出手前 LOCK_TIME 完全锁定，
// 保留可读的出手点——锁定后变向依然是稳定反制。
const TRACK_RATE = { shield: 1.6, thrust: 2, charge: 0 } // rad/s（冲锋靠 lead 预判，不跟踪）
const LOCK_TIME = { shield: .26, thrust: .26, charge: .34 }
const TIER_TRACK = [0, 1, 1.5, 2] // easy / normal / hard / hell

// The player's centre must be in the painted footprint. Charge is a swept
// rectangle with flat ends; the exact same rectangle is used by the renderer.
export function wardenContains(cast, px, py, from = 0, to = cast.length) {
  const dx = px - cast.x, dy = py - cast.y
  const f = dx * Math.cos(cast.angle) + dy * Math.sin(cast.angle)
  const s = -dx * Math.sin(cast.angle) + dy * Math.cos(cast.angle)
  if (cast.kind === 'charge') return f >= from && f <= to && Math.abs(s) <= cast.width
  return Math.hypot(dx, dy) <= cast.reach && Math.abs(Math.atan2(s, f)) <= cast.spread
}

/** Only the first chapter opts in. No character-id reads or contact damage. */
export class BorderWarden extends ExpeditionBoss {
  constructor(options) {
    super(options)
    this.specialCd = .8
    this._pursuit = 0
    this._sequence = []
    this._cast = null
    this._fx = null
    this._presentationMove = null
    this._lastPlayer = null
    this._velocity = { x: 0, y: 0 }
    this._engageSpeed = 195 * (options.speedMultiplier || 1)
    this._hazards = [] // 冲锋落点残留危险区（地面效应，不随 BOSS 冻结）
    this._flank = null // 枪刺二段横扫 / 盾扫后撩（BOSS 动作，随冻结暂停）
  }

  /** 机制强化档位（走 runProfile，不硬编码）：0 简单=现状，1 普通=强化，2 困难 / 3 地狱=加码 */
  get _mechTier() {
    const id = this.game.runProfile?.id
    return id === 'easy' ? 0 : id === 'hard' ? 2 : id === 'hell' ? 3 : 1
  }

  get positionLocked() { return this.specialState !== 'idle' || this.phaseShift > 0 }
  get attackMove() {
    if (this.specialState === 'step') return Object.freeze({ id: 'step', name: '跨步压进 · 随后枪刺' })
    const kind = this._presentationMove
    return kind && MOVES[kind] ? Object.freeze({ id: kind, name: MOVES[kind].name }) : super.attackMove
  }
  _onReinforce() {} // Existing battlefield survivors suffice; no surprise encirclement.
  _onLastStand() {} // Phase two changes actions, not damage or hidden haste.

  _enterPhaseTwo() {
    this.cancelAttack()
    this.phase = 2
    this.enraged = true
    this.phaseShift = .85
    this.specialState = 'idle'
    this.specialCd = .65
    this.vulnerableTimer = 0
    this._sequence = []
    this._cast = this._fx = null
    this._flank = null // 阶段转换取消未兑现的二段；地面残留不受影响
    this._moving = false
    this._lastPlayer = null
    this.stateLabel = this.encounter.phaseName
    this.game.enemyManager.addText(this.x, this.y - 65, '第二阶段', '跨步追击', '#ff7466', 16)
    this.game.dialogue?.sayBoss(this, 'phase')
    this.game.sound.bossRoar()
  }

  update(dt) {
    if (!Number.isFinite(dt) || !(dt > 0) || !this.active) return
    // Sample real player motion once per frame, before subdividing boss motion.
    // Sampling inside the substeps would underestimate speed at 15/30 FPS.
    const p = this.game.player
    if (this._lastPlayer) {
      const vx = (p.x - this._lastPlayer.x) / dt, vy = (p.y - this._lastPlayer.y) / dt
      const k = 1 - Math.exp(-dt * 10), scale = Math.min(1, 400 / (Math.hypot(vx, vy) || 1))
      this._velocity.x += (vx * scale - this._velocity.x) * k
      this._velocity.y += (vy * scale - this._velocity.y) * k
    }
    this._lastPlayer = { x: p.x, y: p.y }
    // 落点残留是地面效应：独立计时，不随 BOSS 冻结/硬直暂停
    if (this._hazards.length) this._tickHazards(dt)
    // Bounded integration prevents charge tunnelling at low frame rates.
    const steps = Math.ceil(dt / (1 / 60))
    for (let i = 0; i < steps && this.active; i++) this._tickWarden(dt / steps)
  }

  _tickWarden(dt) {
    const canAct = this._tickStatus(dt)
    this._tickAnimation(dt, canAct)
    if (this._fx && (this._fx.life -= dt) <= 0) this._fx = null
    const p = this.game.player
    if (this.hp <= 0) return
    if (this.phase === 1 && this.hp <= this.maxHp * .5) this._enterPhaseTwo()
    this._moving = false
    if (this.phaseShift > 0) { this.phaseShift = Math.max(0, this.phaseShift - dt); return }
    // Recovery time does not disappear while frozen/staggered.
    if (!canAct) return
    // 二段判定（枪刺横扫/盾扫后撩）：随 BOSS 动作冻结，兑现只造成 1 伤害
    if (this._flank && (this._flank.timer -= dt) <= 0) this._resolveFlank()
    const state = this.specialState
    if (state === 'telegraph') {
      const c = this._cast, tier = this._mechTier
      // 跟人走：预警期限速转向玩家，出手前 lockTime 完全锁定（简单档不跟踪）。
      // 锁定窗口内玩家变向可稳定脱离——保留可读的呼吸节奏。
      if (tier > 0 && c.track > 0 && this.specialTimer > c.lockTime) {
        const rate = c.track * TIER_TRACK[tier]
        const aim = Math.atan2(p.y - c.y, p.x - c.x)
        const turn = clamp(delta(c.angle, aim), -rate * dt, rate * dt)
        if (turn) c.angle += turn
      }
      this.facing += clamp(delta(this.facing, c.angle), -9 * dt, 9 * dt)
      this.specialTimer -= dt
      if (this.specialTimer <= 0) this._executeSpecial()
      return
    }
    if (state === 'dash' || state === 'step') {
      const c = this._cast
      const before = c.travel || 0
      const amount = Math.min(c.length - before, (state === 'dash' ? 920 : 360) * this._slowScale() * dt)
      c.travel = before + amount
      this.x = c.x + Math.cos(c.angle) * c.travel
      this.y = c.y + Math.sin(c.angle) * c.travel
      this._moving = amount > 0
      this._walkT += dt * 5
      if (state === 'dash' && !c.hit && wardenContains(c, p.x, p.y, Math.max(0, before - 28), Math.min(c.length, c.travel + 28))) {
        c.hit = true
        p.hit(this.outgoingDamage(2), c.event)
      }
      if (c.travel >= c.length - .01) {
        if (state === 'step') this._prepare('thrust')
        else { this._dropShockwave(); this._finishMove() }
      }
      return
    }
    if (state === 'chain') {
      this.specialTimer -= dt
      if (this.specialTimer <= 0) {
        const next = this._sequence.shift()
        const distance = Math.hypot(p.x - this.x, p.y - this.y)
        // Whiffing does not authorize an endless chase or a new charge.
        if (!next || distance > (next === 'step' ? 480 : 300)) this._recover()
        else if (next === 'step') this._startStep()
        else this._prepare(next)
      }
      return
    }
    if (state === 'recover') {
      this.specialTimer = Math.max(0, this.specialTimer - dt)
      this.vulnerableTimer = this.specialTimer
      if (!this.specialTimer) {
        this.specialState = 'idle'; this.specialCd = this._mechTier >= 3 ? .3 : this._mechTier >= 1 ? .4 : .55; this._pursuit = 0
        this.game.enemyManager.releaseBossCast?.(this)
      }
      return
    }
    const dx = p.x - this.x, dy = p.y - this.y, distance = Math.hypot(dx, dy)
    const aim = Math.atan2(dy, dx)
    this.facing += clamp(delta(this.facing, aim), -4.8 * dt, 4.8 * dt)
    this.specialCd -= dt
    this._pursuit += dt
    this.stateLabel = distance > 260 ? '举盾追击' : '盾枪压进'
    if (this.specialCd <= 0 && (distance < 240 || this._pursuit > 1.5)) {
      this._startSpecial()
      return
    }
    if (distance > 105) {
      const step = Math.min(distance - 105, this._engageSpeed * this._slowScale() * dt)
      this.x += dx / distance * step; this.y += dy / distance * step
      this._moving = true; this._walkT += dt * 5
    }
  }

  _slowScale() {
    return Math.min(this.slow > 0 ? .6 : this.primeSlow > 0 ? .7 : 1,
      this.spellSlowTime > 0 ? 1 - this.spellSlowAmount : 1) *
      (this.game.mapFeatures?.speedMultiplierAt(this.x, this.y, 'enemy') || 1)
  }

  _startSpecial() {
    const manager = this.game.enemyManager
    if (manager.claimBossCast && !manager.claimBossCast(this)) { this.specialCd = .35; return }
    const p = this.game.player, d = Math.hypot(p.x - this.x, p.y - this.y)
    const first = d < 155 ? 'shield' : d < 240 ? 'thrust' : 'charge'
    this._sequence = this.phase === 2 ? (first === 'shield' ? ['shield', 'step'] : ['step'])
      : first === 'shield' ? ['thrust'] : []
    this._prepare(first)
  }

  _prepare(kind) {
    this._presentationMove = kind
    const p = this.game.player, move = MOVES[kind]
    // A bounded lead threatens constant circling. It is visible for the whole
    // tell and never follows the player after commitment.
    const dx = p.x - this.x, dy = p.y - this.y, distance = Math.hypot(dx, dy) || 1
    const lead = kind === 'charge' ? (this.phase === 2 ? 1.35 : 1.25) : 0
    const angular = (dx * this._velocity.y - dy * this._velocity.x) / (distance * distance)
    const aim = Math.atan2(dy, dx) + clamp(angular * lead, -1.1, 1.1)
    this.lockedAngle = aim
    this._cast = { ...move, kind, x: this.x, y: this.y, angle: aim, life: .28,
      length: Math.min(600, distance + 100), event: { enemyAttack: true },
      track: TRACK_RATE[kind], lockTime: LOCK_TIME[kind] }
    this._clipTravel(this._cast)
    this.specialState = 'telegraph'
    // Turn visibly during a harmless setup; the footprint is already fixed.
    this.specialDuration = move.tell + Math.abs(delta(this.facing, aim)) / 9
    this.specialTimer = this.specialDuration
    this.stateLabel = `蓄力 · ${this.attackMove.name}`
    this._moving = false
    this.game.sound.enemyShoot()
  }

  _clipTravel(c) {
    const co = Math.cos(c.angle), si = Math.sin(c.angle), r = this.radius
    for (const [origin, direction, max] of [[c.x, co, this.game.worldWidth], [c.y, si, this.game.worldHeight]]) {
      if (direction > .0001) c.length = Math.min(c.length, Math.max(0, (max - r - origin) / direction))
      if (direction < -.0001) c.length = Math.min(c.length, Math.max(0, (r - origin) / direction))
    }
  }

  _executeSpecial() {
    const c = this._cast, p = this.game.player
    this.facing = c.angle
    this._attackAnim = .48
    if (c.kind === 'charge') {
      this.specialState = 'dash'; this.stateLabel = c.name
      return
    }
    if (wardenContains(c, p.x, p.y)) p.hit(this.outgoingDamage(2), c.event)
    this._queueFlank(c)
    this._fx = { ...c, life: .28 }
    this._finishMove()
  }

  /** 封退路：二段判定。枪刺→侧向横扫（普通+）；盾扫→后撩（困难/地狱）。均 1 伤害 */
  _queueFlank(c) {
    const tier = this._mechTier
    const p = this.game.player
    if (c.kind === 'thrust' && tier >= 1) {
      // 选边：横向位置优先，贴身站定时按横向速度——封住最常见的侧向躲法方向。
      // 直中的一段给了 0.5s 受击无敌，二段天然不会与之叠加成二连爆发。
      const s = -(p.x - c.x) * Math.sin(c.angle) + (p.y - c.y) * Math.cos(c.angle)
      const vs = -this._velocity.x * Math.sin(c.angle) + this._velocity.y * Math.cos(c.angle)
      const side = Math.abs(s) > 24 ? Math.sign(s) : vs ? Math.sign(vs) : 1
      this._flank = { x: c.x, y: c.y, angle: c.angle + side * .95, reach: 200, spread: .8,
        timer: .26, kind: 'flank', event: { enemyAttack: true } }
    } else if (c.kind === 'shield' && tier >= 2) {
      this._flank = { x: c.x, y: c.y, angle: c.angle + Math.PI, reach: 152, spread: 1,
        timer: .3, kind: 'flank', event: { enemyAttack: true } }
    }
  }

  _resolveFlank() {
    const f = this._flank
    this._flank = null
    const p = this.game.player
    if (wardenContains(f, p.x, p.y)) p.hit(this.outgoingDamage(1), f.event)
    this._fx = { ...f, life: .28 }
  }

  /** 留地面：冲锋落点短时危险区。1 伤害、单次、走正常命中管线（吃无敌帧/闪避） */
  _dropShockwave() {
    const tier = this._mechTier
    if (tier < 1) return
    const life = tier >= 3 ? 1.35 : tier >= 2 ? 1.15 : .9
    this._hazards.push({
      x: this.x, y: this.y, radius: tier >= 3 ? 150 : tier >= 2 ? 130 : 105,
      arm: .22, life, maxLife: life, event: { enemyAttack: true },
    })
    this.game.enemyManager.addText(this.x, this.y - 40, '落点震荡', null, '#ffb36e', 13)
  }

  _tickHazards(dt) {
    const p = this.game.player
    for (let i = this._hazards.length - 1; i >= 0; i--) {
      const h = this._hazards[i]
      h.life -= dt
      if (h.life <= 0) { this._hazards.splice(i, 1); continue }
      if (h.arm > 0) { h.arm -= dt; continue }
      // 单次兑现：被无敌帧/闪避挡下也视为已结算——冲锋直中的 0.5s 无敌帧
      // 天然挡住落点二连，不会与直中叠加成爆发。
      if (!h.done && Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) {
        h.done = true
        p.hit(this.outgoingDamage(1), h.event)
      }
    }
  }

  _startStep() {
    const p = this.game.player
    const maxStep = this._mechTier >= 3 ? 200 : 160
    this._cast = { x: this.x, y: this.y, angle: Math.atan2(p.y - this.y, p.x - this.x),
      length: Math.min(maxStep, Math.max(0, Math.hypot(p.x - this.x, p.y - this.y) - 115)) }
    this._clipTravel(this._cast)
    this.specialState = 'step'; this.stateLabel = this.attackMove.name
  }

  _finishMove() {
    if (this._sequence.length) { this.specialState = 'chain'; this.specialTimer = .32; this.stateLabel = '连击间隙' }
    else this._recover()
  }

  _recover() {
    this.specialState = 'recover'
    this._sequence = []
    // 压缩纯站桩白打窗口（普通/困难 -0.35s；地狱 -0.5s），仍保留可读的呼吸节奏
    const cut = this._mechTier >= 3 ? .5 : this._mechTier >= 1 ? .35 : 0
    this.specialTimer = (this.phase === 2 ? 2.7 : 2.4) - cut
    this._recoveryDuration = this.specialTimer
    this.vulnerableTimer = this.specialTimer
    this.stateLabel = '破绽暴露'
    this._cast = null
  }

  _drawFootprint(ctx, c, progress, release = false) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle)
    ctx.beginPath()
    if (c.kind === 'charge') ctx.rect(0, -c.width, c.length, c.width * 2)
    else { ctx.moveTo(0, 0); ctx.arc(0, 0, c.reach, -c.spread, c.spread); ctx.closePath() }
    ctx.fillStyle = release ? 'rgba(255,218,148,.30)' : 'rgba(220,91,55,.20)'
    ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke()
    ctx.clip(); ctx.beginPath(); ctx.lineWidth = 4
    if (c.kind === 'charge') { ctx.moveTo(0, 0); ctx.lineTo(c.length * progress, 0) }
    else if (release && c.kind === 'thrust') {
      ctx.lineWidth = 9 * (1 - progress) + 2
      ctx.moveTo(0, 0); ctx.lineTo(c.reach * Math.min(1, progress * 2), 0)
    } else if (release) {
      ctx.lineWidth = 12 * (1 - progress) + 2
      const a = -c.spread + c.spread * 2 * progress
      ctx.arc(0, 0, c.reach * .8, a - .16, a + .16)
    } else ctx.arc(0, 0, c.reach * progress, -c.spread, c.spread)
    ctx.stroke(); ctx.restore()
  }

  _renderTelegraph(ctx) {
    const c = this._cast
    if (c && (this.specialState === 'telegraph' || this.specialState === 'dash'))
      this._drawFootprint(ctx, c, this.specialState === 'dash' ? 1 : 1 - this.specialTimer / this.specialDuration)
    // 二段预告（淡画）：枪刺两侧横扫 / 盾扫后撩（困难+），读招成本与一段一致
    if (c && this.specialState === 'telegraph') {
      const tier = this._mechTier, progress = 1 - this.specialTimer / this.specialDuration
      ctx.save(); ctx.globalAlpha = .4
      if (c.kind === 'thrust' && tier >= 1)
        for (const side of [-1, 1]) this._drawFootprint(ctx, { kind: 'flank', x: c.x, y: c.y, angle: c.angle + side * .95, reach: 200, spread: .8 }, progress * .7)
      if (c.kind === 'shield' && tier >= 2)
        this._drawFootprint(ctx, { kind: 'flank', x: c.x, y: c.y, angle: c.angle + Math.PI, reach: 152, spread: 1 }, progress * .7)
      ctx.restore()
    }
  }

  _drawHazard(ctx, h) {
    const armed = h.arm <= 0
    ctx.save()
    ctx.globalAlpha = Math.min(1, h.life / .3)
    ctx.fillStyle = armed ? 'rgba(255,120,60,.16)' : 'rgba(255,200,120,.10)'
    ctx.strokeStyle = armed ? 'rgba(255,150,80,.65)' : 'rgba(255,210,150,.4)'
    ctx.lineWidth = armed ? 3 : 2
    ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.restore()
  }

  render(ctx) {
    if (!this.active || this.hp <= 0) return
    for (const h of this._hazards) this._drawHazard(ctx, h) // 地面残留压在实体层下
    super.render(ctx)
    if (this._fx) this._drawFootprint(ctx, this._fx, 1 - this._fx.life / .28, true)
  }
}
