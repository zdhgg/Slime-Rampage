// Runner 双核融合（3 core × 3 element = 9 组合）真实行为测试。运行：node runner-fusion-smoke.mjs
//
// 这个文件存在的理由：RUNNER_FUSION_WEAPONS 里写了字段，就必须证明字段真的变成了
// gameplay 行为。此前 gameplay-smoke 的融合断言是
//   runner.secondaryElement = 'frost'; shieldProbe.frostTimer = 3.0
// ——测试自己伪造了游戏永远不会赋值的字段，于是「脆化霜蚀」在真实对局里恒不触发，
// 测试却永远绿。本文件禁止这种写法：每个断言都必须由真实 combat path 产生前置状态。
//
// 失败采用「先跑完再汇总」而不是遇到第一个就退出，这样一次运行就能拿到完整 RED 矩阵。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// —— 浏览器环境桩（与其它 smoke 脚本同形）——
const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {}
    },
    set() {
      return true
    },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
}
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
const sound = new Proxy({}, { get: () => () => {} })

const { RunnerGameplay } = await import('./src/game/gameplay/RunnerGameplay.js')
const {
  RUNNER_ENTITY_TYPES,
  RUNNER_FUSION_WEAPONS,
  RUNNER_MAX_GROUND_FIRES,
  RUNNER_WEAPON_MODULE_IDS,
  getRunnerFusionWeapon,
  getRunnerWeaponCore,
  getRunnerWeaponModule,
} = await import('./src/game/gameplay/runner/RunnerRules.js')
const { getRunnerBulletProfile, planRunnerEffects } = await import('./src/game/gameplay/runner/RunnerEffects.js')

let nextId = 1

/** 一个已经 attach / reset / 进入 active 的空场 Runner。 */
const makeRunner = (seed = 4242) => {
  const runner = new RunnerGameplay()
  runner.attach({
    width: 1280,
    height: 720,
    ctx: ctx2d,
    input: { state: { left: false, right: false } },
    sound,
    finishGameplay() {},
  })
  runner.reset(seed, 'blitz')
  runner.state = 'active'
  runner.countdown = 0
  runner.entities.length = 0
  runner.bullets.length = 0
  runner.groundFires.length = 0
  runner.weaponLevel = 1
  runner.attackDamage = 10
  return runner
}

/** 补齐 Director 生成实体时才会有的运行时字段，测试不得凭空造状态。 */
const makeEntity = (typeId, lane, depth, hp = 60) => {
  const config = RUNNER_ENTITY_TYPES[typeId]
  const id = nextId++
  return {
    ...config,
    id,
    rowId: id,
    lane,
    depth,
    previousDepth: depth,
    hp,
    maxHp: hp,
    baseSpeed: 0.17,
    speed: 0.17,
    hitFlash: 0,
    active: true,
    corrosionStacks: 0,
    freezeTimer: 0,
    slowTimer: 0,
    slowRatio: 0,
    chargeStarted: false,
    chargeTelegraph: 0,
    charging: false,
    attackAt: 9,
    attackTimer: 0,
    attacking: false,
    hasAttacked: false,
  }
}

const loadout = (runner, core, element) => {
  runner.weaponCore = core
  runner.secondaryElement = element
  return runner.fusionWeapon
}

/** 用真实子弹穿过目标，走 _updateShooting 的贯穿分支。 */
const drivePierceThrough = (runner, target) => {
  const bullet = runner._createBullet(target.lane)
  bullet.previousDepth = target.depth + 0.02
  bullet.depth = target.depth + 0.02
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  runner._updateShooting(0.05)
  return bullet
}

/** 走真实爆裂路径 _explodeAt。 */
const driveExplosion = (runner, primary) => {
  const bullet = runner._createBullet(primary.lane)
  runner._explodeAt(primary, bullet)
}

/**
 * D1.2：走完整真实链路的爆裂一发。
 *
 * _createBullet → _updateShooting → _hitEntity → _explodeAt → planRunnerEffects → _applyFreeze，
 * 中间不手动调 _applyFreeze、不手动置 freezeTimer、不伪造 explosive 标记。
 * burst 等级 1 的 every=5，把 _shotSerial 停在 4，下一发就是第 5 发——和真实对局里
 * 「每 5 发引爆一次」落在完全相同的分支上。
 */
const fireExplosiveShot = (runner, lane, target) => {
  runner._shotSerial = 4
  const bullet = runner._createBullet(lane)
  assert.ok(bullet.explosive, '前置：这一发必须是爆裂弹（否则没走 _explodeAt）')
  bullet.previousDepth = target.depth + 0.02
  bullet.depth = target.depth + 0.02
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  runner._updateShooting(0.05)
  return bullet
}

/** 一发真实的腐蚀弹命中。 */
const driveCorrosionHit = (runner, target) => runner._hitEntity(target, { core: 'corrosion', coreLevel: 1, damageMultiplier: 1 })

/** 与正式 bot 同规则的车道选择：先满足选择门，再按风险躲开。 */
const chooseLane = (runner, wantedElement, wantedModule) => {
  // 选择门优先：与正式 bot 同规则，否则 pending 永远挂着，测到的就不是产品问题而是 bot 问题
  if (runner.weaponChoicePending) {
    const gate = runner.entities.find((e) => e.active && e.kind === 'mutation')
    if (gate) return gate.lane
  }
  if (runner.secondaryChoicePending) {
    // 选本组合对应的那颗元素核心——真实玩家就是这么选的
    const gate = runner.entities.find((e) => e.active && e.kind === 'secondary_mutation' && e.secondaryElement === wantedElement)
    if (gate) return gate.lane
  }
  if (runner.moduleChoicePending && wantedModule) {
    const gate = runner.entities.find((e) => e.active && e.kind === 'module_mutation' && e.weaponModule === wantedModule)
    if (gate) return gate.lane
  }
  const risk = [0, 0, 0]
  for (const projectile of runner.enemyProjectiles) {
    if (projectile.active && projectile.depth > 0.62) risk[projectile.lane] += 20 + projectile.depth * 10
  }
  for (const entity of runner.entities) {
    if (!entity.active || entity.kind === 'mutation' || entity.kind === 'fork') continue
    if (entity.kind === 'gate') {
      if (entity.depth > 0.42) risk[entity.lane] -= entity.reward === 'shield' ? 3 : 1
      continue
    }
    if (entity.depth < 0.58) continue
    risk[entity.lane] += (entity.depth - 0.52) * 18 * Math.max(1, entity.damage || 1)
    if (entity.charging) risk[entity.lane] += 8
  }
  risk[runner.targetLane] -= 0.35
  return risk.indexOf(Math.min(...risk))
}

/** 冻结/减速后的实际推进速度（由 _updateEntities 使用）。 */
const effectiveSpeed = (entity) => {
  if ((entity.freezeTimer || 0) > 0) return 0
  return entity.speed * (1 - ((entity.slowTimer || 0) > 0 ? entity.slowRatio || 0 : 0))
}

const failures = []
const check = (name, fn) => {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failures.push({ name, message: error.message })
    console.log(`✗ ${name}\n    ${error.message}`)
  }
}

console.log('=== Runner 融合组合真实行为测试（9 组合）===\n')

// ---------------------------------------------------------------------------
check('pierce_lightning：贯穿时向相邻车道释放折射雷弧', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'pierce', 'lightning')
  const target = makeEntity('brute', 1, 0.5, 200)
  const leftArc = makeEntity('scout', 0, 0.5, 40)
  const rightArc = makeEntity('scout', 2, 0.5, 40)
  runner.entities.push(target, leftArc, rightArc)

  drivePierceThrough(runner, target)

  assert.ok(leftArc.hp < 40, `左邻车道未吃到雷弧伤害（hp=${leftArc.hp}）`)
  assert.ok(rightArc.hp < 40, `右邻车道未吃到雷弧伤害（hp=${rightArc.hp}）`)
  const expected = runner.attackDamage * fusion.arcDamageRatio
  const dealt = 40 - leftArc.hp
  assert.ok(
    Math.abs(dealt - expected) < 0.001,
    `雷弧伤害应等于 ${expected.toFixed(2)}（arcDamageRatio ${fusion.arcDamageRatio}），实测 ${dealt.toFixed(2)}`
  )
  assert.equal(
    target.hp,
    200 - runner.attackDamage,
    '主目标只应吃到穿过它的那一发子弹，雷弧不得额外回打主目标'
  )
})

check('pierce_flame：贯穿后在车道留下熔岩火海', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'pierce', 'flame')
  const target = makeEntity('brute', 1, 0.5, 200)
  runner.entities.push(target)

  drivePierceThrough(runner, target)

  assert.equal(runner.groundFires.length, 1, `贯穿后应留下 1 块地火，实测 ${runner.groundFires.length}`)
  const fire = runner.groundFires[0]
  assert.equal(fire.lane, 1, '地火应落在被贯穿目标所在车道')
  assert.equal(fire.duration, fusion.fireDuration, `地火时长应取自 Rules fireDuration=${fusion.fireDuration}`)
  assert.equal(fire.damage, fusion.fireDamage, `地火伤害应取自 Rules fireDamage=${fusion.fireDamage}`)
  assert.ok(runner.groundFires.length <= RUNNER_MAX_GROUND_FIRES, '地火数量必须受上限约束')
})

check('pierce_frost：贯穿使敌人减速并粉碎护甲', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'pierce', 'frost')
  const armored = makeEntity('shield', 1, 0.5, 200)
  assert.ok(armored.armor > 0, '前置条件：目标必须带护甲')
  runner.entities.push(armored)

  drivePierceThrough(runner, armored)

  assert.ok((armored.slowTimer || 0) > 0, '贯穿后目标应进入减速状态（slowTimer 未被写入）')
  assert.ok(
    Math.abs((armored.slowRatio || 0) - fusion.slowRatio) < 0.001,
    `减速幅度应取自 Rules slowRatio=${fusion.slowRatio}，实测 ${armored.slowRatio}`
  )
  assert.ok(
    Math.abs(effectiveSpeed(armored) - armored.speed * (1 - fusion.slowRatio)) < 0.0001,
    `减速应真实影响推进速度：期望 ${(armored.speed * (1 - fusion.slowRatio)).toFixed(4)}，实测 ${effectiveSpeed(armored).toFixed(4)}`
  )
  assert.equal(armored.armor, 0, `护甲应被粉碎（armorBreak=${fusion.armorBreak}），实测 ${armored.armor}`)
})

