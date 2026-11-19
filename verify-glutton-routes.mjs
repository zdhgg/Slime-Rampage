import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, settleSwing, pressSpace, learn, rollSkills, dispose, SKILL_DATABASE } from './test-support/arena-fixture.mjs'
import { GLUTTON_VORTEX_COOLDOWN } from './src/game/GluttonCombat.js'
import { GLUTTON_ROUTES, GLUTTON_SKILL_BY_ID } from './src/game/GluttonBuild.js'

let count = 0
const learnRoute = (game, id, times = 1) => {
  for (let i = 0; i < times; i++) assert.equal(game.applySkill(GLUTTON_SKILL_BY_ID[id]), true, `${id} should apply`)
}
function check(name, test) {
  const game = createArena()
  try { test(game); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(game) }
}

const entranceIds = new Set(Object.values(GLUTTON_ROUTES).map(route => route.seed))

check('前期三个方向入口与贪婪巨口齐备，且不提前出现路线进阶与终极', game => {
  const cards = rollSkills(game, 100)
  const ids = new Set(cards.map(card => card.id))
  for (const id of entranceIds) assert.ok(ids.has(id), `${id} 必须进入前期随机池`)
  assert.ok(ids.has('glut_bite_sweep'), '贪婪巨口共享 T1 进入随机池')
  assert.equal(cards.find(card => card.id === 'glut_ram').tier, 1, '腐蚀重碾是裂颚 T1 入口')
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

check('Lv.5 觉醒后未确认路线时，入口不因前置或投入门槛消失', game => {
  game.primarySpec = 'gluttony'
  game.player.level = 5
  game.enemyManager.wave = 4
  game.weaponSystem.gluttonCombat.normalChoices = 2
  const ids = new Set(rollSkills(game, 100).map(card => card.id))
  for (const id of entranceIds) assert.ok(ids.has(id), `${id} 在觉醒后探索期仍在池`)
})

check('腐沼路线修复：胃酸迸发直接归属腐沼池且荒古领主只需腐沼投入达标即可抽取', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_maw = 1
  const route = rollSkills(game, 3).find(card => card.route === 'mire' && !card.locked)
  game.applySkill(route)
  assert.equal(game.weaponSystem.gluttonCombat.route, 'mire')
  const cards = rollSkills(game, 100)
  for (const id of ['glut_acid_aura', 'glut_eruption', 'glut_mire']) {
    assert.ok(cards.some(c => c.id === id), `${id} 必须进入腐沼进阶池`)
  }
  assert.ok(!cards.some(c => c.id === 'glut_aftershock' || c.id === 'glut_counter'))
  game.player.level = 14
  game.enemyManager.wave = 10
  game.skillLevels.glut_maw = 2
  game.skillLevels.glut_acid_aura = 2
  assert.ok(rollSkills(game, 100).some(c => c.id === 'glut_capstone'), '腐沼路线即使不点 glut_eruption 也能达到荒古领主')
})

check('裂颚路线全新改造：聚怪碎盾、血宴连噬返冷却与断岳暴食双震晕狂怒', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_ram = 1
  const route = rollSkills(game, 3).find(card => card.route === 'jaw' && !card.locked)
  game.applySkill(route)
  assert.equal(game.weaponSystem.gluttonCombat.route, 'jaw')
  assert.equal(game.player.gluttonGuard, 1, '确认裂颚立即赠 1 层胃铠')

  learnRoute(game, 'glut_aftershock', 2)
  learnRoute(game, 'glut_pounce_reset', 2)
  learnRoute(game, 'glut_frenzy_jaw', 2)
  learnRoute(game, 'glut_breach', 2)
  game.player.level = 14; game.enemyManager.wave = 10
  assert.ok(rollSkills(game, 100).some(c => c.id === 'glut_jaw_ultimate'))
  learnRoute(game, 'glut_jaw_ultimate')

  const c = game.weaponSystem.gluttonCombat
  c.auraTimer = 99
  const basePull = GLUTTON_VORTEX_COOLDOWN
  for (let i = 0; i < 4; i++) spawn(game, { x: 145, y: i * 8 - 12, hp: 1 })
  const survivor = spawn(game, { x: -160, y: 0, hp: 1000 })
  const boss = spawnBoss(game, 1000); boss.x = game.player.x + 65; boss.shieldHits = 2
  pressSpace(game)
  settleSwing(c)
  assert.equal(boss.shieldHits, 0, '裂颚路线吸噬击碎普通护盾')
  assert.ok(boss.gluttonBreachTime > 0 && boss.gluttonBreachVuln > 0, '破阵重压施加易伤')
  assert.ok(game.player.gluttonFrenzyTimer > 0, '裂颚狂咬激活狂热攻速与扇角')
  assert.ok(game.player.gluttonBerserkTimer > 0, '单次吸噬吞杀 ≥3 激活断岳狂怒')
  assert.ok(survivor.elementStun >= 0.6, '断岳双震第二波地震波震晕近敌')
  assert.ok(game.player.strainSkillCd < basePull, '血宴连噬返还冷却')
  assert.equal(c.canPounceFollowup, false, '彻底移除与暗影重样的免费二段位移')
})

