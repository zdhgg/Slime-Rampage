import {
  litChainDecayFloor,
  litChainJumps,
  litChainReachScale,
  litKeeperDamageScale,
  litKeeperDurationBonus,
  litKeeperExtraStrikes,
  litMaelstromDamageMul,
  litMaelstromStun,
  litMaelstromThreshold,
  litOverArcCritStep,
  litOverEchoScale,
  litOverEchoSecondChance,
  litOverloadChance,
  litOverloadPity,
  litOverloadScale,
  litSkyBarrageExtra,
  litSkyBarrageScale,
  litSkyTotemDamageMul,
  litSkyTotemDuration,
  litSolitaryBonusPerJump,
  litStormCloudBonusChain,
  litStormCloudRadiusBonus,
  litStormCloudVuln,
  litThunderDamageMul,
  litThunderInterval,
  litThunderStrikes,
} from './ElementalSchools.js'

const MAX_OVERLOAD_DEPTH = 2

export function buildJaggedBolt(x1, y1, x2, y2, jitter = 12) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const segs = Math.max(2, Math.min(5, Math.floor(len / 46)))
  const pts = [{ x: x1, y: y1 }]
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const off = (Math.random() - 0.5) * 2 * jitter
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off })
  }
  pts.push({ x: x2, y: y2 })
  return pts
}

/**
 * Lightning Specialization engine:
 *  - Chain Lightning with solitary Boss/elite unused-jump focus multiplier
 *  - Lightning Overload (depth-capped <= 2 with pity & Overdrive triple echo)
 *  - Maelstrom guaranteed-crit vortex strike
 *  - Thunderstorm sky strikes & overflow chains
 *  - Stormkeeper Spacebar active + Storm Totem / Sky Storm Core
 */
export class LightningCasting {
  constructor(combat) {
    this.combat = combat
    this.reset()
  }

  reset() {
    this.overloadPity = 0
    this.maelstromCounter = 0
    this.stormkeeperTimer = 0
    this.thunderstormTimer = 2.0
  }

  update(dt) {
    if (this.stormkeeperTimer > 0) {
      this.stormkeeperTimer = Math.max(0, this.stormkeeperTimer - dt)
    }
    const thunderLv = this.combat.rank('lit_thunderstorm')
    if (this.combat.school === 'lightning' && thunderLv > 0) {
      this.thunderstormTimer -= dt
      if (this.thunderstormTimer <= 0) {
        const branchScale = this.combat.branch === 'lit_skyfury' ? 0.8 : 1
        const interval = litThunderInterval(thunderLv) * branchScale / Math.max(1, this.combat.hasteScale)
        this.thunderstormTimer = Math.max(1.2, interval)
        this.castThunderstormStrike()
      }
    }
  }

  _nearestEnemies(originX, originY, maxRange, exclude = new Set(), limit = 1) {
    const out = []
    for (const e of this.combat.enemies || []) {
      if (!e?.active || e.hp <= 0 || exclude.has(e)) continue
      const d = Math.hypot(e.x - originX, e.y - originY)
      if (d <= maxRange + (e.radius || 0)) out.push({ e, d })
    }
    out.sort((a, b) => a.d - b.d)
    return out.slice(0, limit).map(x => x.e)
  }