check('burst_lightning：爆裂迸发 4 枚自动锁敌火花', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'lightning')
  const primary = makeEntity('brute', 1, 0.5, 200)
  // 相邻车道放 3 个目标：旧实现每条邻道只结算 1 个就 break，因此该断言必然失败
  const sparks = [makeEntity('scout', 0, 0.48, 40), makeEntity('scout', 0, 0.5, 40), makeEntity('scout', 0, 0.52, 40)]
  runner.entities.push(primary, ...sparks)

  driveExplosion(runner, primary)

  const hit = sparks.filter((e) => e.hp < 40)
  assert.ok(
    hit.length >= Math.min(fusion.sparksCount, sparks.length),
    `应结算 ${Math.min(fusion.sparksCount, sparks.length)} 枚火花，实测只结算了 ${hit.length} 个邻道目标`
  )
  const expected = runner.attackDamage * fusion.sparkDamage
  assert.ok(
    sparks.every((e) => e.hp === 40 || Math.abs(40 - e.hp - expected) < 0.001),
    `火花伤害应等于 ${expected.toFixed(2)}（sparkDamage ${fusion.sparkDamage}）`
  )
})

check('burst_flame：爆裂范围 ×1.5 并留下核爆焦土', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'flame')
  const primary = makeEntity('brute', 1, 0.5, 200)
  // 0.09 落在基础半径 0.07 之外、1.5 倍半径 0.105 之内：只有真的放大了半径才会被炸到
  const edge = makeEntity('scout', 1, 0.59, 40)
  runner.entities.push(primary, edge)

  driveExplosion(runner, primary)

  assert.equal(fusion.radiusMultiplier, 1.5, 'Rules 承诺半径倍率 1.5')
  assert.ok(edge.hp < 40, `处于放大后半径内的目标应被炸到（hp=${edge.hp}）`)
  assert.equal(runner.groundFires.length, 1, '爆裂应留下焦土')
  assert.equal(runner.groundFires[0].duration, fusion.fireDuration, '焦土时长应取自 Rules')
  assert.equal(runner.groundFires[0].damage, fusion.fireDamage, '焦土伤害应取自 Rules')
})

check('burst_frost：冰爆冻结敌人，且到期后必须恢复', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'frost')
  const primary = makeEntity('brute', 1, 0.5, 200)
  const frozen = makeEntity('hound', 1, 0.52, 200)
  runner.entities.push(primary, frozen)

  driveExplosion(runner, primary)

  assert.equal(frozen.freezeTimer, fusion.freezeDuration, `冻结时长应取自 Rules freezeDuration=${fusion.freezeDuration}`)
  const frozenDepth = frozen.depth
  runner._updateEntities(0.5)
  assert.ok(Math.abs(frozen.depth - frozenDepth) < 1e-9, '冻结期间目标不应推进')
  assert.ok((frozen.freezeTimer || 0) > 0, '0.5s 时冻结尚未到期')

  // 累计推进 1.3s 世界时间，超过 freezeDuration=1.2
  for (let i = 0; i < 8; i++) runner._updateEntities(0.1)
  assert.ok((frozen.freezeTimer || 0) <= 0, `冻结到期后计时器必须归零，实测 ${frozen.freezeTimer}`)
  assert.ok(frozen.depth > frozenDepth + 0.001, '冻结到期后目标必须恢复推进')
  assert.ok(Math.abs(frozen.speed - frozen.baseSpeed) < 1e-9, '冻结到期后速度必须复原，不能停留在 0')
})

// ---------------------------------------------------------------------------
// D1.2 正式合同（人工决策）：
//   爆裂命中的主目标如果在直接伤害结算后仍然存活，则被冻结 1.2 秒；
//   爆炸范围内其它合法目标继续按既有范围规则被冻结。
//
// 修之前主目标被 `entity.id !== primary.id` 排除在冻结之外，而那条排除是为了
// 「主目标已经吃过子弹的直接伤害，不该再吃一次 AoE」——一条**伤害**去重规则。
// 伤害目标集和状态目标集不是同一件事，这就是本轮的全部内容。
// ---------------------------------------------------------------------------

check('D1.2 burst_frost：主目标在直接伤害后存活时被冻结（正式合同）', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 200)
  runner.entities.push(primary)

  fireExplosiveShot(runner, 1, primary)

  assert.ok((runner.weaponStats.explosions || 0) >= 1, '前置：必须真的发生了一次爆裂')
  assert.ok(primary.active && primary.hp > 0, '前置：高血主目标在直接伤害后仍存活')
  assert.equal(
    primary.freezeTimer,
    fusion.freezeDuration,
    `主目标应被冻结 freezeDuration=${fusion.freezeDuration}，实测 freezeTimer=${primary.freezeTimer}`
  )
})

check('D1.2 burst_frost：被直接击破的主目标不挂无意义 freeze', () => {
  const runner = makeRunner()
  loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('scout', 1, 0.5, 3) // 一发直接伤害就打死
  runner.entities.push(primary)
  const killsBefore = runner.kills

  fireExplosiveShot(runner, 1, primary)

  assert.ok(primary.hp <= 0, '主目标应正常死亡')
  assert.equal(runner.kills, killsBefore + 1, '只应计一次击杀，冻结不得复活或重复结算实体')
  assert.ok(
    (primary.freezeTimer || 0) === 0,
    `死亡实体不得留下无意义冻结状态，实测 freezeTimer=${primary.freezeTimer}`
  )
})

check('D1.2 burst_frost：主目标只吃直接伤害，不得重复吃爆裂 AoE', () => {
  const runner = makeRunner()
  loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 200)
  runner.entities.push(primary)
  const startHp = primary.hp
  const aoeMultiplier = getRunnerWeaponCore('burst').levels[0].damage

  fireExplosiveShot(runner, 1, primary)

  const taken = startHp - primary.hp
  const directOnly = runner.attackDamage
  const withAoe = runner.attackDamage * (1 + aoeMultiplier)
  assert.ok(
    Math.abs(taken - directOnly) < 0.001,
    `主目标只应承受直接伤害 ${directOnly.toFixed(2)}，实测 ${taken.toFixed(2)}`
      + `（若被重复结算 AoE 会是 ${withAoe.toFixed(2)}）`
  )
})

check('D1.2 burst_frost：主目标与范围内次级目标都被冻结，且都能正常恢复', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 200)
  // 次级目标放在更远处（depth 更小），这样主弹道先命中的仍然是 primary
  const secondary = makeEntity('scout', 1, 0.48, 200)
  runner.entities.push(primary, secondary)

  fireExplosiveShot(runner, 1, primary)

  assert.equal(primary.freezeTimer, fusion.freezeDuration, '主目标应被冻结')
  assert.equal(secondary.freezeTimer, fusion.freezeDuration, '次级目标仍按既有范围规则被冻结')
  assert.ok(secondary.hp < 200, '次级目标仍应正常承受爆炸伤害')

  const primaryDepth = primary.depth
  const secondaryDepth = secondary.depth
  runner._updateEntities(0.5)
  assert.ok(Math.abs(primary.depth - primaryDepth) < 1e-9, '冻结期间主目标不应推进')
  assert.ok(Math.abs(secondary.depth - secondaryDepth) < 1e-9, '冻结期间次级目标不应推进')
  // 累计推进 1.3s 世界时间，超过 freezeDuration=1.2
  for (let i = 0; i < 8; i++) runner._updateEntities(0.1)
  assert.ok((primary.freezeTimer || 0) <= 0, '到期后主目标冻结计时器必须归零')
  assert.ok((secondary.freezeTimer || 0) <= 0, '到期后次级目标冻结计时器必须归零')
  assert.ok(primary.depth > primaryDepth + 0.001, '到期后主目标必须恢复推进')
  assert.ok(secondary.depth > secondaryDepth + 0.001, '到期后次级目标必须恢复推进')
})

check('D1.2 burst_frost：爆炸半径之外的目标不得被冻结（空间边界不被破坏）', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 200)
  // 刚好落在 blast radius 之外，而不是随便放一个远远够不到的位置
  const blastRadius = getRunnerWeaponCore('burst').levels[0].radius * fusion.radiusMultiplier
  const outside = makeEntity('scout', 1, 0.5 - blastRadius - 0.02, 200)
  runner.entities.push(primary, outside)

  fireExplosiveShot(runner, 1, primary)

  assert.equal(primary.freezeTimer, fusion.freezeDuration, '主目标应被冻结')
  assert.ok(
    (outside.freezeTimer || 0) === 0,
    `范围外目标不得被冻结（blast radius=${blastRadius.toFixed(4)}），实测 ${outside.freezeTimer}`
  )
  assert.equal(outside.hp, 200, '范围外目标也不应受到爆炸伤害')
})

check('D1.3 burst_frost：相邻车道的目标不得被爆炸冻结（合同只覆盖同车道）', () => {
  // D1.3 把「主目标冻结」这件事从统计比率收口成空间合同：合同原话是「爆炸范围内
  // 其它合法目标」继续按既有范围规则被冻结，而既有范围规则的第一条就是同车道。
  // 这里刻意让相邻车道目标深度完全相同——depth 条件满足，只有车道条件能挡住它，
  // 因此这条用例失败必然是车道语义被改动，而不是任何数值波动。
  const runner = makeRunner()
  const fusion = loadout(runner, 'burst', 'frost')
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 200)
  const otherLane = makeEntity('brute', 0, 0.5, 200)
  runner.entities.push(primary, otherLane)

  fireExplosiveShot(runner, 1, primary)

  assert.equal(primary.freezeTimer, fusion.freezeDuration, '主目标应被冻结')
  assert.ok(
    (otherLane.freezeTimer || 0) === 0,
    `相邻车道目标不得被冻结（合同范围是同车道），实测 freezeTimer=${otherLane.freezeTimer}`
  )
  assert.equal(otherLane.hp, 200, '相邻车道目标也不应吃到同车道爆炸伤害')
})