check('饕甲路线全套机制：胃铠最高 5 层、3.5s 再生、蓄甲爆刺与挡伤缩 CD', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_bulk = 1
  const route = rollSkills(game, 3).find(card => card.route === 'shell' && !card.locked)
  game.applySkill(route)
  assert.equal(game.weaponSystem.gluttonCombat.route, 'shell')
  const cards = rollSkills(game, 100)
  for (const id of ['glut_counter', 'glut_sub_digest', 'glut_cow', 'glut_thorns_surge']) {
    assert.ok(cards.some(c => c.id === id), `${id} 必须进入饕甲路线池`)
  }
  learnRoute(game, 'glut_counter', 2)
  learnRoute(game, 'glut_sub_digest', 2)
  learnRoute(game, 'glut_thorns_surge', 1)
  game.player.level = 14; game.enemyManager.wave = 10
  learnRoute(game, 'glut_shell_ultimate')

  const c = game.weaponSystem.gluttonCombat
  assert.equal(c.guardMax, 3, 'base 1 + shell 1 + 不灭胃铠 1 = 3')
  learn(game, 'glut_bulk', 2)
  assert.equal(c.guardMax, 5, '硬化 Lv.3 后封顶 5 层，非无敌 7 层')
  game.player.update(3.6)
  assert.equal(game.player.gluttonGuard, 1, '不灭胃铠每 3.5 秒自动再生 1 层')

  const foe = spawn(game, { x: 50, hp: 1000 })
  game.player.strainSkillCd = 4
  game.player.hit(1, { enemyAttack: true })
  assert.ok(foe.hp < 1000, '反震伤害命中敌人')
  assert.ok(foe.elementStun > 0, '不灭胃铠挡伤眩晕近敌')
  assert.ok(game.player.strainSkillCd <= 3.55, '挡伤缩短深渊吸噬 0.5s 冷却')

  for (let hit = 0; hit < 2; hit++) {
    game.player.invincible = 0
    game.player.hit(1, { enemyAttack: true })
  }
  assert.ok(game.player.gluttonGuard >= 1, '蓄甲爆刺每承受 3 次攻击立刻再生 +1 层胃铠')
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
  assert.equal(game.running, false, '无效卡保持升级暂停')
  assert.equal(game._pauseLock, 1)
  assert.equal(game.applySkill(common), true)
  assert.equal(game.skillLevels.com_vital, 1)
  assert.equal(game.weaponSystem.gluttonCombat.normalChoices, 1)
  assert.equal(game.running, true, '成功选择通用卡后恢复主循环')
  assert.equal(game._pauseLock, 0, '升级暂停锁已释放')
})

check('已有入口且达到门槛后出现三条路线确认卡，未抽到的路线锁定，终极互斥', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.normalChoices = 5
  game.enemyManager.wave = 6
  game.skillLevels.glut_maw = 1
  const cards = rollSkills(game, 3)
  assert.equal(cards.length, 3)
  assert.equal(cards.find(card => card.route === 'mire').locked, false)
  assert.equal(cards.find(card => card.route === 'jaw').locked, true)
  assert.equal(cards.find(card => card.route === 'shell').locked, true)

  game.applySkill(cards.find(c => !c.locked))
  game.player.level = 14; game.enemyManager.wave = 10
  game.skillLevels.glut_maw = 3; game.skillLevels.glut_mire = 1
  assert.ok(rollSkills(game, 100).some(c => c.id === 'glut_capstone'))
  learn(game, 'glut_capstone')
  assert.ok(!rollSkills(game, 100).some(c => c.id === 'glut_jaw_ultimate' || c.id === 'glut_shell_ultimate'))
})

check('腐沼酸沼造成伤害但不会递归吞噬，并可牵引白旗猎物', game => {
  game.primarySpec = 'gluttony'
  game.weaponSystem.gluttonCombat.route = 'mire'
  learnRoute(game, 'glut_mire')
  const origin = spawn(game, { x: 15, hp: 5 })
  game.weaponSystem.gluttonCombat.onDevoured(origin)
  const target = spawn(game, { x: 35, hp: 100 })
  const before = target.hp
  game.weaponSystem.gluttonCombat.update(.5)
  assert.ok(target.hp < before)
  assert.equal(target.devouring, false)
})

console.log(`暴食路线验证：${count} 组通过`)
