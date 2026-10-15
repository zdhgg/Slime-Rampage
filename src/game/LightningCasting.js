import { shadowTargetAlive as alive, shadowLineClear } from './ShadowGeometry.js'

const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
export const LIGHTNING_CHARGE = .12
export const LIGHTNING_WARNING = .18
export const MAX_LIGHTNING_JOBS = 12

/** One lightning spell slot: body-chain by default, aimed sky strike after optional conversion. */
export class LightningCasting {
  constructor(combat) { this.combat = combat; this.reset() }
  reset() { this.jobs = []; this.charge = 0 }
  get storm() { return this.combat.rank('lightning_storm') > 0 }
  get range() { return Math.min(780, 560 * this.combat.rangeScale) }
  valid(target, origin = this.combat.player, reach = this.range) {
    const s = this.combat
    return alive(target) && distance2(origin, target) <= reach ** 2 && shadowLineClear(s.game, origin, target)
  }
  stormTarget() {
    const s = this.combat, anchor = s.target('lightning')
    if (!anchor) return null
    const nearby = s.game.enemyManager.enemies.filter(e => this.valid(e) && !s.fireReserved(e) && distance2(e, anchor) <= 120 ** 2)
    const elites = nearby.filter(e => e.isBoss || e.isElite)
    const pool = elites.length ? elites : nearby
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : anchor
  }
  begin(target, power) {
    const s = this.combat
    if (!s.available || !this.valid(target) || this.jobs.length >= MAX_LIGHTNING_JOBS) return false
    if (this.storm) {
      const selected = this.stormTarget() || target
      return this.warn(selected, power, { basic: true, target: selected, radius: 25 * s.rangeScale })
    }
    this.charge = LIGHTNING_CHARGE
    this.jobs.push({ kind: 'charge', due: s.time + LIGHTNING_CHARGE, target, power })
    s.game.sound?.lightningCharge?.()
    return true
  }
  warn(point, power, { basic = false, target = null, radius = 100, splash = 0, chainPower = power, bonus = 0 } = {}) {
    const s = this.combat
    if (!s.available || this.jobs.length >= MAX_LIGHTNING_JOBS) return false
    const center = { x: point.x, y: point.y }
    s.fx(center.x, center.y, basic ? 23 : Math.min(55, radius * .45), '#f0d588', 'lightning-warning', LIGHTNING_WARNING)
    this.jobs.push({ kind: 'strike', due: s.time + LIGHTNING_WARNING, center, target, basic, radius, power, splash, chainPower, bonus, warning: s.effects.at(-1) })
    return true
  }
  strike(job) {
    const s = this.combat
    let center = job.center
    if (job.basic) {
      // Choose an actual enemy at release; do not waste a cast on a dead/out-of-range target.
      const target = this.valid(job.target) && !s.fireReserved(job.target) ? job.target : this.stormTarget()
      if (!target) return
      center = { x: target.x, y: target.y }
      job.target = target
    }
    s.fx(center.x, center.y, job.basic ? 27 : Math.min(70, job.radius * .6), '#f0d588', 'sky-bolt', .34, { height: job.basic ? 190 : 270, strong: !job.basic })
    s.game.sound?.lightningImpact?.(!job.basic)
    s.stats.skyStrikes++
    if (job.splash > 0) s.area(center, job.radius, job.splash, 'lightning', { active: true })
    if (!s.available) return
    const first = job.basic ? job.target : s.game.enemyManager.enemies
      .filter(e => alive(e) && distance2(e, center) <= (job.radius + e.radius) ** 2 && shadowLineClear(s.game, center, e))
      .sort((a, b) => distance2(a, center) - distance2(b, center))[0]
    if (first) s.chain(first, job.chainPower, { active: !job.basic, bonus: job.bonus, origin: center, sky: true })
    s.game.mapFeatures?.attackBarricades?.(center.x, center.y, job.basic ? 27 : job.radius)
  }
  update(dt) {
    const s = this.combat
    if (!s.available) { this.reset(); return }
    this.charge = Math.max(0, this.charge - dt)
    for (const job of this.jobs) if (job.basic && this.valid(job.target)) {
      job.center = { x: job.target.x, y: job.target.y }
      job.warning.x = job.target.x; job.warning.y = job.target.y
    }
    // Remove due jobs before damage: death/reset during a strike cannot leave new queued work behind.
    const due = this.jobs.filter(job => job.due <= s.time)
    this.jobs = this.jobs.filter(job => job.due > s.time)
    for (const job of due) {
      if (!s.available) { this.reset(); break }
      if (job.kind === 'charge') {
        const target = this.valid(job.target) && !s.fireReserved(job.target) ? job.target : s.target('lightning')
        if (target) {
          s.chain(target, job.power)
          s.game.sound?.lightningImpact?.(false)
          s.stats.bodyLightningCasts++
        }
      } else this.strike(job)
    }
  }
}
