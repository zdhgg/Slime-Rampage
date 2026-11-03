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

check('仅边防官使用独立 AI；无接触暗伤，简单档预警全程锁定', ({ g, b, p }) => {
  g.runProfile = { ...g.runProfile, id: 'easy' } // 简单档：完全保持原有锁定行为
  assert.ok(b instanceof BorderWarden)
  assert.equal(b._mechTier, 0)
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
check('冲锋扫掠在 15/30/60/120 FPS 直中一次+落点残留一次，且不超预警端点', ({ b, p }) => {
  for (const fps of [15, 30, 60, 120]) {
    b.x = 600; b.y = 900; b.facing = 0; p.x = 900; p.y = 900
    let hits = 0; p.hit = () => hits++
    b._startSpecial(); const c = b._cast
    assert.ok(wardenContains(c, p.x, p.y))
    tick(b, 1.6, fps)
    // 直中 1 次（扫掠单次结算）+ 落点残留 1 次（站桩在落点危险区内；桩管线不设无敌帧）
    assert.equal(hits, 2)
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
  assert.equal(b._flank, null, '阶段转换取消未兑现的二段')
  assert.equal(b.speed, speed); assert.equal(g.enemyManager.enemies.length, 1)
  let hits = 0; p.hit = () => hits++
  tick(b, .7); assert.equal(hits, 0)
})
check('连段落空后距离过大直接收势，禁止无限追击续招', ({ b, p }) => {
  b.phase = 2; b._startSpecial(); b._executeSpecial()
  p.x += 800; tick(b, .4)
  assert.equal(b.specialState, 'recover')
})

// ── 机制强化（普通档启用）：跟人走 / 封退路 / 留地面 / 压缩白打 ──
check('普通档：枪刺预警期限速跟人，出手前锁定后可脱离', ({ b, p }) => {
  b.x = p.x - 200; b.y = p.y; b.facing = 0
  let hits = 0; p.hit = () => hits++
  b._startSpecial(); assert.equal(b._cast.kind, 'thrust')
  const c = b._cast, a0 = c.angle
  p.y += 120 // 预警早期变向
  tick(b, .3)
  assert.ok(Math.abs(c.angle - a0) > .1, '跟踪窗口内角度应跟随玩家')
  while (b.specialTimer > c.lockTime + 1e-6) b.update(1 / 60)
  const locked = c.angle
  tick(b, .1)
  assert.equal(c.angle, locked, '出手前锁定后不再追')
  p.y += 200 // 锁定窗口内变向脱离
  tick(b, 1.2)
  assert.equal(hits, 0, '锁定后变向是稳定反制')
})
check('普通档：枪刺二段横扫封侧向躲法（选边/延迟/1伤害/单次）', ({ b, p }) => {
  b.x = 1000; b.y = 900; b.facing = 0; b._velocity = { x: 0, y: 0 }
  p.x = b.x + 150; p.y = b.y + 80 // 侧向躲法位置
  const c = { kind: 'thrust', x: b.x, y: b.y, angle: 0, reach: 245, spread: .25, event: { enemyAttack: true } }
  const taken = []
  p.hit = d => taken.push(d)
  b._queueFlank(c)
  assert.ok(b._flank, '普通档枪刺应有二段')
  assert.ok(b._flank.angle > c.angle, '选边指向玩家所在侧')
  tick(b, .2); assert.equal(taken.length, 0, '延迟 .26s 未兑现')
  tick(b, .1); assert.deepEqual(taken, [1], '二段 1 伤害')
  assert.equal(b._flank, null, '单次兑现')
})
check('普通档：冲锋落点残留独立兑现 1 伤害且只结算一次', ({ b, p }) => {
  b.x = p.x - 480; b.y = p.y; b.facing = 0
  b._startSpecial(); assert.equal(b._cast.kind, 'charge')
  p.y += 300 // 让开冲锋线
  while (b.specialState === 'telegraph' || b.specialState === 'dash') b.update(1 / 60)
  assert.equal(b._hazards.length, 1, '落点生成残留危险区')
  assert.equal(b._hazards[0].radius, 105, '普通档残留半径 105')
  p.x = b.x; p.y = b.y // 走进落点
  const hp0 = p.hp
  for (let i = 0; i < 60; i++) { b.update(1 / 60); p.invincible = Math.max(0, p.invincible - 1 / 60) }
  assert.equal(hp0 - p.hp, 1, '残留 1 伤害且只结算一次')
})
check('普通档：直中后落点残留被受击无敌帧挡下，不构成二连爆发', ({ b, p }) => {
  b.x = p.x - 480; b.y = p.y; b.facing = 0
  b._startSpecial(); assert.equal(b._cast.kind, 'charge')
  const hp0 = p.hp
  let sawHazard = false
  // 真实命中管线站桩吃满：直中 2 伤害，0.5s 受击无敌帧覆盖残留兑现窗口
  for (let i = 0; i < 200; i++) {
    b.update(1 / 60)
    p.invincible = Math.max(0, p.invincible - 1 / 60)
    if (b._hazards.length) sawHazard = true
  }
  assert.ok(sawHazard)
  assert.equal(hp0 - p.hp, 2, '整套冲锋最多 2 伤害，无二连')
})
check('难度分档：简单档无二段/无残留/不跟踪/白打窗口不变', ({ g, b, p }) => {
  g.runProfile = { ...g.runProfile, id: 'easy' }
  assert.equal(b._mechTier, 0)
  b._queueFlank({ kind: 'thrust', x: b.x, y: b.y, angle: 0, event: { enemyAttack: true } })
  assert.equal(b._flank, null, '简单档无二段')
  b._dropShockwave()
  assert.equal(b._hazards.length, 0, '简单档无残留')
  b._recover(); assert.equal(b.specialTimer, 2.4, '简单档一阶段收势不变')
  b.phase = 2; b._recover(); assert.equal(b.specialTimer, 2.7, '简单档二阶段收势不变')
  b.phase = 1; b.specialState = 'idle'; b.specialCd = 0; b._pursuit = 0
  p.x = b.x + 200; p.y = b.y
  b._startSpecial()
  const cast = b._cast, a0 = cast.angle
  p.y += 150; tick(b, .3)
  assert.equal(cast.angle, a0, '简单档预警不跟踪')
})
check('普通档：白打窗口压缩但保留呼吸', ({ b, p }) => {
  b._recover(); assert.equal(b.specialTimer, 2.05, '一阶段 2.4→2.05')
  b.phase = 2; b._recover(); assert.equal(b.specialTimer, 2.35, '二阶段 2.7→2.35')
  while (b.specialState === 'recover') b.update(1 / 60)
  assert.equal(b.specialCd, .4, '收势后出手间隔 .55→.4')
})
check('困难档：盾扫补后撩封贴背站位，落点残留加码', ({ g, b, p }) => {
  g.runProfile = { ...g.runProfile, id: 'hard' }
  assert.equal(b._mechTier, 2)
  p.x = b.x - 100; p.y = b.y // 贴正背后
  const taken = []
  p.hit = d => taken.push(d)
  b._queueFlank({ kind: 'shield', x: b.x, y: b.y, angle: 0, event: { enemyAttack: true } })
  assert.ok(b._flank && Math.abs(Math.abs(b._flank.angle) - Math.PI) < 1e-9, '困难档盾扫补后撩')
  tick(b, .4)
  assert.deepEqual(taken, [1], '贴背站位被后撩惩罚')
  b._dropShockwave()
  assert.equal(b._hazards[0].radius, 130, '困难档残留半径加码 130')
  assert.equal(b._hazards[0].maxLife, 1.15, '困难档残留时长加码 1.15s')
})
check('地狱档：落点残留再扩至 150 / 1.35s，收势窗口与出手冷却进一步收紧', ({ g, b }) => {
  g.runProfile = { ...g.runProfile, id: 'hell' }
  assert.equal(b._mechTier, 3)
  b._dropShockwave()
  assert.equal(b._hazards[0].radius, 150, '地狱档残留半径加码 150')
  assert.equal(b._hazards[0].maxLife, 1.35, '地狱档残留时长加码 1.35s')
  b._recover(); assert.equal(b.specialTimer, 1.9, '地狱档一阶段收势 2.4→1.9')
  b.phase = 2; b._recover(); assert.equal(b.specialTimer, 2.2, '地狱档二阶段收势 2.7→2.2')
  while (b.specialState === 'recover') b.update(1 / 60)
  assert.equal(b.specialCd, .3, '地狱档收势后出手间隔 .3')
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
      if (role === 'elemental') {
        const spells = g.weaponSystem.spellCombat
        assert.equal(spells.applyMilestone(spells.milestoneReward().options.find(o => o.element === element)), true)
      }
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