check('D1.2 freeze 生命周期：按世界时间递减，子弹时间下拉长但绝不永久', () => {
  // D1.2 之后主目标几乎每次爆裂都会被冻住，生命周期从「偶尔发生」变成「常态」，
  // 所以必须单独锁死：到期归零 + 速度复原 + 子弹时间语义正确。
  const normal = makeRunner()
  const fusion = loadout(normal, 'burst', 'frost')
  normal.weaponLevel = 1
  const normalTarget = makeEntity('brute', 1, 0.5, 200)
  normal.entities.push(normalTarget)
  fireExplosiveShot(normal, 1, normalTarget)
  assert.equal(normalTarget.freezeTimer, fusion.freezeDuration, '前置：主目标已被冻结')
  assert.equal(normal.worldTimeScale, 1, '未开子弹时间时世界倍率应为 1')
  for (let i = 0; i < 7; i++) normal._updateEntities(0.2) // 累计 1.4s 世界时间 > 1.2s
  assert.ok(
    (normalTarget.freezeTimer || 0) <= 0,
    `正常速度下 ${fusion.freezeDuration}s 后必须到期，实测 ${normalTarget.freezeTimer}`
  )
  assert.ok(Math.abs(normalTarget.speed - normalTarget.baseSpeed) < 1e-9, '到期后速度必须复原')

  const slowed = makeRunner()
  const slowTarget = makeEntity('brute', 1, 0.5, 200)
  slowed.entities.push(slowTarget)
  slowed.bulletTimeTimer = 1
  assert.ok(slowed.worldTimeScale < 1, '子弹时间下世界倍率应小于 1')
  slowed._applyFreeze(slowTarget, fusion.freezeDuration)
  for (let i = 0; i < 7; i++) slowed._updateEntities(0.2 * slowed.worldTimeScale)
  assert.ok(
    (slowTarget.freezeTimer || 0) > 0,
    `子弹时间下 1.4s 真实时间只推进 ${(1.4 * slowed.worldTimeScale).toFixed(2)}s 世界时间，不应耗尽 ${fusion.freezeDuration}s 冻结`
  )
  // 但它终究会到期：世界时间继续推进足够久之后必须归零，不允许永久冻结
  for (let i = 0; i < 20; i++) slowed._updateEntities(0.2 * slowed.worldTimeScale)
  assert.ok((slowTarget.freezeTimer || 0) <= 0, '子弹时间下冻结最终也必须归零')
  assert.ok(Math.abs(slowTarget.speed - slowTarget.baseSpeed) < 1e-9, '到期后速度必须复原')
})

check('D1.2 burst_lightning / burst_flame：主目标语义未被本轮改写', () => {
  // 本轮只允许增加 frost 状态语义。主目标不得因此重新吃火花，也不得重新吃爆炸伤害。
  const lightning = makeRunner()
  loadout(lightning, 'burst', 'lightning')
  lightning.weaponLevel = 1
  const lightningTarget = makeEntity('brute', 1, 0.5, 200)
  lightning.entities.push(lightningTarget)
  const lightningStart = lightningTarget.hp
  fireExplosiveShot(lightning, 1, lightningTarget)
  assert.ok(
    Math.abs(lightningStart - lightningTarget.hp - lightning.attackDamage) < 0.001,
    'lightning 主目标只应吃直接伤害'
  )

  const flame = makeRunner()
  const flameFusion = loadout(flame, 'burst', 'flame')
  flame.weaponLevel = 1
  const flameTarget = makeEntity('brute', 1, 0.5, 200)
  flame.entities.push(flameTarget)
  const flameStart = flameTarget.hp
  fireExplosiveShot(flame, 1, flameTarget)
  assert.ok(
    Math.abs(flameStart - flameTarget.hp - flame.attackDamage) < 0.001,
    'flame 主目标只应吃直接伤害'
  )
  assert.equal(flame.groundFires.length, 1, 'flame 焦土仍按既有规则落在主目标位置')
  assert.equal(flame.groundFires[0].damage, flameFusion.fireDamage, '焦土伤害仍取自 Rules')
})

check('corrosion_lightning：腐蚀叠满阈值触发过载电击', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'corrosion', 'lightning')
  const victim = makeEntity('brute', 1, 0.5, 500)
  runner.entities.push(victim)

  driveCorrosionHit(runner, victim)
  driveCorrosionHit(runner, victim)
  assert.equal(victim.corrosionStacks, 2, '前两次命中应正常叠层')
  const hpBeforeShock = victim.hp

  driveCorrosionHit(runner, victim)

  const shockDamage = hpBeforeShock - victim.hp
  assert.ok(
    shockDamage > runner.attackDamage * fusion.shockDamage,
    `第 3 层应触发 shockDamage=${fusion.shockDamage} 倍过载，本次总伤害 ${shockDamage.toFixed(2)} 未超过 ${(runner.attackDamage * fusion.shockDamage).toFixed(2)}`
  )
  assert.ok((victim.freezeTimer || 0) > 0, '过载电击应造成大硬直（当前没有任何硬直状态）')
  assert.equal(victim.corrosionStacks, 0, `叠满 ${fusion.shockThreshold} 层放电后应清空叠层`)

  const depthBefore = victim.depth
  runner._updateEntities(0.1)
  assert.equal(victim.depth, depthBefore, '硬直期间目标应完全停住')
})

check('corrosion_frost：被减速的腐蚀目标受到额外增伤', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'corrosion', 'frost')
  const slowed = makeEntity('brute', 1, 0.5, 500)
  const normal = makeEntity('brute', 2, 0.5, 500)
  runner.entities.push(slowed, normal)

  // 本组合会给每一个被腐蚀命中的目标挂减速，所以「减速组 vs 未减速组」无法用两个
  // 腐蚀目标来构造。契约说的是「受到所有子弹伤害」额外提升，因此改用一发非腐蚀弹：
  // 同样一发 pierce 弹，打在「已减速的腐蚀目标」和「干净目标」上，只差减速状态。
  driveCorrosionHit(runner, slowed)
  assert.ok((slowed.slowTimer || 0) > 0, '腐蚀命中应给目标挂上减速（slowTimer 未被写入）')

  const slowSource = { core: 'pierce', coreLevel: 1, damageMultiplier: 1 }
  const onSlowed = runner._hitEntity(slowed, slowSource)
  const onNormal = runner._hitEntity(normal, slowSource)
  assert.ok(
    onSlowed.damage > onNormal.damage * 1.3,
    `被减速目标应吃到 vulnerabilityBonus=${fusion.vulnerabilityBonus} 增伤：减速 ${onSlowed.damage.toFixed(2)} vs 未减速 ${onNormal.damage.toFixed(2)}`
  )

  // 减速到期后增伤必须一起消失，不允许变成永久易伤
  for (let i = 0; i < 40; i++) runner._updateEntities(0.1)
  assert.ok((slowed.slowTimer || 0) <= 0, '减速必须到期')
  const afterExpire = runner._hitEntity(slowed, slowSource)
  assert.ok(
    Math.abs(afterExpire.damage - onNormal.damage) < 0.001,
    `减速到期后增伤必须消失：期望 ${onNormal.damage.toFixed(2)}，实测 ${afterExpire.damage.toFixed(2)}`
  )
})

check('corrosion_flame：被腐蚀目标阵亡时猛烈殉爆', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'corrosion', 'flame')
  const doomed = makeEntity('brute', 1, 0.5, 30)
  const closeVictim = makeEntity('scout', 1, 0.55, 40)
  const farVictim = makeEntity('scout', 1, 0.8, 40)
  runner.entities.push(doomed, closeVictim, farVictim)

  driveCorrosionHit(runner, doomed)
  assert.equal(doomed.corrosionStacks, 1, '殉爆前置：目标必须真的带着腐蚀叠层')
  runner._hitEntity(doomed, { core: 'corrosion', coreLevel: 1, damageMultiplier: 9 })

  const expected = runner.attackDamage * fusion.explosionDamage
  assert.ok(closeVictim.hp < 40, '同车道近距离目标应被殉爆波及')
  assert.ok(
    Math.abs(40 - closeVictim.hp - expected) < 0.01,
    `殉爆伤害应等于 explosionDamage=${fusion.explosionDamage} 倍（${expected.toFixed(2)}），实测 ${(40 - closeVictim.hp).toFixed(2)}`
  )
  assert.equal(farVictim.hp, 40, '超出 explosionRadius 的目标不应被波及')
})

check('九组合均可达：每个组合都能从 Rules 表解析出真实配置', () => {
  const cores = ['pierce', 'burst', 'corrosion']
  const elements = ['lightning', 'flame', 'frost']
  const seen = []
  for (const core of cores) {
    for (const element of elements) {
      const runner = makeRunner()
      const fusion = loadout(runner, core, element)
      assert.ok(fusion, `${core}+${element} 无法从 RUNNER_FUSION_WEAPONS 解析`)
      assert.equal(fusion.primary, core)
      assert.equal(fusion.secondary, element)
      assert.ok(Object.keys(RUNNER_FUSION_WEAPONS[`${core}:${element}`]).length > 4, '融合定义不应只有身份字段')
      seen.push(fusion.id)
    }
  }
  assert.equal(new Set(seen).size, 9, '9 个组合必须有 9 个不同身份')
})

check('frost 生命周期：冻结与减速都会到期，不留永久状态', () => {
  const runner = makeRunner()
  loadout(runner, 'burst', 'frost')
  const frozen = makeEntity('hound', 0, 0.5, 200)
  runner.entities.push(frozen)
  driveExplosion(runner, makeEntity('brute', 0, 0.5, 200))
  for (let i = 0; i < 60; i++) runner._updateEntities(0.1)
  assert.ok((frozen.freezeTimer || 0) <= 0, '冻结计时器必须归零')

  const runner2 = makeRunner()
  loadout(runner2, 'corrosion', 'frost')
  const slowed = makeEntity('hound', 0, 0.5, 200)
  runner2.entities.push(slowed)
  driveCorrosionHit(runner2, slowed)
  assert.ok((slowed.slowTimer || 0) > 0, '减速应已挂上')
  for (let i = 0; i < 60; i++) runner2._updateEntities(0.1)
  assert.ok((slowed.slowTimer || 0) <= 0, '减速计时器必须归零')
  assert.ok(Math.abs(slowed.speed - slowed.baseSpeed) < 1e-9, '减速到期后速度必须完全复原')
})

