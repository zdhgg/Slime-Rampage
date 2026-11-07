import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, settleSwing, pressSpace, learn, dispose, ctx2d, rollSkills } from './test-support/arena-fixture.mjs'
import { rollBossSkills } from './src/game/SkillPool.js'
import { GLUTTON_HEAVY_DAMAGE } from './src/game/GluttonCombat.js'

/**
 * 原生黏液「祖细胞拟态」契约：
 *  - Lv.1~4 早期池仍只含三系 T1 + 通用（暴食/共生 T1 在拟态前是死卡）；
 *  - Lv.5 里程碑五系血统任选（拟态暴食/共生补发机制层：吞噬+重咬 / 伙伴+鼓舞）；
 *  - 拟态给机制不给属性：远程普攻保留，空格换成签名技；
 *  - 拟态暴食独有「吞噬 → 消化 → 元素吸收」签名链路；
 *  - Lv.9 副专精共鸣不受影响。
 */

let count = 0
function check(name, test) {
  const game = createArena('origin')
  try { test(game); console.log(`  ✓ ${++count}. ${name}`) } finally { dispose(game) }
}
function awaken(game, spec) {
  game.player.level = 5
  const card = rollSkills(game).find(s => s.isMilestone && s.spec === spec)
  assert.ok(card, `milestone card for ${spec} should exist`)
  game.applySkill(card)
  return card
}

check('Lv.1~4 早期池：三系 T1 + 通用，暴食/共生不进池', g => {
  g.player.level = 2
  const ids = new Set()
  for (let i = 0; i < 40; i++) for (const s of rollSkills(g, 30)) ids.add(s.id)
  for (const s of rollSkills(g, 30)) {
    assert.ok(!s.id.startsWith('glut_'), `gluttony T1 ${s.id} leaked into early pool`)
    assert.ok(!s.id.startsWith('pet_'), `symbiosis T1 ${s.id} leaked into early pool`)
  }
  assert.ok([...ids].some(id => id.startsWith('gat_')), 'gatling T1 expected')
  assert.ok([...ids].some(id => id.startsWith('com_')), 'common expected')
})

check('Lv.5 里程碑：五系血统全陈列，拟态卡写明机制授予', g => {
  g.player.level = 5
  const specs = rollSkills(g).map(s => s.spec).sort()
  assert.deepEqual(specs, ['assassin', 'elemental', 'gatling', 'gluttony', 'symbiosis'])
  const gluttonCard = rollSkills(g).find(s => s.spec === 'gluttony')
  assert.match(gluttonCard.bonus, /拟态授予/)
  const petCard = rollSkills(g).find(s => s.spec === 'symbiosis')
  assert.match(petCard.bonus, /拟态授予/)
})

check('拟态暴食：远程普攻保留 + 获得吞噬权限 + 猎食点 + 空格重咬', g => {
  awaken(g, 'gluttony')
  assert.equal(g.mimicryStrain, 'glutton')
  assert.equal(g.canDevour, true)
  assert.equal(g.player.gluttonCharge, 0, '拟态授予后猎食点资源从 0 启用（非 -1 哨兵）')
  assert.equal(g.strainSkill.id, 'devour_pulse', '空格换成暴食重咬')
  // 远程普攻仍是飞弹，不换近战
  const e = spawn(g, { x: 300, hp: 200 })
  g.weaponSystem.cooldown = 0
  g.weaponSystem.update(0.02)
  assert.equal(g.weaponSystem._projectiles.length > 0, true, '拟态暴食普攻仍为远程飞弹')
  assert.equal(g.weaponSystem.gluttonCombat.swing, null, '拟态不自动咬击')
  // 空格重咬：近处目标，消耗猎食点
  g.weaponSystem._projectiles.length = 0
  const near = spawn(g, { x: 60, hp: 200 })
  g.player.gluttonCharge = 1
  pressSpace(g)
  assert.equal(g.player.gluttonCharge, 0)
  settleSwing(g.weaponSystem.gluttonCombat)
  assert.equal(near.hp, 200 - GLUTTON_HEAVY_DAMAGE)
  // 贴身吞噬：残血敌人进入吸入口径
  const weak = spawn(g, { x: 10, hp: 1 })
  weak.devourable = true
  g.enemyManager._checkDevour()
  assert.ok(weak.devouring, '拟态暴食可吞噬贴身的残血敌人')
})

check('拟态暴食 × 元素：吞噬点亮消化链（签名路线）', g => {
  awaken(g, 'gluttony')
  assert.equal(g.canUseElements, true, 'origin 保留元素权限')
  g.player.elements.set('fire', 2)
  const ws = g.weaponSystem
  const weak = spawn(g, { x: 10, hp: 1 })
  weak.devourable = true
  ws.onDevoured(weak) // 直接走吞噬结算链
  assert.ok(ws.digestCharge > 0, '吞噬向消化能量注入（暴食血统得不到这条链）')
})

check('拟态共生：岩甲团团到场 + 空格换共生鼓舞 + 招募位开放', g => {
  awaken(g, 'symbiosis')
  assert.equal(g.mimicryStrain, 'summoner')
  assert.equal(g.weaponSystem.petCombat.enabled, true)
  g.weaponSystem.petCombat.update(0.02)
  assert.equal(g.weaponSystem.petCombat.items.length, 1, '岩甲团团应到场')
  assert.equal(g.weaponSystem.petCombat.items[0].type, 'guardian')
  assert.equal(g.strainSkill.id, 'companion_hunt', '空格换成共生鼓舞')
  // 鼓舞释放：在场伙伴响应，进入冷却
  pressSpace(g)
  assert.ok(g.weaponSystem.petCombat.rallyTime > 0, '鼓舞应已生效')
  assert.ok(g.player.strainSkillCd > 0, '冷却型签名技进入冷却')
  // 共生树招募位对拟态开放（requiresStrain 按拟态血统判定）
  g.player.level = 6
  const partnerIds = new Set()
  for (let i = 0; i < 30; i++) for (const s of rollSkills(g, 30)) if (s.isPartnerChoice) partnerIds.add(s.id)
  assert.ok(partnerIds.size >= 1, '觉醒后应出现伙伴招募选项')
})

