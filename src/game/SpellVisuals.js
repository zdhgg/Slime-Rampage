import { spellColorAlpha } from './SpellPalette.js'

const TAU = Math.PI * 2
function ring(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, TAU) }

function poisonPod(ctx, x, y, size, palette) {
  ctx.save(); ctx.translate(x, y)
  ctx.globalAlpha = .95; ctx.fillStyle = palette.main; ctx.strokeStyle = palette.core; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.ellipse(0, 0, size, size * .85, -.3, 0, TAU); ctx.fill(); ctx.stroke()
  ctx.fillStyle = palette.core; ctx.globalAlpha = .85; ring(ctx, -size * .28, -size * .3, size * .22); ctx.fill()
  ctx.fillStyle = palette.accent; ctx.globalAlpha = .9; ring(ctx, size * .25, size * .15, size * .25); ctx.fill()
  ctx.restore()
}

/** Violet shadows separate the poison from grass; the rim matches its damage radius. */
function renderPoisonField(ctx, f, time, palette) {
  const age = Math.max(0, f.maxLife - f.life)
  const alpha = Math.min(1, f.life / .7, .55 + age * 3)
  const color = palette.main
  ctx.save(); ctx.translate(f.x, f.y)
  const mist = ctx.createRadialGradient(0, 0, f.radius * .12, 0, 0, f.radius)
  mist.addColorStop(0, spellColorAlpha(palette.main, .28))
  mist.addColorStop(.55, spellColorAlpha(palette.accent, .24))
  mist.addColorStop(.88, spellColorAlpha(palette.shade, .27))
  mist.addColorStop(1, spellColorAlpha(palette.shade, .06))
  ctx.globalAlpha = alpha; ctx.fillStyle = mist
  ring(ctx, 0, 0, f.radius); ctx.fill()

  // Two quiet strokes keep the footprint readable on both pale roads and dark grass.
  ctx.globalAlpha = alpha * .55; ctx.strokeStyle = palette.shade; ctx.lineWidth = 4
  ring(ctx, 0, 0, f.radius); ctx.stroke()
  ctx.globalAlpha = alpha * .65; ctx.strokeStyle = color; ctx.lineWidth = 1.5
  ctx.setLineDash([9, 5]); ctx.stroke(); ctx.setLineDash([])

  for (let i = 0; i < 8; i++) {
    const phase = time * .65 + i * 2.4, a = i * TAU / 8 + time * .12
    const distance = f.radius * (.33 + .22 * Math.sin(i * 1.7 + time * .35))
    const x = Math.cos(a) * distance, y = Math.sin(a) * distance
    const size = f.radius * (.2 + .025 * Math.sin(phase))
    ctx.globalAlpha = alpha * (.13 + .035 * Math.sin(phase)); ctx.fillStyle = i % 2 ? palette.main : palette.accent
    ctx.beginPath(); ctx.ellipse(x, y, size, size * .72, a, 0, TAU); ctx.fill()
    ctx.globalAlpha = alpha * .24; ctx.strokeStyle = color; ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(x, y, size * .72, size * .48, a, .2, 1.9); ctx.stroke()

    // Rising bubbles give a persistent motion cue without spawning particle entities.
    const rise = (time * .3 + i * .137) % 1
    ctx.globalAlpha = alpha * Math.sin(rise * Math.PI) * .65
    ctx.strokeStyle = i % 2 ? palette.core : palette.accent; ctx.lineWidth = 1.2
    ring(ctx, Math.cos(i * 2.4) * f.radius * .7, Math.sin(i * 2.4) * f.radius * .55 - rise * 16, 2 + rise * 2); ctx.stroke()
  }
  // A compact three-bubble motif identifies the lingering field as poison.
  ctx.globalAlpha = alpha * .75; ctx.fillStyle = color
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 - Math.PI / 2
    ring(ctx, Math.cos(a) * 5, Math.sin(a) * 5, 2.5); ctx.fill()
  }
  ctx.restore()
}