  castChain(target, opts = {}) {
    const p = this.combat.player
    const enemies = (this.combat.enemies || []).filter(e => e?.active && e.hp > 0)
    if (!p || !enemies.length) return false

    const first =
      target?.active && target.hp > 0
        ? target
        : this._nearestEnemies(p.x, p.y, 440 * this.combat.rangeScale, new Set(), 1)[0] || enemies[0]
    if (!first) return false

    const reachLv = this.combat.rank('lit_chain_reach')
    const masteryLv = this.combat.rank('lit_mastery')
    const maelstromLv = this.combat.rank('lit_maelstrom')
    const arcLv = this.combat.rank('lit_over_arc')
    const extraOverJump = opts.overloaded && this.combat.branch === 'lit_overdrive' ? 1 : 0
    const maxJumps = opts.maxJumpsOverride ?? litChainJumps(reachLv) + extraOverJump
    const hopRange = 170 * litChainReachScale(reachLv) * this.combat.rangeScale
    const decayFloor = litChainDecayFloor(reachLv)

    const chain = [first]
    const visited = new Set([first])
    let cur = first
    while (chain.length < maxJumps) {
      const next = this._nearestEnemies(cur.x, cur.y, hopRange, visited, 1)[0]
      if (!next) break
      chain.push(next)
      visited.add(next)
      cur = next
    }

    const unusedJumps = Math.max(0, maxJumps - chain.length)
    const solitaryMul = chain.length === 1 ? 1 + unusedJumps * litSolitaryBonusPerJump(masteryLv) : 1
    const baseDmg = this.combat.schoolDamage('lightning', 1.05 * (opts.scale ?? 1))
    const arcStep = litOverArcCritStep(arcLv)
    const isOver = !!opts.overloaded
    const boltColor = isOver ? '#f8f0ff' : '#f3d97d'

    let prevX = p.x
    let prevY = p.y
    const killedArcs = []

    for (let i = 0; i < chain.length; i++) {
      const e = chain[i]
      const hopMul = chain.length === 1 ? solitaryMul : Math.max(decayFloor, 0.9 ** i)
      const critDamageBonus = arcLv > 0 ? (chain.length === 1 ? unusedJumps * arcStep : i * arcStep) : 0
      const critChanceBonus = isOver && this.combat.branch === 'lit_overdrive' ? 0.15 : 0
      this.combat.damageEnemy(e, baseDmg * hopMul, {
        element: 'lightning',
        extraCritChance: critChanceBonus,
        extraCritDamage: critDamageBonus,
        overloaded: isOver,
        derived: !!opts.derived,
      })
      if (maelstromLv > 0 && !e.isBoss && e.active && e.hp > 0) {
        e.elementStun = Math.max(e.elementStun || 0, litMaelstromStun(maelstromLv))
      }
      if (arcLv > 0 && (!e.active || e.hp <= 0)) {
        killedArcs.push({ x: e.x, y: e.y })
      }
      this.combat.pushEffect({
        kind: 'bolt',
        pts: buildJaggedBolt(prevX, prevY, e.x, e.y, isOver ? 16 : 11),
        color: boltColor,
        glow: isOver ? '#c084fc' : '#f3d97d',
        overloaded: isOver,
        life: isOver ? 0.24 : 0.18,
        maxLife: isOver ? 0.24 : 0.18,
        width: isOver ? 3.8 : 2.5,
      })
      prevX = e.x
      prevY = e.y
    }

    for (const pos of killedArcs) {
      this._triggerStaticBurst(pos.x, pos.y, 75 * this.combat.rangeScale, baseDmg * 0.72)
    }

    if (this.combat.branchUltimate === 'lit_over_ultimate' && !opts.derived && chain.length >= 3) {
      this.combat.fields.push({
        kind: 'arc_grid',
        points: chain.map(e => ({ x: e.x, y: e.y })),
        color: '#e9d5ff',
        life: 1.2,
        maxLife: 1.2,
        tick: 0.3,
        damage: baseDmg * 0.36,
      })
    }

    if (!opts.derived) {
      this.combat.stats.bodyLightningCasts = (this.combat.stats.bodyLightningCasts || 0) + 1
      this.maybeOverload('chain', first, opts)
    }
    return true
  }

  castShieldChain(maxJumps, dmgMul) {
    return this.castChain(null, { maxJumpsOverride: maxJumps, scale: dmgMul, derived: true })
  }

  castCantripChain(target) {
    const p = this.combat.player
    const enemies = (this.combat.enemies || []).filter(e => e?.active && e.hp > 0)
    if (!p || !enemies.length) return false
    const first =
      target?.active && target.hp > 0
        ? target
        : this._nearestEnemies(p.x, p.y, 380 * this.combat.rangeScale, new Set(), 1)[0] || enemies[0]
    if (!first) return false

    const chain = [first]
    const visited = new Set([first])
    let cur = first
    while (chain.length < 3) {
      const next = this._nearestEnemies(cur.x, cur.y, 165 * this.combat.rangeScale, visited, 1)[0]
      if (!next) break
      chain.push(next)
      visited.add(next)
      cur = next
    }
    const baseDmg = this.combat.cantripBaseDamage('lightning', 0.8)
    let prevX = p.x
    let prevY = p.y
    for (let i = 0; i < chain.length; i++) {
      const e = chain[i]
      this.combat.damageEnemy(e, baseDmg * Math.max(0.84, 0.92 ** i), {
        element: 'lightning',
        cantrip: true,
        derived: true,
      })
      this.combat.pushEffect({
        kind: 'bolt',
        pts: buildJaggedBolt(prevX, prevY, e.x, e.y, 9),
        color: '#f3d97d',
        life: 0.16,
        maxLife: 0.16,
        width: 2.0,
      })
      prevX = e.x
      prevY = e.y
    }
    // Electro-conduction: cantrip chain shaves 0.15s off next main-school cast
    if (chain.length > 0 && this.combat.clocks?.primary > 0) {
      this.combat.clocks.primary = Math.max(0, this.combat.clocks.primary - 0.15)
    }
    return true
  }

