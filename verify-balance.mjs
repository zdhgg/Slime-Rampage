// 难度曲线护栏：远征进度、刷怪压力、移速、恢复窗口与成长收益。
// 运行：node verify-balance.mjs
import assert from 'node:assert/strict'

import { EnemyManager } from './src/game/EnemyManager.js'
import { Enemy } from './src/game/entities/Enemy.js'
import { Boss } from './src/game/entities/Boss.js'
import {
  DIFFICULTIES,
  getBossWavePlan,
  getDifficultyBossHpMultiplier,
  getExpeditionBoss,
  getExpeditionStages,
  getRunProfile,
  getWaveModifiers,
} from './src/game/RunRules.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

function createManager(mode = 'timed', difficulty = 'normal', stage = 1) {
  const runSelection = { mode, difficulty }
  const game = {
    runSelection,
    runProfile: getRunProfile(runSelection),
    expeditionStage: stage,
    width: 1280,
    height: 720,
    worldWidth: 2400,
    worldHeight: 1800,
    camera: { x: 0, y: 0 },
    player: {
      x: 1200,
      y: 900,
      radius: 26,
      hp: 5,
      maxHp: 5,
      level: 1,
      dead: false,
      invincible: 0,
      devourRadiusBonus: 1,
      strainDevourRadius: 1,
      hit() {},
    },
    weaponSystem: { kills: 0 },
    sound: { wave() {}, bossRoar() {}, enemyShoot() {}, kill() {} },
    dialogue: { tryMinion() {}, sayBoss() {} },
    shakeScreen() {},
  }
  const manager = new EnemyManager()
  manager.attach(game)
  game.enemyManager = manager
  return { manager, game }
}

// 1. 远征强度只由关卡决定，停留时间不改变敌人基础成长。
{
  const { manager } = createManager('expedition', 'normal', 4)
  manager.wave = 1
  const early = manager._effectiveWave()
  manager.wave = 99
  assert.equal(manager._effectiveWave(), early)
  assert.equal(early, 6)
  const deep = createManager('expedition', 'hell', 12).manager
  assert.equal(deep._effectiveWave(), 19)
  ok('远征有效波次只随关卡推进，不随停留时间叠加')
}

// 2. 普通模式继续随波次成长，但移速成长存在全局封顶。
{
  const { manager } = createManager('endless', 'normal')
  manager.wave = 100
  assert.equal(manager._effectiveWave(), 100)
  assert.equal(manager._speedGrowth(), 1.96)
  ok('非远征保留波次成长，移速成长最高为 1.96 倍')
}

// 3. 各难度保留速度差异，但所有普通敌人都能被基础玩家甩开。
{
  const originalRandom = Math.random
  Math.random = () => 0.999
  try {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const { manager } = createManager('endless', difficulty)
      manager.wave = 100
      const enemy = manager.spawnAt(100, 100, 'hound', { elite: true, affix: 'swift' })
      assert.ok(enemy.speed <= DIFFICULTIES[difficulty].enemySpeedCap)
      assert.ok(enemy.speed < 340)
    }
  } finally {
    Math.random = originalRandom
  }
  ok('迅捷精英也受难度移速上限约束，基础走位始终有逃生空间')
}

// 4. 高难度在后期仍有更高刷新压力，不会一起撞上同一个硬下限。
{
  const originalRandom = Math.random
  Math.random = () => 0.5
  try {
    const normal = createManager('endless', 'normal').manager
    const hell = createManager('endless', 'hell').manager
    normal.wave = 100
    hell.wave = 100
    assert.ok(hell._nextInterval() < normal._nextInterval())
    assert.equal(normal._nextInterval(), 0.2)
    assert.ok(Math.abs(hell._nextInterval() - 0.2 / DIFFICULTIES.hell.spawnPressureMul) < 1e-9)
  } finally {
    Math.random = originalRandom
  }
  ok('后期刷新间隔按难度保留差异')
}

