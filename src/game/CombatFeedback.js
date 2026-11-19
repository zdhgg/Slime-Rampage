/** Presentation clock is separate from the combat clock; no gameplay RNG is consumed. */
export class CombatFeedback {
  constructor(game) { this.game = game; this.reset() }
  reset() { this.stop = 0; this.cooldown = 0; this.kick = 0; this.angle = 0; this.strength = 0 }
  advance(dt) {
    const held = Math.min(dt, this.stop)
    this.stop = Math.max(0, this.stop - dt)
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.kick = Math.max(0, this.kick - dt)
    return dt - held
  }
  impact({ hits = 0, kills = 0, angle = this.game.player.facing, minimum = 1 } = {}) {
    const stats = this.game.weaponSystem?.stats
    if (stats) stats.bestBurst = Math.max(stats.bestBurst || 0, kills)
    if (hits < minimum || this.cooldown > 0 || this.game.runFinished || this.game.player.dead) return false
    const heavy = hits >= 5 || kills >= 3
    this.stop = heavy ? .035 : .016
    this.kick = heavy ? .14 : .09
    this.angle = angle
    this.strength = heavy ? 5 : 2.5
    this.cooldown = heavy ? .65 : .35
    return true
  }
  offset() {
    const t = this.kick / .14
    const value = this.strength * t * t
    return { x: Math.cos(this.angle) * value, y: Math.sin(this.angle) * value }
  }
}