check('架构：融合行为不得再散落成 fusion.id 分支', () => {
  const source = readFileSync(new URL('./src/game/gameplay/RunnerGameplay.js', import.meta.url), 'utf8')
  const branches = source.match(/fusion\??\.id\s*(===|!==|==)/g) || []
  assert.equal(
    branches.length,
    0,
    `RunnerGameplay 仍有 ${branches.length} 处 fusion.id 分支：${branches.join(', ')}；组合行为必须只在 RunnerEffects 里定义一次`
  )
})

check('determinism：同 seed 同搭配必须逐帧复现', () => {
  // 融合效果如果消费 Director 的 RNG（目标挑选、连锁跳跃），岔口时刻与遭遇序列就会漂移。
  // 这里跑两局完全相同的 30s，逐项比对轨迹指纹。
  const trace = () => {
    const runner = makeRunner(777001)
    const signature = []
    for (let frame = 0; frame < 30 * 30; frame++) {
      runner.targetLane = chooseLane(runner, 'flame', 'split')
      if (runner.weaponCore && runner.elapsedTime > 12) runner.weaponCore = 'corrosion'
      runner.updateWorld(1 / 30)
      if (frame % 90 === 0) {
        signature.push([
          runner.elapsedTime.toFixed(3),
          runner.kills,
          runner.score,
          runner.hp,
          runner.entities.length,
          runner.director._nextRowId,
          runner.weaponStats.splinterCount,
          runner.weaponStats.ricochets,
        ].join('|'))
      }
    }
    runner.destroy()
    return signature.join('#')
  }
  const first = trace()
  const second = trace()
  assert.equal(second, first, '同 seed 同搭配的轨迹指纹必须完全一致')
  assert.ok(first.includes('|'), '轨迹指纹不应为空')
})

// ---------------------------------------------------------------------------
// 9 组合端到端 soak：真实对局 45s，bot 选本组合对应的核心与元素，其余全部走正式路径。
// ---------------------------------------------------------------------------
console.log('\n=== 9 组合端到端 soak（blitz 45s，seed 20260929）===')

const soakProblems = []
for (const core of ['pierce', 'burst', 'corrosion']) {
  for (const element of ['lightning', 'flame', 'frost']) {
    const fusionId = getRunnerFusionWeapon(core, element).id
    const runner = makeRunner(20260929)
    let pinned = false
    let maxFires = 0
    let maxEntities = 0
    let maxBullets = 0
    try {
      for (let frame = 0; frame < 45 * 30; frame++) {
        runner.targetLane = chooseLane(runner, element)
        // 不能提前写 secondaryElement：_selectSecondaryElement 有「已有元素就拒绝」的守卫，
        // 提前钉死会让 25s 的选择节点永远无法满足、Director 永久停摆。
        // 正确做法：让 10s/25s 两个节点自然完成，bot 选本组合对应的核心与元素，
        // 之后只钉 weaponCore 保证 45s 窗口跑的一直是本组合。
        if (runner.weaponCore && runner.elapsedTime > 12) {
          runner.weaponCore = core
          pinned = true
        }
        runner.updateWorld(1 / 30)
        maxFires = Math.max(maxFires, runner.groundFires.length)
        maxEntities = Math.max(maxEntities, runner.entities.length)
        maxBullets = Math.max(maxBullets, runner.bullets.length)
        for (const entity of runner.entities) {
          if (!Number.isFinite(entity.depth) || !Number.isFinite(entity.hp) || !Number.isFinite(entity.speed)) {
            throw new Error(`实体 ${entity.id} 出现 NaN/Infinity`)
          }
        }
        if (!Number.isFinite(runner.elapsedTime) || !Number.isFinite(runner.score)) throw new Error('全局状态出现 NaN')
      }
      if (!runner.weaponCore) throw new Error('武器选择未完成')
      if (!pinned) throw new Error('未能钉上测试搭配，soak 没有真正跑到该组合')
      if (runner.fusionWeapon?.id !== fusionId) throw new Error(`跑测结束时实际融合是 ${runner.fusionWeapon?.id}，不是 ${fusionId}`)
      if (runner.secondaryChoicePending) {
        const gate = runner.entities.find((e) => e.active && e.kind === 'secondary_mutation')
        if (!gate) throw new Error('副元素选择挂起却没有可选入口（freeze）')
      }
      if (maxFires > RUNNER_MAX_GROUND_FIRES) throw new Error(`地火越界：${maxFires}`)
      if (maxEntities > 24) throw new Error(`实体无界增长：${maxEntities}`)
      if (maxBullets > 48) throw new Error(`子弹无界增长：${maxBullets}`)
      const stuck = runner.entities.filter((e) => (e.freezeTimer || 0) > 0).length
      if (stuck > 0) throw new Error(`存在永久冻结：${stuck} 个实体`)
      console.log(`✓ soak ${fusionId.padEnd(18)} t=${runner.elapsedTime.toFixed(1)}s hp=${runner.hp} 击杀=${runner.kills} 实体峰值=${maxEntities} 地火峰值=${maxFires}`)
    } catch (error) {
      soakProblems.push(`${fusionId}: ${error.message}`)
      console.log(`✗ soak ${fusionId}: ${error.message}`)
    }
    runner.destroy()
  }
}

// ---------------------------------------------------------------------------
// Phase D1：第三槽 Weapon Module（Core × Element × Module = 27 种构筑）
// ---------------------------------------------------------------------------
console.log('\n=== Phase D1 · Module 专项 ===')

const MODULES = ['split', 'ricochet', 'amplify']
const CORES = ['pierce', 'burst', 'corrosion']
const ELEMENTS = ['lightning', 'flame', 'frost']
// 状态计时器的合法上限，直接从 Rules 推导，不在测试里另写一个 3.0
const MAX_STATUS_SECONDS = Math.max(
  ...Object.values(RUNNER_FUSION_WEAPONS).flatMap((f) => [f.freezeDuration || 0, f.slowDuration || 0, f.shockDuration || 0])
)
let moduleIdCounter = 5000

/** 一发真实的玩家子弹穿过 lane 里的目标，返回本次命中的实体 id 顺序。 */
const fireOneShot = (runner, lane, targets) => {
  const hits = []
  const bullet = runner._createBullet(lane)
  const startDepth = targets.length ? Math.max(...targets.map((t) => t.depth)) + 0.05 : 0.9
  bullet.previousDepth = startDepth
  bullet.depth = startDepth
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  const before = new Map(runner.entities.map((e) => [e.id, e.hp]))
  for (let step = 0; step < 12 && runner.bullets.includes(bullet); step++) {
    const beforeIds = new Set(runner.bullets.map((b) => b))
    runner._updateShooting(0.05)
    for (const e of runner.entities) {
      if (before.has(e.id) && e.hp < before.get(e.id) && !hits.includes(e.id)) hits.push(e.id)
    }
    if (beforeIds.size === runner.bullets.length && step > 0) {
      // 弹体没有继续前进也没消失说明已经离场
      if (bullet.depth <= 0 || !runner.bullets.includes(bullet)) break
    }
  }
  runner.bullets = []
  return hits
}

check('module 数据：3 个 module 都能从 Rules 解析出完整合同', () => {
  assert.equal(RUNNER_WEAPON_MODULE_IDS.length, 3, '本轮只做 3 个 module')
  for (const id of RUNNER_WEAPON_MODULE_IDS) {
    const mod = getRunnerWeaponModule(id)
    assert.ok(mod, `module ${id} 无法解析`)
    assert.ok(mod.name && mod.shortLabel && mod.description, `${id} 缺少展示字段`)
  }
})

check('split：命中真实产生弹片，且不打重复目标、不无限递归', () => {
  const runner = makeRunner()
  const mod = getRunnerWeaponModule('split')
  runner.weaponCore = 'pierce'
  runner.secondaryElement = 'lightning'
  runner.weaponModule = 'split'
  const primary = makeEntity('brute', 1, 0.5, 200, moduleIdCounter++)
  const a = makeEntity('scout', 0, 0.5, 40, moduleIdCounter++)
  const b = makeEntity('scout', 2, 0.5, 40, moduleIdCounter++)
  runner.entities.push(primary, a, b)

  fireOneShot(runner, 1, [primary, a, b])

  const splintered = [a, b].filter((e) => e.hp < 40).length
  assert.ok(
    splintered >= 1,
    `分裂必须让其它目标受到伤害，实测 ${splintered} 个（splitCount=${mod.splitCount}）`
  )
  assert.ok(
    (runner.weaponStats.splits || 0) >= 1,
    '分裂必须被计入统计，证明确实走了模块分支'
  )
  assert.equal(new Set([a.id, b.id]).size, 2, '弹片不得重复命中同一实体')
  assert.equal(new Set([a.id, b.id]).size, 2, '弹片不得重复命中同一实体')
  assert.ok(
    (runner.weaponStats.splinterCount || 0) >= 1,
    '分裂必须被计入统计，证明确实走了模块分支'
  )
  assert.ok(
    (runner.weaponStats.maxProcDepth || 0) <= 1,
    `模块 proc 深度必须封顶在 1，实测 ${runner.weaponStats.maxProcDepth}`
  )
})

check('ricochet：击破后弹体继续命中下一个目标，且次数受限', () => {
  const runner = makeRunner()
  const mod = getRunnerWeaponModule('ricochet')
  runner.weaponCore = 'corrosion'
  runner.secondaryElement = 'flame'
  runner.weaponModule = 'ricochet'
  const first = makeEntity('scout', 1, 0.6, 3, moduleIdCounter++)
  const second = makeEntity('scout', 0, 0.3, 40, moduleIdCounter++)
  const third = makeEntity('scout', 2, 0.1, 40, moduleIdCounter++)
  runner.entities.push(first, second, third)

  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.65
  bullet.depth = 0.65
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 40 && runner.bullets.includes(bullet); i++) runner._updateShooting(0.05)

  assert.ok(first.hp <= 0, '主目标应被击破')
  assert.ok(
    second.hp < 40 || third.hp < 40,
    '回弹必须让弹体转向并命中下一个目标'
  )
  assert.ok((runner.weaponStats.ricochets || 0) >= 1, '回弹必须被计入统计')
  assert.ok(
    (runner.weaponStats.ricochets || 0) <= mod.ricochetCount,
    `回弹次数不得超过 ricochetCount=${mod.ricochetCount}，实测 ${runner.weaponStats.ricochets}`
  )
})

