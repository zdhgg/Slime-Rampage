// 十二章远征首领：配置唯一性、剧情对白、预警绘制与技能结算护栏。
// 运行：node verify-expedition-bosses.mjs
import assert from 'node:assert/strict'

import { getBossDialogue } from './src/game/DialogueData.js'
import { EnemyManager } from './src/game/EnemyManager.js'
import {
  EXPEDITION_BOSSES,
  getExpeditionBoss,
  getExpeditionStages,
  getRunProfile,
} from './src/game/RunRules.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

const hellStages = getExpeditionStages('hell')
assert.equal(hellStages.length, 12)
assert.equal(new Set(hellStages.map((stage) => stage.bossId)).size, 12)
for (const stage of hellStages) assert.equal(getExpeditionBoss(stage.bossId).id, stage.bossId)
ok('地狱远征十二章各自绑定唯一首领')

const encounters = Object.values(EXPEDITION_BOSSES)
for (const field of ['name', 'special', 'phaseName', 'mechanic']) {
  assert.equal(new Set(encounters.map((boss) => boss[field])).size, 12, `${field} 不得重复`)
}
assert.equal(encounters.filter((boss) => boss.final).length, 1)
ok('十二名首领的姓名、招式、二阶段与机制均不重复')

for (const encounter of encounters) {
  const key = `expedition-${encounter.id}`
  for (const event of ['spawn', 'phase', 'defeat']) {
    assert.ok(getBossDialogue(key, event), `${encounter.id} 缺少 ${event} 对白`)
  }
}
ok('每名首领均有登场、转阶段和败亡剧情对白')

const gradient = { addColorStop() {} }
const ctx = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
    return () => {}
  },
  set() {
    return true
  },
})

function createEncounterGame(stageIndex) {
  const runSelection = { mode: 'expedition', difficulty: 'hell' }
  const effects = { hits: 0, damage: 0, bullets: 0, summons: 0 }
  const game = {
    runSelection,
    runProfile: getRunProfile(runSelection),
    expeditionStage: stageIndex + 1,
    width: 1280,
    height: 720,
    worldWidth: 2400,
    worldHeight: 1800,
    elapsed: 1,
    camera: { x: 560, y: 540 },
    player: {
      x: 1200,
      y: 900,
      radius: 26,
      hp: 20,
      maxHp: 20,
      level: 16,
      dead: false,
      devourRadiusBonus: 1,
      strainDevourRadius: 1,
      hit(damage) {
        effects.hits++
        effects.damage += damage
      },
    },
    weaponSystem: { kills: 0 },
    sound: { wave() {}, bossRoar() {}, enemyShoot() {} },
    dialogue: { tryMinion() {}, sayBoss() {} },
    shakeScreen() {},
  }
  const manager = new EnemyManager()
  manager.attach(game)
  game.enemyManager = manager
  const originalBullet = manager.spawnBullet.bind(manager)
  manager.spawnBullet = (...args) => {
    effects.bullets++
    return originalBullet(...args)
  }
  const originalSpawnAt = manager.spawnAt.bind(manager)
  manager.spawnAt = (...args) => {
    effects.summons++
    return originalSpawnAt(...args)
  }
  return { game, manager, effects }
}

const effectSignatures = []
for (let index = 0; index < hellStages.length; index++) {
  const stage = hellStages[index]
  const encounter = getExpeditionBoss(stage.bossId)
  const { manager, effects } = createEncounterGame(index)
  const boss = manager.beginExpeditionStageBoss(encounter, !!encounter.final)
  assert.equal(boss.stageBossId, encounter.id)
  assert.equal(boss.combatInfo.special, encounter.special)
  boss._startSpecial()
  assert.equal(boss.specialPattern, encounter.mechanic)
  assert.equal(boss.specialState, 'telegraph')
  boss._renderTelegraph(ctx)
  const beforeX = boss.x
  const beforeY = boss.y
  boss._executeSpecial()
  assert.equal(boss.specialState, 'recover')
  assert.ok(boss.vulnerableTimer > 0)
  const moved = boss.x !== beforeX || boss.y !== beforeY ? 1 : 0
  assert.ok(effects.hits + effects.bullets + effects.summons + moved > 0, `${encounter.id} 技能没有效果`)
  effectSignatures.push(`${encounter.mechanic}:${effects.hits}:${effects.bullets}:${effects.summons}:${moved}`)
  boss._enterPhaseTwo()
  assert.equal(boss.combatInfo.phaseName, encounter.phaseName)
}
assert.equal(effectSignatures.length, 12)
ok('十二套技能均可完成预警绘制、效果结算、破绽与二阶段切换')

const escortEncounter = createEncounterGame(0)
const escort = escortEncounter.manager.spawnAt(120, 120, 'knight')
escortEncounter.manager.spawnBullet(80, 80, 0, 'mage')
const bullet = escortEncounter.manager._bullets[0]
const guardian = escortEncounter.manager.beginExpeditionStageBoss(
  getExpeditionBoss(hellStages[0].bossId)
)
assert.ok(escortEncounter.manager.enemies.includes(escort))
assert.ok(escortEncounter.manager.enemies.includes(guardian))
assert.ok(escortEncounter.manager._bullets.includes(bullet))
let reinforcements = 0
escortEncounter.manager.spawn = () => { reinforcements++ }
escortEncounter.manager._spawnTimer = 0
escortEncounter.manager.update(0.25)
assert.equal(reinforcements, 0)
ok('章节首领加入现有战场：保留残兵与弹幕，同时冻结后续普通增援')

console.log(`\n远征首领专项通过：${n} 组断言 ✓`)
