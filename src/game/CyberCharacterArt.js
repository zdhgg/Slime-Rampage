// Shared, pre-baked character art. Coordinates use a 64-unit square so all
// walk/attack frames and both sprite sizes preserve the same visual anchor.
const TAU = Math.PI * 2
function panel(ctx, points, fill, stroke = '#0a1323') {
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke() }
}
function disc(ctx, x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
}

export function paintCyberCharacter(ctx, role, phase = 0, attack = false) {
  const king = role.startsWith('boss_')
  const mage = role.includes('mage') || role === 'priest'
  const ranged = role.includes('archer') || role === 'ranger'
  const heavy = king || role === 'berserker' || role === 'golem'
  const light = mage ? '#dd9afa' : ranged ? '#91edba' : king ? '#ffcf80' : '#7be3f0'
  const metal = king ? (mage ? '#766589' : ranged ? '#64867f' : '#716683') : heavy ? '#778499' : '#8babc3'
  const swing = attack ? 0 : Math.sin(phase * TAU)
  ctx.save()
  ctx.translate(0, attack ? -1 : swing * 0.7)

  if (role === 'hound') {
    // Mechanical hound: four articulated legs, sensor snout and a dorsal pack.
    for (const side of [-1, 1]) for (const leg of [-1, 1]) {
      const x = side * 12, y = leg > 0 ? 12 : 5
      panel(ctx, [[x - 3, y - 6], [x + 3, y - 6], [x + 4 + swing * leg, y + 7], [x - 4 + swing * leg, y + 7]], '#43566b')
      ctx.fillStyle = light; ctx.fillRect(x - 2 + swing * leg, y + 4, 4, 2)
    }
    panel(ctx, [[-15, -8], [9, -8], [19, 0], [13, 12], [-13, 11], [-20, 1]], '#738aa3')
    panel(ctx, [[-9, -15], [10, -15], [15, -5], [9, 4], [-11, 3], [-16, -5]], '#a1b4c6')
    panel(ctx, [[-12, -12], [-15, -23], [-4, -15]], '#52657b')
    panel(ctx, [[6, -15], [15, -23], [14, -10]], '#52657b')
    ctx.fillStyle = '#152033'; ctx.fillRect(-11, -9, 23, 6)
    ctx.fillStyle = '#f09792'; ctx.fillRect(-8, -8, 6, 2); ctx.fillRect(4, -8, 6, 2)
    panel(ctx, [[-5, -2], [6, -2], [9, 4], [-7, 4]], '#34465e')
    ctx.restore(); return
  }
  if (role === 'wraith') {
    // A fractured drone replaces the robed apparition in the cyber districts.
    panel(ctx, [[0, -22], [15, -6], [10, 12], [0, 20], [-10, 12], [-15, -6]], '#506888')
    panel(ctx, [[0, -17], [8, -4], [0, 7], [-8, -4]], light)
    for (const s of [-1, 1]) panel(ctx, [[s * 15, -5], [s * 24, 1], [s * 19, 13], [s * 14, 7]], '#354d69')
    ctx.fillStyle = '#cba8ef'; ctx.fillRect(-3, 20, 6, 4)
    ctx.restore(); return
  }

  if (king || mage) {
    // Segmented coat/back armor. It reads as royal regalia without fabric trim.
    panel(ctx, [[-13, -8], [13, -8], [23, 21], [9, 18], [0, 22], [-22, 21]], king ? '#342744' : '#30304e')
    ctx.strokeStyle = light + '90'; ctx.lineWidth = 1
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 12, 0); ctx.lineTo(s * 18, 16); ctx.stroke()
    }
  }
  // Hydraulics, kneepads and broad magnetic boots.
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * 6, 9); ctx.rotate(s * swing * 0.09)
    panel(ctx, [[-4, -2], [4, -2], [4, 11], [-4, 11]], '#34485e')
    panel(ctx, [[-4, 0], [4, 0], [3, 6], [-3, 6]], metal)
    panel(ctx, [[-4, 9], [4, 9], [6, 14], [-5, 14]], '#26364d')
    ctx.fillStyle = light; ctx.fillRect(-3, 10, 6, 1.3)
    ctx.restore()
  }
  panel(ctx, [[-11, -8], [11, -8], [13, 3], [8, 13], [-8, 13], [-13, 3]], metal)
  panel(ctx, [[-9, -5], [0, -1], [9, -5], [7, 7], [0, 11], [-7, 7]], '#34485e')
  ctx.fillStyle = '#15253a'; ctx.fillRect(-7, 10, 14, 3)
  panel(ctx, [[0, -3], [4, 1], [0, 6], [-4, 1]], light, null)
  ctx.fillStyle = '#edfbff'; ctx.fillRect(-1, 0, 2, 3)
  for (const s of [-1, 1]) {
    const shoulder = heavy ? 21 : 17
    panel(ctx, [[s * 8, -8], [s * (shoulder - 2), -10], [s * shoulder, -2], [s * 13, 1]], metal)
    ctx.fillStyle = light; ctx.fillRect(s < 0 ? -shoulder + 3 : 12, -6, 5, 1.5)
    panel(ctx, [[s * 12, 0], [s * 17, 0], [s * 17, 10], [s * 12, 11]], '#3e546b')
  }
  // Oversized, angular helmet; visor is a single unmistakable luminous slit.
  panel(ctx, [[-11, -21], [-6, -26], [7, -26], [12, -20], [11, -8], [6, -5], [-7, -5], [-12, -10]], metal)
  panel(ctx, [[-9, -19], [9, -19], [10, -12], [5, -9], [-6, -9], [-10, -12]], '#101c30')
  ctx.fillStyle = light + '50'; ctx.fillRect(-10, -18, 20, 5)
  ctx.fillStyle = light; ctx.fillRect(-9, -17, 18, 2.2)
  ctx.fillStyle = '#efffff'; ctx.fillRect(-7, -17, 6, 1)
  ctx.fillStyle = '#b9cbdb'; ctx.fillRect(-7, -24, 10, 1.5)
  ctx.fillStyle = '#4c617b'; ctx.fillRect(-14, -18, 3, 8); ctx.fillRect(12, -18, 3, 8)
  if (king) {
    // Three exposed mechanical prongs, gold rails and a magenta power jewel.
    panel(ctx, [[-12, -24], [-14, -32], [-6, -27], [0, -34], [6, -27], [14, -32], [12, -24]], '#d9b777')
    ctx.fillStyle = '#fff0b0'; ctx.fillRect(-10, -25, 20, 2)
    disc(ctx, 0, -28, 2, '#fa9dcd')
  } else if (mage) {
    // Sensor halo, broken at the front so it reads as a mounted device.
    ctx.strokeStyle = light; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.ellipse(0, -28, 14, 3, 0, Math.PI * 1.1, Math.PI * 2.9); ctx.stroke()
  } else if (ranged) {
    ctx.fillStyle = '#45614f'; ctx.fillRect(-11, -26, 22, 4)
    ctx.fillStyle = light; ctx.fillRect(8, -16, 6, 3)
  } else {
    ctx.fillStyle = '#526b85'; ctx.fillRect(-13, -29, 2, 11)
    ctx.fillStyle = light; ctx.fillRect(-13, -29, 2, 2)
  }

  if (mage) {
    ctx.fillStyle = '#35445c'; ctx.fillRect(20, -20, 3, 40)
    panel(ctx, [[21, -27], [28, -19], [21, -10], [14, -19]], '#5a587a')
    disc(ctx, 21, -19, attack ? 5 : 3.8, light)
    disc(ctx, 21, -19, 1.5, '#ffffff')
  } else if (ranged) {
    // Compact rail crossbow, retaining the ranged unit's horizontal silhouette.
    panel(ctx, [[5, 0], [25, 0], [25, 5], [15, 5], [11, 12], [7, 10]], '#344b60')
    ctx.strokeStyle = metal; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(18, -6); ctx.lineTo(23, 2); ctx.lineTo(18, 10); ctx.stroke()
    ctx.fillStyle = light; ctx.fillRect(14, 1, 12, 1.5)
  } else {
    // Arm-mounted hexagonal riot shield and a contained plasma blade.
    panel(ctx, [[-24, -3], [-16, -7], [-9, -3], [-10, 11], [-17, 17], [-24, 11]], '#253d59')
    panel(ctx, [[-22, -2], [-16, -5], [-11, -2], [-12, 10], [-17, 14], [-22, 10]], '#437088', light)
    ctx.fillStyle = light; ctx.fillRect(-18, -1, 2, 10)
    ctx.save(); ctx.translate(18, 3); ctx.rotate(attack ? 0.45 : 0.06)
    panel(ctx, [[-2, 1], [-2, -21], [1, -27], [4, -21], [4, 1]], '#416278')
    ctx.fillStyle = light; ctx.fillRect(-0.3, -20, 2.3, 21)
    ctx.fillStyle = '#e2ffff'; ctx.fillRect(0.3, -21, 0.7, 20)
    ctx.fillStyle = metal; ctx.fillRect(-5, 0, 12, 3)
    ctx.fillStyle = '#213149'; ctx.fillRect(-1, 3, 4, 6)
    ctx.restore()
  }
  ctx.restore()
}
