import { ExpeditionBoss } from './ExpeditionBoss.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const MOVES = {
  shield: { name: '盾缘横扫', reach: 148, spread: 1.05, tell: .52 },
  thrust: { name: '长枪突刺', reach: 245, spread: .25, tell: .64 },
  charge: { name: '举盾冲锋', width: 58, tell: .72 },
}

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
    this._lastPlayer = null
    this._velocity = { x: 0, y: 0 }
    this._engageSpeed = 195 * (options.speedMultiplier || 1)
  }

  get positionLocked() { return this.specialState !== 'idle' || this.phaseShift > 0 }
  _onReinforce() {} // Existing battlefield survivors suffice; no surprise encirclement.
  _onLastStand() {} // Phase two changes actions, not damage or hidden haste.

  _enterPhaseTwo() {
    this.game.enemyManager.releaseBossCast?.(this)
    this.phase = 2
    this.enraged = true
    this.phaseShift = .85
    this.specialState = 'idle'
    this.specialCd = .65
    this.vulnerableTimer = 0
    this._sequence = []
    this._cast = this._fx = null
    this._moving = false
    this._lastPlayer = null
    this.stateLabel = this.encounter.phaseName
    this.game.enemyManager.addText(this.x, this.y - 65, '第二阶段', '跨步追击', '#ff7466', 16)
    this.game.dialogue?.sayBoss(this, 'phase')
    this.game.sound.bossRoar()
  }

  update(dt) {
    if (!(dt > 0) || !this.active) return
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
    // Bounded integration prevents charge tunnelling at low frame rates.
    const steps = Math.ceil(dt / (1 / 60))
    for (let i = 0; i < steps && this.active; i++) this._tickWarden(dt / steps)
  }

  _tickWarden(dt) {
    const canAct = this._tickStatus(dt)
    this._animClock += dt
    this._attackAnim = Math.max(0, this._attackAnim - dt)
    if (this._fx && (this._fx.life -= dt) <= 0) this._fx = null
    const p = this.game.player
    if (this.hp <= 0) return
    if (this.phase === 1 && this.hp <= this.maxHp * .5) this._enterPhaseTwo()
    this._moving = false
    if (this.phaseShift > 0) { this.phaseShift = Math.max(0, this.phaseShift - dt); return }
    // Recovery time does not disappear while frozen/staggered.
    if (!canAct) return
    const state = this.specialState
    if (state === 'telegraph') {
      this.facing += clamp(delta(this.facing, this._cast.angle), -9 * dt, 9 * dt)
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
        else this._finishMove()
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
        this.specialState = 'idle'; this.specialCd = .55; this._pursuit = 0
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
    const p = this.game.player, move = MOVES[kind]
    // A bounded lead threatens constant circling. It is visible for the whole
    // tell and never follows the player after commitment.
    const dx = p.x - this.x, dy = p.y - this.y, distance = Math.hypot(dx, dy) || 1
    const lead = kind === 'charge' ? (this.phase === 2 ? 1.35 : 1.25) : 0
    const angular = (dx * this._velocity.y - dy * this._velocity.x) / (distance * distance)
    const aim = Math.atan2(dy, dx) + clamp(angular * lead, -1.1, 1.1)
    this.lockedAngle = aim
    this._cast = { ...move, kind, x: this.x, y: this.y, angle: aim, life: .28,
      length: Math.min(600, distance + 100), event: { enemyAttack: true } }
    this._clipTravel(this._cast)
    this.specialState = 'telegraph'
    // Turn visibly during a harmless setup; the footprint is already fixed.
    this.specialDuration = move.tell + Math.abs(delta(this.facing, aim)) / 9
    this.specialTimer = this.specialDuration
    this.stateLabel = `蓄力 · ${move.name}`
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
    this._fx = { ...c, life: .28 }
    this._finishMove()
  }

  _startStep() {
    const p = this.game.player
    this._cast = { x: this.x, y: this.y, angle: Math.atan2(p.y - this.y, p.x - this.x),
      length: Math.min(160, Math.max(0, Math.hypot(p.x - this.x, p.y - this.y) - 115)) }
    this._clipTravel(this._cast)
    this.specialState = 'step'; this.stateLabel = '跨步压进 · 随后枪刺'
  }

  _finishMove() {
    if (this._sequence.length) { this.specialState = 'chain'; this.specialTimer = .32; this.stateLabel = '连击间隙' }
    else this._recover()
  }

  _recover() {
    this.specialState = 'recover'
    this._sequence = []
    this.specialTimer = this.phase === 2 ? 2.7 : 2.4
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
    if (this._cast && (this.specialState === 'telegraph' || this.specialState === 'dash'))
      this._drawFootprint(ctx, this._cast, this.specialState === 'dash' ? 1 : 1 - this.specialTimer / this.specialDuration)
  }

  render(ctx) {
    super.render(ctx)
    if (this._fx) this._drawFootprint(ctx, this._fx, 1 - this._fx.life / .28, true)
  }
}