// 5. 远征换章重置为本章第 1 波，导演周期不推进波次；限时仍正常推进并生成首领。
{
  const expedition = createManager('expedition', 'normal', 3).manager
  expedition.wave = 12
  expedition.prepareExpeditionStage()
  expedition._waveTimer = 29.99
  expedition._spawnTimer = Infinity
  expedition.update(0.02)
  assert.equal(expedition.wave, 1)

  const timed = createManager('timed', 'normal', 3).manager
  let bosses = 0
  timed.spawnBoss = () => { bosses++ }
  timed.wave = 4
  timed._waveTimer = 29.99
  timed._spawnTimer = Infinity
  timed.update(0.02)
  assert.equal(timed.wave, 5)
  assert.equal(bosses, 1)
  ok('远征每章波次独立，限时模式仍在第 5 波触发首领')
}

// 6. 定时生成遵守场上软上限，清场后可立即恢复补兵。
{
  const { manager } = createManager('timed', 'normal')
  manager._updateBullets = () => {}
  manager._checkDevour = () => {}
  manager._buildGrid = () => {}
  manager._separate = () => {}
  let spawns = 0
  manager.spawn = () => {
    spawns++
  }
  const softCap = Math.ceil(manager._populationTarget() * 1.2)
  manager._enemies = Array.from({ length: softCap }, () => ({
    active: true,
    isBoss: false,
    _dialogueChecked: true,
    update() {},
  }))
  manager._spawnTimer = 0
  manager.update(0.01)
  assert.equal(spawns, 0)
  manager._enemies = []
  manager._spawnTimer = 0
  manager.update(0.01)
  assert.equal(spawns, 1)
  ok('刷怪软上限抑制堆积，低于上限后正常补兵')
}

// 7. Boss 阵亡后进入明确恢复窗口，期间不会立刻补怪。
{
  const { manager } = createManager('timed', 'normal')
  manager._updateBullets = () => {}
  manager._checkDevour = () => {}
  manager._buildGrid = () => {}
  manager._separate = () => {}
  const boss = { active: false, isBoss: true, update() {} }
  manager._boss = boss
  manager._enemies = [boss]
  manager.update(0.01)
  assert.ok(manager._bossRecovery > 3.9)
  let spawns = 0
  manager.spawn = () => {
    spawns++
  }
  manager._spawnTimer = 0
  manager.update(0.5)
  assert.equal(spawns, 0)
  assert.equal(manager.directorInfo.phase, '战后喘息')
  ok('Boss 阵亡后提供 4 秒喘息且暂停普通补兵')
}

// 8. 清怪效率以短窗口采样，为导演提供轻量反馈而不直接改敌人属性。
{
  const { manager, game } = createManager('timed', 'normal')
  manager._updateClearRate(0.1)
  game.weaponSystem.kills = 9
  manager._updateClearRate(2.9)
  assert.equal(manager.directorInfo.clearRate, 3)
  ok('导演每 3 秒采样清怪率，反馈值稳定可观测')
}

// 9. 精英收益与风险匹配：约 3 倍生命，固定 5 倍经验，不再出现 9 倍跳级。
{
  const common = new Enemy({ x: 0, y: 0, speed: 80, hp: 5, rewardHp: 5, type: 'knight' })
  const elite = new Enemy({ x: 0, y: 0, speed: 80, hp: 5, rewardHp: 5, type: 'knight', elite: true })
  assert.equal(elite.hp, common.hp * 3)
  assert.equal(elite.expValue, common.expValue * 5)
  ok('精英经验固定为同类普通敌人的 5 倍')
}

// 10. 难度主要由密度、精英与招式区分，基础数值仍严格递增。
{
  const order = ['easy', 'normal', 'hard', 'hell']
  for (let i = 1; i < order.length; i++) {
    const prev = DIFFICULTIES[order[i - 1]]
    const current = DIFFICULTIES[order[i]]
    assert.ok(current.enemyHpMul > prev.enemyHpMul)
    assert.ok(current.eliteHpMul > prev.eliteHpMul)
    assert.ok(current.bossHpMul > prev.bossHpMul)
    assert.ok(current.enemySpeedCap > prev.enemySpeedCap)
    assert.ok(current.spawnPressureMul > prev.spawnPressureMul)
    assert.ok(current.eliteChanceCap > prev.eliteChanceCap)
    assert.ok(current.rewardMul > prev.rewardMul)
  }
  assert.equal(DIFFICULTIES.hard.doubleAffixChance, 0.22)
  assert.equal(DIFFICULTIES.hell.doubleAffixChance, 0.48)
  ok('简单到地狱的生命、精英耐久、首领血量、移速上限、密度、精英率与奖励倍率严格递增，困难与地狱高密度双词缀')
}