check('拟态远程系（加特林）：空格保黏液震荡，无拟态血统', g => {
  awaken(g, 'gatling')
  assert.equal(g.mimicryStrain, null)
  assert.equal(g.strainSkill.id, 'slime_shock')
  assert.equal(g.canDevour, false)
  assert.equal(g.player.gluttonCharge, -1, '无猎食点资源')
})

check('震荡分化·机枪形态：击退中追加齐射（复用疾射通道）', g => {
  awaken(g, 'gatling')
  const e = spawn(g, { x: 200, hp: 500 })
  pressSpace(g)
  assert.ok(g.weaponSystem._projectiles.length > 0 || g.weaponSystem.rapidVolley, '机枪形态震荡应追加齐射')
  // 分时齐射推进后清空
  for (let i = 0; i < 40; i++) g.weaponSystem.update(0.05)
  assert.equal(g.weaponSystem.rapidVolley, null)
})

check('震荡分化·元素形态：已吸收附魔扩散给被击退者', g => {
  awaken(g, 'elemental')
  const e = spawn(g, { x: 60, hp: 500 })
  e.x = g.player.x + 60; e.y = g.player.y
  g.player._procs = { burn: { chance: 1, duration: 2 }, freeze: { chance: 1, duration: 1 } }
  pressSpace(g)
  assert.ok(e.burnHits > 0, '元素形态震荡应把燃烧附魔扩散到被击退者')
  assert.ok(e.freeze > 0, '元素形态震荡应把冻结附魔扩散到被击退者')
})

check('里程碑卡「已投入」徽标：早期混搭的沉淀可见', g => {
  learn(g, 'gat_multishot', 2)
  learn(g, 'ass_lethal', 1)
  g.player.level = 5
  const cards = rollSkills(g)
  const gat = cards.find(s => s.spec === 'gatling')
  const ass = cards.find(s => s.spec === 'assassin')
  const ele = cards.find(s => s.spec === 'elemental')
  assert.match(gat.bonus, /已投入 2 级/)
  assert.match(ass.bonus, /已投入 1 级/)
  assert.doesNotMatch(ele.bonus, /已投入/, '未投入的系不显示徽标')
})

check('Lv.9 副专精共鸣：剩余四系全陈列（元素挂件对 origin 开放、共生补挂件）', g => {
  awaken(g, 'gluttony')
  g.player.level = 9
  const specs = rollSkills(g).filter(s => s.isMilestone).map(s => s.spec).sort()
  // 元素挂件对 canUseElements 角色开放（origin 是元素进化体）；
  // 共生补了共鸣挂件（残响伙伴/兽灵回响）；暴食只剩坚韧肉壁（部分展示）。
  assert.deepEqual(specs, ['assassin', 'elemental', 'gatling', 'symbiosis'])
})

check('共生共鸣·残响伙伴：非共生拟态也可获得弱化伙伴投影', g => {
  awaken(g, 'gatling')
  g.secondarySpec = 'symbiosis'
  learn(g, 'sym_sub_echo')
  assert.equal(g.weaponSystem.petCombat.enabled, true, '残响挂件开启伙伴系统')
  g.weaponSystem.petCombat.update(0.02)
  assert.equal(g.weaponSystem.petCombat.items.length, 1, '只有残响，不含岩甲团团')
  assert.equal(g.weaponSystem.petCombat.items[0].type, 'echo')
  learn(g, 'sym_sub_surge')
  assert.ok(g.weaponSystem.petCombat.damageScale > 1.39, '兽灵回响提升伙伴伤害')
})

check('原生拟态后仍抽原生秘典，元素四本保持职业隔离', g => {
  // P2 结论：维持元素血统独占（从 origin 卡池过滤），不改为拟态/专精判定——
  // 与 com_shock 的 originOnly 同向，保护血统终局身份；origin 拟态已拿机制层。
  awaken(g, 'elemental') // origin 主专精走元素树也不行
  for (let i = 0; i < 30; i++) {
    const picks = rollBossSkills(g, 5)
    assert.ok(picks.every(s => s.strain === 'origin'), 'origin 不应抽到元素血统独占秘典')
  }
  const ele = createArena('elemental')
  try {
    ele.primarySpec = 'elemental'
    let seen = false
    for (let i = 0; i < 60 && !seen; i++) seen = rollBossSkills(ele, 5).some(s => s.id === 'boss_elemental_sigil')
    assert.ok(seen, '元素史莱姆应能抽到余辉法印')
  } finally { dispose(ele) }
})

check('重咬结算后飞弹与咬击反馈互不干扰；重开清除拟态', g => {
  awaken(g, 'gluttony')
  const near = spawn(g, { x: 60 })
  g.player.gluttonCharge = 1
  pressSpace(g)
  settleSwing(g.weaponSystem.gluttonCombat)
  g.weaponSystem.gluttonCombat.render(ctx2d)
  g.reset()
  g.applyStartingStrain('origin')
  assert.equal(g.mimicryStrain, null)
  assert.equal(g.canDevour, false)
  assert.equal(g.strainSkill.id, 'slime_shock')
  assert.equal(g.player.gluttonCharge, -1)
})

console.log(`原生黏液拟态契约：${count} 组通过`)
