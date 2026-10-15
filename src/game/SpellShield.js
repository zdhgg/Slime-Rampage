/** A passive barrier: one opening point, rebuilt only after the barrier breaks. */
export class SpellShield {
  constructor(combat) { this.combat = combat; this.reset() }
  get capacity() { return this.combat.level('spell_shield') >= 2 ? 2 : 1 }
  get cooldown() { return this.combat.level('spell_shield') > 0 ? 6 : 8 }
  reset(full = false) {
    this.points = full ? this.capacity : 0; this.remaining = 0; this.flash = 0
    this.previousCapacity = this.capacity; this.previousCooldown = this.cooldown
  }
  upgrade() {
    if (this.points > 0) this.points = Math.min(this.capacity, this.points + this.capacity - this.previousCapacity)
    this.remaining *= this.cooldown / this.previousCooldown
    this.previousCapacity = this.capacity; this.previousCooldown = this.cooldown
  }
  absorb(damage, attack) {
    const s = this.combat
    if (!s.available || !attack?.enemyAttack || this.points <= 0) return damage
    const absorbed = Math.min(this.points, damage)
    this.points = Math.max(0, this.points - absorbed); this.flash = .3
    const broken = this.points < .001
    if (broken) { this.points = 0; this.remaining = this.cooldown }
    const palette = s.palette(), colors = [palette.main, palette.accent]
    s.fx(s.player.x, s.player.y, s.player.radius + 12, palette.main, broken ? 'shield-break' : 'shield-hit', .4, { colors })
    s.stats.shieldAbsorbed += absorbed
    s.game.enemyManager.addText?.(s.player.x, s.player.y - 38, broken ? '护盾破裂' : '护盾', null, palette.main, 13)
    s.game.sound?.spellShield?.(broken)
    s.game._pushCooldown?.()
    return damage - absorbed
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt)
    if (this.points > 0 || this.remaining <= 0) return
    this.remaining = Math.max(0, this.remaining - dt)
    if (this.remaining <= .000001) {
      this.remaining = 0; this.points = this.capacity; this.flash = .3
      this.combat.fx(this.combat.player.x, this.combat.player.y, this.combat.player.radius + 12, this.combat.palette().main, 'shield-hit', .4)
    }
  }
  hud() { return { points: this.points, capacity: this.capacity, remaining: this.remaining, cooldown: this.cooldown } }
}