  _triggerStaticBurst(x, y, radius, damage) {
    this.combat.pushEffect({
      kind: 'ring',
      x,
      y,
      r: 8,
      maxR: radius,
      color: '#f3d97d',
      life: 0.24,
      maxLife: 0.24,
      lineWidth: 2.6,
    })
    for (const e of this.combat.enemies || []) {
      if (!e?.active || e.hp <= 0) continue
      if (Math.hypot(e.x - x, e.y - y) <= radius + (e.radius || 0)) {
        this.combat.damageEnemy(e, damage, { element: 'lightning', derived: true })
      }
    }
  }

  _pickSkyTargets(count) {
    const pool = (this.combat.enemies || []).filter(e => e?.active && e.hp > 0)
    if (!pool.length) return []
    const prioritizeBoss = this.combat.branch === 'lit_skyfury'
    const sorted = [...pool].sort((a, b) => {
      if (prioritizeBoss) {
        const pa = a.isBoss ? 3 : a.isElite ? 2 : 1
        const pb = b.isBoss ? 3 : b.isElite ? 2 : 1
        if (pa !== pb) return pb - pa
      }
      return b.hp - a.hp
    })
    const out = []
    for (let i = 0; i < count; i++) {
      out.push(sorted[i % sorted.length])
    }
    return out
  }

  castThunderstormStrike(opts = {}) {
    const enemies = (this.combat.enemies || []).filter(e => e?.active && e.hp > 0)
    if (!enemies.length) return false

    const thunderLv = this.combat.rank('lit_thunderstorm')
    const cloudLv = this.combat.rank('lit_storm_cloud')
    const barrageLv = this.combat.rank('lit_sky_barrage')
    const count = opts.targetsOverride
      ? opts.targetsOverride.length
      : opts.strikes ?? litThunderStrikes(thunderLv) + litSkyBarrageExtra(barrageLv)
    const targets = opts.targetsOverride || this._pickSkyTargets(count)
    if (!targets.length) return false

    const radius = (46 + litStormCloudRadiusBonus(cloudLv)) * this.combat.rangeScale
    const scale = (opts.scale ?? 1) * litSkyBarrageScale(barrageLv)
    const dmg = opts.damageOverride ?? this.combat.schoolDamage('lightning', litThunderDamageMul(thunderLv) * scale)
    const vuln = cloudLv > 0 ? litStormCloudVuln(cloudLv) : opts.baseVuln || 0
    const spillHops = 2 + litStormCloudBonusChain(cloudLv)
    const isOver = !!opts.overloaded

    for (const main of targets) {
      if (!main) continue
      const tx = main.x
      const ty = main.y
      const hitSet = new Set()
      let shockedDetonate = false

      for (const e of this.combat.enemies || []) {
        if (!e?.active || e.hp <= 0) continue
        if (Math.hypot(e.x - tx, e.y - ty) <= radius + (e.radius || 0)) {
          hitSet.add(e)
          if (barrageLv > 0 && e.lightningVulnTime > 0 && !opts.derived) shockedDetonate = true
          this.combat.damageEnemy(e, dmg, {
            element: 'lightning',
            overloaded: isOver,
            derived: !!opts.derived,
          })
          if (vuln > 0 && e.active && e.hp > 0) {
            e.lightningVulnTime = Math.max(e.lightningVulnTime || 0, 3.0)
            e.lightningVulnAmount = Math.max(e.lightningVulnAmount || 0, vuln)
          }
        }
      }

      if (shockedDetonate) {
        this._triggerStaticBurst(tx, ty, 90 * this.combat.rangeScale, dmg * 0.65)
      }

      // Overflow short chain from ground strike center
      let prevX = tx
      let prevY = ty
      let curX = tx
      let curY = ty
      const spillVisited = new Set(hitSet)
      for (let h = 0; h < spillHops; h++) {
        const next = this._nearestEnemies(curX, curY, 155 * this.combat.rangeScale, spillVisited, 1)[0]
        if (!next) break
        spillVisited.add(next)
        this.combat.damageEnemy(next, dmg * 0.65, { element: 'lightning', overloaded: isOver, derived: true })
        if (vuln > 0 && next.active && next.hp > 0) {
          next.lightningVulnTime = Math.max(next.lightningVulnTime || 0, 3.0)
          next.lightningVulnAmount = Math.max(next.lightningVulnAmount || 0, vuln)
        }
        this.combat.pushEffect({
          kind: 'bolt',
          pts: buildJaggedBolt(prevX, prevY, next.x, next.y, 10),
          color: isOver ? '#f8f0ff' : '#93c5fd',
          overloaded: isOver,
          life: 0.18,
          maxLife: 0.18,
          width: 2.2,
        })
        prevX = next.x
        prevY = next.y
        curX = next.x
        curY = next.y
      }

      if (this.combat.branch === 'lit_skyfury' && !opts.noStaticField) {
        this.combat.spawnZone({
          kind: 'static_field',
          school: 'lightning',
          x: tx,
          y: ty,
          radius: 62 * this.combat.rangeScale,
          life: 1.5,
          maxLife: 1.5,
          tick: 0.45,
          damage: dmg * 0.25,
          slow: 0.25,
        })
      }

      this.combat.pushEffect({
        kind: 'sky_bolt',
        x: tx,
        y: ty,
        radius,
        color: isOver ? '#f8f0ff' : '#a9d3ff',
        overloaded: isOver,
        life: 0.26,
        maxLife: 0.26,
      })

      this.combat.stats.skyStrikes = (this.combat.stats.skyStrikes || 0) + 1
      if (!opts.derived) {
        this.maybeOverload('sky', main, opts)
      }
    }
    return true
  }