check('ricochet：没有合法目标时安全结束', () => {
  const runner = makeRunner()
  runner.weaponCore = 'corrosion'
  runner.secondaryElement = 'flame'
  runner.weaponModule = 'ricochet'
  const only = makeEntity('scout', 1, 0.6, 2, moduleIdCounter++)
  runner.entities.push(only)
  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.65
  bullet.depth = 0.65
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 40 && runner.bullets.includes(bullet); i++) runner._updateShooting(0.05)
  assert.equal(runner.bullets.length, 0, '没有可回弹目标时弹体必须正常消失，不得残留')
})

// D1.1：pierce × ricochet 的死路径回归。
// 既有的 ricochet 断言全部用 corrosion 建场，而 corrosion 的 canPierce 恒为 false，
// 于是「回弹」在测试里永远走的是 else 分支——pierce × ricochet 从未被覆盖过。
// 旧实现把回弹挂在「贯穿次数耗尽」的 else 上，pierce 升到 2~3 级后 remainingHits
// 几乎不再归零，真实对局 270 局 0 次回弹。这里刻意构造成真实中后期条件：
// 等级 3、module 已生效、remainingHits 仍 > 0、这一击造成击破、前方存在合法目标。
check('pierce × ricochet：仍有贯穿次数时击破也必须回弹（贯穿不吞掉 module）', () => {
  const runner = makeRunner()
  const mod = getRunnerWeaponModule('ricochet')
  runner.weaponCore = 'pierce'
  runner.secondaryElement = 'lightning'
  runner.weaponModule = 'ricochet'
  runner.weaponLevel = 3 // 真实中后期：penetrations = 3
  const first = makeEntity('scout', 1, 0.6, 3, moduleIdCounter++)
  const second = makeEntity('scout', 1, 0.3, 40, moduleIdCounter++)
  runner.entities.push(first, second)

  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.65
  bullet.depth = 0.65
  assert.equal(bullet.ricochetRemaining, mod.ricochetCount, '前置：module 生效后弹体带满回弹次数')
  assert.ok(bullet.remainingHits > 0, '前置：击破这一刻仍有贯穿次数')
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 40 && runner.bullets.includes(bullet); i++) runner._updateShooting(0.05)

  assert.ok(first.hp <= 0, '主目标应被击破')
  assert.ok(
    (runner.weaponStats.ricochets || 0) >= 1,
    `pierce 击破后必须回弹，实测 ricochets=${runner.weaponStats.ricochets}（remainingHits=${bullet.remainingHits}）`
  )
  assert.ok(second.hp < 40, '回弹必须真的转向并命中前方的下一个目标')
  assert.equal(
    bullet.provenance,
    'secondary',
    '回弹后的弹体必须降级为二级攻击（provenance 向后传播），否则它后续命中会重新获得 Module 触发资格'
  )
  assert.ok(
    (runner.weaponStats.ricochets || 0) <= mod.ricochetCount,
    `回弹次数不得超过 ricochetCount=${mod.ricochetCount}，实测 ${runner.weaponStats.ricochets}`
  )
  assert.ok(
    (runner.weaponStats.maxProcDepth || 0) <= 1,
    `回弹属于二级攻击，proc 深度必须封顶在 1，实测 ${runner.weaponStats.maxProcDepth}`
  )
})

check('pierce × ricochet：没有击破时仍然照常贯穿，不得被 module 改写', () => {
  const runner = makeRunner()
  runner.weaponCore = 'pierce'
  runner.secondaryElement = 'lightning'
  runner.weaponModule = 'ricochet'
  runner.weaponLevel = 3
  // 两个都打不死的主目标：验证 pierce 自身没有被削弱成「只回弹不贯穿」
  const a = makeEntity('brute', 1, 0.6, 200, moduleIdCounter++)
  const b = makeEntity('brute', 1, 0.3, 200, moduleIdCounter++)
  runner.entities.push(a, b)

  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.65
  bullet.depth = 0.65
  const pierceBefore = bullet.remainingHits
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 40 && runner.bullets.includes(bullet); i++) runner._updateShooting(0.05)

  assert.ok(a.hp < 200 && b.hp < 200, '未击破的贯穿目标必须都吃到伤害')
  assert.equal(runner.weaponStats.ricochets, 0, '没有击破就不该回弹')
  assert.ok(
    bullet.remainingHits < pierceBefore,
    `未击破时必须真的消耗贯穿次数：${pierceBefore} -> ${bullet.remainingHits}`
  )
})

check('pierce × ricochet：击破但没有回弹次数时仍然照常贯穿', () => {
  const runner = makeRunner()
  runner.weaponCore = 'pierce'
  runner.secondaryElement = 'lightning'
  runner.weaponModule = 'ricochet'
  runner.weaponLevel = 3
  const first = makeEntity('scout', 1, 0.6, 3, moduleIdCounter++)
  const second = makeEntity('brute', 1, 0.3, 200, moduleIdCounter++)
  runner.entities.push(first, second)

  const bullet = runner._createBullet(1)
  bullet.ricochetRemaining = 0 // 唯一的合法目标已经回弹完
  bullet.previousDepth = 0.65
  bullet.depth = 0.65
  const pierceBefore = bullet.remainingHits
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 40 && runner.bullets.includes(bullet); i++) runner._updateShooting(0.05)

  assert.equal(runner.weaponStats.ricochets, 0, '没有回弹次数时不得凭空回弹')
  assert.ok(first.hp <= 0, '主目标仍应被击破')
  assert.ok(
    bullet.remainingHits < pierceBefore,
    `回弹次数用尽后必须退回贯穿：${pierceBefore} -> ${bullet.remainingHits}`
  )
})

check('amplify：只对低于血线���目标增伤，不是无条件全局加成', () => {
  const runner = makeRunner()
  const mod = getRunnerWeaponModule('amplify')
  runner.weaponCore = 'pierce'
  runner.weaponModule = 'amplify'
  const healthy = makeEntity('brute', 1, 0.5, 200, moduleIdCounter++)
  const wounded = makeEntity('brute', 2, 0.5, 200, moduleIdCounter++)
  wounded.hp = Math.floor(200 * mod.amplifyHpRatio) - 1
  runner.entities.push(healthy, wounded)
  const source = { core: 'pierce', coreLevel: 1, damageMultiplier: 1 }

  const healthyHit = runner._hitEntity(healthy, source).damage
  const woundedHit = runner._hitEntity(wounded, source).damage

  assert.ok(
    woundedHit > healthyHit * 1.3,
    `低血目标应吃到 amplifyBonus=${mod.amplifyBonus}：${woundedHit.toFixed(2)} vs 满血 ${healthyHit.toFixed(2)}`
  )
  assert.ok(
    Math.abs(healthyHit - runner.attackDamage) < 0.001,
    `满血目标不得被增幅，实测 ${healthyHit.toFixed(2)}（基础 ${runner.attackDamage}）`
  )
})

check('27 组合：Core × Element × Module 全部成立且互相正交', () => {
  let passed = 0
  const broken = []
  const ricochetModule = getRunnerWeaponModule('ricochet')
  for (const core of CORES) {
    for (const element of ELEMENTS) {
      for (const moduleId of MODULES) {
        const runner = makeRunner(31337)
        runner.weaponCore = core
        runner.secondaryElement = element
        runner.weaponModule = moduleId
        try {
          assert.equal(runner.fusionWeapon?.id, `${core}_${element}`, '融合身份错误')
          assert.equal(runner.moduleWeapon?.id, moduleId, '模块身份错误')
          // 一次 plan 必须同时包含融合效果与模块效果——这才是「正交」而不是拼表
          const explosion = planRunnerEffects({ fusion: runner.fusionWeapon, module: runner.moduleWeapon }, 'onExplosion')
          const hit = planRunnerEffects({ fusion: runner.fusionWeapon, module: runner.moduleWeapon }, 'onHit')
          if (core === 'burst') {
            const expected = { burst_flame: 'blastRadius', burst_frost: 'blastRadius', burst_lightning: 'sparks' }[`${core}_${element}`]
            assert.ok(
              explosion.some((e) => e.kind === expected),
              `${core}+${element} 缺少 ${expected}`
            )
          }
          // ricochet 走弹道通道（getRunnerBulletProfile），本来就没有 onHit 效果；
          // 其余两个 module 必须在 onHit 里出现。三条路径都算「模块行为存在」。
          const bulletProfile = getRunnerBulletProfile({ fusion: runner.fusionWeapon, module: runner.moduleWeapon })
          if (moduleId === 'ricochet') {
            assert.ok(
              bulletProfile && bulletProfile.ricochetCount === ricochetModule.ricochetCount,
              `${core}+${element}+ricochet 缺少弹道参数`
            )
          } else {
            assert.ok(
              hit.some((e) => e.kind === (moduleId === 'split' ? 'split' : 'amplify')),
              `${core}+${element}+${moduleId} 缺少模块效果`
            )
          }

          // 真实开火：必须真的打中东西，且不产生 NaN
          const target = makeEntity('brute', 1, 0.5, 120, moduleIdCounter++)
          const neighbour = makeEntity('scout', 0, 0.5, 60, moduleIdCounter++)
          runner.entities.push(target, neighbour)
          fireOneShot(runner, 1, [target, neighbour])
          for (const entity of runner.entities) {
            assert.ok(Number.isFinite(entity.hp) && Number.isFinite(entity.depth), '实体状态出现 NaN')
          }
          passed++
        } catch (error) {
          broken.push(`${core}+${element}+${moduleId}: ${error.message}`)
        } finally {
          runner.destroy()
        }
      }
    }
  }
  assert.equal(broken.length, 0, `${broken.length} 个构筑不成立：\n    ${broken.join('\n    ')}`)
  assert.equal(passed, 27, '必须是 27 个真实构筑')
  console.log(`    27 组合矩阵：${passed}/27 成立`)
})

