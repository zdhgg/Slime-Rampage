import {
  poiContagionGenerations,
  poiContagionInherit,
  poiContagionRange,
  poiContagionTargets,
  poiPanSpreadDamageMul,
} from './ElementalSchools.js'

export const MAX_SPELL_INFECTIONS = 128
export const CONTAGION_FRAME_BUDGET = 12
const MAX_QUEUE_LEN = 48

function distPointToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq))
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

/**
 * Poison Specialization Contagion engine:
 *  - Delayed + Death dual-track multi-DoT contagion (Agony / Poison / Curse / Unsteady)
 *  - Strict frame budget (CONTAGION_FRAME_BUDGET = 12) and total infection cap (128)
 *  - Supports Pandemic 90% inherit floor & 大瘟疫蔓延 tether slash
 */
export class SpellContagion {
  constructor(combat) {
    this.combat = combat
    this.reset()
  }

  reset() {
    this._frameTransfers = 0
    this._queue = []
  }

  update(dt) {
    this._frameTransfers = 0
    if (!this._queue.length || this.combat.school !== 'poison') {
      if (this.combat.school !== 'poison') this._queue.length = 0
      return
    }
    const due = []
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const job = this._queue[i]
      job.timer -= dt
      if (job.timer <= 0) {
        due.push(job)
        this._queue.splice(i, 1)
      }
    }
    for (const job of due) {
      if (this._frameTransfers >= CONTAGION_FRAME_BUDGET) break
      const origin = job.source?.active ? job.source : { x: job.x, y: job.y }
      const snap = job.source?.active && this.isInfected(job.source) ? this._snapshot(job.source) : job.snap
      this.spreadFrom(origin, snap, job.generation, { forceWave: job.forceWave })
    }
  }

  isInfected(e) {
    return !!e && ((e.agonyTime || 0) > 0 || (e.poisonHits || 0) > 0 || (e.curseTime || 0) > 0 || (e.unsteadyTime || 0) > 0)
  }

  snapshot(e) {
    return this._snapshot(e)
  }

  _snapshot(e) {
    return {
      agonyStacks: e?.agonyStacks || 0,
      agonyTime: e?.agonyTime || 0,
      agonyDmg: e?.agonyDmg || 0,
      agonyCritChance: e?.agonyCritChance || 0,
      agonyCritMul: e?.agonyCritMul || 1.75,
      poisonHits: e?.poisonHits || 0,
      poisonDmg: e?._poisonDmg || 0,
      curseTime: e?.curseTime || 0,
      curseSlow: e?.curseSlow || 0,
      curseVuln: e?.curseVuln || 0,
      unsteadyTime: e?.unsteadyTime || 0,
      unsteadyDmg: e?.unsteadyDmg || 0,
    }
  }

  queueDelayedContagion(source, generation = 0, forceWave = false) {
    if (!source || this.combat.school !== 'poison') return false
    const contLv = this.combat.rank('poi_contagion')
    if (contLv <= 0 && !forceWave) return false
    const spreadLv = this.combat.rank('poi_pan_spread')
    const maxGen = Math.max(1, poiContagionGenerations(contLv, spreadLv))
    if (generation >= maxGen || this._queue.length >= MAX_QUEUE_LEN) return false

    this._queue.push({
      timer: 0.42,
      source,
      x: source.x,
      y: source.y,
      snap: this._snapshot(source),
      generation,
      forceWave,
    })
    return true
  }

  spreadFrom(sourceOrPos, snap, generation = 0, { forceWave = false, nascentDeath = false, targetsOverride = 0, rangeOverride = 0 } = {}) {
    if (this.combat.school !== 'poison' || !snap) return 0
    if (this._frameTransfers >= CONTAGION_FRAME_BUDGET) return 0
    const enemies = this.combat.enemies || []
    if (!enemies.length) return 0

    let infectedTotal = 0
    for (const e of enemies) {
      if (e?.active && e.hp > 0 && this.isInfected(e)) infectedTotal++
    }
    if (infectedTotal >= MAX_SPELL_INFECTIONS && !forceWave) return 0

    const contLv = this.combat.rank('poi_contagion')
    if (contLv <= 0 && !forceWave && !nascentDeath) return 0
    const spreadLv = this.combat.rank('poi_pan_spread')
    const maxGen = nascentDeath ? 1 : poiContagionGenerations(contLv, spreadLv)
    if (!forceWave && generation >= maxGen) return 0

    const inherit = forceWave
      ? Math.max(0.85, poiContagionInherit(contLv, this.combat.branch))
      : nascentDeath
        ? 0.65
        : poiContagionInherit(contLv, this.combat.branch)
    const range = (rangeOverride || (nascentDeath ? 105 : poiContagionRange(contLv))) * this.combat.rangeScale
    const maxTargets = targetsOverride || (nascentDeath ? 1 : poiContagionTargets(contLv, spreadLv))
    const sx = sourceOrPos.x
    const sy = sourceOrPos.y

    const candidates = []
    for (const e of enemies) {
      if (!e?.active || e.hp <= 0 || e === sourceOrPos) continue
      const dist = Math.hypot(e.x - sx, e.y - sy)
      if (dist > range + (e.radius || 0)) continue
      const already = this.isInfected(e)
      if (!forceWave && already) continue
      candidates.push({ e, dist, already })
    }
    if (!candidates.length) return 0

    candidates.sort((a, b) => {
      if (a.already !== b.already) return a.already ? 1 : -1
      return a.dist - b.dist
    })

    const recipients = candidates.slice(0, maxTargets)
    const slashDmg = spreadLv > 0 ? this.combat.schoolDamage('poison', poiPanSpreadDamageMul(spreadLv)) : 0
    let count = 0

    for (const { e } of recipients) {
      if (this._frameTransfers >= CONTAGION_FRAME_BUDGET) break
      if (!forceWave && infectedTotal >= MAX_SPELL_INFECTIONS) break

      const wasInfected = this.isInfected(e)
      this._applySnapshot(e, snap, inherit)
      if (!wasInfected) infectedTotal++

      this._frameTransfers++
      this.combat.stats.contagionTransfers = (this.combat.stats.contagionTransfers || 0) + 1
      count++

      this.combat.pushEffect({
        kind: 'tether',
        x1: sx,
        y1: sy,
        x2: e.x,
        y2: e.y,
        color: this.combat.branch === 'poi_affliction' ? '#c084fc' : '#a8e46b',
        life: 0.28,
        maxLife: 0.28,
        width: spreadLv > 0 ? 3 : 2,
      })

      if (slashDmg > 0) {
        for (const bystander of enemies) {
          if (!bystander?.active || bystander.hp <= 0 || bystander === sourceOrPos) continue
          const d = distPointToSegment(bystander.x, bystander.y, sx, sy, e.x, e.y)
          if (d <= 22 + (bystander.radius || 12)) {
            this.combat.damageEnemy(bystander, slashDmg, { element: 'poison', derived: true })
          }
        }
      }

      if (!forceWave && !nascentDeath && generation + 1 < maxGen && this._queue.length < MAX_QUEUE_LEN) {
        this.queueDelayedContagion(e, generation + 1, false)
      }
    }
    return count
  }

  _applySnapshot(target, snap, inherit) {
    if (!target?.active || target.hp <= 0) return
    const cap = this.combat.agonyCap()
    if (snap.agonyStacks > 0 && snap.agonyTime > 0) {
      const addStacks = Math.max(1, Math.round(snap.agonyStacks * inherit))
      target.agonyStacks = Math.min(cap, Math.max(target.agonyStacks || 0, addStacks))
      target.agonyTime = Math.max(target.agonyTime || 0, snap.agonyTime * inherit)
      target.agonyDmg = Math.max(target.agonyDmg || 0, snap.agonyDmg * inherit)
      target.agonyCritChance = Math.max(target.agonyCritChance || 0, snap.agonyCritChance || 0)
      target.agonyCritMul = Math.max(target.agonyCritMul || 1.5, snap.agonyCritMul || 1.75)
    }
    if (snap.poisonHits > 0 && snap.poisonDmg > 0) {
      const nextHits = Math.max(1, Math.round(snap.poisonHits * inherit))
      if (snap.poisonDmg * inherit >= (target._poisonDmg || 0)) target._poisonDmg = snap.poisonDmg * inherit
      target.poisonHits = Math.max(target.poisonHits || 0, nextHits)
    }
    if (snap.curseTime > 0 && (snap.curseVuln > 0 || snap.curseSlow > 0)) {
      target.curseTime = Math.max(target.curseTime || 0, snap.curseTime * inherit)
      target.curseVuln = Math.max(target.curseVuln || 0, snap.curseVuln || 0)
      target.curseSlow = target.isBoss ? 0 : Math.max(target.curseSlow || 0, snap.curseSlow || 0)
    }
    if (snap.unsteadyTime > 0 && snap.unsteadyDmg > 0) {
      target.unsteadyTime = Math.max(target.unsteadyTime || 0, snap.unsteadyTime * inherit)
      target.unsteadyDmg = Math.max(target.unsteadyDmg || 0, snap.unsteadyDmg * inherit)
    }
  }

  onEnemyKilled(enemy) {
    if (this.combat.school !== 'poison' || !this.isInfected(enemy)) return 0
    const contLv = this.combat.rank('poi_contagion')
    return this.spreadFrom(enemy, this._snapshot(enemy), 0, { forceWave: false, nascentDeath: contLv <= 0 })
  }
}
