import assert from 'node:assert/strict'
import { createArena, dispose, ctx2d, learn } from './test-support/arena-fixture.mjs'
import { getExpeditionBoss } from './src/game/RunRules.js'
import { BorderWarden, wardenContains } from './src/game/entities/BorderWarden.js'
import { ELEMENTAL_SKILLS } from './src/game/SpellRules.js'

function setup(role = 'glutton', distance = 100) {
  const g = createArena(role)
  g.configureRun({ mode: 'expedition', difficulty: 'normal' })
  g.mapFeatures.barricades = []
  g.mapFeatures.speedMultiplierAt = () => 1
  g.player.x = 1200; g.player.y = 900; g.player.facing = 0
  g.player.level = 4
  g.weaponSystem.damage *= 1.08 ** 3
  const b = g.enemyManager.beginExpeditionStageBoss(getExpeditionBoss('border_warden'))
  b.x = g.player.x + distance; b.y = g.player.y; b.facing = Math.PI
  return { g, b, p: g.player }
}
let checks = 0
function check(name, f) {
  const s = setup()
  try { f(s); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(s.g) }
}
const tick = (b, seconds, fps = 60) => { for (let i = 0; i < Math.ceil(seconds * fps); i++) b.update(1 / fps) }

check('仅边防官使用独立 AI；无接触暗伤，逐段锁定预警', ({ b, p }) => {
  assert.ok(b instanceof BorderWarden)
  let hits = 0; p.hit = () => hits++
  b._startSpecial()
  const c = { ...b._cast }
  b.update(.1); assert.equal(hits, 0)
  p.x = b.x; p.y = b.y + 200
  tick(b, .55)
  assert.equal(hits, 0)
  assert.equal(b._fx.angle, c.angle)
  b._renderTelegraph(ctx2d); b.render(ctx2d)
})
check('盾击接枪刺；二阶段盾击接跨步，整套有硬上限与更长收势', ({ b, p }) => {
  p.hit = () => {}
  for (const phase of [1, 2]) {
    b.phase = phase; b.x = p.x + 100; b.y = p.y
    b._startSpecial()
    assert.equal(b._cast.kind, 'shield')
    let moves = 0, previous = ''
    for (let i = 0; i < 600 && b.specialState !== 'recover'; i++) {
      if (b.specialState === 'telegraph' && previous !== 'telegraph') moves++
      previous = b.specialState; b.update(1 / 60)
    }
    assert.equal(moves, phase === 1 ? 2 : 3)
    assert.ok(b.vulnerableTimer >= (phase === 1 ? 1.7 : 2.1))
    const x = b.x; tick(b, 1); assert.equal(b.x, x)
  }
})
check('远处会冲锋；锁定后改向能脱离，不能追踪拐弯', ({ b, p }) => {
  b.x = p.x - 480; b.y = p.y; b.facing = 0
  let hits = 0; p.hit = () => hits++
  b._startSpecial(); assert.equal(b._cast.kind, 'charge')
  const c = b._cast; p.y += 160
  tick(b, 2)
  assert.equal(hits, 0); assert.equal(b.y, c.y)
  assert.equal(b.specialState, 'recover')
})
check('冲锋扫掠在 15/30/60/120 FPS 均只结算一次且不超预警端点', ({ b, p }) => {
  for (const fps of [15, 30, 60, 120]) {
    b.x = 600; b.y = 900; b.facing = 0; p.x = 900; p.y = 900
    let hits = 0; p.hit = () => hits++
    b._startSpecial(); const c = b._cast
    assert.ok(wardenContains(c, p.x, p.y))
    tick(b, 1.6, fps); assert.equal(hits, 1)
    assert.ok(b.x <= c.x + c.length + .01)
  }
})
check('场边裁剪预警与位移，判定外一像素安全', ({ b, p }) => {
  b.x = b.game.worldWidth - b.radius - 70; b.y = 900
  p.x = b.x + 400; p.y = 900
  b._startSpecial(); const c = b._cast
  assert.ok(c.length <= 70.001)
  assert.equal(wardenContains(c, c.x + c.length + 1, c.y), false)
  tick(b, 2); assert.ok(b.x <= b.game.worldWidth - b.radius)
})
check('冻结保留蓄力/破绽，减速影响追击，伙伴削弱作用于技能伤害', ({ b, p }) => {
  b._startSpecial(); const time = b.specialTimer
  b.freeze = .8; b.update(.3); assert.equal(b.specialTimer, time)
  b.freeze = 0; b.petWeakenTime = 2; b.petWeakenAmount = .25
  let damage = 0; p.hit = d => damage += d
  tick(b, .7); assert.equal(damage, 1.5)
  b._recover(); b.freeze = 1; const window = b.vulnerableTimer
  b.update(.5); assert.equal(b.vulnerableTimer, window)
})
check('半血取消旧攻击和连段，不叠加速度伤害；不额外召怪', ({ g, b, p }) => {
  b._startSpecial(); const speed = b.speed
  b.hit(b.maxHp * .51); b.update(.01)
  assert.equal(b.phase, 2); assert.equal(b._cast, null); assert.equal(b._sequence.length, 0)
  assert.equal(b.speed, speed); assert.equal(g.enemyManager.enemies.length, 1)
  let hits = 0; p.hit = () => hits++
  tick(b, .7); assert.equal(hits, 0)
})
check('连段落空后距离过大直接收势，禁止无限追击续招', ({ b, p }) => {
  b.phase = 2; b._startSpecial(); b._executeSpecial()
  p.x += 800; tick(b, .4)
  assert.equal(b.specialState, 'recover')
})