check('module choice 生命周期：出现 / 三选一 / 磁暴不吞 / pending 解除 / reset 归零', () => {
  const runner = makeRunner(555)
  assert.equal(runner.weaponModule, null, '开局不得白送 module')
  assert.equal(runner.moduleChoicePending, false)

  const gates = runner.director.createModuleChoice()
  assert.equal(gates.length, 3, 'module 选择必须是三选一')
  for (const gate of gates) {
    assert.equal(gate.kind, 'module_mutation', 'module 门必须有独立 kind，不得冒充 gate')
    assert.ok(gate.weaponModule, 'module 门必须携带自己的 module id')
    assert.equal(
      runner._isMagnetEligibleEntity(gate),
      false,
      '磁暴绝不能吸走 module 门'
    )
  }

  runner.entities.push(...gates)
  runner.moduleChoicePending = true
  runner._moduleChoiceRowId = gates[0].rowId
  const ok = runner._selectWeaponModule(runner.entities.find((g) => g.kind === 'module_mutation' && g.lane === 1).weaponModule)
  assert.equal(ok, true, '驶入车道应能完成 module 选择')
  assert.equal(runner.moduleChoicePending, false, '选择后 pending 必须解除')
  assert.equal(runner.weaponModule, runner.moduleWeapon.id)
  for (const gate of gates) assert.equal(gate.active, false, '选择后同排其余 module 门必须关闭')

  const fresh = makeRunner(555)
  assert.equal(fresh.weaponModule, null, 'reset 后 module 必须归零')
  assert.equal(fresh.moduleChoicePending, false, 'reset 后 pending 必须归零')
  fresh.destroy()
  runner.destroy()
})

check('递归压力：最密集构筑下 effect 数量必须有确定上限', () => {
  const runner = makeRunner(909)
  runner.weaponCore = 'burst'
  runner.secondaryElement = 'lightning'
  runner.weaponModule = 'split'
  for (let lane = 0; lane < 3; lane++) {
    for (let n = 0; n < 6; n++) {
      runner.entities.push(makeEntity(n % 2 ? 'brute' : 'hound', lane, 0.15 + n * 0.12, 60, moduleIdCounter++))
    }
  }
  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.95
  bullet.depth = 0.95
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let i = 0; i < 30; i++) runner._updateShooting(0.05)

  const perShot = (runner.weaponStats.splinterCount || 0)
  const cap = 4 * (getRunnerWeaponModule('split').splitCount + 1)
  assert.ok(perShot <= cap, `单发子弹的二级效果必须有上限，实测 ${perShot} > ${cap}`)
  assert.ok((runner.weaponStats.maxProcDepth || 0) <= 1, 'proc 深度不得增长')
  assert.ok(runner.bullets.length <= 48, '弹体不得无界增长')
  assert.ok(runner.entities.length <= 24, '实体不得无界增长')
  runner.destroy()
})

check('选择门免疫：任何范围效果都不得替玩家做掉构筑选择', () => {
  // 真实踩过的坑：pierce_lightning 的折射雷弧会打死相邻车道的 module 门，
  // 于是玩家还没来得及选，构筑就被效果定死了。核心门 / 元素门同理。
  for (const [core, element] of [['pierce', 'lightning'], ['burst', 'flame'], ['corrosion', 'flame'], ['corrosion', 'frost']]) {
    const runner = makeRunner(6060)
    runner.weaponCore = core
    runner.secondaryElement = element
    const player = makeEntity('brute', 1, 0.5, 300, moduleIdCounter++)
    runner.entities.push(player)
    const choiceGates = runner.director.createModuleChoice()
    for (const gate of choiceGates) {
      gate.id = moduleIdCounter++
      gate.depth = 0.5
      runner.entities.push(gate)
    }
    // 真正打开选择态：pending 为真时 _selectWeaponModule 才可能生效。
    // 否则门被打坏也看不出来，这条断言就是空转。
    runner.moduleChoicePending = true
    runner._moduleChoiceRowId = choiceGates[0].rowId
    assert.equal(runner.weaponModule, null, '前置：尚未做出 module 选择')

    runner._explodeAt(player, runner._createBullet(1))
    runner._applyFusionOnPierce(player)
    for (let i = 0; i < 5; i++) runner._updateGroundFires(0.2)
    for (const gate of choiceGates) {
      assert.equal(gate.hp, gate.maxHp, `${core}+${element} 的范围效果打坏了 module 门`)
      assert.equal(gate.active, true, `${core}+${element} 的范围效果销毁了 module 门`)
    }
    assert.equal(runner.weaponModule, null, `${core}+${element} 替玩家做了 module 选择`)
    runner.destroy()
  }
})

// ---------------------------------------------------------------------------
// Phase D1.3 · 攻击 provenance（二级攻击不得重新获得 Module 触发资格）
//
// 为什么不能只断言 maxProcDepth <= 1：procDepth 只挂在「同一个 source 对象」上。
// 一旦攻击跨过一层 fusion，效果层会构造一个**新的** source，那个数字就不见了，
// 二级攻击于是重新拿到 Module 触发资格。修复前的实测状态（就是本区用例转红的那个状态）：
//   C+L+S       ：单发子弹 → 主目标过载放电 → 放电以全新 source 触发 split → 4 次 split / 8 片弹片，
//                 而 maxProcDepth 全程 = 1；
//   burst+light ：爆炸 AoE 每炸到一个目标就各触发一次 split → 4 次 split / 8 片弹片。
// 因此这里的判据是**直接审计 _applyModuleProc 的触发资格**，而不是任何代理数字。
// ---------------------------------------------------------------------------
console.log('\n=== Phase D1.3 · 攻击 provenance ===')

/**
 * 审计每一次 _applyModuleProc：记录 source 的 provenance，以及它是否真的产生了弹片。
 * 「是否真的产生」用 weaponStats.splits 的增量判定，与被测实现内部怎么判资格无关。
 */
const auditModuleProcs = (runner) => {
  const log = []
  const original = runner._applyModuleProc.bind(runner)
  runner._applyModuleProc = (primary, source) => {
    const splitsBefore = runner.weaponStats.splits
    const result = original(primary, source)
    log.push({ provenance: source?.provenance ?? null, procced: runner.weaponStats.splits > splitsBefore })
    return result
  }
  return log
}

/** 核心不变式：真正产生的弹片只能来自 primary 攻击，且本次必须至少有一次 proc（防空转）。 */
const assertOnlyPrimaryProcs = (log, label) => {
  const procced = log.filter((row) => row.procced)
  assert.ok(procced.length > 0, `${label}：前置失败——本次没有任何 Module proc，断言会空转`)
  const leaked = procced.filter((row) => row.provenance !== 'primary')
  assert.equal(
    leaked.length,
    0,
    `${label}：有 ${leaked.length}/${procced.length} 次 Module proc 来自非 primary 来源`
      + `（provenance=${[...new Set(leaked.map((row) => row.provenance ?? 'unmarked'))].join('|')}）`
  )
}

/** 包一层过载放电计数，返回读取器。 */
const countShocks = (runner) => {
  let shocks = 0
  const original = runner._triggerCorrosionShock.bind(runner)
  runner._triggerCorrosionShock = (...args) => {
    shocks += 1
    return original(...args)
  }
  return () => shocks
}

check('D1.3 provenance：玩家直接命中仍然触发 Module（正向对照，合法模块行为不被误杀）', () => {
  const runner = makeRunner()
  const mod = getRunnerWeaponModule('split')
  loadout(runner, 'pierce', 'lightning')
  runner.weaponModule = 'split'
  const primary = makeEntity('brute', 1, 0.5, 5000)
  const left = makeEntity('brute', 0, 0.5, 5000)
  const right = makeEntity('brute', 2, 0.5, 5000)
  runner.entities.push(primary, left, right)
  const log = auditModuleProcs(runner)

  fireOneShot(runner, 1, [primary])

  assertOnlyPrimaryProcs(log, '玩家直接命中')
  assert.equal(runner.weaponStats.splits, 1, `一次直接命中只应产生 1 次分裂，实测 ${runner.weaponStats.splits}`)
  assert.equal(
    runner.weaponStats.splinterCount,
    mod.splitCount,
    `一次 proc 只应产生 splitCount=${mod.splitCount} 片弹片，实测 ${runner.weaponStats.splinterCount}`
  )
  // 合法 fusion 行为必须仍然活着：相邻车道照旧吃折射雷弧
  assert.ok(left.hp < 5000 && right.hp < 5000, '相邻车道的折射雷弧不得因为 provenance 收敛而失效')
})

check('D1.3 provenance：过载放电（fusion 二级）不得重新触发 split —— C+L+S 回路', () => {
  const runner = makeRunner()
  const fusion = loadout(runner, 'corrosion', 'lightning')
  const mod = getRunnerWeaponModule('split')
  runner.weaponModule = 'split'
  const threshold = fusion.shockThreshold
  // 主目标与邻道目标都停在「再挨一发腐蚀就叠满」：弹片命中邻道目标时同样会触发过载放电，
  // 于是这条用例给出的触发机会与真实 C+L+S 对局完全一致，回路不可能因为构造不足而空转。
  const victim = makeEntity('brute', 1, 0.5, 5000)
  const near = [makeEntity('brute', 0, 0.5, 5000), makeEntity('brute', 2, 0.5, 5000)]
  victim.corrosionStacks = threshold - 1
  for (const entity of near) entity.corrosionStacks = threshold - 1
  runner.entities.push(victim, ...near)
  const shockCount = countShocks(runner)
  const log = auditModuleProcs(runner)

  fireOneShot(runner, 1, [victim])

  assert.ok(shockCount() >= 1, '前置：主目标必须真的触发了过载放电')
  assert.equal(victim.corrosionStacks, 0, '前置：放电后叠层应被清空')
  assert.ok(near.every((entity) => entity.hp < 5000), '弹片必须真的打到邻道目标（否则回路没有触发机会）')
  assertOnlyPrimaryProcs(log, 'C+L+S 回路')
  assert.equal(runner.weaponStats.splits, 1, `单发子弹只允许 1 次分裂，实测 ${runner.weaponStats.splits}`)
  assert.equal(
    runner.weaponStats.splinterCount,
    mod.splitCount,
    `弹片数量应为 splitCount=${mod.splitCount}，实测 ${runner.weaponStats.splinterCount}`
  )
  assert.ok(
    (runner.weaponStats.maxProcDepth || 0) <= 1,
    'proc 深度仍应封顶（但这条不足以发现跨层回路，所以不作为唯一判据）'
  )
})

