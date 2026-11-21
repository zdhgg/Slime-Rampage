import assert from 'node:assert/strict'
import { createArena, dispose, settleSwing, SKILL_DATABASE, spawn, strike } from './test-support/arena-fixture.mjs'
import { applyGenes, getChosenOrigin, getGene, getGenePurchaseState } from './src/game/GenePool.js'
import { getGenePresentation } from './src/components/blackMarketPresentation.js'
import { sanitizeSave } from './src/game/SaveManager.js'

let checks = 0
const check = (name, test) => {
  try { test(); console.log(`✓ ${++checks}. ${name}`) } finally { }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

check('无账本档案按冻结价格估算，旧币折算只做一次，已记录的实付优先', () => {
  const recent = { version: 6, drops: 23, records: {}, genes: { giant: 2, gorged_origin: 1, glass: 1, split: 1, unknown: 99 } }
  const restored = sanitizeSave(recent)
  assert.equal(restored.geneInvestment, 4200)
  assert.equal(restored.drops, 23)
  assert.deepEqual(restored.genes, recent.genes)
  assert.equal(sanitizeSave({ ...recent, geneInvestment: 4100 }).geneInvestment, 4100)
  const legacy = sanitizeSave({ version: 4, drops: 30, records: {}, genes: { giant: 2, split: 1 } })
  assert.equal(legacy.drops, 200)
  assert.equal(legacy.geneInvestment, 400)
  assert.deepEqual(sanitizeSave(legacy), legacy)
  assert.equal(sanitizeSave({ ...recent, genes: {}, geneInvestment: 4100 }).geneInvestment, 0)
})

check('新通用原核遵守依赖和终点互斥', () => {
  const genes = { giant: 4, leech: 2 }
  assert.equal(getGenePurchaseState('gorged_origin', genes, 99999).canBuy, true)
  assert.equal(getGenePurchaseState('arsenal_origin', genes, 99999).locked, true)
  genes.gorged_origin = 1
  assert.equal(getChosenOrigin(genes).id, 'gorged_origin')
  assert.equal(getGenePurchaseState('flux_origin', genes, 99999).exclusiveOwner.id, 'gorged_origin')
})

check('通用火力基因接入伤害、攻速与暴击（近战远程同源）', () => {
  const game = createArena('shadow')
  try {
    game.setGenes({ razor: 10, rapid: 10, hunter: 6, arsenal_origin: 1 })
    // 复刻 reset() 顺序：基因先写基础值，血统先天乘数最后叠加
    game.applyStartingStrain('shadow')
    assert.ok(game.weaponSystem.damage > 1.4) // 1.30 × 1.15
    assert.ok(game.weaponSystem.fireInterval < 0.45) // 0.98^10 × 0.92 × 0.55（暗影血统）
    assert.ok(game.weaponSystem.critChance > 0.17) // 0.1 + 0.09 + 血统
    assert.ok(game.weaponSystem.critMul > 3.5)
    assert.equal(game.weaponSystem.genePierces, 1)
  } finally { dispose(game) }
})

check('兵工原核让弹射主弹多穿一敌，但不增加咬击与影刃命中数', () => {
  function resolveAttack(strain, hasOrigin) {
    const game = createArena(strain)
    try {
      game.setGenes(hasOrigin ? { arsenal_origin: 1 } : {})
      game.applyStartingStrain(strain)
      const weapon = game.weaponSystem
      weapon.critChance = 0
      const distances = strain === 'ricochet' ? [100, 210, 320] : [40, 58, 76, 94, 230]
      const enemies = distances.map(x => spawn(game, { x }))
      if (strain === 'glutton') {
        strike(game, enemies[0])
      } else if (strain === 'shadow') {
        const combat = weapon.shadowCombat
        assert.ok(combat.stab(enemies[0]))
        settleSwing(combat)
      } else {
        weapon.projectileCount = 1
        weapon.fire(enemies[0])
        const projectile = weapon._projectiles[0]
        projectile.x = game.player.x + 400
        game.enemyManager._buildGrid()
        weapon.ricochetCombat.resolve(projectile)
      }
      return enemies.map(enemy => enemy.maxHp - enemy.hp)
    } finally { dispose(game) }
  }
  assert.deepEqual(resolveAttack('ricochet', false).map(damage => damage > 0), [true, false, false])
  assert.deepEqual(resolveAttack('ricochet', true).map(damage => damage > 0), [true, true, false])
  for (const strain of ['glutton', 'shadow']) {
    const base = resolveAttack(strain, false)
    assert.ok(base[0] > 0)
    assert.equal(base.at(-1), 0)
    resolveAttack(strain, true).forEach((damage, index) => near(damage, base[index] * 1.15))
  }
})

check('噬血基因按击杀计数回血且遵守回复间隔', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ leech: 5, gorged_origin: 1, giant: 4, regen: 1 })
    const p = game.player
    // 饕餮原核：阈值 18 × 0.6 ≈ 11；生命上限 5+4+2 = 11
    assert.equal(p.maxHp, 11)
    p.hp = 1
    for (let i = 0; i < 11; i++) game.weaponSystem._tickLeech()
    assert.equal(p.hp, 2) // 满额回复 1 点
    for (let i = 0; i < 40; i++) game.weaponSystem._tickLeech() // 冷却期内不再回血
    assert.equal(p.hp, 2)
    p._leechHealCd = 0
    for (let i = 0; i < 11; i++) game.weaponSystem._tickLeech()
    assert.equal(p.hp, 3)
    assert.ok(p.geneIFramesMul > 1.2) // 无敌帧延长
  } finally { dispose(game) }
})

