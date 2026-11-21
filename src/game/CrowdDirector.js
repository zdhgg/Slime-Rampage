import { getFinalWarningAt, isTimedMode } from './RunRules.js'

/** Small crowd encounters share the arena director's spawn slots and quiet windows. */
export const CROWD_RULES = Object.freeze({
  firstDelay: 6, interval: 28, tideDuration: 15, routDuration: 2,
  tideHp: .35, tideReward: .35, tideDamage: .35, vulnerability: 1.35,
})

const alive = e => e.active && !e.devouring && e.hp > 0

export class CrowdDirector {
  constructor(manager) { this.manager = manager; this.reset() }
  get game() { return this.manager.game }
  get stats() { return this.game?.weaponSystem?.stats }
  reset() {
    this.nextIn = CROWD_RULES.firstDelay
    this.nextKind = 'tide'
    this.tide = 0
    this.squad = null
    this.spawnDebt = 0
  }
  get active() { return this.tide > 0 || !!this.squad }
  get label() { return this.tide > 0 ? '战獒奔潮' : this.squad ? this.squad.broken ? '破阵追击' : '讨伐小队 · 先斩旗手' : null }
  blocked() {
    const g = this.game, m = this.manager
    return !g || g.player.dead || g.runFinished || (g.runState && g.runState !== 'active') ||
      (g.gameplayId && g.gameplayId !== 'arena') || m._finale || m.hasBoss || m.pendingBossCount > 0 ||
      m._bossGrace > 0 || m._bossRecovery > 0 || m._stagePressure > .7 ||
      g.mapFeatures?.nestDefenseActive || !!g.worldEvents?.current ||
      (isTimedMode(g.runSelection?.mode) && g.elapsed >= getFinalWarningAt(g.runSelection.mode))
  }
  _crowdInterval() {
    const g = this.game
    return g?.runSelection?.mode === 'timed20' && this.manager._effectiveWave() > 20
      ? 22
      : CROWD_RULES.interval
  }
  update(dt) {
    if (this.blocked()) { this.cancel(); return }
    const wasActive = this.active
    if (this.tide > 0) this.tide = Math.max(0, this.tide - dt)
    if (this.squad) {
      const s = this.squad
      s.life -= dt
      // Defeated flag bearers include devoured targets and DOT deaths.
      if (!s.broken && !alive(s.leader)) this.breakSquad()
      if (s.life <= 0 || !s.members.some(alive)) this.releaseSquad()
      else {
        const p = this.game.player, dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy)
        s.angle = Math.atan2(dy, dx)
        const step = Math.min(Math.max(0, d - 300), 65 * dt)
        s.x += dx / (d || 1) * step; s.y += dy / (d || 1) * step
      }
    }
    if (wasActive || this.active || this.manager._effectiveWave() < 3) return
    this.nextIn -= dt
    if (this.nextIn > 0) return
    const started = this.nextKind === 'tide' ? this.startTide() : this.startSquad()
    if (!started) this.nextIn = 3
  }
  cancel() {
    this.tide = 0
    this.releaseSquad()
  }
  releaseSquad() {
    if (!this.squad) return
    for (const e of this.squad.members) {
      e.crowdSquad = null; e.routTime = 0
      if (e.crowdShield) { e.shieldHits = 0; e.crowdShield = false }
    }
    this.squad = null
  }
  startTide() {
    if (this.blocked() || this.active) return false
    this.tide = CROWD_RULES.tideDuration
    this.nextIn = this._crowdInterval(); this.nextKind = 'squad'
    if (this.stats) this.stats.swarmTides = (this.stats.swarmTides || 0) + 1
    this.manager.addText(this.game.player.x, this.game.player.y - 90, '战獒奔潮', '低血量兽群 · 迎击收割', '#a8e2c3', 19)
    return true
  }
  /** Two weak hounds replace one ordinary reinforcement (three in late timed20), with reduced total XP. */
  spawnTide(x, y) {
    const m = this.manager
    const batch = this.game?.runSelection?.mode === 'timed20' && m._effectiveWave() > 20 ? 3 : 2
    for (let i = 0; i < batch && m.count < Math.ceil(m._populationTarget() * 1.2); i++) {
      const e = m.spawnAt(Math.max(0, Math.min(this.game.worldWidth, x + i * 22)),
        Math.max(0, Math.min(this.game.worldHeight, y + i * 18)), 'hound')
      if (!e) continue
      e.hp = e.maxHp = Math.max(1, e.hp * CROWD_RULES.tideHp)
      e.expValue = Math.max(1, Math.floor(e.expValue * CROWD_RULES.tideReward))
      e.damage = CROWD_RULES.tideDamage
      e.speed = Math.min(e.speed * 1.1, this.game.runProfile?.enemySpeedCap || 240)
      e.swarmTide = true
    }
  }
  startSquad() {
    const m = this.manager, g = this.game
    const eliteSquad = m._effectiveWave() >= 12
    const formation = eliteSquad
      ? [
        ['bulwark', 74, -52], ['berserker', 74, 0], ['bulwark', 74, 52],
        ['bannerman', 10, 0],
        ['archer', -34, -56], ['mage', -34, 56], ['knight', 24, -46],
        ['priest', -82, 0],
      ]
      : [
        ['knight', 68, -46], ['knight', 68, 0], ['knight', 68, 46],
        ['archer', -30, -48], ['archer', -30, 48], ['priest', -78, 0],
      ]
    if (this.blocked() || this.active || m.count + formation.length > Math.ceil(m._populationTarget() * 1.2)) return false
    const p = g.player
    // Choose an approach with room for both ranks; never clamp a squad onto the player.
    const choices = [[1, 0, g.worldWidth - p.x], [-1, 0, p.x], [0, 1, g.worldHeight - p.y], [0, -1, p.y]]
    const available = choices.filter(c => c[2] >= 460)
    if (!available.length) return false
    const [ux, uy, room] = available[Math.floor(Math.random() * available.length)]
    const distance = Math.min(520, room - 110), angle = Math.atan2(-uy, -ux)
    const s = { x: Math.max(100, Math.min(g.worldWidth - 100, p.x + ux * distance)),
      y: Math.max(100, Math.min(g.worldHeight - 100, p.y + uy * distance)), angle, life: 28, broken: false, members: [], leader: null }
    for (const [type, forward, side] of formation) {
      const e = m.spawnAt(s.x + Math.cos(angle) * forward - Math.sin(angle) * side,
        s.y + Math.sin(angle) * forward + Math.cos(angle) * side, type)
      if (!e) continue
      e.crowdSquad = s; e.squadSlot = { forward, side }
      if (type === 'knight' || type === 'bulwark' || type === 'berserker') {
        e.shieldHits = Math.max(e.shieldHits || 0, eliteSquad ? 2 : 1)
        e.crowdShield = true
      }
      if (type === 'priest') s.leader = e
      s.members.push(e)
    }
    if (!s.leader) { for (const e of s.members) { e.crowdSquad = null; e.shieldHits = 0; e.crowdShield = false }; return false }
    this.squad = s
    this.nextIn = this._crowdInterval(); this.nextKind = 'tide'
    this.spawnDebt += s.members.length
    if (this.stats) this.stats.squadsFaced = (this.stats.squadsFaced || 0) + 1
    m.addText(s.leader.x, s.leader.y - 44, '讨伐旗手', '击破旗手 → 全队破盾溃散', '#f3d58b', 16)
    return true
  }
  onDefeated(enemy) {
    if (this.squad?.leader === enemy) this.breakSquad()
  }
  breakSquad() {
    const s = this.squad
    if (!s || s.broken) return
    s.broken = true
    for (const e of s.members) {
      if (!alive(e) || e.isBoss) continue
      e.shieldHits = 0; e.crowdShield = false
      e.routTime = CROWD_RULES.routDuration
    }
    if (this.stats) this.stats.squadBreaks = (this.stats.squadBreaks || 0) + 1
    this.game.weaponSystem?._ring(s.leader.x, s.leader.y, '#f3d58b', 150)
    this.manager.addText(s.leader.x, s.leader.y - 48, '破阵！', '所属小队溃散 · 易伤 2 秒', '#fff0bc', 22)
  }
  /** Formation is a short approach, then the original class AI owns attacks and healing. */
  steer(e, dt) {
    if (!e.crowdSquad && !(e.routTime > 0)) return false
    const slow = Math.min(
      e.slow > 0 ? .6 : e.primeSlow > 0 ? .7 : 1,
      e.spellSlowTime > 0 ? 1 - e.spellSlowAmount : 1,
      e.corrodeSlowTime > 0 ? 1 - (e.corrodeSlowAmount || 0) : 1
    )
    const speed = e.speed * slow * (this.game.mapFeatures?.speedMultiplierAt(e.x, e.y, 'enemy') || 1)
    if (e.routTime > 0 && !e.isBoss) {
      const p = this.game.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1
      e.x += dx / d * speed * .55 * dt; e.y += dy / d * speed * .55 * dt
      e._moving = true
      return true
    }
    const s = e.crowdSquad
    if (!s || s.broken || !alive(s.leader) || Math.hypot(s.x - this.game.player.x, s.y - this.game.player.y) < 310) return false
    const { forward, side } = e.squadSlot
    const tx = s.x + Math.cos(s.angle) * forward - Math.sin(s.angle) * side
    const ty = s.y + Math.sin(s.angle) * forward + Math.cos(s.angle) * side
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), step = Math.min(d, speed * dt)
    e.x += dx / (d || 1) * step; e.y += dy / (d || 1) * step
    e.facing = s.angle; e._moving = step > .01
    return true
  }
  renderMarker(ctx, e) {
    if (!e.crowdSquad || !alive(e)) return
    ctx.save(); ctx.translate(e.x, e.y)
    if (e.crowdSquad.leader === e) {
      ctx.strokeStyle = '#fff0bc'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(17, -10); ctx.lineTo(17, -44); ctx.stroke()
      ctx.fillStyle = '#e8b953'; ctx.beginPath(); ctx.moveTo(18, -43); ctx.lineTo(37, -38); ctx.lineTo(18, -30); ctx.fill()
    }
    if (e.crowdShield && e.shieldHits > 0) {
      ctx.strokeStyle = '#8adce8'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, e.radius + 5, e.facing - 1, e.facing + 1); ctx.stroke()
    }
    if (e.routTime > 0) {
      ctx.strokeStyle = '#ffe1a0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-6, -25); ctx.lineTo(0, -31); ctx.lineTo(6, -25); ctx.stroke()
    }
    ctx.restore()
  }
}
