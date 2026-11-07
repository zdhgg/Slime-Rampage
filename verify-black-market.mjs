import assert from 'node:assert/strict'
import { createArena, dispose } from './test-support/arena-fixture.mjs'
import { applyGenes, getChosenOrigin, getGenePurchaseState } from './src/game/GenePool.js'
import { getGenePresentation } from './src/components/blackMarketPresentation.js'

let checks = 0
const check = (name, test) => {
  try { test(); console.log(`✓ ${++checks}. ${name}`) } finally { }
}

check('新通用原核遵守依赖和终点互斥', () => {
  const genes = { giant: 2, leech: 1 }
  assert.equal(getGenePurchaseState('gorged_origin', genes, 99999).canBuy, true)
  assert.equal(getGenePurchaseState('arsenal_origin', genes, 99999).locked, true)
  genes.gorged_origin = 1
  assert.equal(getChosenOrigin(genes).id, 'gorged_origin')
  assert.equal(getGenePurchaseState('flux_origin', genes, 99999).exclusiveOwner.id, 'gorged_origin')
})

check('通用火力基因接入伤害、攻速与暴击（近战远程同源）', () => {
  const game = createArena('shadow')
  try {
    game.setGenes({ razor: 4, rapid: 4, hunter: 3, arsenal_origin: 1 })
    // 复刻 reset() 顺序：基因先写基础值，血统先天乘数最后叠加
    game.applyStartingStrain('shadow')
    assert.ok(game.weaponSystem.damage > 1.3) // 1.24 × 1.15
    assert.ok(game.weaponSystem.fireInterval < 0.75) // 0.96^4 × 0.92 × 0.55（暗影血统）
    assert.ok(game.weaponSystem.critChance > 0.17) // 0.1 + 0.075 + 血统
    assert.ok(game.weaponSystem.critMul > 3.4)
    assert.equal(game.weaponSystem.genePierces, 1)
  } finally { dispose(game) }
})

check('噬血基因按击杀计数回血且遵守回复间隔', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ leech: 3, gorged_origin: 1, giant: 4, regen: 1 })
    const p = game.player
    // 饕餮原核：阈值 20 × 0.6 = 12；生命上限 5+8+2 = 15
    assert.equal(p.maxHp, 15)
    p.hp = 1
    for (let i = 0; i < 12; i++) game.weaponSystem._tickLeech()
    assert.equal(p.hp, 2) // 满额回复 1 点
    for (let i = 0; i < 40; i++) game.weaponSystem._tickLeech() // 冷却期内不再回血
    assert.equal(p.hp, 2)
    p._leechHealCd = 0
    for (let i = 0; i < 12; i++) game.weaponSystem._tickLeech()
    assert.equal(p.hp, 3)
    assert.ok(p.geneIFramesMul > 1.2) // 无敌帧延长
  } finally { dispose(game) }
})

check('扩张基因接入近战触及、法术半径与拾取范围', () => {
  const glutton = createArena('glutton')
  try {
    const base = glutton.weaponSystem.gluttonCombat.reach()
    glutton.setGenes({ expand: 3, swift: 1 })
    assert.ok(glutton.weaponSystem.gluttonCombat.reach() > base)
    assert.ok(glutton.player.pickupRadius > 200)
  } finally { dispose(glutton) }
  const elemental = createArena('elemental')
  try {
    elemental.setGenes({ expand: 3, swift: 1 })
    assert.ok(elemental.weaponSystem.spellCombat.rangeScale > 1.2)
  } finally { dispose(elemental) }
  const shadow = createArena('shadow')
  try {
    const base = shadow.weaponSystem.shadowCombat.reach
    shadow.setGenes({ expand: 3, swift: 1 })
    assert.ok(shadow.weaponSystem.shadowCombat.reach > base)
  } finally { dispose(shadow) }
})

check('违禁品互斥且附带副作用', () => {
  const genes = {}
  assert.equal(getGenePurchaseState('stim', genes, 99999).canBuy, true)
  genes.stim = 1
  const serum = getGenePurchaseState('serum', genes, 99999)
  assert.equal(serum.locked, true)
  assert.equal(serum.exclusiveOwner.id, 'stim')
  const game = createArena('origin')
  try {
    game.setGenes({ stim: 1, giant: 2 })
    assert.equal(game.player.maxHp, 8) // 5+4-1
    assert.ok(game.weaponSystem.fireInterval < 0.85) // ×0.80
  } finally { dispose(game) }
})

check('旧血统基因下架不可购买，但旧存档仍按原等级生效', () => {
  assert.equal(getGenePurchaseState('shadow_origin', {}, 99999).canBuy, false)
  assert.equal(getGenePurchaseState('symbiosis_bond', {}, 99999).canBuy, false)
  const game = createArena('shadow')
  try {
    game.setGenes({ shadow_step: 3, shadow_echo: 3, shadow_origin: 1 })
    assert.ok(game.player.evasionChance > 0.15)
    assert.ok(game.weaponSystem.shadowCombat.clones.duration > 4)
    // 旧原核不再占用互斥位：同档可同时购买新通用原核
    assert.equal(getGenePurchaseState('gorged_origin', { shadow_origin: 1, giant: 2, leech: 1 }, 99999).canBuy, true)
  } finally { dispose(game) }
})

