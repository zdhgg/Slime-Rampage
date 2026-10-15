import { shadowTargetAlive as alive, shadowLineClear } from './ShadowGeometry.js'
import { burnSpreadRange, burnSpreadTargets, burnSpreadDuration, burnSpreadInherit, burnSpreadDelay } from './FireSpellRules.js'

export const MAX_SPELL_INFECTIONS = 96
export const CONTAGION_FRAME_BUDGET = 8

// 毒素与火焰各用一套档案：各自的地图、代数与预算，互不挤占传播机会。
const PROFILES = {
  poison: {
    skill: 'spell_poison_contagion',
    range: level => 90 + level * 20,
    generations: level => level >= 2 ? 2 : 1,
    targets: level => level >= 3 ? 2 : 1,
    inherit: .7, duration: 2, delay: .6, palette: '#b9e589', kind: 'contagion',
    active: enemy => enemy.poisonHits > 0,
    apply(combat, target, damage) {
      target.hit(0, { poison: 2, poisonDmg: damage, replaceInactiveDots: true })
      combat.mark(target).poisonUntil = combat.time + 2
      combat.stats.contagionTransfers++
    },
  },
  fire: {
    skill: 'spell_fire_spread',
    range: burnSpreadRange,
    generations: () => 1,
    targets: burnSpreadTargets,
    inherit: burnSpreadInherit, duration: burnSpreadDuration, delay: burnSpreadDelay, palette: '#ffae70', kind: 'ember-spread',
    active: enemy => enemy.burnHits > 0,
    apply(combat, target, damage) {
      target.hit(0, { burn: burnSpreadDuration, burnDmg: damage, replaceInactiveDots: true })
      combat.mark(target).fireUntil = combat.time + 3
      combat.stats.burnSpreads++
    },
  },
}

/** Each infection spreads once; delayed, attenuated generations cannot recurse in one frame. */
export class SpellContagion {
  constructor(combat, kind = 'poison') { this.combat = combat; this.kind = kind; this.profile = PROFILES[kind]; this.reset() }
  reset() { this.infections = new Map() }
  get level() { return this.combat.level(this.profile.skill) }
  get range() { return this.profile.range(this.level) }
  get generations() { return this.profile.generations(this.level) }
  get targets() { return this.profile.targets(this.level) }
  seed(enemy, damage, duration) {
    if (!this.level || !alive(enemy)) return
    let previous = this.infections.get(enemy)
    if (previous?.until <= this.combat.time) { this.infections.delete(enemy); previous = null }
    if (previous) {
      previous.until = Math.max(previous.until, this.combat.time + duration)
      previous.damage = Math.max(previous.damage, damage)
      return
    }
    this.infect(enemy, damage, duration, 0)
  }
  infect(enemy, damage, duration, generation) {
    if (this.infections.size >= MAX_SPELL_INFECTIONS) return false
    this.infections.set(enemy, { damage, until: this.combat.time + duration, due: this.combat.time + this.profile.delay, generation, spread: false })
    return true
  }
  update() {
    const s = this.combat, profile = this.profile
    for (const [e, infection] of this.infections) if (!alive(e) || infection.until <= s.time || !profile.active(e)) this.infections.delete(e)
    if (!this.level) return
    let budget = CONTAGION_FRAME_BUDGET
    for (const [source, infection] of [...this.infections]) {
      if (infection.spread || infection.due > s.time || infection.generation >= this.generations) continue
      if (budget-- <= 0) break
      infection.spread = true
      const distance = e => (e.x - source.x) ** 2 + (e.y - source.y) ** 2
      const targets = s.game.enemyManager.enemies.filter(e => alive(e) && !this.infections.has(e) && distance(e) <= this.range ** 2)
        .sort((a, b) => distance(a) - distance(b))
      let count = 0
      for (const target of targets) {
        if (!shadowLineClear(s.game, source, target)) continue
        const damage = infection.damage * profile.inherit
        if (!this.infect(target, damage, profile.duration, infection.generation + 1)) break
        profile.apply(s, target, damage)
        s.fx(target.x, target.y, 14, profile.palette, profile.kind, .45, { from: { x: source.x, y: source.y } })
        if (++count >= this.targets) break
      }
    }
  }
}