// 11. 远征后段不再叠出过量 Boss 招式层数，且修饰与计时波次无关。
{
  const selection = { mode: 'expedition', difficulty: 'hell' }
  const atWave1 = getWaveModifiers(selection, 1, 12)
  const atWave99 = getWaveModifiers(selection, 99, 12)
  assert.deepEqual(atWave99, atWave1)
  assert.equal(atWave1.bossPatternBonus, 2)
  assert.equal(atWave1.enemyHpMul, 1.66)
  // bossHpMul = 灾变档位 1 × 末章乘算成长 6.5：首领须有乘算成长才能追上玩家 DPS 曲线
  assert.equal(atWave1.bossHpMul, 6.5)
  ok('远征末关修饰固定，额外 Boss 招式层数封顶为 2')
}

// 12. 远征最终 Boss 基础生命取决于关卡和难度，不因玩家耗时增加。
{
  const first = createManager('expedition', 'normal', 8)
  first.manager.wave = 1
  const hpAtWave1 = first.manager.spawnBoss({ type: 'boss-expedition', expeditionBoss: true }).maxHp
  const late = createManager('expedition', 'normal', 8)
  late.manager.wave = 99
  const hpAtWave99 = late.manager.spawnBoss({ type: 'boss-expedition', expeditionBoss: true }).maxHp
  assert.equal(hpAtWave99, hpAtWave1)
  ok('远征最终 Boss 生命不随关卡内耗时膨胀')
}

// 13. 无尽攻击频率按灾变等级平滑提高，并在 30% 处封顶。
{
  const selection = { mode: 'endless', difficulty: 'normal' }
  assert.equal(getWaveModifiers(selection, 20).attackTempoMul, 1)
  assert.equal(getWaveModifiers(selection, 25).attackTempoMul, 1.03)
  assert.equal(getWaveModifiers(selection, 70).attackTempoMul, 1.3)
  assert.equal(getWaveModifiers(selection, 200).attackTempoMul, 1.3)
  ok('无尽每五波提高 3% 攻击频率，并在累计 30% 时封顶')
}

// 14. 远征首领拥有独立耐久曲线；普通章节与最终章均达到目标区间。
{
  const stages = getExpeditionStages('normal')
  const hp = stages.map((stage, index) => {
    const { manager } = createManager('expedition', 'normal', index + 1)
    const encounter = getExpeditionBoss(stage.bossId)
    return manager.beginExpeditionStageBoss(encounter, !!encounter.final).maxHp
  })
  assert.ok(hp[0] >= 400 && hp[hp.length - 1] >= 4000, `普通远征首领曲线抬升（${hp[0]}～${hp[hp.length - 1]}）`)
  assert.ok(hp.every((value, index) => index === 0 || value > hp[index - 1]))

  // 曲线平滑性：不再有末章悬崖，且整体必须明显跑赢玩家纯等级成长
  const steps = hp.slice(1).map((value, index) => value / hp[index])
  assert.ok(steps.every((ratio) => ratio < 1.6), `逐章增幅应平滑（实际最大 ${Math.max(...steps).toFixed(2)}×）`)
  assert.ok(hp[hp.length - 1] / hp[0] > 8, '终章相对首章应有量级差距（追赶玩家乘算成长）')

  const timed = createManager('timed', 'normal', 1).manager
  timed.wave = 5
  assert.equal(timed.spawnBoss({ type: 'boss-knight' }).maxHp, 468)
  ok('普通远征首领生命平滑递增且限时首领基础生命同步抬升')
}