check('扩张基因接入近战触及、法术半径与拾取范围', () => {
  const glutton = createArena('glutton')
  try {
    const base = glutton.weaponSystem.gluttonCombat.reach()
    glutton.setGenes({ expand: 6, swift: 1 })
    assert.ok(glutton.weaponSystem.gluttonCombat.reach() > base)
    assert.ok(glutton.player.pickupRadius > 200)
  } finally { dispose(glutton) }
  const elemental = createArena('elemental')
  try {
    elemental.setGenes({ expand: 6, swift: 1 })
    assert.ok(elemental.weaponSystem.spellCombat.rangeScale > 1.25)
  } finally { dispose(elemental) }
  const shadow = createArena('shadow')
  try {
    const base = shadow.weaponSystem.shadowCombat.reach
    shadow.setGenes({ expand: 6, swift: 1 })
    assert.ok(shadow.weaponSystem.shadowCombat.reach > base)
  } finally { dispose(shadow) }
})

check('扩张基因延长弹射主弹、主动弹和派生弹航程，不改变弹跳或分裂参数', () => {
  function fireRicochet(rank) {
    const game = createArena('ricochet')
    try {
      game.setGenes({ expand: rank })
      game.applyStartingStrain('ricochet')
      const weapon = game.weaponSystem, combat = weapon.ricochetCombat
      const target = spawn(game, { x: 100 }), next = spawn(game, { x: 180 }), extra = spawn(game, { x: 240 })
      game.skillLevels.rico_split = 2
      game.skillLevels.rico_bounce = 2
      weapon.projectileCount = 1
      weapon.fire(target)
      const main = weapon._projectiles[0]
      main.hitTargets.add(target)
      combat.split(target, main)
      const split = weapon._projectiles.slice(1)
      assert.deepEqual(split.map(shot => shot.target), [next, extra])
      const echo = combat.spawnPrismSplit(main, next)
      assert.equal(echo?.target, extra)
      weapon.fire(target, { ricochetActive: true, ultimate: true })
      const active = weapon._projectiles.at(-1)
      return {
        flight: [main, active, ...split, echo].map(shot => shot.life),
        behavior: [main, active, ...split, echo].map(shot => {
          const { bounceRange, bounces, splitCount } = shot.ricochet
          return { speed: shot.speed, bounceRange, bounces, splitCount }
        }),
      }
    } finally { dispose(game) }
  }
  const base = fireRicochet(0), expanded = fireRicochet(6)
  assert.deepEqual(base.flight, [2.5, 5, 1.2, 1.2, 2.5])
  expanded.flight.forEach((life, index) => near(life, base.flight[index] * 1.3))
  assert.deepEqual(expanded.behavior, base.behavior)
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
    assert.equal(game.player.maxHp, 6) // 5+2-1
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
    assert.equal(getGenePurchaseState('gorged_origin', { shadow_origin: 1, giant: 4, leech: 2 }, 99999).canBuy, true)
  } finally { dispose(game) }
})

check('新基因仍按存档等级幂等应用', () => {
  const game = createArena('elemental')
  try {
    applyGenes(game, { razor: 5, expand: 3, flux_origin: 1, lore: 6, swift: 5 })
    const first = { damage: game.weaponSystem.damage, range: game.weaponSystem.geneRangeMul, speed: game.player.speed }
    applyGenes(game, { razor: 5, expand: 3, flux_origin: 1, lore: 6, swift: 5 })
    assert.equal(game.weaponSystem.damage, first.damage)
    assert.equal(game.weaponSystem.geneRangeMul, first.range)
    assert.equal(game.player.speed, first.speed)
  } finally { dispose(game) }
})

check('新血肉基因：反震、经验回血与免死茧接入运行时', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ giant: 4, thorns: 3, regen: 1, siphon: 3, leech: 2, cocoon: 1 })
    const p = game.player
    assert.equal(p.thornsPulse, true)
    assert.equal(p.thornsDamage, 5)
    assert.equal(p.geneSiphonRate, 0.4)
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