/** Bounded Canvas effects with stable geometry; enemy telegraphs stay visible. */
export function renderSpells(ctx, combat) {
  ctx.save()
  const poison = combat.palette('poison'), lightning = combat.palette('lightning'), current = combat.palette()
  for (const f of combat.fields) renderPoisonField(ctx, f, combat.time, poison)
  for (const [enemy, infection] of combat.contagion.infections) {
    if (!enemy.active || infection.until <= combat.time) continue
    ctx.globalAlpha = .65; ctx.fillStyle = infection.generation ? poison.accent : poison.main
    for (let i = 0; i < 3; i++) {
      ring(ctx, enemy.x - 5 + i * 5, enemy.y - enemy.radius - 5 - (i % 2) * 3, 1.8); ctx.fill()
    }
  }
  // 余烬蔓延：用跳动的小火星区别毒素气泡，传播来源用一代浅色表示。
  for (const [enemy, infection] of combat.embers.infections) {
    if (!enemy.active || infection.until <= combat.time) continue
    const fire = combat.palette('fire')
    ctx.globalAlpha = .7; ctx.fillStyle = infection.generation ? fire.accent : fire.main
    for (let i = 0; i < 3; i++) {
      const flicker = .8 + .5 * Math.sin(combat.time * 12 + i * 2.1)
      ring(ctx, enemy.x - 5 + i * 5, enemy.y - enemy.radius - 5 - (i % 2) * 3, 1.5 * flicker); ctx.fill()
    }
  }
  for (const [enemy, mark] of combat.marks) {
    if (!enemy.active) continue
    if (mark.frost > 0 && mark.frostUntil > combat.time) {
      ctx.globalAlpha = .75; ctx.fillStyle = '#94dbef'
      for (let i = 0; i < Math.min(3, mark.frost); i++) {
        const x = enemy.x - 8 + i * 8, y = enemy.y - enemy.radius - 8
        ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 2, y); ctx.closePath(); ctx.fill()
      }
    }
    if (enemy.elementStun > 0) {
      ctx.globalAlpha = .8; ctx.strokeStyle = lightning.main; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(enemy.x - 4, enemy.y - 8); ctx.lineTo(enemy.x + 3, enemy.y - 2); ctx.lineTo(enemy.x - 3, enemy.y + 3); ctx.lineTo(enemy.x + 4, enemy.y + 8); ctx.stroke()
    }
  }
  for (const s of combat.shots) {
    if (s.element === 'poison') {
      if (s.delay > 0) {
        const p = combat.player, charge = 1 - s.delay / .12
        poisonPod(ctx, p.x + Math.cos(s.angle) * p.radius * .7, p.y - p.radius * .55 + Math.sin(s.angle) * p.radius * .4, 6 + charge * 3, poison)
      } else {
        const progress = s.elapsed / s.duration
        const lift = s.lift * (1 - progress) + Math.sin(progress * Math.PI) * s.arcHeight
        ctx.save(); ctx.globalAlpha = .23; ctx.fillStyle = '#372947'
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, 9, 3.5, 0, 0, TAU); ctx.fill()
        for (let i = 3; i > 0; i--) {
          const t = Math.max(0, progress - i * .07)
          const x = s.start.x + (s.aim.x - s.start.x) * t
          const y = s.start.y + (s.aim.y - s.start.y) * t - s.lift * (1 - t) - Math.sin(t * Math.PI) * s.arcHeight
          ctx.globalAlpha = .3 - i * .055; ctx.fillStyle = i % 2 ? poison.accent : poison.main
          ring(ctx, x, y, 5 - i * .7); ctx.fill()
        }
        poisonPod(ctx, s.x, s.y - lift, 9, poison)
        ctx.restore()
      }
      continue
    }
    if (s.delay > 0) continue
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle); ctx.globalAlpha = .9
    const palette = combat.palette(s.element); ctx.fillStyle = palette.main; ctx.strokeStyle = palette.main
    if (s.element === 'fire') {
      ctx.scale((s.size || 10) / 7, (s.size || 10) / 7)
      ctx.globalAlpha = .28; ctx.beginPath(); ctx.moveTo(-26, -3); ctx.lineTo(3, -7); ctx.lineTo(7, 0); ctx.lineTo(3, 7); ctx.lineTo(-26, 3); ctx.fill()
      ctx.globalAlpha = .9; ring(ctx, 0, 0, 7); ctx.fill(); ctx.fillStyle = palette.core; ring(ctx, 2, 0, 3); ctx.fill()
      if (combat.fusion) {
        ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-1, -3); ctx.lineTo(1, 1); ctx.lineTo(4, -3); ctx.stroke()
      }
    } else if (s.shard) {
      // 碎晶比冰箭更小更短：读得出是分裂产物，也不会盖住主箭。
      ctx.scale(s.visualScale || .62, s.visualScale || .62)
      ctx.globalAlpha = .85; ctx.fillStyle = palette.main; ctx.strokeStyle = palette.core; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, -4.5); ctx.lineTo(-8, 0); ctx.lineTo(0, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.globalAlpha = .4; ctx.strokeStyle = palette.accent
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-9, 0); ctx.stroke()
    } else {
      ctx.scale(s.visualScale || 1, s.visualScale || 1)
      ctx.globalAlpha = .25; ctx.fillStyle = palette.accent
      ctx.beginPath(); ctx.moveTo(-54, -2); ctx.lineTo(-8, -6); ctx.lineTo(8, 0); ctx.lineTo(-8, 6); ctx.lineTo(-54, 2); ctx.closePath(); ctx.fill()
      ctx.globalAlpha = .95; ctx.fillStyle = palette.main; ctx.strokeStyle = palette.core; ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(0, -7); ctx.lineTo(-13, -3); ctx.lineTo(-8, 0); ctx.lineTo(-13, 3); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = palette.core; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-7, -1.5); ctx.lineTo(-2, 0); ctx.lineTo(-7, 1.5); ctx.closePath(); ctx.fill()
      ctx.globalAlpha = .65; ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.moveTo(-43, 0); ctx.lineTo(-15, 0); ctx.stroke()
      for (let i = 0; i < 3; i++) {
        const x = -20 - i * 10, y = (i % 2 ? -1 : 1) * (4 + i)
        ctx.globalAlpha = .5 - i * .1; ring(ctx, x, y, 1.7 - i * .3); ctx.fill()
      }
    }
    ctx.restore()
  }
  for (const fx of combat.effects) {
    const progress = 1 - fx.life / fx.maxLife
    const palette = combat.fusion ? current : ['bolt', 'sky-bolt', 'lightning-warning'].includes(fx.kind) ? lightning : ['poison-bloom', 'contagion'].includes(fx.kind) ? poison : combat.palette(fx.kind === 'crystal' ? 'water' : undefined)
    const color = combat.fusion ? palette.main : fx.color
    ctx.globalAlpha = (1 - progress) * .8; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
    if (fx.kind === 'contagion' || fx.kind === 'ember-spread') {
      const dx = fx.x - fx.from.x, dy = fx.y - fx.from.y
      ctx.globalAlpha = (1 - progress) * .38; ctx.strokeStyle = palette.main; ctx.lineWidth = 1.2
      ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(fx.from.x, fx.from.y - 8); ctx.lineTo(fx.x, fx.y - 8); ctx.stroke(); ctx.setLineDash([])
      // 余烬用上抛的火星表现，毒素保持单颗气泡。
      ctx.globalAlpha = (1 - progress) * .85; ctx.fillStyle = fx.kind === 'ember-spread' ? palette.accent : palette.core
      if (fx.kind === 'ember-spread') {
        for (let i = 0; i < 3; i++) ring(ctx, fx.from.x + dx * progress, fx.from.y + dy * progress - 8 - Math.sin(progress * Math.PI) * (10 + i * 4), 2.2 - i * .5)
        ctx.fill()
      } else {
        ring(ctx, fx.from.x + dx * progress, fx.from.y + dy * progress - 8 - Math.sin(progress * Math.PI) * 12, 3.5); ctx.fill()
      }
    } else if (fx.kind === 'shield-break') {
      const colors = combat.fusion ? [palette.main, palette.accent] : fx.colors?.length ? fx.colors : [color]
      ctx.globalAlpha = (1 - progress) * .8
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8, radius = fx.radius * (1 + progress * .7)
        ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, a + progress * .3, a + .25 + progress * .3); ctx.stroke()
      }
    } else if (fx.kind === 'shield-hit') {
      ctx.globalAlpha = (1 - progress) * .7; ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y - 5, fx.radius * (1 + progress * .12), fx.radius * 1.2, 0, 0, TAU); ctx.stroke()
    } else if (fx.kind === 'poison-bloom') {
      const spread = 1 - (1 - progress) ** 3, radius = fx.radius * (.15 + spread * .85)
      ctx.globalAlpha = (1 - progress) * .8; ctx.strokeStyle = palette.main; ctx.lineWidth = 2.2
      ring(ctx, fx.x, fx.y, radius); ctx.stroke()
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6, x = fx.x + Math.cos(a) * radius * .62, y = fx.y + Math.sin(a) * radius * .62 - progress * 12
        ctx.globalAlpha = (1 - progress) * .24; ctx.fillStyle = i % 2 ? palette.accent : palette.main
        ctx.beginPath(); ctx.ellipse(x, y, fx.radius * .25, fx.radius * .19, a, 0, TAU); ctx.fill()
      }
    } else if (fx.kind === 'lightning-warning') {
      ctx.globalAlpha = .35 + progress * .3; ctx.strokeStyle = palette.main; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, fx.radius, fx.radius * .45, 0, 0, TAU); ctx.stroke()
      const r = fx.radius * .6
      ctx.beginPath(); ctx.moveTo(fx.x - r, fx.y); ctx.lineTo(fx.x + r, fx.y); ctx.moveTo(fx.x, fx.y - r * .45); ctx.lineTo(fx.x, fx.y + r * .45); ctx.stroke()
      ctx.globalAlpha = .08; ctx.fillStyle = palette.main; ctx.fill()
    } else if (fx.kind === 'sky-bolt') {
      const topY = Math.min(fx.y - 90, Math.max(fx.y - fx.height, (combat.game.camera?.y || 0) - 30)), height = fx.y - topY
      ctx.globalAlpha = (1 - progress) * .95; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(fx.x - 14, topY)
      for (let i = 1; i < 7; i++) ctx.lineTo(fx.x + (i % 2 ? 10 : -8) * (1 - i / 8), topY + height * i / 7)
      ctx.lineTo(fx.x, fx.y); ctx.strokeStyle = palette.main; ctx.lineWidth = fx.strong ? 5 : 3; ctx.stroke()
      ctx.strokeStyle = palette.core; ctx.lineWidth = fx.strong ? 1.8 : 1.1; ctx.stroke()
      ctx.globalAlpha = (1 - progress) * .65; ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.7
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, fx.radius * (.5 + progress), fx.radius * (.5 + progress) * .4, 0, 0, TAU); ctx.stroke()
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'
    } else if (fx.kind === 'fusion' && fx.colors) {
      const radius = fx.radius * (.25 + progress * .75)
      const colors = [palette.main, palette.accent]
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = colors[i]; ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.arc(fx.x, fx.y, Math.max(1, radius), i * Math.PI + progress, (i + 1) * Math.PI + progress); ctx.stroke()
        ctx.fillStyle = colors[i]; ctx.globalAlpha = (1 - progress) * .1
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.arc(fx.x, fx.y, Math.max(1, radius), i * Math.PI + progress, (i + 1) * Math.PI + progress); ctx.closePath(); ctx.fill()
        ctx.globalAlpha = (1 - progress) * .8
      }
    } else if (fx.kind === 'bolt' || fx.kind === 'ember') {
      const dx = fx.x - fx.from.x, dy = fx.y - fx.from.y, length = Math.max(1, Math.hypot(dx, dy))
      ctx.beginPath(); ctx.moveTo(fx.from.x, fx.from.y)
      for (let i = 1; i < 6; i++) {
        const off = fx.kind === 'bolt' ? (i % 2 ? 1 : -1) * Math.min(10, length * .08) : 0
        ctx.lineTo(fx.from.x + dx * i / 6 - dy / length * off, fx.from.y + dy * i / 6 + dx / length * off)
      }
      ctx.lineTo(fx.x, fx.y); ctx.lineWidth = fx.body ? 3.2 : 1.7; ctx.stroke(); ctx.strokeStyle = palette.core; ctx.lineWidth = fx.body ? 1.2 : .7; ctx.stroke()
    } else if (fx.kind === 'crystal') {
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6, r = fx.radius * progress
        ctx.beginPath(); ctx.moveTo(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r)
        ctx.lineTo(fx.x + Math.cos(a) * (r + 8), fx.y + Math.sin(a) * (r + 8)); ctx.stroke()
      }
    } else {
      const radius = fx.radius * (.25 + progress * .75)
      ring(ctx, fx.x, fx.y, radius); ctx.stroke()
      ctx.globalAlpha = (1 - progress) * (fx.kind === 'core' ? .07 : .13); ctx.fill()
      if (fx.kind === 'core') { ctx.globalAlpha = (1 - progress) * .5; ring(ctx, fx.x, fx.y, radius * .7); ctx.stroke() }
    }
  }
  const p = combat.player, elements = [...combat.elements]
  if (combat.available && combat.shield.points > 0) {
    const shield = combat.shield, radius = p.radius + 8, y = p.y - p.radius * .18
    ctx.globalAlpha = .05 + shield.flash * .18; ctx.fillStyle = current.main
    ctx.beginPath(); ctx.ellipse(p.x, y, radius, radius * 1.22, 0, 0, TAU); ctx.fill()
    for (let i = 0; i < 2; i++) {
      ctx.globalAlpha = .38 + shield.flash; ctx.strokeStyle = i ? current.accent : current.main; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.ellipse(p.x, y, radius, radius * 1.22, 0, i * Math.PI + .08, (i + 1) * Math.PI - .08); ctx.stroke()
    }
    ctx.globalAlpha = .75; ctx.fillStyle = current.core
    for (let i = 0; i < Math.ceil(shield.points); i++) {
      const x = p.x - (Math.ceil(shield.points) - 1) * 4 + i * 8
      ctx.beginPath(); ctx.moveTo(x, y + radius * 1.22 - 5); ctx.lineTo(x + 2.5, y + radius * 1.22 - 2); ctx.lineTo(x, y + radius * 1.22 + 1); ctx.lineTo(x - 2.5, y + radius * 1.22 - 2); ctx.closePath(); ctx.fill()
    }
  }
  if (combat.castPulses.poison > 0) {
    const progress = 1 - combat.castPulses.poison / .3
    ctx.globalAlpha = (1 - progress) * .7; ctx.fillStyle = poison.main
    for (let i = 0; i < 3; i++) {
      ring(ctx, p.x + (i - 1) * (7 + progress * 10), p.y - p.radius * .3 - progress * 15, 3 + progress * 2); ctx.fill()
    }
  }
  if (combat.lightning.charge > 0) {
    const progress = 1 - combat.lightning.charge / .12, x = p.x, y = p.y - p.radius * .2
    ctx.globalAlpha = .4 + progress * .5; ctx.strokeStyle = lightning.main; ctx.fillStyle = lightning.core; ctx.lineWidth = 1.8
    ring(ctx, x, y, 5 + progress * 8); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(x - 13, y - 5); ctx.lineTo(x - 6, y); ctx.lineTo(x - 10, y + 5); ctx.moveTo(x + 13, y - 5); ctx.lineTo(x + 6, y); ctx.lineTo(x + 10, y + 5); ctx.stroke()
  }
  for (let i = 0; i < elements.length; i++) {
    const a = combat.time * .8 + i * Math.PI, radius = p.radius + 9, x = p.x + Math.cos(a) * radius, y = p.y + Math.sin(a) * radius
    ctx.globalAlpha = .75; ctx.fillStyle = combat.palette(elements[i]).main
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill()
    if (combat.castPulses[elements[i]] > 0) {
      ctx.globalAlpha = combat.castPulses[elements[i]] / .3 * .8; ctx.strokeStyle = combat.palette(elements[i]).main; ctx.lineWidth = 2
      ring(ctx, x, y, 6 + (1 - combat.castPulses[elements[i]] / .3) * 10); ctx.stroke()
    }
  }
  if (combat.castPulse > 0) {
    ctx.globalAlpha = combat.castPulse / .25 * .6; ctx.strokeStyle = combat.fusion ? current.main : combat.castColor; ctx.lineWidth = 1.5
    ring(ctx, p.x, p.y, p.radius + (1 - combat.castPulse / .25) * 14); ctx.stroke()
  }
  ctx.restore()
}
