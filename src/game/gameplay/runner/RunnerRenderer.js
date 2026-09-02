import { AssetManager } from '../../AssetManager.js'
import {
  RUNNER_COLLISION_DEPTH,
  RUNNER_DURATION,
  RUNNER_PLAYER_DEPTH,
  RUNNER_RAPID_DURATION,
} from './RunnerRules.js'

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class RunnerRenderer {
  constructor(gameplay) {
    this.gameplay = gameplay
    this.assets = AssetManager.getInstance()
    this.width = 0
    this.height = 0
    this.horizonY = 0
    this.playerY = 0
    this.roadTopWidth = 0
    this.roadBottomWidth = 0
    this.baseUnit = 0
    this._roadGradient = null
    this._skyGradient = null
  }

  ensureLayout() {
    const game = this.gameplay.game
    if (!game || (game.width === this.width && game.height === this.height)) return
    this.width = game.width
    this.height = game.height
    this.horizonY = Math.max(88, this.height * 0.155)
    this.playerY = this.height * 0.84
    this.roadBottomWidth = Math.min(this.width * 0.8, this.height * 1.36)
    this.roadTopWidth = Math.max(180, this.roadBottomWidth * 0.31)
    this.baseUnit = clamp(Math.min(this.width, this.height) * 0.055, 34, 58)

    const ctx = game.ctx
    this._skyGradient = ctx.createLinearGradient(0, 0, 0, this.height)
    this._skyGradient.addColorStop(0, '#071019')
    this._skyGradient.addColorStop(0.55, '#0b151f')
    this._skyGradient.addColorStop(1, '#101923')
    this._roadGradient = ctx.createLinearGradient(0, this.horizonY, 0, this.height)
    this._roadGradient.addColorStop(0, '#111b25')
    this._roadGradient.addColorStop(1, '#1a2a36')
  }

  depthToY(depth) {
    const d = clamp(depth, 0, 1.08)
    const eased = Math.pow(d, 1.48)
    return this.horizonY + (this.playerY - this.horizonY) * eased
  }

  roadWidthAt(depth) {
    const d = clamp(depth, 0, 1.08)
    return this.roadTopWidth + (this.roadBottomWidth - this.roadTopWidth) * Math.pow(d, 0.92)
  }

  laneBoundaryX(boundary, depth) {
    return this.width / 2 + (boundary - 1.5) * (this.roadWidthAt(depth) / 3)
  }

  lanePositionX(lanePosition, depth = RUNNER_PLAYER_DEPTH) {
    return this.width / 2 + (lanePosition - 1) * (this.roadWidthAt(depth) / 3)
  }

  project(lane, depth) {
    return {
      x: this.lanePositionX(lane, depth),
      y: this.depthToY(depth),
      scale: 0.34 + clamp(depth, 0, 1) * 0.88,
    }
  }

  render(ctx) {
    this.ensureLayout()
    const gameplay = this.gameplay
    this._drawBackdrop(ctx)

    const shake = gameplay.reducedMotion ? 0 : gameplay.shakeOffset()
    ctx.save()
    if (shake) ctx.translate(shake * 0.7, -shake * 0.35)
    this._drawRoad(ctx)
    this._drawFinishLine(ctx)
    this._drawEnemyThreats(ctx)
    this._drawEntities(ctx)
    this._drawBullets(ctx)
    this._drawWorldEffects(ctx)
    this._drawFusionWave(ctx)
    this._drawPlayer(ctx)
    ctx.restore()

    if (gameplay.damageFlash > 0) {
      const alpha = clamp(gameplay.damageFlash * 0.2, 0, 0.2)
      const vignette = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        Math.min(this.width, this.height) * 0.25,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.7
      )
      vignette.addColorStop(0, 'rgba(171, 48, 42, 0)')
      vignette.addColorStop(1, `rgba(171, 48, 42, ${alpha.toFixed(3)})`)
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }

  _drawBackdrop(ctx) {
    ctx.fillStyle = this._skyGradient
    ctx.fillRect(0, 0, this.width, this.height)

    const time = this.gameplay.visualTime
    const cx = this.width / 2

    // 1. Dynamic sweeping searchlights in night sky
    ctx.save()
    for (let s = 0; s < 2; s++) {
      const angle = s === 0 ? Math.sin(time * 0.65) * 0.48 - 0.22 : Math.cos(time * 0.52) * 0.48 + 0.22
      const beamBaseX = cx + (s === 0 ? -1 : 1) * (this.roadTopWidth * 1.8)
      const beamLen = this.height * 0.85
      const beamEndX = beamBaseX + Math.sin(angle) * beamLen
      const beamEndY = this.horizonY - Math.cos(angle) * beamLen

      const beamGrad = ctx.createLinearGradient(beamBaseX, this.horizonY, beamEndX, beamEndY)
      beamGrad.addColorStop(0, 'rgba(120, 215, 255, 0.12)')
      beamGrad.addColorStop(0.65, 'rgba(80, 180, 240, 0.04)')
      beamGrad.addColorStop(1, 'rgba(80, 180, 240, 0)')

      ctx.fillStyle = beamGrad
      ctx.beginPath()
      ctx.moveTo(beamBaseX - 16, this.horizonY + 10)
      ctx.lineTo(beamEndX - 65, beamEndY)
      ctx.lineTo(beamEndX + 65, beamEndY)
      ctx.lineTo(beamBaseX + 16, this.horizonY + 10)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()

    // 2. Distant fortress spires & horizon skyline
    ctx.fillStyle = '#08131d'
    ctx.beginPath()
    ctx.moveTo(0, this.horizonY + 28)
    for (let x = 0; x <= this.width; x += 48) {
      const isTower = (x / 48) % 4 === 0
      const towerHeight = isTower ? 42 : 16 + ((x / 48) % 3) * 12
      ctx.lineTo(x, this.horizonY - towerHeight)
      if (isTower) {
        ctx.lineTo(x + 14, this.horizonY - towerHeight)
        ctx.lineTo(x + 14, this.horizonY - 14)
      }
    }
    ctx.lineTo(this.width, this.horizonY + 50)
    ctx.closePath()
    ctx.fill()

    // 3. Midground jagged mountain ramparts
    ctx.fillStyle = '#101c27'
    ctx.beginPath()
    ctx.moveTo(0, this.horizonY + 28)
    for (let x = 0; x <= this.width; x += 72) {
      const ridge = 18 + ((x / 72) % 3) * 11
      ctx.lineTo(x, this.horizonY - ridge)
    }
    ctx.lineTo(this.width, this.horizonY + 50)
    ctx.closePath()
    ctx.fill()

    // 4. Side speed lines & particle tracks
    const speedRatio = (this.gameplay.section?.advanceSpeed || 0.17) / 0.17
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const track = (i * 0.125 + time * 0.08 * speedRatio) % 1
      const y = this.horizonY + Math.pow(track, 1.7) * (this.height - this.horizonY)
      const edge = this.width / 2 + side * (this.roadWidthAt(track) / 2 + 18 + track * 95)
      ctx.strokeStyle = `rgba(110, 185, 225, ${(0.06 + track * 0.18).toFixed(3)})`
      ctx.lineWidth = 1 + track * 2.5
      ctx.beginPath()
      ctx.moveTo(edge, y)
      ctx.lineTo(edge + side * (20 + track * 55), y + 30 + track * 90)
      ctx.stroke()
    }
  }

  _drawRoad(ctx) {
    const cx = this.width / 2
    const bottomY = this.height + 28
    const time = this.gameplay.visualTime

    // 1. Road base
    ctx.fillStyle = this._roadGradient
    ctx.beginPath()
    ctx.moveTo(cx - this.roadTopWidth / 2, this.horizonY)
    ctx.lineTo(cx + this.roadTopWidth / 2, this.horizonY)
    ctx.lineTo(cx + this.roadBottomWidth / 2, bottomY)
    ctx.lineTo(cx - this.roadBottomWidth / 2, bottomY)
    ctx.closePath()
    ctx.fill()

    // 2. In-world holographic lane telemetry (hazard chevron strips & energy corridors)
    this._drawInWorldTelemetry(ctx)

    // 3. Glowing neon outer guardrails
    const railPulse = 0.35 + Math.sin(time * 6) * 0.15
    ctx.strokeStyle = `rgba(80, 210, 245, ${railPulse.toFixed(3)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - this.roadTopWidth / 2, this.horizonY)
    ctx.lineTo(cx - this.roadBottomWidth / 2, bottomY)
    ctx.moveTo(cx + this.roadTopWidth / 2, this.horizonY)
    ctx.lineTo(cx + this.roadBottomWidth / 2, bottomY)
    ctx.stroke()

    // 4. Moving lane dashed dividers
    const speedRatio = (this.gameplay.section?.advanceSpeed || 0.17) / 0.17
    const speedMult = (this.gameplay.isFeverActive ? 1.6 : 1) * speedRatio
    const offset = (time * 0.28 * speedMult) % 0.14
    for (let boundary = 1; boundary <= 2; boundary++) {
      for (let depth = -0.14 + offset; depth < 1.06; depth += 0.14) {
        const a = clamp(depth, 0, 1.06)
        const b = clamp(depth + 0.065, 0, 1.06)
        if (b <= 0.02) continue
        const x0 = this.laneBoundaryX(boundary, a)
        const x1 = this.laneBoundaryX(boundary, b)
        ctx.strokeStyle = `rgba(167, 210, 235, ${(0.12 + b * 0.38).toFixed(3)})`
        ctx.lineWidth = 1.2 + b * 4.5
        ctx.beginPath()
        ctx.moveTo(x0, this.depthToY(a))
        ctx.lineTo(x1, this.depthToY(b))
        ctx.stroke()
      }
    }

    // 5. Horizontal grid speed lines
    for (let depth = offset; depth < 1.05; depth += 0.14) {
      const y = this.depthToY(depth)
      const half = this.roadWidthAt(depth) * 0.48
      ctx.strokeStyle = `rgba(114, 175, 215, ${(0.03 + depth * 0.06).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - half, y)
      ctx.lineTo(cx + half, y)
      ctx.stroke()
    }
  }

  _drawInWorldTelemetry(ctx) {
    const time = this.gameplay.visualTime
    const telemetry = this.gameplay._getLaneTelemetry()
    const targetLane = this.gameplay.targetLane
    const currentLane = this.gameplay.currentLane

    for (let lane = 0; lane < 3; lane++) {
      const info = telemetry[lane]
      if (!info) continue

      // Danger / Warning Hazard Floor Projections
      if (info.status === 'danger' || info.status === 'warning') {
        const isDanger = info.status === 'danger'
        const baseColor = isDanger ? 'rgba(240, 70, 70,' : 'rgba(245, 170, 50,'
        const pulse = 0.15 + Math.sin(time * 10 + lane) * 0.08

        // Draw glowing danger corridor
        const d0 = 0.32
        const d1 = 0.94
        ctx.fillStyle = `${baseColor} ${pulse.toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(this.laneBoundaryX(lane, d0), this.depthToY(d0))
        ctx.lineTo(this.laneBoundaryX(lane + 1, d0), this.depthToY(d0))
        ctx.lineTo(this.laneBoundaryX(lane + 1, d1), this.depthToY(d1))
        ctx.lineTo(this.laneBoundaryX(lane, d1), this.depthToY(d1))
        ctx.closePath()
        ctx.fill()

        // Draw animated hazard chevrons pointing downward (towards player)
        const chevOffset = (time * 0.4) % 0.2
        for (let cd = 0.4 + chevOffset; cd < 0.9; cd += 0.18) {
          const cy = this.depthToY(cd)
          const cxLane = this.lanePositionX(lane, cd)
          const span = (this.roadWidthAt(cd) / 3) * 0.36
          ctx.strokeStyle = `${baseColor} ${(0.35 + cd * 0.45).toFixed(3)})`
          ctx.lineWidth = 1.8 + cd * 2.5
          ctx.beginPath()
          ctx.moveTo(cxLane - span, cy - 8 * cd)
          ctx.lineTo(cxLane, cy + 6 * cd)
          ctx.lineTo(cxLane + span, cy - 8 * cd)
          ctx.stroke()
        }
      } else if (lane !== currentLane && lane !== targetLane) {
        // Subtle forward green arrows for open safe lanes
        const arrowOffset = (-time * 0.3) % 0.25
        for (let cd = 0.45 + arrowOffset; cd < 0.85; cd += 0.22) {
          if (cd < 0.35 || cd > 0.9) continue
          const cy = this.depthToY(cd)
          const cxLane = this.lanePositionX(lane, cd)
          const span = (this.roadWidthAt(cd) / 3) * 0.24
          ctx.strokeStyle = `rgba(110, 235, 160, ${(0.08 + cd * 0.14).toFixed(3)})`
          ctx.lineWidth = 1.2 + cd * 1.5
          ctx.beginPath()
          ctx.moveTo(cxLane - span, cy + 6 * cd)
          ctx.lineTo(cxLane, cy - 6 * cd)
          ctx.lineTo(cxLane + span, cy + 6 * cd)
          ctx.stroke()
        }
      }
    }

    // Player Lane Energy Chassis Aura
    const selected = targetLane
    const d0 = 0.72
    const d1 = 1.05
    const fever = this.gameplay.isFeverActive
    const chassisColor = fever ? 'rgba(255, 215, 80,' : 'rgba(115, 230, 110,'
    const pulse = 0.12 + Math.sin(time * 8) * 0.05

    ctx.fillStyle = `${chassisColor} ${pulse.toFixed(3)})`
    ctx.beginPath()
    ctx.moveTo(this.laneBoundaryX(selected, d0), this.depthToY(d0))
    ctx.lineTo(this.laneBoundaryX(selected + 1, d0), this.depthToY(d0))
    ctx.lineTo(this.laneBoundaryX(selected + 1, d1), this.depthToY(d1))
    ctx.lineTo(this.laneBoundaryX(selected, d1), this.depthToY(d1))
    ctx.closePath()
    ctx.fill()

    this._drawGroundFires(ctx)

    // Energy Chassis Ring under the player
    const px = this.lanePositionX(this.gameplay.lanePosition, RUNNER_PLAYER_DEPTH)
    const py = this.playerY
    const pr = this.baseUnit * (fever ? 1.25 : 1.05)
    ctx.save()
    ctx.strokeStyle = fever ? 'rgba(255, 220, 90, 0.75)' : 'rgba(125, 240, 140, 0.55)'
    ctx.lineWidth = fever ? 3 : 2
    ctx.beginPath()
    ctx.ellipse(px, py + 8, pr * 1.15, pr * 0.42, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }

  _drawGroundFires(ctx) {
    for (const fire of this.gameplay.groundFires) {
      const point = this.project(fire.lane, fire.depth)
      const size = this.baseUnit * point.scale * 1.15
      const alpha = Math.min(0.5, fire.duration / 1.0)
      const pulse = 1 + Math.sin(this.gameplay.visualTime * 8 + fire.id) * 0.12
      ctx.save()
      ctx.translate(point.x, point.y)
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, size * 0.75)
      grad.addColorStop(0, `rgba(255, 180, 60, ${alpha.toFixed(3)})`)
      grad.addColorStop(0.45, `rgba(235, 75, 25, ${(alpha * 0.7).toFixed(3)})`)
      grad.addColorStop(1, 'rgba(160, 30, 10, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(0, 0, size * 0.8 * pulse, size * 0.3 * pulse, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

  _drawFinishLine(ctx) {
    if (!this.gameplay.duration || this.gameplay.duration === Infinity) return
    const remaining = this.gameplay.duration - this.gameplay.elapsedTime
    if (remaining > 8 || remaining < 0) return
    const depth = clamp(1 - remaining / 8, 0.02, RUNNER_COLLISION_DEPTH)
    const y = this.depthToY(depth)
    const left = this.laneBoundaryX(0, depth)
    const width = this.roadWidthAt(depth)
    const tileW = width / 12
    const tileH = 4 + depth * 15
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(224, 238, 242, 0.88)' : 'rgba(51, 81, 96, 0.9)'
      ctx.fillRect(left + i * tileW, y - tileH / 2, tileW + 1, tileH)
    }
  }

  _drawEnemyThreats(ctx) {
    const gameplay = this.gameplay
    for (const entity of gameplay.entities) {
      if (!entity.active || !entity.attacking) continue
      const progress = entity.attackDelay > 0 ? 1 - entity.attackTimer / entity.attackDelay : 1
      if (entity.behavior === 'archer') {
        const from = this.project(entity.lane, entity.depth)
        const targetX = this.lanePositionX(entity.attackLane, RUNNER_COLLISION_DEPTH)
        const targetY = this.depthToY(RUNNER_COLLISION_DEPTH)
        ctx.save()
        ctx.strokeStyle = `rgba(143, 215, 172, ${(0.22 + progress * 0.5).toFixed(3)})`
        ctx.lineWidth = 1.5 + progress * 1.5
        ctx.setLineDash([7, 6])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(targetX, targetY)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = `rgba(214, 245, 226, ${(0.4 + progress * 0.5).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(targetX, targetY, 8 + progress * 8, 0, TAU)
        ctx.stroke()
        ctx.restore()
      } else if (entity.behavior === 'mage') {
        for (const lane of entity.attackLanes || []) {
          const nearDepth = RUNNER_COLLISION_DEPTH + 0.04
          const farDepth = Math.min(0.92, entity.depth + 0.08)
          ctx.fillStyle = `rgba(193, 105, 224, ${(0.08 + progress * 0.13).toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(this.laneBoundaryX(lane, farDepth), this.depthToY(farDepth))
          ctx.lineTo(this.laneBoundaryX(lane + 1, farDepth), this.depthToY(farDepth))
          ctx.lineTo(this.laneBoundaryX(lane + 1, nearDepth), this.depthToY(nearDepth))
          ctx.lineTo(this.laneBoundaryX(lane, nearDepth), this.depthToY(nearDepth))
          ctx.closePath()
          ctx.fill()

          const center = this.project(lane, RUNNER_COLLISION_DEPTH - 0.045)
          ctx.strokeStyle = `rgba(229, 163, 248, ${(0.34 + progress * 0.55).toFixed(3)})`
          ctx.lineWidth = 1.5 + progress * 2
          ctx.beginPath()
          ctx.arc(center.x, center.y, 13 + progress * 16, 0, TAU)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(center.x - 10, center.y - 10)
          ctx.lineTo(center.x + 10, center.y + 10)
          ctx.moveTo(center.x + 10, center.y - 10)
          ctx.lineTo(center.x - 10, center.y + 10)
          ctx.stroke()
        }
      }
    }

    for (const projectile of gameplay.enemyProjectiles) {
      if (!projectile.active) continue
      const point = this.project(projectile.lane, projectile.depth)
      const tail = this.project(projectile.lane, Math.max(0, projectile.depth - 0.055))
      ctx.save()
      ctx.strokeStyle = projectile.hitFlash > 0 ? '#ffffff' : projectile.color
      ctx.fillStyle = projectile.hitFlash > 0 ? '#ffffff' : '#d8eddd'
      ctx.lineWidth = 2 + point.scale
      ctx.beginPath()
      ctx.moveTo(tail.x, tail.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.translate(point.x, point.y)
      ctx.rotate(Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, -6 - point.scale * 2)
      ctx.lineTo(4 + point.scale, 4)
      ctx.lineTo(-4 - point.scale, 4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  _drawEntities(ctx) {
    const list = this.gameplay.entities
    this._drawSupportLinks(ctx, list)
    for (let i = list.length - 1; i >= 0; i--) {
      const entity = list[i]
      if (!entity.active) continue
      const point = this.project(entity.lane, entity.depth)
      const size = this.baseUnit * point.scale * (entity.renderScale || 1)
      if (entity.behavior === 'charge' && entity.chargeTelegraph > 0) {
        this._drawChargeWarning(ctx, entity, point, size)
      }
      ctx.save()
      ctx.translate(point.x, point.y)
      if (entity.hitFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.38, entity.hitFlash * 3).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(0, 0, size * 0.67, 0, TAU)
        ctx.fill()
      }

      if (entity.kind === 'mutation') this._drawMutationGate(ctx, entity, size)
      else if (entity.kind === 'secondary_mutation') this._drawSecondaryMutationGate(ctx, entity, size)
      else if (entity.kind === 'gate') this._drawGate(ctx, entity, size)
      else if (entity.behavior === 'barrel') this._drawBarrel(ctx, entity, size)
      else if (entity.behavior === 'laser_gate') this._drawLaserGate(ctx, entity, size)
      else if (entity.kind === 'hazard') this._drawBarrier(ctx, entity, size)
      else this._drawEnemy(ctx, entity, size)

      const activeTarget = entity.lane === this.gameplay.occupiedLane && !this.gameplay.isSwitching
      const mutationArmed =
        (entity.kind !== 'mutation' && entity.kind !== 'secondary_mutation') ||
        entity.depth >= entity.armedDepth
      if (mutationArmed && (entity.hp < entity.maxHp || activeTarget)) this._drawHealth(ctx, entity, size)
      if (activeTarget && entity.depth > 0.28) this._drawTarget(ctx, entity, size)
      if (entity.corrosionStacks > 0) this._drawCorrosionStacks(ctx, entity, size)
      ctx.restore()
    }
  }

  _drawSupportLinks(ctx, entities) {
    ctx.save()
    ctx.lineWidth = 1.5
    for (const support of entities) {
      if (!support.active || support.behavior !== 'support') continue
      const from = this.project(support.lane, support.depth)
      for (const ally of entities) {
        if (!ally.active || ally.id === support.id || ally.rowId !== support.rowId || ally.kind !== 'enemy') continue
        const to = this.project(ally.lane, ally.depth)
        ctx.strokeStyle = 'rgba(224, 200, 126, 0.28)'
        ctx.setLineDash([5, 6])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  _drawChargeWarning(ctx, entity, point, size) {
    const ratio = entity.chargeDelay > 0 ? entity.chargeTelegraph / entity.chargeDelay : 0
    const pulse = 0.18 + (1 - ratio) * 0.28
    ctx.save()
    ctx.strokeStyle = `rgba(232, 101, 77, ${pulse.toFixed(3)})`
    ctx.lineWidth = 2 + (1 - ratio) * 2
    ctx.setLineDash([10, 10])
    ctx.beginPath()
    ctx.moveTo(point.x, point.y + size * 0.45)
    ctx.lineTo(this.lanePositionX(entity.lane), this.playerY - this.baseUnit * 0.7)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  _drawEnemy(ctx, entity, size) {
    const bob = Math.sin(this.gameplay.visualTime * 8 + entity.id) * size * 0.035
    ctx.translate(0, bob)
    if (entity.elite) {
      ctx.strokeStyle = entity.type === 'gold_convoy' ? '#ffd700' : 'rgba(242, 170, 100, 0.75)'
      ctx.lineWidth = Math.max(1.5, size * 0.035)
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.7, 0, TAU)
      ctx.stroke()
    }
    const walkFrame = entity.hitFlash > 0 ? 4 : Math.floor(this.gameplay.visualTime * 8 + entity.id) % 4
    const sprite = entity.sprite ? `${entity.sprite.slice(0, -1)}${walkFrame}` : null
    if (!sprite || !this.assets.draw(ctx, sprite, 0, 0, size * 1.25, size * 1.25)) {
      ctx.fillStyle = entity.color
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.48, 0, TAU)
      ctx.fill()
    }
    if (entity.behavior === 'shield') this._drawShield(ctx, size)
    else if (entity.behavior === 'support') this._drawSupportAura(ctx, size)
    else if (entity.behavior === 'split') this._drawSplitCore(ctx, size)
    else if (entity.charging) this._drawChargeStreaks(ctx, size)
    if (entity.boss) this._drawBossAura(ctx, size)
  }

  _drawBossAura(ctx, size) {
    const pulse = 1 + Math.sin(this.gameplay.visualTime * 6) * 0.08
    ctx.strokeStyle = 'rgba(235, 75, 55, 0.85)'
    ctx.lineWidth = Math.max(2, size * 0.05)
    ctx.strokeRect(-size * 0.75 * pulse, -size * 0.75 * pulse, size * 1.5 * pulse, size * 1.5 * pulse)
    ctx.fillStyle = 'rgba(255, 90, 60, 0.15)'
    ctx.fillRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4)
  }

  _drawShield(ctx, size) {
    ctx.strokeStyle = 'rgba(137, 205, 230, 0.82)'
    ctx.fillStyle = 'rgba(90, 151, 178, 0.16)'
    ctx.lineWidth = Math.max(2, size * 0.055)
    ctx.beginPath()
    ctx.arc(0, size * 0.12, size * 0.62, 0.12 * Math.PI, 0.88 * Math.PI)
    ctx.lineTo(0, size * 0.72)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  _drawSupportAura(ctx, size) {
    const pulse = 0.7 + Math.sin(this.gameplay.visualTime * 5) * 0.12
    ctx.strokeStyle = `rgba(224, 200, 126, ${pulse.toFixed(3)})`
    ctx.lineWidth = Math.max(1.5, size * 0.035)
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.68, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-size * 0.15, -size * 0.72)
    ctx.lineTo(0, -size * 0.9)
    ctx.lineTo(size * 0.15, -size * 0.72)
    ctx.stroke()
  }

  _drawSplitCore(ctx, size) {
    ctx.strokeStyle = 'rgba(190, 155, 225, 0.72)'
    ctx.lineWidth = Math.max(1.5, size * 0.04)
    ctx.beginPath()
    ctx.moveTo(-size * 0.18, -size * 0.4)
    ctx.lineTo(size * 0.08, -size * 0.08)
    ctx.lineTo(-size * 0.05, size * 0.16)
    ctx.lineTo(size * 0.22, size * 0.42)
    ctx.stroke()
  }

  _drawChargeStreaks(ctx, size) {
    ctx.strokeStyle = 'rgba(238, 121, 88, 0.55)'
    ctx.lineWidth = 2
    for (const x of [-0.34, 0, 0.34]) {
      ctx.beginPath()
      ctx.moveTo(size * x, -size * 0.58)
      ctx.lineTo(size * x, -size * 1.02)
      ctx.stroke()
    }
  }

  _drawBarrier(ctx, entity, size) {
    const w = size * 1.15
    const h = size * 0.68
    ctx.fillStyle = '#4b3030'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(1.5, size * 0.045)
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.beginPath()
    ctx.moveTo(-w * 0.34, h * 0.25)
    ctx.lineTo(-w * 0.08, -h * 0.25)
    ctx.lineTo(w * 0.18, h * 0.25)
    ctx.lineTo(w * 0.42, -h * 0.25)
    ctx.stroke()
  }

  _drawBarrel(ctx, entity, size) {
    const w = size * 0.72
    const h = size * 0.95
    ctx.fillStyle = '#c2410c'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = Math.max(1.5, size * 0.045)
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.fillStyle = '#fef08a'
    ctx.fillRect(-w / 2, -h * 0.15, w, h * 0.3)
    ctx.fillStyle = '#000'
    ctx.font = `900 ${Math.max(8, size * 0.22)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('TNT', 0, 0)
  }

  _drawLaserGate(ctx, entity, size) {
    const w = size * 1.3
    const h = size * 0.25
    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 3
    ctx.strokeRect(-w / 2, -h / 2, w, h)
  }

  _drawGate(ctx, entity, size) {
    const pulse = 1 + Math.sin(this.gameplay.visualTime * 5 + entity.id) * 0.025
    const r = size * 0.53 * pulse
    ctx.fillStyle = `${entity.color}24`
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(1.5, size * 0.04)
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.82, 0)
    ctx.lineTo(0, r)
    ctx.lineTo(-r * 0.82, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = entity.color
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(2, size * 0.065)
    ctx.lineCap = 'round'
    if (entity.reward === 'attack') {
      ctx.beginPath()
      ctx.moveTo(0, r * 0.34)
      ctx.lineTo(0, -r * 0.34)
      ctx.moveTo(-r * 0.18, -r * 0.12)
      ctx.lineTo(0, -r * 0.34)
      ctx.lineTo(r * 0.18, -r * 0.12)
      ctx.stroke()
    } else if (entity.reward === 'rapid') {
      ctx.beginPath()
      ctx.moveTo(r * 0.12, -r * 0.38)
      ctx.lineTo(-r * 0.16, 0)
      ctx.lineTo(r * 0.08, 0)
      ctx.lineTo(-r * 0.12, r * 0.38)
      ctx.stroke()
    } else if (entity.reward === 'repair') {
      ctx.fillRect(-r * 0.08, -r * 0.34, r * 0.16, r * 0.68)
      ctx.fillRect(-r * 0.34, -r * 0.08, r * 0.68, r * 0.16)
    } else if (entity.reward === 'fever_shard') {
      const boltPulse = 1 + Math.sin(this.gameplay.visualTime * 10) * 0.1
      ctx.strokeStyle = '#fff07a'
      ctx.fillStyle = '#ffd166'
      ctx.beginPath()
      ctx.moveTo(r * 0.08 * boltPulse, -r * 0.42 * boltPulse)
      ctx.lineTo(-r * 0.22 * boltPulse, 0)
      ctx.lineTo(r * 0.06 * boltPulse, 0)
      ctx.lineTo(-r * 0.08 * boltPulse, r * 0.42 * boltPulse)
      ctx.lineTo(r * 0.24 * boltPulse, -r * 0.05 * boltPulse)
      ctx.lineTo(-r * 0.04 * boltPulse, -r * 0.05 * boltPulse)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else if (entity.reward === 'item_magnet') {
      ctx.beginPath()
      ctx.arc(0, -r * 0.1, r * 0.32, Math.PI, 0)
      ctx.lineTo(r * 0.32, r * 0.28)
      ctx.lineTo(r * 0.16, r * 0.28)
      ctx.lineTo(r * 0.16, -r * 0.1)
      ctx.arc(0, -r * 0.1, r * 0.16, 0, Math.PI, true)
      ctx.lineTo(-r * 0.16, r * 0.28)
      ctx.lineTo(-r * 0.32, r * 0.28)
      ctx.closePath()
      ctx.stroke()
    } else if (entity.reward === 'item_bullet_time') {
      ctx.beginPath()
      ctx.moveTo(-r * 0.28, -r * 0.35)
      ctx.lineTo(r * 0.28, -r * 0.35)
      ctx.lineTo(-r * 0.28, r * 0.35)
      ctx.lineTo(r * 0.28, r * 0.35)
      ctx.closePath()
      ctx.stroke()
    } else if (entity.reward === 'item_booster') {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.42)
      ctx.lineTo(r * 0.28, r * 0.32)
      ctx.lineTo(0, r * 0.15)
      ctx.lineTo(-r * 0.28, r * 0.32)
      ctx.closePath()
      ctx.stroke()
    } else if (entity.reward === 'item_drone') {
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.26, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-r * 0.4, 0)
      ctx.lineTo(r * 0.4, 0)
      ctx.moveTo(0, -r * 0.4)
      ctx.lineTo(0, r * 0.4)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.38)
      ctx.lineTo(r * 0.3, -r * 0.2)
      ctx.lineTo(r * 0.24, r * 0.2)
      ctx.quadraticCurveTo(0, r * 0.42, -r * 0.24, r * 0.2)
      ctx.lineTo(-r * 0.3, -r * 0.2)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  _drawSecondaryMutationGate(ctx, entity, size) {
    const armed = entity.depth >= entity.armedDepth
    const pulse = 1 + Math.sin(this.gameplay.visualTime * 6 + entity.id) * 0.05
    const r = size * 0.68 * pulse
    ctx.globalAlpha = armed ? 1 : 0.46
    ctx.fillStyle = 'rgba(12, 16, 28, 0.88)'
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(2, size * 0.055)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = entity.color
    ctx.fillStyle = entity.color
    ctx.lineWidth = Math.max(1.5, size * 0.05)
    if (entity.secondaryElement === 'lightning') {
      ctx.beginPath()
      ctx.moveTo(r * 0.1, -r * 0.45)
      ctx.lineTo(-r * 0.22, 0)
      ctx.lineTo(r * 0.08, 0)
      ctx.lineTo(-r * 0.1, r * 0.45)
      ctx.lineTo(r * 0.25, -r * 0.05)
      ctx.lineTo(-r * 0.02, -r * 0.05)
      ctx.closePath()
      ctx.fill()
    } else if (entity.secondaryElement === 'flame') {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.48)
      ctx.quadraticCurveTo(r * 0.42, 0, 0, r * 0.45)
      ctx.quadraticCurveTo(-r * 0.42, 0, 0, -r * 0.48)
      ctx.fill()
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45)
        ctx.stroke()
      }
    }

    ctx.font = `800 ${Math.max(9, Math.min(13, size * 0.24))}px "Segoe UI", "PingFang SC", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = armed ? '#eef5f2' : 'rgba(238, 245, 242, 0.55)'
    ctx.fillText(entity.name, 0, r + 7)
    ctx.globalAlpha = 1
  }

  _drawMutationGate(ctx, entity, size) {
    const armed = entity.depth >= entity.armedDepth
    const pulse = 1 + Math.sin(this.gameplay.visualTime * 5 + entity.id) * 0.04
    const r = size * 0.67 * pulse
    ctx.globalAlpha = armed ? 1 : 0.46
    ctx.fillStyle = 'rgba(9, 18, 24, 0.82)'
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(2, size * 0.055)
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.88, 0)
    ctx.lineTo(0, r)
    ctx.lineTo(-r * 0.88, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = entity.color
    ctx.fillStyle = entity.color
    ctx.lineWidth = Math.max(1.5, size * 0.045)
    if (entity.weaponCore === 'pierce') {
      for (const x of [-0.2, 0, 0.2]) {
        ctx.beginPath()
        ctx.moveTo(r * x, r * 0.36)
        ctx.lineTo(r * x, -r * 0.34)
        ctx.stroke()
      }
    } else if (entity.weaponCore === 'burst') {
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.14, 0, TAU)
      ctx.fill()
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * r * 0.25, Math.sin(angle) * r * 0.25)
        ctx.lineTo(Math.cos(angle) * r * 0.48, Math.sin(angle) * r * 0.48)
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.45)
      ctx.quadraticCurveTo(r * 0.42, 0, 0, r * 0.42)
      ctx.quadraticCurveTo(-r * 0.42, 0, 0, -r * 0.45)
      ctx.fill()
    }

    ctx.font = `800 ${Math.max(9, Math.min(13, size * 0.24))}px "Segoe UI", "PingFang SC", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = armed ? '#eef5f2' : 'rgba(238, 245, 242, 0.55)'
    ctx.fillText(entity.name, 0, r + 7)
    ctx.globalAlpha = 1
  }

  _drawHealth(ctx, entity, size) {
    const width = size * (entity.boss ? 1.55 : 1.05)
    const y = -size * (entity.boss ? 0.95 : 0.78)
    const ratio = clamp(entity.hp / entity.maxHp, 0, 1)
    ctx.fillStyle = 'rgba(7, 12, 17, 0.78)'
    ctx.fillRect(-width / 2, y, width, Math.max(2, size * (entity.boss ? 0.08 : 0.055)))
    ctx.fillStyle = entity.boss
      ? '#ff5544'
      : entity.kind === 'gate'
      ? entity.color
      : ratio < 0.35
      ? '#e36b59'
      : '#d5dedf'
    ctx.fillRect(-width / 2, y, width * ratio, Math.max(2, size * (entity.boss ? 0.08 : 0.055)))
    if (entity.boss) {
      ctx.fillStyle = '#ff8877'
      ctx.font = `900 ${Math.max(10, size * 0.16)}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${entity.name} [BOSS]`, 0, y - 10)
    }
  }

  _drawTarget(ctx, entity, size) {
    const alpha = 0.32 + Math.sin(this.gameplay.visualTime * 7) * 0.08
    ctx.strokeStyle = entity.kind === 'gate'
      ? `rgba(210, 240, 247, ${alpha.toFixed(3)})`
      : `rgba(239, 151, 123, ${alpha.toFixed(3)})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.72, -0.7, 0.7)
    ctx.arc(0, 0, size * 0.72, Math.PI - 0.7, Math.PI + 0.7)
    ctx.stroke()
  }

  _drawCorrosionStacks(ctx, entity, size) {
    const count = Math.min(6, entity.corrosionStacks)
    const width = (count - 1) * 5
    ctx.fillStyle = '#9bdf6a'
    for (let i = 0; i < count; i++) {
      ctx.beginPath()
      ctx.arc(-width / 2 + i * 5, size * 0.76, 1.7, 0, TAU)
      ctx.fill()
    }
  }

  _drawBullets(ctx) {
    for (const bullet of this.gameplay.bullets) {
      const point = this.project(bullet.lane, bullet.depth)
      const tail = this.project(bullet.lane, Math.min(1, bullet.depth + 0.04))
      const size = (bullet.size || 1) * (2.4 + point.scale * 2.2)
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = bullet.color || '#ffe39a'
      ctx.lineWidth = (3 + point.scale * 2) * (bullet.core === 'pierce' ? 0.72 : 1)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tail.x, tail.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = bullet.color || '#ffe39a'
      ctx.beginPath()
      if (bullet.core === 'pierce') {
        ctx.ellipse(point.x, point.y, size * 0.58, size * 1.45, 0, 0, TAU)
      } else {
        ctx.arc(point.x, point.y, size, 0, TAU)
      }
      ctx.fill()
      if (bullet.fever) {
        ctx.strokeStyle = 'rgba(255, 235, 120, 0.95)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(point.x, point.y, size * 1.6, 0, TAU)
        ctx.stroke()
      }
      if (bullet.explosive) {
        ctx.strokeStyle = 'rgba(255, 226, 170, 0.82)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(point.x, point.y, size * 1.9, 0, TAU)
        ctx.stroke()
      }
      if (bullet.core === 'corrosion') {
        ctx.fillStyle = 'rgba(215, 255, 180, 0.8)'
        ctx.beginPath()
        ctx.arc(point.x - size * 0.65, point.y + size * 0.2, size * 0.34, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.lineCap = 'butt'
  }

  _drawWorldEffects(ctx) {
    for (const ring of this.gameplay.rings) {
      const point = this.project(ring.lane, ring.depth)
      const k = 1 - ring.life / ring.maxLife
      ctx.strokeStyle = ring.color.replace('ALPHA', ((1 - k) * 0.7).toFixed(3))
      ctx.lineWidth = 2
      ctx.beginPath()
      const radiusScale = ring.radiusScale || 1
      ctx.arc(point.x, point.y, (6 + k * this.baseUnit * 0.8) * radiusScale, 0, TAU)
      ctx.stroke()
    }
    for (const particle of this.gameplay.particles) particle.render(ctx)
    for (const floatingText of this.gameplay.floatingTexts) floatingText.render(ctx)
    this._drawDamageNumbers(ctx)
  }

  _drawDamageNumbers(ctx) {
    const styles = {
      normal: { color: '#f5f2df', size: 19 },
      pierce: { color: '#79d9ee', size: 20 },
      burst: { color: '#f0b35f', size: 25 },
      corrosion: { color: '#9bdf6a', size: 20 },
      armor: { color: '#9eb5c1', size: 18 },
      shield: { color: '#70d8d3', size: 18 },
      player: { color: '#ff8877', size: 24 },
    }
    for (const number of this.gameplay.damageNumbers) {
      const style = styles[number.style] || styles.normal
      const progress = 1 - number.life / number.maxLife
      const alpha = clamp(number.life / 0.24, 0, 1)
      const scale = 1 + number.pulse * 0.12
      const rounded = Math.round(number.value * 10) / 10
      const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
      const label = number.style === 'player'
        ? `-${value}`
        : number.style === 'shield'
        ? `吸收 ${value}`
        : value
      ctx.save()
      ctx.translate(number.x, number.y - progress * 30)
      ctx.scale(scale, scale)
      ctx.globalAlpha = alpha
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `900 ${style.size}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(5, 10, 14, 0.78)'
      ctx.strokeText(label, 0, 0)
      ctx.fillStyle = style.color
      ctx.fillText(label, 0, 0)
      if (number.style === 'corrosion' && number.stacks > 0) {
        ctx.font = '800 10px "Segoe UI", "PingFang SC", sans-serif'
        ctx.fillText(`腐蚀 ×${number.stacks}`, 0, 17)
      } else if (number.style === 'armor') {
        ctx.font = '800 9px "Segoe UI", "PingFang SC", sans-serif'
        ctx.fillText('装甲减伤', 0, 15)
      }
      ctx.restore()
    }
  }

  _drawFusionWave(ctx) {
    const pulse = this.gameplay.fusionPulse
    if (pulse <= 0) return
    const progress = 1 - pulse
    const x = this.lanePositionX(this.gameplay.lanePosition)
    const y = this.playerY
    const color = this.gameplay.weaponDefinition?.color || '#83df51'
    ctx.save()
    ctx.globalAlpha = clamp(pulse * 0.58, 0, 0.58)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.ellipse(
      x,
      y - progress * this.height * 0.22,
      this.baseUnit * (1.2 + progress * 6.8),
      this.baseUnit * (0.35 + progress * 1.4),
      0,
      0,
      TAU
    )
    ctx.stroke()
    ctx.restore()
  }

  _drawPlayer(ctx) {
    const gameplay = this.gameplay
    const x = this.lanePositionX(gameplay.lanePosition)
    const y = this.playerY
    const r = this.baseUnit * 0.78
    const switching = gameplay.isSwitching
    const lean = switching ? clamp(gameplay.targetLane - gameplay.lanePosition, -1, 1) * 0.13 : 0
    const bob = Math.sin(gameplay.visualTime * 6) * 2

    ctx.save()
    ctx.translate(x, y + bob)
    ctx.rotate(lean)

    if (gameplay.isFeverActive) {
      ctx.scale(1.22, 1.22)
      const feverPulse = 1 + Math.sin(gameplay.visualTime * 12) * 0.08
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.15 * feverPulse, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (gameplay.dashTimer > 0) {
      ctx.globalAlpha = 0.28
      ctx.fillStyle = gameplay.isFeverActive ? '#fff275' : '#d8f7eb'
      for (const offset of [-0.42, -0.22]) {
        ctx.beginPath()
        ctx.ellipse(offset * r, r * 0.12, r * 0.62, r * 0.38, 0, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.58, r * 0.88, r * 0.28, 0, 0, TAU)
    ctx.fill()

    const body = ctx.createLinearGradient(0, -r, 0, r)
    if (gameplay.isFeverActive) {
      body.addColorStop(0, '#fff475')
      body.addColorStop(0.5, '#ffb703')
      body.addColorStop(1, '#fb8500')
    } else {
      body.addColorStop(0, '#a4f267')
      body.addColorStop(1, '#57ba42')
    }
    ctx.fillStyle = body
    ctx.strokeStyle = gameplay.isFeverActive
      ? '#ffe066'
      : gameplay.weaponDefinition?.color || '#2e8738'
    ctx.lineWidth = gameplay.isFeverActive ? 4 : gameplay.weaponDefinition ? 3 : 2
    ctx.beginPath()
    ctx.moveTo(-r * 0.84, r * 0.34)
    ctx.quadraticCurveTo(-r * 0.76, -r * 0.65, 0, -r * 0.72)
    ctx.quadraticCurveTo(r * 0.76, -r * 0.65, r * 0.84, r * 0.34)
    ctx.quadraticCurveTo(r * 0.4, r * 0.78, 0, r * 0.68)
    ctx.quadraticCurveTo(-r * 0.4, r * 0.78, -r * 0.84, r * 0.34)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    const face = gameplay.damageFlash > 0.4 ? 'hurt' : 'idle'
    this.assets.draw(ctx, `slime_face_${face}`, 0, -r * 0.08, r * 1.42, r * 1.42)

    if (gameplay.shield > 0 || gameplay.shieldFlash > 0) {
      const alpha = gameplay.shield > 0 ? 0.52 + gameplay.shield * 0.08 : gameplay.shieldFlash * 0.5
      ctx.strokeStyle = `rgba(112, 216, 211, ${alpha.toFixed(3)})`
      ctx.lineWidth = 2.5
      for (let layer = 0; layer < gameplay.shield; layer++) {
        ctx.beginPath()
        ctx.arc(0, 0, r * (1.03 + layer * 0.09), -Math.PI * 0.88, Math.PI * 0.16)
        ctx.stroke()
      }
      if (gameplay.shieldFlash > 0) {
        ctx.beginPath()
        ctx.moveTo(r * 0.45, -r * 0.78)
        ctx.lineTo(r * 0.2, -r * 0.5)
        ctx.lineTo(r * 0.38, -r * 0.22)
        ctx.stroke()
      }
    }

    if (gameplay.hyperBoostTimer > 0) {
      const boostPulse = 1 + Math.sin(gameplay.visualTime * 16) * 0.12
      ctx.save()
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.35 * boostPulse, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (gameplay.bulletTimeTimer > 0) {
      const btPulse = 1 + Math.sin(gameplay.visualTime * 8) * 0.06
      ctx.save()
      ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.5 * btPulse, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (gameplay.droneTimer > 0) {
      const droneX = this.lanePositionX(gameplay.droneLane) - x
      const droneY = -r * 0.4 + Math.sin(gameplay.visualTime * 10) * 6
      ctx.save()
      ctx.translate(droneX, droneY)
      ctx.fillStyle = '#ec4899'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.38, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#fbcfe8'
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(-r * 0.1, -r * 0.05, r * 0.08, 0, TAU)
      ctx.arc(r * 0.1, -r * 0.05, r * 0.08, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    if (gameplay.rapidFireTimer > 0) {
      ctx.strokeStyle = 'rgba(183, 148, 232, 0.75)'
      ctx.lineWidth = 2
      ctx.beginPath()
      const rapidRatio = Math.min(1, gameplay.rapidFireTimer / RUNNER_RAPID_DURATION)
      ctx.arc(0, 0, r * 1.05, -Math.PI / 2, -Math.PI / 2 + TAU * rapidRatio)
      ctx.stroke()
    }
    ctx.restore()
  }
}