check('暴食胃铠完全挡伤只触发自身反击，扣血时才额外触发刺膜', () => {
  function takeHit(hasThorns, blocked) {
    const game = createArena('glutton')
    try {
      game.setGenes(hasThorns ? { thorns: 1 } : {})
      game.applyStartingStrain('glutton')
      const player = game.player
      player.invincible = 0
      if (blocked) {
        player.gluttonGuard = 1
        player.gluttonGuardTimer = 1
      }
      const enemy = spawn(game, { x: 60 })
      player.hit(1)
      assert.equal(player.maxHp - player.hp, blocked ? 0 : 1)
      return enemy.maxHp - enemy.hp
    } finally { dispose(game) }
  }
  const guardCounter = takeHit(false, true)
  assert.ok(guardCounter > 0)
  near(takeHit(true, true), guardCounter)
  near(takeHit(true, false), takeHit(false, false) + 3)
})

check('新军火基因：狩猎窗口攻速与困兽残血增伤', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ razor: 1, rapid: 1, hunt: 3, fury: 4 })
    const ws = game.weaponSystem
    const p = game.player
    assert.ok(Math.abs(ws.geneHuntHaste - Math.pow(0.97, 3)) < 1e-9)
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

check('新杂货基因：刷新次数与候选扩容', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ swift: 1, blueprint: 3, lore: 3, horizon: 1 })
    const p = game.player
    assert.equal(p.geneRerolls, 3)
    assert.equal(p.geneExtraOptions, 1)
    assert.equal(game._skillOptionCount(), 4)
    game._skillPanelRerollable = true
    game.onLevelUp = (opts) => { game._rerolled = opts }
    assert.equal(game.rerollSkillOptions(), true)
    assert.equal(p.geneRerolls, 2)
    assert.ok(Array.isArray(game._rerolled) && game._rerolled.length <= 4)
    game._skillPanelRerollable = false // 里程碑/路线面板不可刷新
    assert.equal(game.rerollSkillOptions(), false)
    assert.equal(p.geneRerolls, 2)
  } finally { dispose(game) }
})

check('全域磁感翻倍并叠加引力细胞，元素核心使用独立半径', () => {
  const game = createArena('origin')
  try {
    game.setGenes({ swift: 1, expand: 1, magnet: 1 })
    game.reset()
    const { player, gemManager } = game
    const { x, y } = player
    const updateMagnets = () => { for (let i = 0; i < 3; i++) gemManager.update(0) }
    near(player.pickupRadius, 327)
    const exp = gemManager.spawn(x + 310, y, 1)
    const tome = gemManager.spawn(x, y + 310, 0, 'tome')
    const core = gemManager.spawn(x + 130, y, 0, 'fire')
    const upgradeRange = gemManager.spawn(x + 385, y, 1)
    const outside = gemManager.spawn(x + 450, y, 1)
    updateMagnets()
    assert.deepEqual([exp.state, tome.state, core.state, upgradeRange.state, outside.state],
      ['magnet', 'magnet', 'idle', 'idle', 'idle'])

    const card = SKILL_DATABASE.common.find(skill => skill.id === 'com_magnet')
    assert.equal(card.stats(0, game), '拾取半径 327 → 409')
    assert.equal(game.applySkill(card), true)
    near(player.pickupRadius, 408.75)
    updateMagnets()
    assert.deepEqual([core.state, upgradeRange.state, outside.state], ['idle', 'magnet', 'idle'])
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
  const razor = getGenePresentation({ id: 'razor', maxLevel: 10, desc: '锋锐' }, 2)
  assert.match(razor.preview.current, /\+\d+%/)
  const leech = getGenePresentation({ id: 'leech', maxLevel: 5, desc: '噬血' }, 0)
  assert.match(leech.preview.next, /击杀/)
  const stim = getGenePresentation({ id: 'stim', maxLevel: 1, desc: '燃血' }, 0)
  assert.match(stim.description, /攻击间隔/)
  assert.deepEqual(getGenePresentation(getGene('magnet'), 0).preview,
    { label: '吸附半径', current: '×1', next: '×2' })
  const thorns = getGene('thorns')
  assert.deepEqual(getGenePresentation(thorns, 0).preview, { label: '受击反震', current: '未解锁', next: '3 点' })
  assert.deepEqual(getGenePresentation(thorns, 3).preview, { label: '受击反震', current: '5 点', next: '6 点' })
  const hunter = getGenePresentation(getGene('hunter'), 0)
  assert.equal(hunter.preview.next, '+1.5% · +0.10x')
  assert.match(hunter.note, /暗影每溢出 1 个百分点/)
  const arsenal = getGenePresentation(getGene('arsenal_origin'), 0)
  assert.match(arsenal.description, /飞弹额外穿透/)
  assert.match(arsenal.note, /近战不增加命中目标数/)
})

console.log(`\n黑市基因适配验证通过：${checks} 组检查`)