for (const fps of [15, 30, 60, 120]) for (const phase of [1, 2]) check(`${fps} FPS 阶段 ${phase}：固定方向绕圈受威胁，预警后变向可避开`, ({ b, p }) => {
  const results = []
  for (const reactive of [false, true]) {
    b.phase = phase; b.specialState = 'idle'; b.specialCd = .1; b._pursuit = 0
    b.x = 1000; b.y = 900; b._lastPlayer = null; b._velocity = { x: 0, y: 0 }
    let hits = 0, direction = 1, previous = '', angle = 0
    p.hit = () => hits++
    p.x = 1410; p.y = 900
    for (let i = 0; i < fps * 60; i++) {
      if (reactive && b.specialState === 'telegraph' && previous !== 'telegraph') direction *= -1
      previous = b.specialState
      const a = angle += direction * p.speed / 410 / fps
      p.x = 1000 + Math.cos(a) * 410; p.y = 900 + Math.sin(a) * 410
      b.update(1 / fps)
    }
    results.push(hits)
  }
  console.log('circle comparison', phase, results)
  assert.ok(results[0] > 0, 'unreactive circling must encounter attacks')
  assert.ok(results[1] < results[0], 'reading the tell must improve safety')
})

// Real player/weapon/enemy systems at ordinary Lv4 growth. Scripted movement
// measures feasibility, not human feel or a claimed win-rate balance.
const rows = []
for (const build of ['glutton', 'shadow', 'origin', 'ricochet', 'elemental:water', 'elemental:fire', 'elemental:poison', 'elemental:lightning', 'summoner']) {
  const [role, element] = build.split(':')
  for (const phase of [1, 2]) {
    const { g, b, p } = setup(role, 350)
    try {
      if (role === 'elemental') g.weaponSystem.spellCombat.start(element)
      if (element === 'poison' || element === 'fire') {
        const id = element === 'poison' ? 'spell_poison_linger' : 'spell_fire_burn'
        g.applySkill(ELEMENTAL_SKILLS.find(s => s.id === id))
      }
      if (role === 'glutton') learn(g, 'glut_bulk')
      if (role === 'shadow') learn(g, 'ass_echo')
      if (role === 'ricochet') learn(g, 'gat_multishot')
      if (role === 'summoner') learn(g, 'pet_power')
      b.phase = phase
      const originalHp = b.hp
      const melee = role === 'glutton' || role === 'shadow'
      let pressure = 0, recoveryDamage = 0, attacks = new Set(), taken = 0
      const realHit = p.hit.bind(p)
      p.hit = (d, e) => { const before = p.hp; const result = realHit(d, e); taken += Math.max(0, before - p.hp); return result }
      for (let i = 0; i < 1500 && b.active && !p.dead; i++) {
        const dt = 1 / 60, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1
        const danger = b.specialState === 'telegraph' || b.specialState === 'dash'
        const desired = melee ? (danger ? 185 : 95) : element === 'poison' ? 210 : 410
        const radial = Math.abs(d - desired) < 12 ? 0 : Math.sign(d - desired)
        let mx = dx / d * radial, my = dy / d * radial
        if (danger) { mx += -dy / d * 1.7; my += dx / d * 1.7 }
        const length = Math.hypot(mx, my) || 1
        p.x = Math.max(60, Math.min(g.worldWidth - 60, p.x + mx / length * p.speed * dt))
        p.y = Math.max(60, Math.min(g.worldHeight - 60, p.y + my / length * p.speed * dt))
        p.facing = Math.atan2(b.y - p.y, b.x - p.x)
        p.invincible = Math.max(0, p.invincible - dt)
        g.elapsed += dt; g.enemyManager.update(dt)
        if (b._cast?.kind) attacks.add(b._cast.kind)
        if (d < 260 && !melee) pressure++
        const hp = b.hp; g.weaponSystem.update(dt)
        if (b.specialState === 'recover') recoveryDamage += hp - b.hp
      }
      const dealt = originalHp - b.hp
      assert.ok(dealt > 0, `${role}/${phase} must deal damage with real weapons`)
      assert.ok(melee || element === 'poison' ? attacks.has('shield') || attacks.has('thrust') : attacks.has('charge'), `${role}/${phase} must face gap-closing`)
      if (melee) assert.ok(recoveryDamage > 0, `${role} must punish recovery`)
      rows.push({ build, phase, damage: +dealt.toFixed(1), recoveryDamage: +recoveryDamage.toFixed(1), taken, dead: p.dead, attacks: [...attacks].join('/') })
    } finally { dispose(g) }
  }
}
console.table(rows)
console.log(`Border Warden: ${checks} mechanism groups + ${rows.length} real-weapon scenarios passed`)