// 15. 限时首领血量按波次档位乘算成长，终局成为真正的强度高峰。
{
  const normal = { mode: 'timed', difficulty: 'normal' }
  const at5 = getWaveModifiers(normal, 5).bossHpMul
  const at10 = getWaveModifiers(normal, 10).bossHpMul
  const at15 = getWaveModifiers(normal, 15).bossHpMul
  const at20 = getWaveModifiers(normal, 20).bossHpMul
  const at25 = getWaveModifiers(normal, 25).bossHpMul
  assert.ok(at5 < at10 && at10 < at15 && at15 < at20 && at20 < at25)
  assert.equal(at5, 2.2)
  assert.equal(at25, 4.2)
  // 档位在波次区间内保持稳定（第 25~29 波同档），避免同段内无意义抖动
  assert.equal(getWaveModifiers(normal, 29).bossHpMul, at25)
  assert.equal(getWaveModifiers({ mode: 'endless', difficulty: 'normal' }, 5).bossHpMul, 2.2)
  assert.ok(Math.abs(getWaveModifiers({ mode: 'endless', difficulty: 'normal' }, 25).bossHpMul - 1.18 * 2.6) < 1e-9)
  ok('限时首领按波次档位乘算成长（2.2 → 4.2），无尽按灾变档位复用同一成长表')
}

// 16. 首领二阶段连击：段数随难度档位提升，破绽窗口随段数延长。
{
  const { manager, game } = createManager('timed', 'normal', 1)
  game.player.invincible = 0
  const boss = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight', patternBonus: 0 })
  boss.attach(game)
  manager._enemies.push(boss)
  manager._bosses.push(boss)
  manager._boss = boss
  assert.equal(boss._chainTotal, 1, '一阶段不连击')
  boss._enterPhaseTwo()
  boss.specialState = 'idle'
  boss.phaseShift = 0
  boss.specialCd = 0
  boss.update(0.016)
  assert.equal(boss._chainTotal, 2, '普通档二阶段为 2 段连击')

  // 打满第一段：冲锋是持续状态（dash → 撞完才收尾），推进到收尾后进入连击间隙
  boss._executeSpecial()
  assert.equal(boss.specialState, 'dash')
  boss.update(1) // 冲刺结束 → _beginRecovery → 进入第二段间隙
  assert.equal(boss.specialState, 'chain')
  assert.equal(boss.vulnerableTimer, 0, '连击中段不给破绽窗口')
  assert.equal(boss._chainStep, 1)

  // 第二段（末段）打完才给破绽，且窗口比单段更长
  boss.update(boss._chainDelay + 0.01) // 进入第二段蓄力
  assert.equal(boss.specialState, 'telegraph')
  boss.specialTimer = 0.001
  boss.update(0.01)
  boss.update(1) // 第二段冲锋结束 → 连击打满
  const chainRecover = boss.vulnerableTimer
  assert.equal(boss.specialState, 'recover')
  assert.ok(chainRecover > 1.6, `连击收尾破绽窗口应延长（实际 ${chainRecover.toFixed(2)}s）`)
  assert.equal(boss._chainStep, 0, '连击结束后段数复位')

  // 高难档位（patternBonus ≥ 1）提升为 3 段
  manager.releaseBossCast(boss) // 交还施法权，否则新首领拿不到强招释放资格
  const hard = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight', patternBonus: 2 })
  hard.attach(game)
  hard._enterPhaseTwo()
  hard.specialState = 'idle'
  hard.phaseShift = 0
  hard.specialCd = 0
  hard.update(0.016)
  assert.equal(hard._chainTotal, 3, '困难/地狱档二阶段为 3 段连击')

  // 转阶段发生在连段中途时，连击状态必须复位（否则二阶段会错接旧连段）
  const midChain = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight', patternBonus: 0 })
  midChain.attach(game)
  midChain._chainStep = 1
  midChain._chainTotal = 2
  midChain._enterPhaseTwo()
  assert.equal(midChain._chainStep, 0, '转阶段复位连击段数')
  assert.equal(midChain._chainTotal, 1, '转阶段复位连击总段数')
  ok('二阶段连击：普通 2 段 / 高难 3 段，中段无破绽、收尾窗口随段数延长')
}

