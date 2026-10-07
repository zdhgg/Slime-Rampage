import { AssetManager } from '../../AssetManager.js'
import { renderSlimeBody, renderSlimeFace, paintSlimeSilhouette } from '../../SlimeRenderer.js'
import {
  RUNNER_COLLISION_DEPTH,
  RUNNER_DURATION,
  RUNNER_PLAYER_DEPTH,
  RUNNER_RAPID_DURATION,
  getRunnerRouteByLane,
} from './RunnerRules.js'
import { RunnerScenery, SCROLL_DEPTH_RATE } from './RunnerScenery.js'
import { runnerSceneProfile, blendRunnerScene } from './RunnerSceneProfiles.js'

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
    // Baked scenery service (strips, gate/glow sprites, fog gradients, motes).
    this.scenery = new RunnerScenery()
    this._roadWidthAt = this.roadWidthAt.bind(this)
    this._vignette = null
    this._lastScroll = 0
    this._hudInsets = null
    this._layoutDirty = false
    this._sceneProfile = null
    this._sceneFrom = null
    this._sceneClock = -1
    this._sceneStartedAt = 0
    this._sceneProgress = 1
    this._scenePaintKey = null
  }

  get motionTime() {
    return this.gameplay.reducedMotion ? 0 : this.gameplay.visualTime
  }

  setHudInsets(insets) {
    if (!Number.isFinite(insets?.top) || !Number.isFinite(insets?.bottom)) return
    const top = Math.max(0, Math.ceil(insets.top))
    const bottom = Math.max(0, Math.ceil(insets.bottom))
    if (this._hudInsets?.top === top && this._hudInsets?.bottom === bottom) return
    this._hudInsets = { top, bottom }
    this._layoutDirty = true
    this.ensureLayout()
  }

  ensureLayout() {
    const game = this.gameplay.game
    if (!game || (!this._layoutDirty && game.width === this.width && game.height === this.height)) return
    this._layoutDirty = false
    this.width = game.width
    this.height = game.height
    this.roadBottomWidth = Math.min(this.width * 0.8, this.height * 1.36)
    this.roadTopWidth = Math.max(180, this.roadBottomWidth * 0.31)
    this.baseUnit = clamp(Math.min(this.width, this.height) * 0.055, 34, 58)
    const landscape = this.width / this.height >= 4 / 3 && this.height <= 520
    const hudTop = this._hudInsets?.top ?? (this.width <= 700 && !landscape ? 218 : 112)
    const hudBottom = this._hudInsets?.bottom ?? 96
    this.playerY = Math.min(this.height * 0.84, this.height - hudBottom - 14 - this.baseUnit)
    this.horizonY = Math.min(this.playerY - 72, Math.max(hudTop + 8, this.height * 0.155))

    const ctx = game.ctx
    this._scenePaintKey = null

    // (Re)bake the backdrop layers for this canvas size, then cache the static
    // vignette: both are size-dependent and must never be rebuilt per frame.
    this.scenery.prepare(this.width, this.height, this.gameplay.game?.dpr || 1, {
      horizonY: this.horizonY,
      roadTopWidth: this.roadTopWidth,
      playerY: this.playerY, roadBottomWidth: this.roadBottomWidth,
    }, runnerSceneProfile(this.gameplay))
    const vignette = ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.34,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72
    )
    vignette.addColorStop(0, 'rgba(3, 8, 14, 0)')
    vignette.addColorStop(0.7, 'rgba(3, 8, 14, 0.08)')
    vignette.addColorStop(1, 'rgba(3, 8, 14, 0.42)')
    this._vignette = vignette
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

  // Continue the same projection below the player plane, so the asphalt,
  // shoulders, lane markers and collision positions share a single road.
  roadHalfAtY(y) {
    const depth = Math.pow(Math.max(0, (y - this.horizonY) / Math.max(1, this.playerY - this.horizonY)), 1 / 1.48)
    return (this.roadTopWidth + (this.roadBottomWidth - this.roadTopWidth) * Math.pow(depth, 0.92)) / 2
  }

  _roadOutline(ctx) {
    ctx.beginPath()
    for (const side of [-1, 1]) for (let n = 0; n <= 24; n++) {
      const t = side === -1 ? n / 24 : 1 - n / 24
      const y = this.horizonY + t * (this.height + 28 - this.horizonY)
      const x = this.width / 2 + side * this.roadHalfAtY(y)
      if (side === -1 && n === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
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

  _syncScene(ctx) {
    const gameplay = this.gameplay
    const target = runnerSceneProfile(gameplay)
    const clock = gameplay.visualTime || 0
    const reset = !this._sceneProfile || clock < this._sceneClock || clock === 0 || this._sceneMode !== gameplay.submode
    if (reset || target !== this._sceneProfile) {
      this._sceneFrom = reset ? null : this._sceneProfile
      this._sceneProfile = target
      this._sceneStartedAt = clock
      this._sceneMode = gameplay.submode
    }
    this._sceneClock = clock
    this._sceneProgress = !this._sceneFrom || gameplay.reducedMotion ? 1 : clamp((clock - this._sceneStartedAt) / 1.2, 0, 1)
    this.scenery.prepare(this.width, this.height, gameplay.game?.dpr || 1, {
      horizonY: this.horizonY, roadTopWidth: this.roadTopWidth,
      playerY: this.playerY, roadBottomWidth: this.roadBottomWidth,
    }, target)
    this.scenery.transition = this._sceneProgress
    if (this._sceneProgress >= 1) {
      this._sceneFrom = null
      this.scenery.finishTransition()
    }
    const profile = blendRunnerScene(this._sceneFrom, target, this._sceneProgress)
    const key = `${this.width}|${this.height}|${this.horizonY}|${profile.sky}|${profile.horizon}|${profile.road}`
    if (this._scenePaintKey !== key) {
      this._scenePaintKey = key
      this._skyGradient = ctx.createLinearGradient(0, 0, 0, this.height)
      this._skyGradient.addColorStop(0, profile.sky)
      this._skyGradient.addColorStop(1, '#0b121b')
      this._roadGradient = ctx.createLinearGradient(0, this.horizonY, 0, this.height)
      this._roadGradient.addColorStop(0, profile.landmark)
      this._roadGradient.addColorStop(1, profile.road)
      this._atmosphere = ctx.createLinearGradient(0, this.horizonY * 0.35, 0, this.horizonY + 120)
      this._atmosphere.addColorStop(0, `${profile.sky}00`)
      this._atmosphere.addColorStop(1, `${profile.horizon}b0`)
    }
    return profile
  }

  render(ctx) {
    this.ensureLayout()
    const gameplay = this.gameplay
    const profile = this._syncScene(ctx)
    this._drawBackdrop(ctx, profile)

    const shake = gameplay.reducedMotion ? 0 : gameplay.shakeOffset()
    ctx.save()
    if (shake) ctx.translate(shake * 0.7, -shake * 0.35)
    this._drawRoad(ctx, profile)
    this._drawFinishLine(ctx)
    this._drawEnemyThreats(ctx)
    this._drawEntities(ctx)
    this._drawForkSigns(ctx)
    this._drawBullets(ctx)
    this._drawWorldEffects(ctx)
    this._drawFusionWave(ctx)
    this._drawPlayer(ctx)
    ctx.restore()

    // Persistent vignette focuses the eye on the play lanes; subtle enough to
    // coexist with the damage flash below.
    if (this._vignette) {
      ctx.fillStyle = this._vignette
      ctx.fillRect(0, 0, this.width, this.height)
    }

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

  _drawBackdrop(ctx, profile) {
    ctx.fillStyle = this._skyGradient
    ctx.fillRect(0, 0, this.width, this.height)

    const time = this.motionTime
    ctx.fillStyle = this._atmosphere
    ctx.fillRect(0, 0, this.width, this.horizonY + 125)

    // Far skyline: baked strip on slow parallax (no per-frame path work),
    // then fog band A blends its base into the mid-ground below.
    this.scenery.drawSkyline(ctx, this.gameplay.scrollDistance || 0)
    this.scenery.drawFogBand(ctx, 'A', profile)

    // Mid-ground towers travel in depth; lower roofs establish the bridge height.
    this.scenery.drawClusters(ctx, this.gameplay.scrollDistance || 0)
    this.scenery.drawDestination(ctx)
    // Connect the playable deck to its distant approach without changing lanes.
    ctx.fillStyle = profile.landmark
    ctx.beginPath()
    ctx.moveTo(this.width / 2 - 24, this.horizonY - 38)
    ctx.lineTo(this.width / 2 + 24, this.horizonY - 38)
    ctx.lineTo(this.width / 2 + this.roadTopWidth / 2, this.horizonY)
    ctx.lineTo(this.width / 2 - this.roadTopWidth / 2, this.horizonY)
    ctx.closePath(); ctx.fill()
    this._drawRoadBanks(ctx, profile)

    // Side landmarks provide scale and parallax. Their depth is driven by
    // the same scroll accumulator as the road markings and enemy entities.
    this._drawRoadsideLandmarks(ctx, profile)

    // Ambient motes: pooled, drift on the same scroll clock as everything
    // else, kept low-alpha and outside the road so they never mask threats.
    const scrollNow = this.gameplay.scrollDistance || 0
    this.scenery.updateMotes(scrollNow - this._lastScroll)
    this._lastScroll = scrollNow
    if (!this.gameplay.reducedMotion && profile.theme === 'rift') this.scenery.drawMotes(ctx, time, profile, this._roadWidthAt)
  }

  _drawRoadBanks(ctx, profile) {
    const cx = this.width / 2
    ctx.save()
    for (const side of [-1, 1]) {
      const bank = 12
      // Outer concrete/steel fascia continues below the deck, visibly supporting it.
      ctx.fillStyle = '#0c1729'
      ctx.beginPath()
      for (const lower of [false, true]) for (let n = 0; n <= 24; n++) {
        const t = lower ? 1 - n / 24 : n / 24
        const y = this.horizonY + t * (this.height + 28 - this.horizonY)
        const x = cx + side * (this.roadHalfAtY(y) + 18 + t * 43)
        const sy = y + (lower ? 12 + t * 70 : 0)
        if (!lower && n === 0) ctx.moveTo(x, sy)
        else ctx.lineTo(x, sy)
      }
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#25354a'
      ctx.beginPath()
      for (const outer of [false, true]) for (let n = 0; n <= 24; n++) {
        const t = outer ? 1 - n / 24 : n / 24
        const y = this.horizonY + t * (this.height + 28 - this.horizonY)
        const offset = 4 + t * bank + (outer ? 14 + t * 30 : 0)
        const x = cx + side * (this.roadHalfAtY(y) + offset)
        if (!outer && n === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = profile.accent + '75'; ctx.lineWidth = 2
      ctx.beginPath()
      for (let n = 0; n <= 24; n++) {
        const t = n / 24, y = this.horizonY + t * (this.height + 28 - this.horizonY)
        const x = cx + side * (this.roadHalfAtY(y) + 10 + t * bank)
        if (n === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  _drawRoadsideLandmarks(ctx, profile) {
    if (this._sceneFrom && this._sceneProgress < 1) {
      this._drawThemeProps(ctx, this._sceneFrom, 1 - this._sceneProgress)
      this._drawThemeProps(ctx, this._sceneProfile, this._sceneProgress)
    } else this._drawThemeProps(ctx, profile, 1)
  }

  _drawThemeProps(ctx, profile, opacity) {
    if (opacity <= 0) return
    const scroll = this.gameplay.scrollDistance || 0
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const kind = Math.floor(i / 2) % 4
      const depth = (i * 0.137 + scroll * SCROLL_DEPTH_RATE) % 1
      const y = this.depthToY(depth)
      const x = this.width / 2 + side * (this.roadWidthAt(depth) / 2 + 10 + depth * 24)
      const unit = this.baseUnit * (0.16 + depth * 0.62)
      ctx.save(); ctx.translate(x, y); ctx.scale(unit, unit)
      ctx.globalAlpha = opacity * Math.min(1, depth * 12) * (0.35 + depth * 0.6)
      ctx.lineWidth = 0.055; ctx.lineCap = 'butt'
      ctx.fillStyle = '#152237'; ctx.strokeStyle = profile.prop
      if (kind === 0) {
        // Slim, outward-facing lamps keep their arms outside the playfield.
        ctx.fillRect(-0.055, -1.75, 0.11, 1.9)
        ctx.fillStyle = profile.prop
        ctx.fillRect(-0.055, -1.75, 0.035, 1.9)
        ctx.fillRect(Math.min(0, side * 0.55), -1.75, 0.55, 0.12)
        ctx.fillStyle = profile.accent
        ctx.fillRect(Math.min(0, side * 0.5), -1.64, 0.48, 0.055)
      } else if (kind === 1) {
        // Segmented parapet reflectors, visually attached to the bridge.
        ctx.fillRect(-0.08, -0.44, 0.16, 0.57)
        ctx.fillStyle = profile.prop; ctx.fillRect(-0.08, -0.44, 0.16, 0.05)
        ctx.fillStyle = profile.accent; ctx.fillRect(-0.05, -0.37, 0.1, 0.16)
      } else if (kind === 2) {
        ctx.fillRect(-0.18, -0.5, 0.36, 0.63)
        ctx.fillStyle = profile.prop; ctx.fillRect(-0.18, -0.5, 0.36, 0.04)
        for (let n = 0; n < 3; n++) ctx.fillRect(-0.1, -0.28 + n * 0.09, 0.2, 0.02)
        ctx.fillStyle = profile.lamp; ctx.fillRect(0.07, -0.41, 0.05, 0.05)
      } else {
        ctx.fillRect(-0.04, -0.95, 0.08, 1.08)
        ctx.fillStyle = '#19293e'; ctx.fillRect(-0.24, -0.97, 0.48, 0.34)
        ctx.fillStyle = profile.sign + '95'; ctx.fillRect(-0.17, -0.9, 0.34, 0.035)
        ctx.fillRect(-0.17, -0.8, 0.2, 0.025)
      }
      ctx.restore()
    }
  }
  _drawRoad(ctx, profile) {
    // 1. Road base
    ctx.fillStyle = this._roadGradient
    this._roadOutline(ctx)
    ctx.fill()

    if (this._sceneFrom && this._sceneProgress < 1) {
      this._drawRoadMaterial(ctx, this._sceneFrom, 1 - this._sceneProgress)
      this._drawRoadMaterial(ctx, this._sceneProfile, this._sceneProgress)
    } else this._drawRoadMaterial(ctx, profile, 1)

    // 2. Object-local threat markers and the player's location ring.
    this._drawInWorldTelemetry(ctx)

    // 3. Glowing neon outer guardrails
    const railPulse = 0.24 + (this.gameplay.isFeverActive ? 0.12 : 0)
    ctx.strokeStyle = profile.accent
    ctx.globalAlpha = clamp(railPulse, 0.1, 0.42)
    ctx.lineWidth = 2
    this._roadOutline(ctx)
    ctx.stroke()
    ctx.globalAlpha = 1

    // 4. Moving lane dashed dividers
    const speedMult = this.gameplay.isFeverActive ? 1.6 : 1
    const offset = ((this.gameplay.scrollDistance || 0) * 1.55 * speedMult) % 0.14
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

  }

  _drawRoadMaterial(ctx, profile, opacity) {
    const scroll = this.gameplay.scrollDistance || 0
    const cx = this.width / 2
    ctx.save()
    ctx.globalAlpha = opacity * 0.18
    ctx.strokeStyle = profile.prop
    ctx.lineWidth = 1
    for (let n = 0; n < 9; n++) {
      const depth = ((n / 9 + scroll * SCROLL_DEPTH_RATE) % 1)
      const next = Math.min(1.04, depth + 0.075)
      const y = this.depthToY(depth), half = this.roadWidthAt(depth) / 2
      if (profile.material === 'paving' || profile.material === 'metal') {
        ctx.beginPath(); ctx.moveTo(cx - half * 0.96, y); ctx.lineTo(cx + half * 0.96, y); ctx.stroke()
        if (profile.material === 'paving') for (let tile = 0; tile < 6; tile++) {
          const lateral = (tile + (n % 2) * 0.5) / 3 - 1
          ctx.beginPath(); ctx.moveTo(cx + lateral * half, y); ctx.lineTo(cx + lateral * this.roadWidthAt(next) / 2, this.depthToY(next)); ctx.stroke()
        }
        else {
          ctx.beginPath(); ctx.moveTo(cx - half * 0.96, y + 3); ctx.lineTo(cx + half * 0.96, y + 3); ctx.stroke()
        }
      } else for (const side of [-1, 1]) {
        if (profile.material === 'asphalt') {
          ctx.lineWidth = 1 + depth * 2
          ctx.beginPath(); ctx.moveTo(cx + side * half * 0.94, y); ctx.lineTo(cx + side * this.roadWidthAt(next) * 0.47, this.depthToY(next)); ctx.stroke()
        } else {
          ctx.beginPath(); ctx.moveTo(cx + side * half * 0.98, y); ctx.lineTo(cx + side * half * 0.85, y + 4 + depth * 9); ctx.lineTo(cx + side * half * 0.9, y + 8 + depth * 15); ctx.lineTo(cx + side * half * 0.77, y + 12 + depth * 20); ctx.stroke()
        }
      }
    }
    ctx.restore()
  }

  _drawInWorldTelemetry(ctx) {
    const gameplay = this.gameplay
    for (const entity of gameplay.entities) {
      if (!entity.active || !['enemy', 'hazard', 'obstacle'].includes(entity.kind) || entity.depth < 0.2) continue
      const speed = gameplay._effectiveSpeed?.(entity) ?? entity.speed ?? 0.17
      const remaining = speed > 0 ? (RUNNER_COLLISION_DEPTH - entity.depth) / speed : Infinity
      const urgency = clamp(1 - remaining / 2.4, 0, 1)
      const imminent = remaining < 0.85
      if (imminent) this._drawDangerZone(ctx, entity.lane, entity.depth - 0.025, Math.min(1.03, entity.depth + 0.075), urgency)
      // A small bracket belongs to the object, never to the entire lane.
      const point = this.project(entity.lane, entity.depth)
      const size = this.baseUnit * point.scale * (entity.renderScale || 1)
      ctx.save()
      ctx.strokeStyle = imminent ? '#ff8174' : '#d2ad73'
      ctx.globalAlpha = 0.24 + urgency * 0.6
      ctx.lineWidth = imminent ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(point.x - size * 0.65, point.y + size * 0.25)
      ctx.lineTo(point.x - size * 0.65, point.y + size * 0.53)
      ctx.lineTo(point.x + size * 0.65, point.y + size * 0.53)
      ctx.lineTo(point.x + size * 0.65, point.y + size * 0.25)
      ctx.stroke()
      ctx.restore()
    }
    this._drawGroundFires(ctx)
    // The location ring follows the actual player during a lane change.
    const px = this.lanePositionX(gameplay.lanePosition)
    ctx.save()
    ctx.strokeStyle = gameplay.isFeverActive ? '#ffdc83' : '#96dfd6'
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(px, this.playerY + 8, this.baseUnit * 1.08, this.baseUnit * 0.38, 0, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }

  _drawDangerZone(ctx, lane, farDepth, nearDepth, urgency) {
    const far = clamp(farDepth, 0, 1.05)
    const near = clamp(nearDepth, far, 1.05)
    ctx.save()
    ctx.fillStyle = 'rgba(235, 72, 65, ' + (0.08 + urgency * 0.14).toFixed(3) + ')'
    ctx.strokeStyle = 'rgba(255, 127, 111, ' + (0.4 + urgency * 0.5).toFixed(3) + ')'
    ctx.lineWidth = 1.5 + urgency
    ctx.beginPath()
    ctx.moveTo(this.laneBoundaryX(lane, far) + 5, this.depthToY(far))
    ctx.lineTo(this.laneBoundaryX(lane + 1, far) - 5, this.depthToY(far))
    ctx.lineTo(this.laneBoundaryX(lane + 1, near) - 5, this.depthToY(near))
    ctx.lineTo(this.laneBoundaryX(lane, near) + 5, this.depthToY(near))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  _drawGroundFires(ctx) {
    for (const fire of this.gameplay.groundFires) {
      const point = this.project(fire.lane, fire.depth)
      const size = this.baseUnit * point.scale * 1.15
      const alpha = Math.min(0.5, fire.duration / 1.0)
      const pulse = 1 + Math.sin(this.motionTime * 8 + fire.id) * 0.12
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

  /**
   * 岔口路线牌：三条车道各一块，绑定固定的 lane -> route 映射。
   * 目标车道高亮，解析后由玩法层移除整行，因此本方法只负责可读性，不参与判定。
   */
  _drawForkSigns(ctx) {
    const gameplay = this.gameplay
    for (const entity of gameplay.entities) {
      if (!entity.active || entity.kind !== 'fork') continue
      const route = getRunnerRouteByLane(entity.lane)
      const point = this.project(entity.lane, entity.depth)
      const size = this.baseUnit * point.scale
      const selected = entity.lane === gameplay.targetLane

      ctx.save()
      ctx.translate(point.x, point.y)

      // 立杆
      ctx.strokeStyle = '#708894'
      ctx.lineWidth = Math.max(2, size * 0.08)
      ctx.beginPath()
      ctx.moveTo(0, size * 0.55)
      ctx.lineTo(0, -size * 0.86)
      ctx.stroke()

      // 牌面
      const w = Math.min(148, this.roadWidthAt(entity.depth) / 3 - 12)
      const stacked = w < 128
      const h = stacked ? 66 : 48
      const top = -h - size * 0.15
      ctx.fillStyle = '#0c1b26'
      ctx.fillRect(-w / 2, top, w, h)
      ctx.strokeStyle = route.color
      ctx.lineWidth = selected ? 2 : 1
      ctx.strokeRect(-w / 2, top, w, h)
      if (selected) {
        ctx.fillStyle = route.color
        ctx.fillRect(-w / 2, top, w, Math.max(2, size * 0.07))
      }

      // 主标题 + 最短风险—收益副标签：以真实机制为准，不做营销措辞
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = selected ? '#f4fcff' : '#c5d5df'
      ctx.font = '700 14px "Segoe UI", "PingFang SC", sans-serif'
      ctx.fillText(w < 76 ? route.shortLabel : route.label, 0, top + 16)
      ctx.fillStyle = '#b5cbd4'
      ctx.font = '500 12px "Segoe UI", "PingFang SC", sans-serif'
      if (stacked) {
        ctx.fillText(route.riskLabel, 0, top + 35)
        ctx.fillText(route.rewardLabel, 0, top + 52)
      } else ctx.fillText(`${route.riskLabel} · ${route.rewardLabel}`, 0, top + 34)
      ctx.restore()
    }
  }

  _drawEnemyThreats(ctx) {
    const gameplay = this.gameplay
    for (const entity of gameplay.entities) {
      if (!entity.active) continue
      if (entity.charging || entity.chargeTelegraph > 0) {
        const urgency = entity.charging ? 1 : clamp(1 - entity.chargeTelegraph / entity.chargeDelay, 0, 1)
        this._drawDangerZone(ctx, entity.lane, entity.depth, RUNNER_COLLISION_DEPTH + 0.04, urgency)
      }
      if (!entity.attacking) continue
      const progress = entity.attackDelay > 0 ? clamp(1 - entity.attackTimer / entity.attackDelay, 0, 1) : 1
      if (entity.behavior === 'archer') {
        const from = this.project(entity.lane, entity.depth)
        const target = this.project(entity.attackLane, RUNNER_COLLISION_DEPTH)
        ctx.save()
        ctx.strokeStyle = 'rgba(255, 138, 117, ' + (0.35 + progress * 0.5).toFixed(3) + ')'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 7])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.ellipse(target.x, target.y + 6, 18 + progress * 10, 8 + progress * 5, 0, 0, TAU)
        ctx.stroke()
        ctx.restore()
      } else if (entity.behavior === 'mage') {
        // The cast hits the player plane, not the full road between caster
        // and player. Each marked lane matches _detonateMageCast exactly.
        for (const lane of entity.attackLanes || []) {
          this._drawDangerZone(ctx, lane, RUNNER_COLLISION_DEPTH - 0.09, RUNNER_COLLISION_DEPTH + 0.045, progress)
          const target = this.project(lane, RUNNER_COLLISION_DEPTH)
          ctx.save()
          ctx.fillStyle = '#ffb4a5'
          ctx.font = '700 16px "Segoe UI", sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('!', target.x, target.y + 6)
          ctx.restore()
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
    let priorityTarget = null
    for (const entity of list) {
      if (entity.active && entity.kind === 'enemy' && (entity.elite || entity.boss) && (!priorityTarget || entity.depth > priorityTarget.depth)) priorityTarget = entity
    }
    this._drawSupportLinks(ctx, list)
    for (let i = list.length - 1; i >= 0; i--) {
      const entity = list[i]
      if (!entity.active || entity.kind === 'fork') continue
      const point = this.project(entity.lane, entity.depth)
      const size = this.baseUnit * point.scale * (entity.renderScale || 1)
      ctx.save()
      ctx.translate(point.x, point.y)
      ctx.fillStyle = 'rgba(1, 7, 13, 0.42)'
      ctx.beginPath()
      ctx.ellipse(0, size * 0.43, size * 0.58, size * 0.17, 0, 0, TAU)
      ctx.fill()
      if (entity.hitFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.38, entity.hitFlash * 3).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(0, 0, size * 0.67, 0, TAU)
        ctx.fill()
      }

      if (entity.kind === 'mutation') this._drawMutationGate(ctx, entity, size)
      else if (entity.kind === 'secondary_mutation') this._drawSecondaryMutationGate(ctx, entity, size)
      // D1 第三槽：复用既有变异门绘制，只换配色与图标，不引入新素材或新绘制管线
      else if (entity.kind === 'module_mutation') this._drawModuleMutationGate(ctx, entity, size)
      else if (entity.kind === 'gate') this._drawGate(ctx, entity, size)
      else if (entity.behavior === 'barrel') this._drawBarrel(ctx, entity, size)
      else if (entity.behavior === 'laser_gate') this._drawLaserGate(ctx, entity, size)
      else if (entity.kind === 'hazard' || entity.kind === 'obstacle') this._drawBarrier(ctx, entity, size)
      else this._drawEnemy(ctx, entity, size)

      const activeTarget = entity.lane === this.gameplay.occupiedLane && !this.gameplay.isSwitching
      const mutationArmed =
        (entity.kind !== 'mutation' && entity.kind !== 'secondary_mutation') ||
        entity.depth >= entity.armedDepth
      const priority = entity === priorityTarget && entity.depth > 0.28
      if (mutationArmed && (entity.hp < entity.maxHp || activeTarget || priority)) this._drawHealth(ctx, entity, size)
      if (priority && !entity.boss) {
        const label = entity.behavior === 'convoy' ? '运宝车 · 击破奖励' : entity.name
        const labelY = -size * 0.78 - 14
        ctx.font = '700 12px "Segoe UI", "PingFang SC", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const labelWidth = ctx.measureText(label).width + 14
        ctx.fillStyle = 'rgba(8, 17, 25, 0.94)'
        ctx.fillRect(-labelWidth / 2, labelY - 10, labelWidth, 20)
        ctx.fillStyle = '#f4d79c'
        ctx.fillText(label, 0, labelY)
      }
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

  _drawEnemy(ctx, entity, size) {
    if (entity.behavior === 'convoy') {
      this._drawConvoy(ctx, size)
      return
    }
    const bob = this.gameplay.reducedMotion ? 0 : Math.sin(this.gameplay.visualTime * 8 + entity.id) * size * 0.035
    ctx.translate(0, bob)
    const walkFrame = entity.hitFlash > 0 ? 4 : Math.floor(this.motionTime * 8 + entity.id) % 4
    const role = entity.type === 'carrier_boss' ? 'boss_knight'
      : entity.sprite?.replace(/^char_/, '').replace(/_\d+$/, '').replace(/^ranger$/, 'archer')
    const sprite = role ? `cyber_${role}_${walkFrame}` : null
    if (!sprite || !this.assets.draw(ctx, sprite, 0, 0, size * 1.55, size * 1.55)) {
      // Fallback enemies retain a head, torso, feet and eyes, never a coin.
      ctx.fillStyle = entity.color || '#b67e92'
      ctx.strokeStyle = '#17202d'
      ctx.lineWidth = Math.max(2, size * 0.055)
      ctx.beginPath()
      ctx.moveTo(-size * 0.3, -size * 0.22)
      ctx.lineTo(0, -size * 0.51)
      ctx.lineTo(size * 0.3, -size * 0.22)
      ctx.lineTo(size * 0.42, size * 0.25)
      ctx.lineTo(size * 0.15, size * 0.46)
      ctx.lineTo(0, size * 0.28)
      ctx.lineTo(-size * 0.15, size * 0.46)
      ctx.lineTo(-size * 0.42, size * 0.25)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#faf2e1'
      ctx.fillRect(-size * 0.19, -size * 0.16, size * 0.38, size * 0.1)
      ctx.fillStyle = '#182330'
      ctx.fillRect(-size * 0.11, -size * 0.16, size * 0.06, size * 0.1)
      ctx.fillRect(size * 0.07, -size * 0.16, size * 0.06, size * 0.1)
    }
    if (entity.elite) {
      ctx.fillStyle = '#efc584'
      ctx.beginPath()
      ctx.moveTo(-size * 0.15, -size * 0.6)
      ctx.lineTo(0, -size * 0.76)
      ctx.lineTo(size * 0.15, -size * 0.6)
      ctx.closePath()
      ctx.fill()
    }
    if (entity.behavior === 'shield') this._drawShield(ctx, size)
    else if (entity.behavior === 'support') this._drawSupportAura(ctx, size)
    else if (entity.behavior === 'split') this._drawSplitCore(ctx, size)
    else if (entity.charging) this._drawChargeStreaks(ctx, size)
    if (entity.boss) this._drawBossAura(ctx, size)
  }

  _drawConvoy(ctx, size) {
    ctx.save()
    ctx.scale(size, size)
    ctx.lineJoin = 'round'
    ctx.lineWidth = 0.055
    ctx.strokeStyle = '#17202b'
    // Four rubber wheels flank a cool steel chassis.
    for (const x of [-0.48, 0.48]) {
      for (const y of [-0.12, 0.39]) {
        ctx.fillStyle = '#17202b'
        ctx.fillRect(x - 0.105, y - 0.14, 0.21, 0.29)
        ctx.fillStyle = '#8493a2'
        ctx.fillRect(x - 0.045, y - 0.08, 0.09, 0.16)
      }
    }
    ctx.fillStyle = '#52687b'
    ctx.fillRect(-0.45, -0.23, 0.9, 0.78)
    ctx.strokeRect(-0.45, -0.23, 0.9, 0.78)
    ctx.fillStyle = '#91a8b9'
    ctx.fillRect(-0.45, 0.42, 0.9, 0.1)
    // A raised chest, bevelled lid, straps and central lock.
    ctx.fillStyle = '#b77730'
    ctx.fillRect(-0.34, -0.4, 0.68, 0.55)
    ctx.strokeRect(-0.34, -0.4, 0.68, 0.55)
    ctx.fillStyle = '#edc66c'
    ctx.beginPath()
    ctx.moveTo(-0.34, -0.4)
    ctx.lineTo(-0.23, -0.59)
    ctx.lineTo(0.23, -0.59)
    ctx.lineTo(0.34, -0.4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffe5a1'
    for (const x of [-0.23, 0.17]) ctx.fillRect(x, -0.48, 0.06, 0.59)
    ctx.fillRect(-0.065, -0.2, 0.13, 0.16)
    ctx.fillStyle = '#5b3c24'
    ctx.fillRect(-0.018, -0.16, 0.036, 0.075)
    ctx.fillStyle = '#e9f5f7'
    for (const x of [-0.33, 0.2]) ctx.fillRect(x, 0.28, 0.13, 0.085)
    ctx.restore()
  }

  _drawBossAura(ctx, size) {
    const pulse = this.gameplay.reducedMotion ? 1 : 1 + Math.sin(this.gameplay.visualTime * 6) * 0.04
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
    const pulse = 0.7 + Math.sin(this.motionTime * 5) * 0.12
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
    ctx.fillStyle = '#513d3f'
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
    const w = size * 0.76
    const h = size * 0.96
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
    body.addColorStop(0, '#7c3029')
    body.addColorStop(0.4, '#d5744b')
    body.addColorStop(1, '#8e362b')
    ctx.fillStyle = body
    ctx.strokeStyle = '#f1a477'
    ctx.lineWidth = Math.max(2, size * 0.045)
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.fillStyle = '#9b7a6e'
    ctx.fillRect(-w / 2, -h / 2, w, size * 0.09)
    ctx.fillStyle = '#24313c'
    ctx.fillRect(-w * 0.43, h / 2, w * 0.2, size * 0.13)
    ctx.fillRect(w * 0.23, h / 2, w * 0.2, size * 0.13)
    ctx.fillStyle = '#a85139'
    ctx.beginPath()
    ctx.ellipse(0, -h / 2, w / 2, h * 0.1, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#382e30'
    ctx.fillRect(-w / 2, -h * 0.32, w, h * 0.07)
    ctx.fillRect(-w / 2, h * 0.26, w, h * 0.07)
    ctx.fillStyle = '#f9dfa2'
    ctx.fillRect(-w * 0.41, -h * 0.15, w * 0.82, h * 0.3)
    ctx.fillStyle = '#472a27'
    ctx.font = '900 ' + Math.max(12, size * 0.22) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('TNT', 0, 0)
  }

  _drawLaserGate(ctx, entity, size) {
    const w = size * 1.3
    ctx.fillStyle = '#ed6d66'
    ctx.fillRect(-w / 2, -size * 0.1, w, size * 0.2)
    ctx.fillStyle = '#ffd9c4'
    ctx.fillRect(-w / 2, -size * 0.025, w, size * 0.05)
    for (const x of [-w / 2, w / 2]) {
      ctx.fillStyle = '#384c5e'
      ctx.strokeStyle = '#acbac9'
      ctx.lineWidth = Math.max(2, size * 0.045)
      ctx.fillRect(x - size * 0.1, -size * 0.4, size * 0.2, size * 0.72)
      ctx.strokeRect(x - size * 0.1, -size * 0.4, size * 0.2, size * 0.72)
      ctx.fillStyle = '#ffe3a9'
      ctx.fillRect(x - size * 0.06, -size * 0.32, size * 0.12, size * 0.07)
    }
  }

  _drawGate(ctx, entity, size) {
    const pulse = 1
    const r = size * 0.53 * pulse
    ctx.fillStyle = '#182e3b'
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
      const boltPulse = 1
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
    const pulse = 1 + Math.sin(this.motionTime * 6 + entity.id) * 0.05
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

    this._drawChoiceCaption(ctx, entity, r + 7)
  }

  _drawMutationGate(ctx, entity, size) {
    const armed = entity.depth >= entity.armedDepth
    const pulse = 1 + Math.sin(this.motionTime * 5 + entity.id) * 0.04
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

    this._drawChoiceCaption(ctx, entity, r + 7)
  }

  /**
   * D1 第三槽的 module 门。刻意复用变异门的菱形轮廓与武装态逻辑，
   * 只把内部图标换成 module 自己的标记——不新增素材、不新增绘制管线，
   * 视觉工程留给 Phase E。
   */
  _drawModuleMutationGate(ctx, entity, size) {
    const armed = entity.depth >= entity.armedDepth
    const pulse = 1 + Math.sin(this.motionTime * 4.4 + entity.id) * 0.05
    const r = size * 0.67 * pulse
    ctx.globalAlpha = armed ? 1 : 0.46
    ctx.fillStyle = 'rgba(9, 18, 24, 0.82)'
    ctx.strokeStyle = entity.color
    ctx.lineWidth = Math.max(2, size * 0.055)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU - Math.PI / 2
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = entity.color
    ctx.fillStyle = entity.color
    ctx.lineWidth = Math.max(1.5, size * 0.05)
    // 内部标记：split 两道分叉、ricochet 一个回环、amplify 一个实心菱形
    if (entity.weaponModule === 'split') {
      for (const angle of [-0.7, 0.7]) {
        ctx.beginPath()
        ctx.moveTo(0, r * 0.34)
        ctx.lineTo(Math.sin(angle) * r * 0.5, -r * 0.36)
        ctx.stroke()
      }
    } else if (entity.weaponModule === 'ricochet') {
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.34, Math.PI * 0.25, Math.PI * 1.75)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.42)
      ctx.lineTo(r * 0.34, 0)
      ctx.lineTo(0, r * 0.42)
      ctx.lineTo(-r * 0.34, 0)
      ctx.closePath()
      ctx.fill()
    }

    this._drawChoiceCaption(ctx, entity, r + 7)
  }

  _drawChoiceCaption(ctx, entity, y) {
    const laneWidth = this.roadWidthAt(entity.depth) / 3 - 12
    ctx.globalAlpha = 1
    ctx.font = '700 12px "Segoe UI", "PingFang SC", sans-serif'
    const width = Math.min(laneWidth, ctx.measureText(entity.name).width + 14)
    const lines = []
    let line = ''
    for (const character of entity.name) {
      if (line && ctx.measureText(line + character).width > width - 12) { lines.push(line); line = '' }
      line += character
    }
    if (line) lines.push(line)
    ctx.fillStyle = '#0b1a24'
    ctx.fillRect(-width / 2, y - 3, width, lines.length * 16 + 6)
    ctx.fillStyle = entity.lane === this.gameplay.targetLane ? '#f2faf7' : '#c3d4de'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    lines.forEach((text, index) => ctx.fillText(text, 0, y + index * 16))
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
      ctx.font = `800 ${Math.max(12, size * 0.16)}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${entity.name} [BOSS]`, 0, y - 10)
    }
  }

  _drawTarget(ctx, entity, size) {
    const alpha = 0.32 + Math.sin(this.motionTime * 7) * 0.08
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
      normal: { color: '#f5f2df', size: 16 },
      pierce: { color: '#79d9ee', size: 17 },
      burst: { color: '#f0b35f', size: 21 },
      corrosion: { color: '#9bdf6a', size: 16 },
      burn: { color: '#f0b35f', size: 16 },
      armor: { color: '#9eb5c1', size: 18 },
      shield: { color: '#70d8d3', size: 18 },
      player: { color: '#ff8877', size: 24 },
    }
    for (const number of this.gameplay.damageNumbers) {
      const style = styles[number.style] || styles.normal
      const progress = 1 - number.life / number.maxLife
      const alpha = clamp(number.life / 0.24, 0, 1)
      const scale = this.gameplay.reducedMotion ? 1 : 1 + number.pulse * 0.06
      const rounded = Math.round(number.value * 10) / 10
      const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
      const label = number.style === 'player'
        ? `-${value}`
        : number.style === 'shield'
        ? `吸收 ${value}`
        : value
      ctx.save()
      ctx.translate(number.x, number.y - (this.gameplay.reducedMotion ? 0 : progress * 22))
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
      if (number.style === 'armor') {
        ctx.font = '700 12px "Segoe UI", "PingFang SC", sans-serif'
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
    const bob = gameplay.reducedMotion ? 0 : Math.sin(gameplay.visualTime * 6) * 2

    ctx.save()
    ctx.translate(x, y + bob)
    ctx.rotate(lean)

    if (gameplay.isFeverActive) {
      ctx.scale(1.22, 1.22)
      const feverPulse = gameplay.reducedMotion ? 1 : 1 + Math.sin(gameplay.visualTime * 6) * 0.04
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.15 * feverPulse, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (gameplay.hyperBoostTimer > 0) {
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

    const strainId = gameplay.game?.player?.strainId || gameplay.strainId || 'origin'
    // Share the selection portrait and arena actor, including glutton's face.
    const actorRadius = r * 0.8
    renderSlimeBody(ctx, strainId, actorRadius)
    if (gameplay.isFeverActive) {
      paintSlimeSilhouette(ctx, strainId, actorRadius, { fill: 'rgba(255, 183, 3, 0.35)', stroke: '#ffe066', width: 2 })
    } else if (gameplay.weaponDefinition?.color) {
      paintSlimeSilhouette(ctx, strainId, actorRadius, { stroke: gameplay.weaponDefinition.color, width: 1.4 })
    }
    renderSlimeFace(ctx, strainId, actorRadius, { hurt: gameplay.damageFlash > 0.4 })

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

    if (gameplay.hyperBoostTimer > 0 && !gameplay.isFeverActive) {
      const boostPulse = gameplay.reducedMotion ? 1 : 1 + Math.sin(gameplay.visualTime * 6) * 0.04
      ctx.save()
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.35 * boostPulse, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (gameplay.bulletTimeTimer > 0) {
      const btPulse = 1
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
      const droneY = -r * 0.4 + (gameplay.reducedMotion ? 0 : Math.sin(gameplay.visualTime * 10) * 6)
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