check('新基因仍按存档等级幂等应用', () => {
  const game = createArena('elemental')
  try {
    applyGenes(game, { razor: 3, expand: 2, flux_origin: 1, lore: 4, swift: 4 })
    const first = { damage: game.weaponSystem.damage, range: game.weaponSystem.geneRangeMul, speed: game.player.speed }
    applyGenes(game, { razor: 3, expand: 2, flux_origin: 1, lore: 4, swift: 4 })
    assert.equal(game.weaponSystem.damage, first.damage)
    assert.equal(game.weaponSystem.geneRangeMul, first.range)
    assert.equal(game.player.speed, first.speed)
  } finally { dispose(game) }
})

check('新血肉基因：反震、经验回血与免死茧接入运行时', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ giant: 4, thorns: 2, regen: 1, siphon: 3, leech: 1, cocoon: 1 })
    const p = game.player
    assert.equal(p.thornsPulse, true)
    assert.equal(p.thornsDamage, 4) // 2×Lv2，不覆盖暴食甲壳的更高值
    assert.equal(p.geneSiphonRate, 0.25)
    p.hp = 1
    p._siphonProgress = p.maxExp // 一次拾取越线即触发回血
    p.gainExp(1)
    assert.equal(p.hp, 2)
    p.hp = 3; p.invincible = 0
    p.hit(99, { enemyAttack: true }) // 复苏茧：致命伤害 → 1血+无敌，不死亡
    assert.equal(p.dead, false)
    assert.equal(p.hp, 1)
    assert.equal(p._cocoonUsed, true)
    p.invincible = 0; p.hit(99, { enemyAttack: true }) // 每局仅一次
    assert.equal(p.dead, true)
  } finally { dispose(game) }
})

check('新军火基因：狩猎窗口攻速与困兽残血增伤', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ razor: 1, rapid: 1, hunt: 2, fury: 2 })
    const ws = game.weaponSystem
    const p = game.player
    assert.ok(Math.abs(ws.geneHuntHaste - Math.pow(0.95, 2)) < 1e-9)
    const idle = ws.attackInterval
    p._huntRushTimer = 2.5 // 击杀窗口内攻速提升
    assert.ok(ws.attackInterval < idle * 0.95)
    p._huntRushTimer = 0
    assert.equal(ws.attackInterval, idle)
    p.hp = 1 // 满血 5，缺失 4 × 12% = +48%
    assert.ok(ws.damage > 1.4, `困兽残血增伤应放大伤害，实际 ${ws.damage}`)
    const boosted = ws.damage
    ws.damage *= 1 // *= 写回折算基础值，不叠加残血乘区
    assert.ok(Math.abs(ws.damage - boosted) < 1e-9)
    p.hp = p.maxHp // 满血归零
    assert.ok(ws.damage < 1.1)
  } finally { dispose(game) }
})

check('新杂货基因：刷新次数、候选扩容与全屏磁感', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ swift: 1, blueprint: 2, expand: 1, magnet: 1, lore: 2, horizon: 1 })
    const p = game.player
    assert.equal(p.geneRerolls, 2)
    assert.equal(p.geneExtraOptions, 1)
    assert.equal(game._skillOptionCount(), 4)
    assert.equal(p.geneMagnetAll, 1)
    game._skillPanelRerollable = true
    game.onLevelUp = (opts) => { game._rerolled = opts }
    assert.equal(game.rerollSkillOptions(), true)
    assert.equal(p.geneRerolls, 1)
    assert.ok(Array.isArray(game._rerolled) && game._rerolled.length <= 4)
    game._skillPanelRerollable = false // 里程碑/路线面板不可刷新
    assert.equal(game.rerollSkillOptions(), false)
    assert.equal(p.geneRerolls, 1)
  } finally { dispose(game) }
})

check('新违禁品：玻璃腺体/赌命菌株互斥且副作用生效', () => {
  const genes = { glass: 1 }
  const dicer = getGenePurchaseState('dicer', genes, 99999)
  assert.equal(dicer.locked, true)
  assert.equal(dicer.exclusiveOwner.id, 'glass')
  const game = createArena('origin')
  try {
    game.setGenes({ glass: 1 })
    assert.ok(game.weaponSystem.damage > 1.35) // +40%
    assert.ok(game.player.geneIFramesMul < 0.7) // 受击无敌帧 -35%
  } finally { dispose(game) }
  const game2 = createArena('origin')
  try {
    game2.setGenes({ dicer: 1 })
    assert.ok(game2.weaponSystem.critChance > 0.2) // +15pp
    assert.ok(game2.player.expGainMul < 0.8) // 经验 -25%
  } finally { dispose(game2) }
})

check('黑市预览展示通用数值收益', () => {
  const razor = getGenePresentation({ id: 'razor', maxLevel: 4, desc: '锋锐' }, 2)
  assert.match(razor.preview.current, /\+\d+%/)
  const leech = getGenePresentation({ id: 'leech', maxLevel: 3, desc: '噬血' }, 0)
  assert.match(leech.preview.next, /击杀/)
  const stim = getGenePresentation({ id: 'stim', maxLevel: 1, desc: '燃血' }, 0)
  assert.match(stim.description, /攻击间隔/)
})

console.log(`\n黑市基因适配验证通过：${checks} 组检查`)