// 17. 血量阈值事件：75% / 25% 各只触发一次，且三种首领加在不同的维度（不同用一张模板）。
{
  const { manager, game } = createManager('timed', 'normal', 1)
  const boss = new Boss({ x: 500, y: 500, wave: 5, type: 'boss-knight' })
  boss.attach(game)
  manager._enemies.push(boss)
  manager._bosses.push(boss)
  manager._boss = boss
  let summons = 0
  const originalSpawnAt = manager.spawnAt.bind(manager)
  manager.spawnAt = (...args) => { summons++; return originalSpawnAt(...args) }

  assert.equal(boss._reinforced, false)
  boss.hp = boss.maxHp * 0.74
  boss.hit(0) // 阈值检查在 hit 路径上（damage > 0 才计入，0 伤害仅验证不误触发）
  assert.equal(boss._reinforced, false, '0 伤害不应触发阈值事件')

  boss.hit(1)
  assert.equal(boss._reinforced, true, '跌破 75% 触发 75% 事件')
  // 骑士王加的是地形：不叫护卫，把落点裂地升成双段（距离轴）
  assert.equal(summons, 0, '骑士王 75% 不召护卫')
  assert.equal(boss._ruptureTier, 2, '骑士王 75% 裂地升为双段')
  const summonsAfter = summons
  const tierAfter = boss._ruptureTier
  boss.hit(1)
  assert.equal(summons, summonsAfter, '75% 事件只触发一次')
  assert.equal(boss._ruptureTier, tierAfter, '双段不会重复叠加')

  const speedBefore = boss.speed
  boss.hp = boss.maxHp * 0.24
  boss.hit(1)
  assert.equal(boss._lastStand, true, '跌破 25% 触发困兽之斗')
  assert.ok(boss.speed > speedBefore, '困兽之斗提升移速')
  assert.equal(boss._ruptureOff, true, '骑士王 25% 不再留地')
  const speedAfter = boss.speed
  boss.hit(1)
  assert.equal(boss.speed, speedAfter, '25% 事件只触发一次')

  // 大法师在同一个阈值上加的是护盾层：3 名护卫＝承伤 ×0.4，25% 后停止召唤
  const mage = new Boss({ x: 600, y: 500, wave: 10, type: 'boss-mage' })
  mage.attach(game)
  manager._enemies.push(mage)
  mage.hp = mage.maxHp * 0.74
  mage.hit(1)
  assert.equal(mage._guards.length, 3, '法师 75% 召 3 名护卫')
  assert.ok(Math.abs(mage._guardMitigation() - 0.4) < 1e-9, '3 层护盾＝承伤 ×0.4')
  mage.hp = mage.maxHp * 0.24
  mage.hit(1)
  assert.equal(mage.summonCd, Infinity, '法师 25% 停止召唤，护盾层只减不增')

  ok('血量阈值事件：75% / 25% 各只触发一次、零伤害不误触发，且骑士王加地形 / 法师加护盾层')
}

// 18. 困难与地狱难度首领耐久加强：普通 < 困难 < 地狱梯级平滑，远征与限时高难均有挑战度。
{
  const expNormal = createManager('expedition', 'normal', 10).manager.beginExpeditionStageBoss(getExpeditionBoss('court_commander'), true).maxHp
  const expHard = createManager('expedition', 'hard', 10).manager.beginExpeditionStageBoss(getExpeditionBoss('court_commander'), true).maxHp
  const expNormal12 = createManager('expedition', 'normal', 12).manager.beginExpeditionStageBoss(getExpeditionBoss('court_commander'), true).maxHp
  const expHell = createManager('expedition', 'hell', 12).manager.beginExpeditionStageBoss(getExpeditionBoss('court_commander'), true).maxHp
  assert.ok(expHard >= expNormal * 1.5 && expHard < expHell, `远征困难统帅落在普通与地狱之间（实际 ${expHard}）`)
  assert.ok(expHell >= expNormal12 * 2.2, `远征地狱统帅应显著高于普通难度（实际 ${expHell} vs ${expNormal12}）`)

  const timedHard = createManager('timed', 'hard').manager
  timedHard.wave = 5
  const [hardW5] = timedHard.spawnBossGroup(getBossWavePlan({ mode: 'timed', difficulty: 'hard' }, 5))
  const timedHell = createManager('timed', 'hell').manager
  timedHell.wave = 5
  const [hellW5] = timedHell.spawnBossGroup(getBossWavePlan({ mode: 'timed', difficulty: 'hell' }, 5))
  assert.ok(hardW5.maxHp >= 450 && hardW5.maxHp < hellW5.maxHp, `限时困难第 5 波首领平滑强化（实际 ${hardW5.maxHp}）`)
  assert.ok(hellW5.maxHp >= 850, `限时地狱第 5 波首领耐久提升（实际 ${hellW5.maxHp}）`)

  const timedNormal = createManager('timed', 'normal').manager
  timedNormal.wave = 25
  const normalFinal = timedNormal.spawnBoss({ type: 'boss-final', finalBoss: true, memberHpMul: 0.78 }).maxHp
  const hardMgr = createManager('timed', 'hard').manager
  hardMgr.wave = 25
  const hardFinal = hardMgr.spawnBoss({ type: 'boss-final', finalBoss: true, memberHpMul: 0.78 }).maxHp
  const hellMgr = createManager('timed', 'hell').manager
  hellMgr.wave = 25
  const hellFinal = hellMgr.spawnBoss({ type: 'boss-final', finalBoss: true, memberHpMul: 0.78 }).maxHp
  assert.ok(hardFinal >= normalFinal * 3.5 && hardFinal < hellFinal * 0.65, `限时困难终审勇者硬核强化（实际 ${hardFinal}）`)
  assert.ok(hellFinal >= normalFinal * 7.5 && hellFinal >= 20000, `限时地狱终审勇者具备硬核挑战度（实际 ${hellFinal}）`)
  for (const diff of ['hard', 'hell']) {
    assert.ok(
      getDifficultyBossHpMultiplier(DIFFICULTIES[diff], { mode: 'timed' }, 25) >
      getDifficultyBossHpMultiplier(DIFFICULTIES[diff], { mode: 'timed' }, 5),
      `限时 ${diff} 首领倍率随波次递增`
    )
  }
  ok('困难与地狱首领耐久加强：普通 < 困难 < 地狱梯度平滑，终局均有足够挑战度')
}

