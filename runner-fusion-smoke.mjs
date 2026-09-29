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
  getRunnerFusionWeapon,
} = await import('./src/game/gameplay/runner/RunnerRules.js')

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

/** 一发真实的腐蚀弹命中。 */
const driveCorrosionHit = (runner, target) => runner._hitEntity(target, { core: 'corrosion', coreLevel: 1, damageMultiplier: 1 })

/** 与正式 bot 同规则的车道选择：先满足选择门，再按风险躲开。 */
const chooseLane = (runner, wantedElement) => {
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
      runner.targetLane = chooseLane(runner, 'flame')
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
console.log('\n=== 汇总 ===')
if (failures.length) console.log(`组合断言失败 ${failures.length} 项：\n  - ${failures.map((f) => f.name).join('\n  - ')}`)
if (soakProblems.length) console.log(`soak 失败 ${soakProblems.length} 项：\n  - ${soakProblems.join('\n  - ')}`)

assert.equal(failures.length + soakProblems.length, 0, `融合真实行为未达标：${failures.length} 项断言失败 + ${soakProblems.length} 项 soak 失败`)

console.log('\nRunner 融合组合测试通过 ✓')