  maybeOverload(kind, target, opts = {}) {
    const depth = opts.overloadDepth || 0
    if (depth >= MAX_OVERLOAD_DEPTH || opts.derived || opts.noOverload) return false

    const overloadLv = this.combat.rank('lit_overload')
    const branch = this.combat.branch
    let chance = 0
    if (depth === 0) {
      if (this.stormkeeperTimer > 0) chance = 1
      else if (this.combat.school === 'lightning') {
        chance = Math.min(0.95, litOverloadChance(overloadLv) + (branch === 'lit_overdrive' ? 0.12 : 0))
      }
    } else if (depth === 1 && branch === 'lit_overdrive') {
      if (this.stormkeeperTimer > 0 && this.combat.branchUltimate === 'lit_over_ultimate') chance = 1
      else chance = litOverEchoSecondChance(this.combat.rank('lit_over_echo'))
    }
    if (chance <= 0) return false

    let triggered = Math.random() < chance
    if (!triggered && depth === 0 && this.combat.school === 'lightning' && this.stormkeeperTimer <= 0) {
      this.overloadPity++
      if (this.overloadPity >= litOverloadPity(overloadLv)) {
        triggered = true
        this.overloadPity = 0
      }
    } else if (triggered && depth === 0) {
      this.overloadPity = 0
    }
    if (!triggered) return false

    const nextDepth = depth + 1
    const echoScale = litOverEchoScale(this.combat.rank('lit_over_echo'))
    const scale = litOverloadScale(overloadLv) * echoScale * (nextDepth === 2 ? 0.6 : 1)

    this.combat.delay(0.14, () => {
      if (!this.combat.enabled) return
      if (this.combat.branch === 'lit_overdrive') {
        this.combat.reduceActiveCooldown(0.15)
      }
      this.combat.stats.overloads = (this.combat.stats.overloads || 0) + 1

      const maelstromLv = this.combat.rank('lit_maelstrom')
      if (maelstromLv > 0) {
        this.maelstromCounter++
        if (this.maelstromCounter >= litMaelstromThreshold(maelstromLv)) {
          this.maelstromCounter = 0
          this._castMaelstromVortex(maelstromLv)
        }
      }

      if (kind === 'sky') {
        const liveTarget =
          target?.active && target.hp > 0
            ? target
            : this._pickSkyTargets(1)[0]
        if (liveTarget) {
          this.castThunderstormStrike({
            targetsOverride: [liveTarget],
            scale,
            overloaded: true,
            overloadDepth: nextDepth,
            derived: nextDepth >= MAX_OVERLOAD_DEPTH,
            noStaticField: true,
          })
        }
      } else {
        const liveTarget =
          target?.active && target.hp > 0
            ? target
            : this._nearestEnemies(this.combat.player?.x || 0, this.combat.player?.y || 0, 440, new Set(), 1)[0]
        if (liveTarget) {
          this.castChain(liveTarget, {
            overloaded: true,
            overloadDepth: nextDepth,
            scale,
            derived: nextDepth >= MAX_OVERLOAD_DEPTH,
          })
        }
      }
    })
    return true
  }