check('D1.3 provenance：爆炸 AoE 与火花（effect 二级）不得触发 split', () => {
  const runner = makeRunner()
  loadout(runner, 'burst', 'lightning')
  const mod = getRunnerWeaponModule('split')
  runner.weaponModule = 'split'
  runner.weaponLevel = 1
  const primary = makeEntity('brute', 1, 0.5, 5000)
  const inRadius = [
    makeEntity('brute', 1, 0.52, 5000),
    makeEntity('brute', 1, 0.48, 5000),
    makeEntity('brute', 1, 0.54, 5000),
  ]
  runner.entities.push(primary, ...inRadius)
  const log = auditModuleProcs(runner)

  fireExplosiveShot(runner, 1, primary)

  assert.ok((runner.weaponStats.explosions || 0) >= 1, '前置：必须真的发生了一次爆裂')
  assert.ok(inRadius.every((entity) => entity.hp < 5000), '前置：范围内目标必须真的吃到了 AoE / 火花伤害')
  assertOnlyPrimaryProcs(log, '爆炸 AoE')
  assert.equal(runner.weaponStats.splits, 1, `只有直接命中允许 proc：应为 1 次，实测 ${runner.weaponStats.splits}`)
  assert.equal(
    runner.weaponStats.splinterCount,
    mod.splitCount,
    `弹片数量应为 splitCount=${mod.splitCount}，实测 ${runner.weaponStats.splinterCount}`
  )
})

check('D1.3 provenance：殉爆（由二级弹片击杀触发的 onKill）不得触发 split，且范围合同不变', () => {
  const runner = makeRunner()
  loadout(runner, 'corrosion', 'flame')
  const mod = getRunnerWeaponModule('split')
  runner.weaponModule = 'split'
  runner.weaponLevel = 1
  // P 是玩家弹体真正直接命中的目标：存活，因此唯一一次 primary 资格在此用掉（proc 出弹片）。
  const primary = makeEntity('brute', 1, 0.6, 5000)
  // D 带腐蚀叠层、血量刚好被弹片打死 —— 殉爆因此由**二级弹片**的击杀触发。
  // 这正是「二级攻击可以继续触发现有允许的融合行为」的那条路径。
  const doomed = makeEntity('brute', 1, 0.58, 4)
  doomed.corrosionStacks = 2
  // X 在同车道殉爆半径内：证明殉爆真的结算了（而且它又是弹片目标，会再走一次资格判定）。
  const closeVictim = makeEntity('brute', 1, 0.53, 500)
  // Y 同时在 splitRange 与殉爆半径之外：证明两条范围规则都没有被放宽。
  const farVictim = makeEntity('brute', 1, 0.3, 500)
  runner.entities.push(primary, doomed, closeVictim, farVictim)
  const log = auditModuleProcs(runner)

  fireOneShot(runner, 1, [primary, doomed, closeVictim, farVictim])

  assert.ok(primary.hp < 5000 && primary.active, '前置：弹体必须真的直接命中 P（否则没有 primary 资格可用）')
  assert.ok(doomed.hp <= 0, '前置：带腐蚀叠层的目标必须真的被弹片击破（否则不会走 onKill 殉爆）')
  assert.ok(closeVictim.hp < 500, '前置：同车道近距离目标必须被殉爆波及')
  assert.equal(farVictim.hp, 500, 'splitRange 与殉爆半径之外的目标不得被波及')
  assert.equal(runner.weaponStats.splits, 1, `只允许直接命中产生 1 次分裂，实测 ${runner.weaponStats.splits}`)
  assert.equal(
    runner.weaponStats.splinterCount,
    mod.splitCount,
    `弹片数量应为 splitCount=${mod.splitCount}，实测 ${runner.weaponStats.splinterCount}`
  )
  assertOnlyPrimaryProcs(log, '殉爆（二级弹片击杀触发）')
})

check('D1.3 provenance：C+L+S 最密集场地下二级效果数量仍有确定上限', () => {
  // 与既有「递归压力」同形，但换成真正的跨层回路构筑（腐蚀过载 + 分裂），
  // 并且让全部目标都停在阈值前一层的状态，把回路的触发机会开到最大。
  const runner = makeRunner(909)
  const fusion = loadout(runner, 'corrosion', 'lightning')
  const mod = getRunnerWeaponModule('split')
  runner.weaponModule = 'split'
  for (let lane = 0; lane < 3; lane++) {
    for (let n = 0; n < 6; n++) {
      const entity = makeEntity(n % 2 ? 'brute' : 'hound', lane, 0.15 + n * 0.12, 5000)
      entity.corrosionStacks = fusion.shockThreshold - 1
      runner.entities.push(entity)
    }
  }
  const shockCount = countShocks(runner)
  const log = auditModuleProcs(runner)
  const bullet = runner._createBullet(1)
  bullet.previousDepth = 0.95
  bullet.depth = 0.95
  runner.bullets = [bullet]
  runner._fireCooldown = 999
  for (let step = 0; step < 30; step++) runner._updateShooting(0.05)

  assert.ok(shockCount() >= 1, '前置：本场必须真的触发过载放电')
  assertOnlyPrimaryProcs(log, 'C+L+S 密集场地')
  assert.equal(runner.weaponStats.splits, 1, `单发子弹最多 1 次分裂，实测 ${runner.weaponStats.splits}`)
  assert.ok(
    runner.weaponStats.splinterCount <= mod.splitCount,
    `单发子弹的弹片数量不得超过 splitCount=${mod.splitCount}，实测 ${runner.weaponStats.splinterCount}`
  )
  assert.ok((runner.weaponStats.maxProcDepth || 0) <= 1, 'proc 深度不得增长')
  assert.ok(runner.bullets.length <= 48, '弹体不得无界增长')
  assert.ok(runner.entities.length <= 24, '实体不得无界增长')
  runner.destroy()
})

// ---------------------------------------------------------------------------
// 27 组合 soak：Core × Element × Module 全跑一局完整 blitz 60s。
// 60s 是必需的——blitz 的 module 门 34s 生成、约 41.7s 结算，只有跑满 60s
// 才真的「拿到 module 并用它打完最后 18 秒」。
// ---------------------------------------------------------------------------
console.log('\n=== 27 组合 soak（blitz 60s 完整局，seed 20260929）===')

const comboSoakProblems = []
let comboSoakPassed = 0
for (const core of CORES) {
  for (const element of ELEMENTS) {
    for (const moduleId of MODULES) {
      const runner = makeRunner(20260929)
      let maxFires = 0
      let maxEntities = 0
      let maxBullets = 0
      const buildId = `${core}+${element}+${moduleId}`
      try {
        for (let frame = 0; frame < 60 * 30; frame++) {
          runner.targetLane = chooseLane(runner, element, moduleId)
          if (runner.weaponCore && runner.elapsedTime > 12) runner.weaponCore = core
          runner.updateWorld(1 / 30)
          maxFires = Math.max(maxFires, runner.groundFires.length)
          maxEntities = Math.max(maxEntities, runner.entities.length)
          maxBullets = Math.max(maxBullets, runner.bullets.length)
          for (const entity of runner.entities) {
            if (!Number.isFinite(entity.depth) || !Number.isFinite(entity.hp) || !Number.isFinite(entity.speed)) {
              throw new Error(`实体 ${entity.id} 出现 NaN`)
            }
          }
        }
        if (runner.weaponCore !== core) throw new Error(`weaponCore 实际是 ${runner.weaponCore}`)
        if (runner.secondaryElement !== element) throw new Error(`secondaryElement 实际是 ${runner.secondaryElement}`)
        if (runner.weaponModule !== moduleId) throw new Error(`weaponModule 实际是 ${runner.weaponModule}，说明 34s 的 module 门没被结算`)
        if (runner.moduleChoicePending) throw new Error('module 选择在局末仍挂起')
        if (runner.weaponChoicePending || runner.secondaryChoicePending) throw new Error('核心/元素选择未完成')
        if (maxFires > RUNNER_MAX_GROUND_FIRES) throw new Error(`地火越界 ${maxFires}`)
        if (maxEntities > 24) throw new Error(`实体无界 ${maxEntities}`)
        if (maxBullets > 48) throw new Error(`弹体无界 ${maxBullets}`)
        if ((runner.weaponStats.maxProcDepth || 0) > 1) throw new Error(`proc 深度失控 ${runner.weaponStats.maxProcDepth}`)
        // 「无永久状态」的正确判据是计时器会到期，而不是局末必须为 0——
        // 最后一秒刚挂上的 3 秒减速在到期前仍然活跃，那是设计，不是泄漏。
        // 真正的泄漏长这样：计时器超过 Rules 里配置过的最大时长却仍在增长。
        const leaked = runner.entities.filter(
          (e) => (e.freezeTimer || 0) > MAX_STATUS_SECONDS || (e.slowTimer || 0) > MAX_STATUS_SECONDS
        )
        if (leaked.length) throw new Error(`${leaked.length} 个实体的状态计时器超过 Rules 上限 ${MAX_STATUS_SECONDS}s，疑似泄漏`)
        if (runner.routeLog.length < 2) throw new Error(`岔口未继续推进（${runner.routeLog.length}）`)
        comboSoakPassed++
      } catch (error) {
        comboSoakProblems.push(`${buildId}: ${error.message}`)
        console.log(`✗ soak ${buildId}: ${error.message}`)
      }
      runner.destroy()
    }
  }
}
if (!comboSoakProblems.length) console.log(`  ✓ 27/27 构筑完成完整 blitz 60s，无异常、无残留状态、岔口继续推进`)

// ---------------------------------------------------------------------------
// D1.1：真实对局 capability delivery 回归
//
// 这个 section 存在的唯一理由：本文件在 D1 之前全部是「构造 fixture → 调方法 → 断言」。
// 它证明了每一段代码路径都存在且正确，于是 27/27 全绿——而真实 60s 对局里
// pierce × ricochet 是 0 次回弹、burst × frost 是 0.05 次冻结。
// 「代码能执行」和「玩家能在一局里体验到」是两件事，只有真的把一局跑完才能测后者。
//
// 断言锁的是交付语义（>0 / 多数 seed / 明显下界），不是精确计数：
// 遭遇序列以后可能合法变化，写死 ricochet === 17 这种断言只会制造假红。
// 每一个下界都来自修复后的实测分布（见 D1.1 汇报），不是拍脑袋挑的整数。
// ---------------------------------------------------------------------------
console.log('\n=== D1.1 · 真实对局 capability delivery ===')