// 19. 首领四层防暴毙护盾：单击上限、2 秒滚动爆发衰减、50%/25% 锁血转阶段与转阶段霸体无敌。
{
  const { manager, game } = createManager('timed', 'hard', 1)
  game.elapsed = 10
  manager.wave = 20
  const boss = manager.spawnBoss({ type: 'boss-knight' })
  const maxHp = boss.maxHp
  // 1) 单击伤害上限（困难非破绽 6.5%）
  boss.hit(maxHp * 0.8)
  const lost1 = maxHp - boss.hp
  assert.ok(lost1 <= maxHp * 0.066, `单次重击被限制在 6.5% 内（实际 ${(lost1 / maxHp * 100).toFixed(2)}%）`)

  // 2) 2 秒滚动窗口爆发衰减（困难超过 11% 开始强衰减）
  for (let i = 0; i < 6; i++) boss.hit(maxHp * 0.065)
  const lostWindow = maxHp - boss.hp
  assert.ok(lostWindow < maxHp * 0.28, `2 秒连续爆发受到自适应衰减（总损血 ${(lostWindow / maxHp * 100).toFixed(1)}%）`)

  // 3) 50% 二阶段强制锁血 + 转阶段霸体无敌
  boss.hp = Math.ceil(maxHp * 0.5) + 5
  game.elapsed = 20 // 清空 2 秒窗口
  boss.hit(maxHp * 0.065)
  assert.equal(boss.phase, 2, '触及 50% 锁血门立即转二阶段')
  assert.equal(boss.hp, Math.ceil(maxHp * 0.5), '50% 锁血门截断溢出伤害')
  assert.ok(boss.phaseShift > 0, '转阶段获得霸体无敌')
  const hpDuringShift = boss.hp
  boss.hit(maxHp * 0.06)
  assert.equal(boss.hp, hpDuringShift, '转阶段霸体期间免疫一切伤害')

  // 4) 25% 困兽锁血门（困难/地狱生效）
  boss.phaseShift = 0
  boss.hp = Math.ceil(maxHp * 0.25) + 5
  game.elapsed = 30
  boss.hit(maxHp * 0.065)
  assert.equal(boss._lastStand, true, '触及 25% 锁血门触发困兽之斗')
  assert.equal(boss.hp, Math.ceil(maxHp * 0.25), '25% 锁血门截断溢出伤害')
  assert.ok(boss.phaseShift > 0, '困兽锁血触发短霸体窗口')
  ok('首领四层防暴毙：单击封顶、2秒爆发衰减、50%/25% 强制锁血门与转阶段霸体全部生效')
}

console.log(`\n难度曲线专项通过：${n} 组断言 ✓`)