  _castMaelstromVortex(maelstromLv) {
    const enemies = (this.combat.enemies || []).filter(e => e?.active && e.hp > 0)
    if (!enemies.length) return
    const target = enemies.reduce((best, cur) => (cur.hp > best.hp ? cur : best), enemies[0])
    const dmg = this.combat.schoolDamage('lightning', litMaelstromDamageMul(maelstromLv))
    const radius = 85 * this.combat.rangeScale
    const pullRadius = radius + 15
    const ww = this.combat.game?.worldWidth || 2000
    const wh = this.combat.game?.worldHeight || 2000
    // Gentle inward vacuum pull on non-boss enemies so follow-up chain & thunderstorm cleave the pack
    for (const e of enemies) {
      if (e.isBoss || e === target) continue
      const dx = target.x - e.x
      const dy = target.y - e.y
      const dist = Math.hypot(dx, dy)
      if (dist > 18 && dist <= pullRadius + (e.radius || 0)) {
        const step = Math.min(24, dist - 18)
        e.x = Math.max(28, Math.min(ww - 28, e.x + (dx / dist) * step))
        e.y = Math.max(28, Math.min(wh - 28, e.y + (dy / dist) * step))
      }
    }
    for (const e of enemies) {
      if (Math.hypot(e.x - target.x, e.y - target.y) <= radius + (e.radius || 0)) {
        this.combat.damageEnemy(e, dmg * (e === target ? 1 : 0.7), {
          element: 'lightning',
          forceCrit: true,
          derived: true,
        })
      }
    }
    this.combat.pushEffect({
      kind: 'maelstrom_vortex',
      x: target.x,
      y: target.y,
      radius,
      color: '#fde047',
      overloaded: true,
      life: 0.46,
      maxLife: 0.46,
      seed: Math.random() * Math.PI * 2,
    })
  }

  castStormkeeperActive() {
    const p = this.combat.player
    if (!p) return false
    const pactLv = this.combat.rank('lit_keeper_pact')
    const novaR = 128 * this.combat.rangeScale
    const scale = litKeeperDamageScale(pactLv)
    const novaDmg = this.combat.schoolDamage('lightning', 1.35 * scale)

    this.combat.pushEffect({
      kind: 'ring',
      x: p.x,
      y: p.y,
      r: 18,
      maxR: novaR,
      color: '#f3d97d',
      life: 0.36,
      maxLife: 0.36,
      lineWidth: 4,
    })

    for (const e of this.combat.enemies || []) {
      if (!e?.active || e.hp <= 0) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d <= novaR + (e.radius || 0)) {
        if (!e.isBoss) {
          const dx = e.x - p.x
          const dy = e.y - p.y
          const len = Math.hypot(dx, dy) || 1
          e.x += (dx / len) * 34
          e.y += (dy / len) * 34
          e.elementStun = Math.max(e.elementStun || 0, 0.7)
        }
        this.combat.damageEnemy(e, novaDmg, { element: 'lightning', derived: true })
      }
    }

    this.stormkeeperTimer = 4.0 + litKeeperDurationBonus(pactLv)
    const strikeCount = 3 + litKeeperExtraStrikes(pactLv)
    this.castThunderstormStrike({
      strikes: strikeCount,
      scale: scale * 1.15,
      damageOverride: this.combat.schoolDamage('lightning', 1.45 * scale),
      baseVuln: 0.1,
    })

    if (this.combat.branch === 'lit_skyfury') {
      const totemLv = this.combat.rank('lit_sky_totem')
      if (this.combat.branchUltimate === 'lit_sky_ultimate') {
        this.combat.spawnSummon({
          kind: 'sky_core',
          x: p.x,
          y: p.y,
          life: 6.5,
          maxLife: 6.5,
          tick: 0.3,
          damage: this.combat.schoolDamage('lightning', Math.max(1.35, litSkyTotemDamageMul(totemLv)) * scale),
        })
      } else if (totemLv > 0) {
        this.combat.spawnSummon({
          kind: 'storm_totem',
          x: p.x,
          y: p.y,
          life: litSkyTotemDuration(totemLv),
          maxLife: litSkyTotemDuration(totemLv),
          tick: 0.6,
          radius: 175 * this.combat.rangeScale,
          damage: this.combat.schoolDamage('lightning', litSkyTotemDamageMul(totemLv)),
        })
      }
    }

    this.combat.game?.combatFeedback?.impact?.({ hits: 3 })
    return true
  }
}
