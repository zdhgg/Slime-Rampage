import assert from 'node:assert/strict'
import { captureExpeditionCheckpoint, restoreExpeditionCheckpoint, captureTowerCheckpoint, restoreTowerCheckpoint, withRunRandom } from './src/game/RunCheckpoint.js'
const gradient = { addColorStop() {} }
const ctx = new Proxy({}, { get: (_, key) => ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => gradient : () => {}, set: () => true })
const canvas = { getBoundingClientRect: () => ({ width: 1280, height: 720 }), getContext: () => ctx, addEventListener() {}, removeEventListener() {} }
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = { createElement: () => canvas, addEventListener() {}, removeEventListener() {}, hidden: false }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
const { GameEngine } = await import('./src/game/GameEngine.js')
const { rollSkills } = await import('./src/game/SkillPool.js')
const { getExpeditionBoss } = await import('./src/game/RunRules.js')
const { STRAIN_IDS } = await import('./src/game/Strains.js')
const { setAccountCampaign } = await import('./src/game/gameplay/tower-defense/TowerDefenseSave.js')
const engine = GameEngine.create(canvas)
try {
  for (const strain of STRAIN_IDS) {
    engine.configureGameplay('arena')
    engine.configureRun({ mode: 'expedition', difficulty: 'normal' })
    engine.applyStartingStrain(strain)
    engine.reset()
    for (let level = 2; level <= 12; level++) {
      engine.player.level = level
      engine._ensureRoleAwakening()
      const options = withRunRandom(engine, () => rollSkills(engine, 3))
      if (options.length) engine.applySkill(options[0])
    }
    // A real chapter transition resets temporary effects before snapshotting.
    engine._enterExpeditionStage(3)
    engine.elapsed = 123
    engine.player.hp = Math.max(1, engine.player.maxHp - 1)
    engine.player.strainSkillCd = 2.5
    engine.player.elements.set('fire', 2)
    engine.player._refreshElements()
    engine.weaponSystem.kills = 80
    engine.weaponSystem.eliteKills = 4
    engine.worldEvents.completed = 3
    engine.worldEvents.completedByType = { hunt: 2, beacon: 1 }
    engine._expeditionBaseline = { kills: 80, elites: 4, events: 3, eventsByType: { hunt: 2, beacon: 1 } }
    const saved = JSON.parse(JSON.stringify(captureExpeditionCheckpoint(engine)))
    const invalid = structuredClone(saved)
    invalid.metrics = null
    const previousPlayer = engine.player
    assert.throws(() => restoreExpeditionCheckpoint(engine, invalid))
    assert.equal(engine.player, previousPlayer, 'reject invalid data before changing the live engine')
    saved.engine.reset = 'cannot replace a method'
    saved.components.player.update = 'cannot replace a method'
    const before = { hp: engine.player.hp, maxHp: engine.player.maxHp, speed: engine.player.speed,
      level: engine.player.level, damage: engine.weaponSystem.damage, skills: { ...engine.skillLevels },
      spellElements: [...engine.weaponSystem.spellCombat.elements], route: engine.originRoute,
      shield: engine.weaponSystem.spellCombat.shield.points }
    const expectedRandom = withRunRandom(engine, () => Array.from({ length: 8 }, () => Math.random()))
    restoreExpeditionCheckpoint(engine, saved)
    assert.equal(typeof engine.reset, 'function')
    assert.equal(typeof engine.player.update, 'function')
    assert.equal(engine.startingStrain, strain)
    assert.equal(engine.expeditionStage, 3)
    assert.equal(engine.runState, 'expedition-intro')
    assert.equal(engine.player.hp, before.hp)
    assert.equal(engine.player.maxHp, before.maxHp)
    assert.equal(engine.player.level, before.level)
    assert.equal(engine.player.speed, before.speed)
    assert.equal(engine.player.strainSkillCd, 2.5)
    assert.equal(engine.player.elements.get('fire'), 2)
    assert.equal(engine.weaponSystem.damage, before.damage)
    assert.deepEqual(engine.skillLevels, before.skills)
    assert.deepEqual([...engine.weaponSystem.spellCombat.elements], before.spellElements)
    assert.equal(engine.weaponSystem.spellCombat.shield.points, before.shield)
    assert.equal(engine.originRoute, before.route)
    assert.equal(engine.weaponSystem.kills, 80)
    assert.equal(engine.elapsed, 123)
    assert.deepEqual(engine._expeditionBaseline.eventsByType, { hunt: 2, beacon: 1 })
    assert.deepEqual(withRunRandom(engine, () => Array.from({ length: 8 }, () => Math.random())), expectedRandom)
    engine.start()
    for (let i = 0; i < 5; i++) { engine.update(.05); engine.render() }
    engine.stop()
    assert.equal(engine.runFinished, false)
    console.log(`✓ ${strain}: actual skills, build, resources, cooldowns and random state survive chapter resume`)
  }
  engine.setGenes({ swift: 1, expand: 1, magnet: 1 })
  engine._enterExpeditionStage(3)
  const magnetCheckpoint = captureExpeditionCheckpoint(engine)
  const legacyMagnet = structuredClone(magnetCheckpoint)
  legacyMagnet.components.player.geneMagnetAll = 1
  legacyMagnet.components.player.pickupRadius = 215.625
  restoreExpeditionCheckpoint(engine, legacyMagnet)
  assert.equal(engine.player.pickupRadius, 431.25, '旧版全域磁感按已保存的局内半径翻倍')
  restoreExpeditionCheckpoint(engine, captureExpeditionCheckpoint(engine))
  assert.equal(engine.player.pickupRadius, 431.25, '新版续玩存档只应用一次翻倍')
  engine.setGenes({})
  engine.applyStartingStrain('origin')
  engine.reset()
  engine.evolutionEvent = () => {}
  const { player, gemManager } = engine
  const skillChoices = []
  let reward, checkpoint, coreChoice
  engine.onLevelUp = options => skillChoices.push(options)
  engine.onExpeditionReward = info => { reward = info }
  engine.onCheckpoint = saved => { checkpoint = saved }
  engine.onFusionConfirm = info => { coreChoice = info }
  player.expGainMul = 1.5
  player.exp = 7
  gemManager.spawn(80, 80, 101)
  gemManager.spawn(200, 200, 3).state = 'magnet'
  gemManager.spawn(400, 400, 0, 'poison')
  engine.runState = 'expedition-guardian'
  const boss = engine.enemyManager.beginExpeditionStageBoss(getExpeditionBoss(engine._expeditionDefinition.bossId))
  boss.destroy()
  engine.weaponSystem._settleKill(boss)
  assert.deepEqual(gemManager._gems.filter(gem => gem.type !== 'exp').map(gem => gem.type), ['poison'])
  const totalExp = player.exp + gemManager._gems
    .filter(gem => gem.type === 'exp')
    .reduce((sum, gem) => sum + Math.round(gem.value * player.expGainMul), 0)
  engine._updateExpedition(.7)
  assert.equal(reward.phase, 'boss')
  const tome = reward.options.find(card => card.isBossSkill)
  assert.equal(engine.resolveExpeditionReward(tome.id), true)
  assert.equal(engine.resolveExpeditionReward(tome.id), false)
  assert.equal(engine.expeditionStage, 2)
  assert.equal(engine.runState, 'expedition-intro')
  assert.equal(player.exp, totalExp)
  assert.equal(skillChoices.length, 0)
  assert.equal(player.level, 1)
  assert.equal(gemManager.count, 1)
  const [entranceCore] = gemManager._gems
  assert.equal(entranceCore.coreChoices.length, 2)
  gemManager.update(.05)
  assert.equal(entranceCore.state, 'idle')
  assert.equal(coreChoice, undefined)

  const savedLoot = JSON.parse(JSON.stringify(checkpoint))
  assert.equal(savedLoot.components.player.exp, totalExp)
  assert.deepEqual(savedLoot.entranceCore, { type: entranceCore.type, coreChoices: entranceCore.coreChoices })
  const invalidCore = structuredClone(savedLoot)
  invalidCore.entranceCore.type = 'exp'
  assert.throws(() => restoreExpeditionCheckpoint(engine, invalidCore))
  const legacyCheckpoint = structuredClone(savedLoot)
  delete legacyCheckpoint.entranceCore
  restoreExpeditionCheckpoint(engine, legacyCheckpoint)
  assert.equal(gemManager.count, 0)
  assert.equal(player.exp, totalExp)
  restoreExpeditionCheckpoint(engine, savedLoot)
  assert.equal(gemManager.count, 1)
  const [restoredCore] = gemManager._gems
  assert.deepEqual([restoredCore.x, restoredCore.y, restoredCore.type, restoredCore.coreChoices],
    [entranceCore.x, entranceCore.y, entranceCore.type, entranceCore.coreChoices])
  engine.start()
  engine.update(.05)
  assert.equal(skillChoices.length, 0, '读档后先播放开场，再结算升级')
  engine.update(2)
  assert.equal(engine.runState, 'active')
  assert.equal(player.level, 2)
  assert.equal(skillChoices.length, 1)
  assert.equal(engine._pauseLock, 1)
  while (skillChoices.length) {
    assert.equal(skillChoices.length, 1)
    const level = player.level
    const canLevelAgain = player.exp >= player.maxExp
    const [skill] = skillChoices.shift()
    assert.equal(engine.applySkill(skill), true)
    assert.equal(player.level, level + Number(canLevelAgain))
  }
  assert.ok(player.level >= 3)
  assert.ok(player.exp < player.maxExp)
  assert.equal(engine._pauseLock, 0)
  assert.equal(restoredCore.state, 'idle')
  player.x = restoredCore.x
  player.y = restoredCore.y
  for (let i = 0; i < 3 && !coreChoice; i++) gemManager.update(.05)
  assert.equal(coreChoice?.coreChoice, true)
  assert.equal(engine.resolveOriginCoreChoice(restoredCore.coreChoices[1]), true)
  assert.equal(gemManager.count, 0)
  assert.equal(player.elements.get(restoredCore.coreChoices[1]), 1)
  console.log('✓ Expedition loot: full XP and the guardian core survive checkpoints, with level choices deferred until after the intro')

  setAccountCampaign({ unlockedStage: 20, stageStars: {}, tutorialCompleted: true })
  engine.configureGameplay('tower-defense')
  for (const endless of [false, true]) {
    if (endless) engine.gameplay.startEndlessMode(4)
    else engine.gameplay.loadStage(4)
    const game = engine.gameplay
    game.gold = 999
    const slot = [...game.unlockedSlots][0]
    assert.equal(game.placeTower(slot, 'rapid'), true)
    game.towers[0].cooldown = .73
    game.baseHp = 12
    game.director.waveIndex = 1
    game.director.completedWaves = 2
    game.director.phase = 'intermission'
    game.director.timer = 8
    game.elapsedTime = 77
    game.kills = 44
    const saved = JSON.parse(JSON.stringify(captureTowerCheckpoint(engine)))
    assert.ok(saved)
    assert.equal(saved.director.waves, undefined)
    const expected = { gold: game.gold, towers: structuredClone(game.towers), unlocked: [...game.unlockedSlots] }
    restoreTowerCheckpoint(engine, saved)
    assert.equal(engine.gameplay.baseHp, 12)
    assert.equal(engine.gameplay.gold, expected.gold)
    assert.equal(engine.gameplay.elapsedTime, 77)
    assert.equal(engine.gameplay.kills, 44)
    assert.equal(engine.gameplay.director.completedWaves, 2)
    assert.equal(engine.gameplay.director.timer, 8)
    assert.equal(engine.gameplay.isEndless, endless)
    assert.deepEqual(engine.gameplay.towers, expected.towers)
    assert.deepEqual([...engine.gameplay.unlockedSlots], expected.unlocked)
    engine.start(); engine.update(.05); engine.render(); engine.stop()
    console.log(`✓ Tower defense ${endless ? 'endless' : 'campaign'} resumes wave preparation with exact tower economy`)
  }
  assert.throws(() => restoreTowerCheckpoint(engine, { version: 99 }))
  engine.gameplay.director.phase = 'spawning'
  assert.equal(captureTowerCheckpoint(engine), null)
} finally { engine.destroy() }
