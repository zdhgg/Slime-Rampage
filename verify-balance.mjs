// 难度曲线护栏：远征进度、刷怪压力、移速、恢复窗口与成长收益。
// 运行：node verify-balance.mjs
import assert from 'node:assert/strict'

import { EnemyManager } from './src/game/EnemyManager.js'
import { Enemy } from './src/game/entities/Enemy.js'
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
      devourRadiusBonus: 1,
      strainDevourRadius: 1,
    },
    weaponSystem: { kills: 0 },
    sound: { wave() {}, bossRoar() {} },
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
  assert.equal(atWave1.bossHpMul, 1.99)
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
  assert.deepEqual(hp, [163, 207, 256, 323, 388, 465, 565, 1027])
  assert.ok(hp.every((value, index) => index === 0 || value > hp[index - 1]))

  const timed = createManager('timed', 'normal', 1).manager
  timed.wave = 5
  assert.equal(timed.spawnBoss({ type: 'boss-knight' }).maxHp, 100)
  ok('普通远征首领生命递增至 163～1027，且限时首领生命不受影响')
}

console.log(`\n难度曲线专项通过：${n} 组断言 ✓`)
