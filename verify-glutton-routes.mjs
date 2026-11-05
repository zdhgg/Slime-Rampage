import assert from 'node:assert/strict'
import { createArena, spawn, settleSwing, pressSpace, learn, rollSkills, dispose, SKILL_DATABASE } from './test-support/arena-fixture.mjs'
import { GLUTTON_ROUTES, GLUTTON_SKILL_BY_ID } from './src/game/GluttonBuild.js'

let count = 0
const learnRoute = (game, id) => game.applySkill(GLUTTON_SKILL_BY_ID[id])
function check(name, test) {
  const game = createArena()
  try { test(game); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(game) }
}

const entranceIds = new Set(Object.values(GLUTTON_ROUTES).map(route => route.seed))

check('前期三个方向入口齐备，且不提前出现路线进阶与终极', game => {
  const cards = rollSkills(game, 100)
  const ids = new Set(cards.map(card => card.id))
  for (const id of entranceIds) assert.ok(ids.has(id), `${id} 必须进入前期随机池`)
  assert.equal(cards.find(card => card.id === 'glut_ram').tier, 1, '重咬是对齐后的 T1 入口')
  assert.ok(cards.every(card => !card.isGluttonSkill && (!card.tier || card.tier === 1)))
  assert.ok(!cards.some(card => card.isGluttonRoute || card.isCapstone))
})

check('探索期每次三选一保底至少一个方向入口，且不出现重复卡', game => {
  for (let i = 0; i < 300; i++) {
    const cards = rollSkills(game, 3)
    assert.equal(cards.length, 3)
    assert.ok(cards.some(card => entranceIds.has(card.id)), '每屏至少一个方向入口')
    assert.equal(new Set(cards.map(card => card.id)).size, 3, '同一屏不出现重复卡')
  }
})

check('Lv.5 觉醒后未确认路线时，重咬不因前置或投入门槛消失', game => {
  game.primarySpec = 'gluttony'
  game.player.level = 5
  game.enemyManager.wave = 4
  game.weaponSystem.gluttonCombat.normalChoices = 2
  const ids = new Set(rollSkills(game, 100).map(card => card.id))
  for (const id of entranceIds) assert.ok(ids.has(id), `${id} 在觉醒后探索期仍在池`)
})

check('裂颚入口点亮后可选路线，确认后不再强制入口卡', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_ram = 1
  const route = rollSkills(game, 3).find(card => card.route === 'jaw' && !card.locked)
  assert.ok(route, '前期拿到重咬即可点亮裂颚破阵')
  game.applySkill(route)
  assert.equal(game.weaponSystem.gluttonCombat.route, 'jaw')
  const cards = rollSkills(game, 100)
  assert.ok(cards.some(card => card.id === 'glut_aftershock'), '本路线进阶正常进入随机池')
  assert.ok(!cards.some(card => card.id === 'glut_mire' || card.id === 'glut_counter'))
})

check('暴食不抽取原生专属震荡扩能；通用卡应用后能正常解除升级暂停', game => {
  const cards = rollSkills(game, 100)
  assert.ok(!cards.some(card => card.id === 'com_shock'), '暴食不能获得只适配原生主动的震荡扩能')
  const common = cards.find(card => card.kind === 'common' && card.id === 'com_vital')
  assert.ok(common, '暴食池仍开放合法通用卡')
  game.pause()
  assert.equal(game.running, false)
  const invalidNativeOnly = { ...SKILL_DATABASE.common.find(skill => skill.id === 'com_shock'), role: 'common' }
  assert.equal(game.applySkill(invalidNativeOnly), false, '过期或伪造的原生专属卡被拒绝')
  assert.equal(game.running, false, '无效卡保持升级暂停，UI 可以继续显示选择项')
  assert.equal(game._pauseLock, 1)
  assert.equal(game.applySkill(common), true)
  assert.equal(game.skillLevels.com_vital, 1)
  assert.equal(game.weaponSystem.gluttonCombat.normalChoices, 1)
  assert.equal(game.running, true, '成功选择通用卡后恢复主循环')
  assert.equal(game._pauseLock, 0, '升级暂停锁已释放')
})

check('已有入口且达到门槛后出现三条路线确认卡，未抽到的路线锁定', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_maw = 1
  const cards = rollSkills(game, 3)
  assert.equal(cards.length, 3)
  assert.equal(cards.find(card => card.route === 'mire').locked, false)
  assert.equal(cards.find(card => card.route === 'jaw').locked, true)
  assert.equal(cards.find(card => card.route === 'shell').locked, true)
})

check('路线锁定后只开放本路线进阶，其他方向终极互斥', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_maw = 1
  const route = rollSkills(game, 3).find(card => !card.locked)
  game.applySkill(route)
  const cards = rollSkills(game, 100)
  assert.equal(game.weaponSystem.gluttonCombat.route, 'mire')
  assert.ok(cards.some(card => card.id === 'glut_mire'))
  assert.ok(!cards.some(card => card.id === 'glut_aftershock' || card.id === 'glut_counter'))
  assert.equal(GLUTTON_ROUTES.mire.ultimate, 'glut_capstone')
})

check('腐沼酸沼造成伤害但不会递归吞噬或返还猎食点', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.route = 'mire'
  learnRoute(game, 'glut_mire')
  const origin = spawn(game, { x: 15, hp: 5 })
  game.weaponSystem.gluttonCombat.onDevoured(origin)
  const target = spawn(game, { x: 15, hp: 100 })
  const before = target.hp, charge = game.player.gluttonCharge
  game.weaponSystem.gluttonCombat.update(.5)
  assert.ok(target.hp < before)
  assert.equal(target.devouring, false)
  assert.equal(game.player.gluttonCharge, charge)
})

check('裂颚余震只追加有限伤害，不重复触发重咬循环', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.route = 'jaw'
  learnRoute(game, 'glut_aftershock')
  game.player.gluttonAftershockLevel = 1
  game.player.gluttonCharge = 1
  const target = spawn(game, { x: 60, hp: 1000 })
  pressSpace(game)
  settleSwing(game.weaponSystem.gluttonCombat)
  assert.ok(target.hp < 1000)
  assert.equal(game.player.gluttonCharge, 0)
})

check('饕甲护甲挡伤时触发有冷却的反击', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.route = 'shell'
  learnRoute(game, 'glut_counter')
  const target = spawn(game, { x: 50, hp: 1000 })
  game.weaponSystem.gluttonCombat.grantGuard()
  game.player.hit(1, { enemyAttack: true })
  assert.ok(target.hp < 1000)
  const after = target.hp
  game.player.hit(1, { enemyAttack: true })
  assert.equal(target.hp, after)
})

check('未获得的终极不会保证出现，已选终极排除其他终极', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.route = 'jaw'
  game.player.level = 14
  game.enemyManager.wave = 10
  game.skillLevels.glut_ram = 3
  game.skillLevels.glut_aftershock = 3
  const cards = rollSkills(game, 100)
  assert.ok(cards.some(card => card.id === 'glut_jaw_ultimate'))
  game.applySkill(cards.find(card => card.id === 'glut_jaw_ultimate'))
  assert.equal(game.skillLevels.glut_jaw_ultimate, 1)
  assert.ok(!rollSkills(game, 100).some(card => card.id === 'glut_shell_ultimate' || card.id === 'glut_capstone'))
})

console.log(`暴食路线验证：${count} 组通过`)