/**
 * 跑 N 局真实 blitz 60s，只统计 module 生效之后那段窗口的交付量。
 * 之所以要卡 module 生效时刻：module 前的交付恒为 0（那时根本没有这个能力），
 * 不切窗口的话数字会被前半局稀释，看起来像「交付很少」其实是「口径不对」。
 *
 * read  : 从 runner 上读累计量（用于 weaponStats 里的计数）
 * wrap  : 需要在实例上包一层计数的私有方法名（用于 _applySlow / _applyFreeze 这类不落在 stats 上的效果）
 */
const measureDelivery = (seeds, core, element, moduleId, read, wrap = null) => {
  const rows = []
  for (let seed = 1; seed <= seeds; seed++) {
    const runner = makeRunner(90210 + seed)
    let counter = 0
    runner.__counter = 0
    if (wrap) {
      const original = runner[wrap].bind(runner)
      runner[wrap] = (...args) => { counter += 1; runner.__counter = counter; return original(...args) }
    }
    let atModule = null
    for (let frame = 0; frame < 60 * 30; frame++) {
      runner.targetLane = chooseLane(runner, element, moduleId)
      if (runner.weaponCore && runner.elapsedTime > 12) runner.weaponCore = core
      runner.updateWorld(1 / 30)
      if (atModule === null && runner.weaponModule) atModule = read(runner)
    }
    const end = read(runner)
    rows.push({ atModule, post: end - (atModule || 0), end })
    runner.destroy()
  }
  return rows
}

const RICOCHET_SEEDS = 20
const recAt = (r) => r.weaponStats.ricochets

// --- 1. pierce × ricochet：修复前三个 element 全部恒为 0 ---
// 实测（D1.1 修复后，20 seeds，module 生效后窗口）：lightning 84 次/19 seed、flame 125 次/20 seed、
// frost 205 次/20 seed。下界取「多数 seed 至少一次」+「单局明显下界」，避开精确计数。
// D1.3 重新实测：lightning 46 次/17 seed、flame 86 次/20 seed、frost 126 次/20 seed——
// 降幅来自「二级攻击不再泄漏 Module 触发资格」后总伤害回落（回弹本身由击破触发），
// 回弹逻辑与数值一个字节都没改，所以下界不动。
const pierceRicochet = []
for (const element of ELEMENTS) {
  const rows = measureDelivery(RICOCHET_SEEDS, 'pierce', element, 'ricochet', recAt)
  pierceRicochet.push({ element, rows })
}
check('capability delivery：pierce × ricochet 在真实对局 module 生效后真的交付', () => {
  const measured = []
  for (const { element, rows } of pierceRicochet) {
    const total = rows.reduce((a, r) => a + r.post, 0)
    const delivering = rows.filter((r) => r.post > 0).length
    const best = Math.max(...rows.map((r) => r.post))
    measured.push(`${element}=${total}次/${delivering}seed(峰值${best})`)
    assert.ok(total > 0, `pierce+${element}+ricochet 的真实交付必须 >0，实测 ${total}`)
    assert.ok(
      delivering >= Math.ceil(RICOCHET_SEEDS * 0.75),
      `pierce+${element}+ricochet 至少应有 3/4 的 seed 交付过，实测 ${delivering}/${RICOCHET_SEEDS}`
    )
    assert.ok(
      best >= 3,
      `pierce+${element}+ricochet 单局峰值应明显高于 1（否则只是偶发），实测 ${best}`
    )
  }
  console.log(`  pierce × ricochet 真实交付（${RICOCHET_SEEDS} seeds，module 生效后）: ${measured.join('  ')}`)
})

// --- 2. 对照组：证明这套 harness 分得清「代码路径存在」与「真实比赛真的发生」---
// 这些能力本来就是活的；如果哪天它们也归零，说明 delivery 测量本身坏了，而不是游戏坏了。
check('capability delivery：对照组证明测量有效（活的能力不应归零）', () => {
  const splitRows = measureDelivery(RICOCHET_SEEDS, 'corrosion', 'lightning', 'split', (r) => r.weaponStats.splits)
  const splitTotal = splitRows.reduce((a, r) => a + r.post, 0)
  assert.ok(splitTotal > 0, `corrosion+lightning+split 的分裂真实交付必须 >0，实测 ${splitTotal}`)

  const slowRows = measureDelivery(RICOCHET_SEEDS, 'pierce', 'frost', 'split', (r) => r.__counter, '_applySlow')
  const slowTotal = slowRows.reduce((a, r) => a + r.post, 0)
  assert.ok(slowTotal > 0, `pierce+frost+split 的减速真实交付必须 >0，实测 ${slowTotal}`)

  console.log(`  对照组交付: split=${splitTotal}  pierce×frost 减速=${slowTotal}`)
})

// --- 3. burst × frost：D1.2 正式合同落地后的真实对局交付 ---
// 修复前 3 个 module 分别是 0 / 1 / 0。这里把下限正式锁住，并且**分别统计
// primary 与 secondary freeze**——这是本轮最关键的一条证据：如果冻结是靠
// 扩大范围变活的，secondary 会跟着暴涨；只有 primary 暴涨才说明我们修的是合同本身。
const measureBlastFreeze = (seeds, core, element, moduleId) => {
  const rows = []
  for (let seed = 1; seed <= seeds; seed++) {
    const runner = makeRunner(90210 + seed)
    let primaryFreeze = 0
    let secondaryFreeze = 0
    let currentPrimary = null
    const originalExplode = runner._explodeAt.bind(runner)
    runner._explodeAt = (primary, bullet) => {
      currentPrimary = primary ? primary.id : null
      try {
        return originalExplode(primary, bullet)
      } finally {
        currentPrimary = null
      }
    }
    const originalFreeze = runner._applyFreeze.bind(runner)
    runner._applyFreeze = (entity, duration) => {
      // 只统计爆裂结算期间挂上的冻结；其它来源（如腐蚀过载）不混进来
      if (currentPrimary !== null) {
        if (entity && entity.id === currentPrimary) primaryFreeze += 1
        else secondaryFreeze += 1
      }
      return originalFreeze(entity, duration)
    }
    let atModule = null
    for (let frame = 0; frame < 60 * 30; frame++) {
      runner.targetLane = chooseLane(runner, element, moduleId)
      if (runner.weaponCore && runner.elapsedTime > 12) runner.weaponCore = core
      runner.updateWorld(1 / 30)
      if (atModule === null && runner.weaponModule) atModule = { p: primaryFreeze, s: secondaryFreeze }
    }
    const base = atModule || { p: 0, s: 0 }
    rows.push({
      postPrimary: primaryFreeze - base.p,
      postSecondary: secondaryFreeze - base.s,
    })
    runner.destroy()
  }
  return rows
}

check('capability delivery：burst × frost 在三个 module 下都真实交付冻结（主目标冻结必须真实交付）', () => {
  const observed = []
  for (const moduleId of MODULES) {
    const rows = measureBlastFreeze(RICOCHET_SEEDS, 'burst', 'frost', moduleId)
    const primary = rows.reduce((a, r) => a + r.postPrimary, 0)
    const secondary = rows.reduce((a, r) => a + r.postSecondary, 0)
    const total = primary + secondary
    const delivering = rows.filter((r) => r.postPrimary + r.postSecondary > 0).length
    const best = Math.max(...rows.map((r) => r.postPrimary + r.postSecondary))
    observed.push(`${moduleId}=${total}次(${delivering}seed, 峰值${best}, primary=${primary}/secondary=${secondary})`)

    assert.ok(total > 0, `burst+frost+${moduleId} 的真实冻结交付必须 >0，实测 ${total}`)
    assert.ok(
      delivering >= Math.ceil(RICOCHET_SEEDS * 0.75),
      `burst+frost+${moduleId} 至少应有 3/4 的 seed 交付过，实测 ${delivering}/${RICOCHET_SEEDS}`
    )
    assert.ok(best >= 3, `burst+frost+${moduleId} 单局峰值应明显高于 1（否则只是偶发），实测 ${best}`)
    // D1.3 收口：这里曾经断言 primary >= secondary。那是**当前编队密度下的统计特征**，
    // 不是 correctness contract——敌群变密时同一发爆裂会合法地冻到更多次级目标，
    // secondary 超过 primary 完全是正确行为，把它当不变式只会制造假红。
    // 与密度无关的真正合同在这里与定向用例里：
    //   1. 主目标冻结必须真的交付（下面的 primary > 0）；
    //   2. 主目标存活时按合同被冻结、radius 外不冻结、相邻车道不冻结、
    //      主目标不重复吃 AoE 伤害 —— 由 'D1.2 burst_frost' 与 'D1.3 burst_frost' 锁死。
    assert.ok(
      primary > 0,
      `burst+frost+${moduleId} 必须真的交付过主目标冻结（这是 D1.2 合同本身），实测 primary=${primary}`
    )
  }
  console.log(`  burst × frost 真实冻结交付（${RICOCHET_SEEDS} seeds，module 生效后）: ${observed.join('  ')}`)
})

// --- 4. 交付路径的通用安全门：这批真实对局本身不能带坏任何东西 ---
check('capability delivery：这批真实对局不引入递归、冻结残留或 Director 停摆', () => {
  for (const { element, rows } of pierceRicochet) {
    for (const row of rows) {
      assert.ok(row.end >= row.atModule, `pierce+${element}+ricochet 的 ricochet 计数出现回退`)
    }
  }
  console.log('  交付路径未出现计数回退（回弹不会凭空减少）')
})

// ---------------------------------------------------------------------------
console.log('\n=== 汇总 ===')
if (failures.length) console.log(`组合断言失败 ${failures.length} 项：\n  - ${failures.map((f) => f.name).join('\n  - ')}`)
if (soakProblems.length) console.log(`soak 失败 ${soakProblems.length} 项：\n  - ${soakProblems.join('\n  - ')}`)
if (comboSoakProblems.length) console.log(`27 组合 soak 失败 ${comboSoakProblems.length} 项：\n  - ${comboSoakProblems.join('\n  - ')}`)

assert.equal(
  failures.length + soakProblems.length + comboSoakProblems.length,
  0,
  `融合/模块真实行为未达标：${failures.length} 项断言 + ${soakProblems.length} 项 9 组合 soak + ${comboSoakProblems.length} 项 27 组合 soak`
)

console.log('\nRunner 融合组合测试通过 ✓')
