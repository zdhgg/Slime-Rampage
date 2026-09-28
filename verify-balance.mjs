// 难度曲线护栏：远征进度、刷怪压力、移速、恢复窗口与成长收益。
// 运行：node verify-balance.mjs
import assert from 'node:assert/strict'

import { EnemyManager } from './src/game/EnemyManager.js'
import { Enemy } from './src/game/entities/Enemy.js'
import { Boss } from './src/game/entities/Boss.js'
import {
  DIFFICULTIES,
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
    assert.ok(current.enemySpeedCap > prev.enemySpeedCap)
    assert.ok(current.spawnPressureMul > prev.spawnPressureMul)
    assert.ok(current.eliteChanceCap > prev.eliteChanceCap)
  }
  ok('简单到地狱的生命、移速上限、密度与精英率严格递增')
}

// 11. 远征后段不再叠出过量 Boss 招式层数，且修饰与计时波次无关。
{
  const selection = { mode: 'expedition', difficulty: 'hell' }
  const atWave1 = getWaveModifiers(selection, 1, 12)
  const atWave99 = getWaveModifiers(selection, 99, 12)
  assert.deepEqual(atWave99, atWave1)
  assert.equal(atWave1.bossPatternBonus, 2)
  assert.equal(atWave1.enemyHpMul, 1.66)
  // bossHpMul = 灾变档位 1 × 末章乘算成长 5.12：首领须有乘算成长才能追上玩家 DPS 曲线
  assert.equal(atWave1.bossHpMul, 5.12)
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
  assert.deepEqual(hp, [163, 220, 292, 397, 516, 674, 895, 1426])
  assert.ok(hp.every((value, index) => index === 0 || value > hp[index - 1]))

  // 曲线平滑性：不再有末章悬崖（旧口径终章相对前章 +82%~+99%），
  // 且整体必须明显跑赢玩家纯等级成长（Lv.1→20 约 4.3×），否则后期首领相对变脆
  const steps = hp.slice(1).map((value, index) => value / hp[index])
  assert.ok(steps.every((ratio) => ratio < 1.6), `逐章增幅应平滑（实际最大 ${Math.max(...steps).toFixed(2)}×）`)
  assert.ok(hp[hp.length - 1] / hp[0] > 8, '终章相对首章应有量级差距（追赶玩家乘算成长）')

  const timed = createManager('timed', 'normal', 1).manager
  timed.wave = 5
  assert.equal(timed.spawnBoss({ type: 'boss-knight' }).maxHp, 100)
  ok('普通远征首领生命递增至 163～1426，曲线平滑且限时首领基础生命不受影响')
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
  assert.equal(at5, 1)
  assert.equal(at25, 3.32)
  // 档位在波次区间内保持稳定（第 25~29 波同档），避免同段内无意义抖动
  assert.equal(getWaveModifiers(normal, 29).bossHpMul, at25)
  // 无尽仍由灾变档位负责，不受限时档位表影响
  assert.equal(getWaveModifiers({ mode: 'endless', difficulty: 'normal' }, 25).bossHpMul, 1.18)
  ok('限时首领按波次档位乘算成长（1 → 3.32），无尽仍走灾变档位')
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

// 17. 血量阈值事件：75% 召唤护卫、25% 困兽之斗，且各自只触发一次。
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
  assert.equal(boss._reinforced, true, '跌破 75% 触发召唤护卫')
  assert.equal(summons, 2)
  const summonsAfter = summons
  boss.hit(1)
  assert.equal(summons, summonsAfter, '75% 事件只触发一次')

  const speedBefore = boss.speed
  boss.hp = boss.maxHp * 0.24
  boss.hit(1)
  assert.equal(boss._lastStand, true, '跌破 25% 触发困兽之斗')
  assert.ok(boss.speed > speedBefore, '困兽之斗提升移速')
  const speedAfter = boss.speed
  boss.hit(1)
  assert.equal(boss.speed, speedAfter, '25% 事件只触发一次')
  ok('血量阈值事件：75% 增援 / 25% 困兽之斗，各只触发一次且零伤害不误触发')
}

console.log(`\n难度曲线专项通过：${n} 组断言 ✓`)
