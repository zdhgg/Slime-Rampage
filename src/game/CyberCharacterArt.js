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

function paintBossVariant(ctx, role, phase, attack) {
  const sway = attack ? 0 : Math.sin(phase * TAU)
  const step = attack ? 0 : Math.sin(phase * TAU) * 0.6
  const armor = {
    boss_warden: ['#315c66', '#8dd0b1', '#d4eaa8'],
    boss_marshal: ['#4a536b', '#d5b978', '#9bc3bf'],
    boss_paladin: ['#6c2f38', '#f0a35b', '#f7d58b'],
    boss_guard: ['#433755', '#c6a4dd', '#f0d38e'],
    boss_commander: ['#5b3047', '#e7b66c', '#f3d796'],
  }[role] || ['#716683', '#ffcf80', '#fff0b0']
  const [metal, light, trim] = armor

  // Each variant owns its silhouette. The shared panel/disc primitives keep
  // the rendering language consistent while changing mass, head shape, and
  // the weapon read at a glance.
  if (role === 'boss_warden') {
    panel(ctx, [[-6, 9], [-1, 8], [2, 23], [-5, 24]], '#1c3442')
    panel(ctx, [[3, 8], [8, 8], [12, 22], [5, 23]], '#1c3442')
    panel(ctx, [[-12, -8], [7, -12], [15, 7], [6, 16], [-13, 12], [-18, 1]], metal)
    panel(ctx, [[-9, -3], [4, -7], [10, 7], [0, 12], [-11, 8]], '#25404e', light)
    panel(ctx, [[-15, -22], [0, -28], [13, -20], [8, -5], [-11, -5]], '#29434f')
    ctx.fillStyle = '#132331'; ctx.fillRect(-10, -17, 19, 4)
    ctx.fillStyle = light; ctx.fillRect(-8, -16, 15, 1.8)
    ctx.fillStyle = trim; ctx.fillRect(-2, -31, 4, 8)
    ctx.strokeStyle = light; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(18, -33); ctx.stroke()
    ctx.fillStyle = trim; ctx.beginPath(); ctx.moveTo(18, -37); ctx.lineTo(23, -29); ctx.lineTo(18, -22); ctx.lineTo(13, -29); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#142b36'; ctx.beginPath(); ctx.moveTo(-14, 7); ctx.lineTo(-27, 14); ctx.lineTo(-20, 22); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill()
    return
  }

  if (role === 'boss_marshal') {
    panel(ctx, [[-10, 5], [-2, 5], [-3, 23], [-12, 23]], '#29364d')
    panel(ctx, [[2, 5], [11, 5], [13, 22], [4, 23]], '#29364d')
    panel(ctx, [[-15, -10], [13, -10], [18, 11], [8, 18], [-11, 16], [-20, 5]], metal)
    panel(ctx, [[-10, -3], [10, -5], [11, 9], [0, 14], [-12, 9]], '#303b52', trim)
    ctx.strokeStyle = light; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-10, 1); ctx.lineTo(10, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 12); ctx.stroke()
    panel(ctx, [[-18, -25], [-8, -31], [9, -31], [18, -23], [12, -7], [-13, -7]], '#3e4c63')
    ctx.fillStyle = '#111d2f'; ctx.fillRect(-12, -20, 24, 5)
    ctx.fillStyle = light; ctx.fillRect(-10, -19, 20, 2)
    ctx.fillStyle = trim; ctx.fillRect(-16, -34, 32, 3)
    // Tower shield and short mace define the profile even when surrounded by minions.
    panel(ctx, [[-29, -6], [-18, -12], [-10, -6], [-11, 18], [-20, 25], [-29, 17]], '#22364e', light)
    ctx.fillStyle = light; ctx.fillRect(-21, -3, 3, 18)
    ctx.save(); ctx.translate(20, 8); ctx.rotate(attack ? 0.6 : 0.12 + sway * 0.04)
    ctx.fillStyle = '#4b5c73'; ctx.fillRect(-2, -18, 5, 21); ctx.fillStyle = trim; ctx.fillRect(-5, -20, 11, 4); ctx.restore()
    return
  }

  if (role === 'boss_paladin') {
    panel(ctx, [[-8, 6], [-1, 5], [-3, 23], [-12, 22]], '#42283a')
    panel(ctx, [[2, 5], [9, 6], [13, 22], [4, 23]], '#42283a')
    panel(ctx, [[-12, -10], [11, -10], [16, 9], [6, 17], [-9, 15], [-17, 5]], metal, '#301c2a')
    panel(ctx, [[-8, -4], [8, -4], [5, 10], [0, 13], [-6, 9]], '#4c2634', light)
    ctx.fillStyle = trim; ctx.fillRect(-2, -3, 4, 17); ctx.fillRect(-9, 2, 18, 4)
    panel(ctx, [[-15, -25], [-7, -32], [7, -32], [16, -24], [11, -7], [-12, -7]], '#5b2b39')
    ctx.fillStyle = '#1b1828'; ctx.fillRect(-11, -20, 22, 5); ctx.fillStyle = light; ctx.fillRect(-9, -19, 18, 2)
    // Ember crown and two-handed war hammer.
    ctx.fillStyle = trim; ctx.beginPath(); ctx.moveTo(-11, -29); ctx.lineTo(-7, -39); ctx.lineTo(0, -32); ctx.lineTo(7, -40); ctx.lineTo(11, -29); ctx.closePath(); ctx.fill()
    ctx.save(); ctx.translate(19, 3); ctx.rotate(attack ? -0.48 : -0.12 + sway * 0.04)
    ctx.fillStyle = '#6e4d4a'; ctx.fillRect(-2, -23, 4, 30); ctx.fillStyle = trim; ctx.fillRect(-10, -26, 20, 7); ctx.fillStyle = light; ctx.fillRect(-8, -29, 16, 3); ctx.restore()
    ctx.fillStyle = 'rgba(255, 164, 75, 0.78)'; ctx.beginPath(); ctx.arc(-18, -28, 2, 0, TAU); ctx.arc(23, -17, 1.5, 0, TAU); ctx.fill()
    return
  }

  if (role === 'boss_guard') {
    panel(ctx, [[-7, 7], [-1, 6], [-2, 25], [-10, 24]], '#2e2948')
    panel(ctx, [[2, 6], [8, 7], [11, 24], [4, 25]], '#2e2948')
    panel(ctx, [[-10, -12], [10, -12], [12, 15], [5, 19], [-7, 19], [-13, 12]], metal, '#271e39')
    panel(ctx, [[-6, -6], [6, -6], [8, 10], [0, 15], [-8, 10]], '#322745', light)
    ctx.strokeStyle = trim; ctx.lineWidth = 1.7; ctx.strokeRect(-5, -2, 10, 12)
    panel(ctx, [[-13, -27], [-6, -34], [7, -34], [14, -27], [10, -8], [-10, -8]], '#4a3b5d')
    ctx.fillStyle = '#17172b'; ctx.fillRect(-10, -21, 20, 5); ctx.fillStyle = light; ctx.fillRect(-8, -20, 16, 2)
    ctx.fillStyle = '#9c78bf'; ctx.beginPath(); ctx.moveTo(-4, -31); ctx.lineTo(0, -44); ctx.lineTo(4, -31); ctx.closePath(); ctx.fill()
    ctx.save(); ctx.translate(20, 1); ctx.rotate(attack ? 0.55 : 0.18 + sway * 0.04)
    ctx.fillStyle = '#6f5a7f'; ctx.fillRect(-2, -25, 4, 31); ctx.fillStyle = trim; ctx.fillRect(-10, -28, 18, 5); ctx.fillRect(4, -33, 4, 11); ctx.restore()
    return
  }

  // boss_commander: tall standard-bearing silhouette reserved for final-tier encounters.
  panel(ctx, [[-9, 8], [-2, 7], [-4, 25], [-13, 24]], '#34243e')
  panel(ctx, [[2, 7], [10, 8], [14, 24], [5, 25]], '#34243e')
  panel(ctx, [[-14, -11], [13, -11], [18, 10], [7, 18], [-10, 17], [-19, 4]], metal, '#291a2d')
  panel(ctx, [[-9, -5], [8, -5], [9, 9], [0, 14], [-10, 8]], '#47263e', light)
  ctx.fillStyle = trim; ctx.fillRect(-2, -4, 4, 17); ctx.fillRect(-10, 1, 20, 3)
  panel(ctx, [[-16, -27], [-7, -34], [8, -34], [16, -26], [11, -7], [-13, -7]], '#5f3850')
  ctx.fillStyle = '#191727'; ctx.fillRect(-12, -21, 24, 5); ctx.fillStyle = light; ctx.fillRect(-10, -20, 20, 2)
  ctx.fillStyle = trim; ctx.fillRect(-3, -39, 6, 8)
  ctx.save(); ctx.translate(20, 0); ctx.rotate(attack ? 0.35 : 0.04)
  ctx.strokeStyle = trim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(0, -43); ctx.stroke()
  ctx.fillStyle = '#8b304f'; ctx.beginPath(); ctx.moveTo(2, -39); ctx.lineTo(24, -34); ctx.lineTo(15, -20); ctx.lineTo(2, -25); ctx.closePath(); ctx.fill(); ctx.restore()
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

  if (['boss_warden', 'boss_marshal', 'boss_paladin', 'boss_guard', 'boss_commander'].includes(role)) {
    paintBossVariant(ctx, role, phase, attack)
    ctx.restore()
    return
  }

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
