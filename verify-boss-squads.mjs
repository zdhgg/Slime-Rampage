// 限时/无尽首领编队：波次表、人数上限、共享施法权与终局增援。
// 运行：node verify-boss-squads.mjs
import assert from 'node:assert/strict'

import { EnemyManager } from './src/game/EnemyManager.js'
import { getEndlessBossFormation } from './src/game/EndlessMode.js'
import { getBossWavePlan, getRunProfile } from './src/game/RunRules.js'
import { getLootDropCount } from './src/game/WeaponSystem.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

const timed = { mode: 'timed', difficulty: 'normal' }
assert.deepEqual([5, 10, 15, 20].map((wave) => getBossWavePlan(timed, wave).types.length), [1, 1, 2, 2])
assert.equal(getBossWavePlan(timed, 25), null)
assert.equal(getBossWavePlan({ mode: 'expedition', difficulty: 'normal' }, 15), null)
ok('限时第 5/10 波单首领、第 15/20 波双首领，远征不插入波次首领')

const endless = { mode: 'endless', difficulty: 'normal' }
assert.deepEqual(
  [20, 25, 30, 35, 40, 45, 80].map((wave) => getBossWavePlan(endless, wave).types.length),
  [1, 2, 3, 4, 5, 6, 6]
)
assert.deepEqual(
  [20, 25, 30, 35, 40, 45].map((wave) => getBossWavePlan(endless, wave).maxActive),
  [1, 2, 3, 3, 3, 3]
)
ok('无尽第 25 波起每个首领波增加一名成员，第 45 波达到六名编队')

assert.deepEqual(
  [25, 30, 35, 40].map((wave) => getEndlessBossFormation(wave, 3)?.id),
  ['royal_guard', 'blood_oath', 'arcane_relay', 'royal_guard']
)
assert.equal(getEndlessBossFormation(25, 1), null)
ok('无尽多人首领按护卫阵、血誓、奥术接力循环轮换')

function createManager(selection = timed) {
  const game = {
    runSelection: selection,
    runProfile: getRunProfile(selection),
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
      level: 18,
      dead: false,
      devourRadiusBonus: 1,
      strainDevourRadius: 1,
      hit() {},
    },
    weaponSystem: { kills: 0 },
    sound: { wave() {}, bossRoar() {}, enemyShoot() {} },
    dialogue: { tryMinion() {}, sayBoss() {} },
    shakeScreen() {},
    formationBreaks: [],
    triggerEndlessFormationBreak(info) {
      this.formationBreaks.push(info)
      return true
    },
  }
  const manager = new EnemyManager()
  manager.attach(game)
  game.enemyManager = manager
  return { game, manager }
}

{
  const { manager } = createManager()
  manager.wave = 15
  const spawned = manager.spawnBossGroup(getBossWavePlan(timed, 15))
  assert.equal(spawned.length, 2)
  assert.equal(manager.activeBossCount, 2)
  assert.equal(manager.bossInfo.count, 2)
  assert.equal(manager.bossInfo.total, 2)
  assert.equal(manager.bossInfo.members.length, 2)
  assert.equal(manager.bossInfo.hp, manager.bossInfo.members.reduce((sum, member) => sum + member.hp, 0))
  ok('双首领生成后 HUD 快照提供总血量与成员血量')

  const [first, second] = manager._bosses
  assert.equal(manager.claimBossCast(first), true)
  assert.equal(manager.claimBossCast(second), false)
  assert.equal(manager.bossInfo.activeName, first.name)
  manager.releaseBossCast(first)
  assert.equal(manager.claimBossCast(second), true)
  ok('大型技能施放权在编队成员之间互斥并可轮换')
}

{
  const { manager } = createManager(endless)
  manager.wave = 40
  manager.spawnBossGroup(getBossWavePlan(endless, 40))
  assert.equal(manager.activeBossCount, 3)
  assert.equal(manager.pendingBossCount, 2)
  assert.equal(manager.bossInfo.total, 5)
  assert.deepEqual(manager._bosses.map((boss) => boss.bossLootDrops), [1, 1, 1])
  assert.equal(manager.spawnBoss({ type: 'boss-knight', allowMultiple: true }), undefined)

  const defeated = manager._bosses.find((boss) => boss.active)
  defeated.destroy()
  assert.equal(manager.advanceBossEncounter(defeated), false)
  assert.equal(manager.activeBossCount, 3)
  assert.equal(manager.pendingBossCount, 1)

  let complete = false
  while (manager.activeBossCount > 0) {
    const boss = manager._bosses.find((member) => member.active)
    boss.destroy()
    complete = manager.advanceBossEncounter(boss)
    assert.ok(manager.activeBossCount <= 3)
  }
  assert.equal(complete, true)
  assert.equal(manager.pendingBossCount, 0)
  assert.equal(manager._bosses.reduce((sum, boss) => sum + getLootDropCount(boss), 0), 3)
  ok('无尽首领同屏封顶三名、后备立即补位，整队战利品预算封顶三份')
}

{
  const { manager } = createManager(endless)
  manager.wave = 30
  manager.spawnBossGroup(getBossWavePlan(endless, 30))
  const survivor = manager._bosses[0]
  manager._bosses[1].destroy()
  manager._bosses[2].destroy()
  manager.wave = 35
  manager.spawnBossGroup(getBossWavePlan(endless, 35))
  assert.equal(manager.activeBossCount, 3)
  assert.equal(manager.pendingBossCount, 1)
  const encounterMembers = [survivor, ...manager._bosses.slice(3), ...manager._bossEncounter.pending]
  const assignedLoot = encounterMembers.reduce(
    (sum, member) => sum + Math.max(0, member.bossLootDrops ?? 0),
    0
  )
  assert.equal(assignedLoot, 3)
  ok('跨首领波仍存活的成员计入新编队，后续增援不会突破三份预算')
}

{
  const { manager } = createManager(endless)
  manager.wave = 25
  manager.spawnBossGroup(getBossWavePlan(endless, 25))
  const captain = manager._bosses.find(
    (boss) => boss.bossMemberId === manager._bossEncounter.captainId
  )
  const guard = manager._bosses.find((boss) => boss !== captain && boss.active)
  assert.equal(manager.bossInfo.formation.id, 'royal_guard')
  assert.equal(manager.bossInfo.members.find((member) => member.id === captain.bossMemberId).protected, true)

  const protectedHp = captain.hp
  captain.hit(10)
  assert.equal(protectedHp - captain.hp, 6.5)
  guard.destroy()
  manager.advanceBossEncounter(guard)
  assert.equal(manager.bossInfo.formation.active, false)
  assert.equal(manager.bossInfo.formation.broken, true)
  assert.deepEqual(manager.game.formationBreaks.map((entry) => entry.id), ['royal_guard'])
  const exposedHp = captain.hp
  captain.hit(10)
  assert.equal(exposedHp - captain.hp, 10)
  ok('王庭护卫阵为主将减伤 35%，护卫清空后立即解除')
}

{
  const { manager } = createManager(endless)
  manager.wave = 30
  manager.spawnBossGroup(getBossWavePlan(endless, 30))
  const [defeated, survivor] = manager._bosses
  survivor.hp = Math.round(survivor.maxHp * 0.5)
  const hpBefore = survivor.hp
  const expectedHeal = Math.max(1, Math.round(survivor.maxHp * 0.08))
  defeated.destroy()
  manager.advanceBossEncounter(defeated)
  assert.equal(manager._bossEncounter.furyStacks, 1)
  assert.equal(manager.getBossTempoMultiplier(survivor), 1.12)
  assert.equal(survivor.hp, Math.min(survivor.maxHp, hpBefore + expectedHeal))
  assert.match(manager.bossInfo.formation.status, /行动 \+12%/)
  assert.equal(manager.game.formationBreaks.length, 0)
  ok('复仇血誓在成员阵亡时治疗余众，并叠加 12% 行动节奏')
}

{
  const { manager } = createManager(endless)
  manager.wave = 30
  manager.spawnBossGroup(getBossWavePlan(endless, 30))
  const [defeated, survivor] = manager._bosses
  survivor.hp = Math.round(survivor.maxHp * 0.5)
  const hpBefore = survivor.hp
  defeated.vulnerableTimer = 1
  defeated.destroy()
  manager.advanceBossEncounter(defeated)
  assert.equal(manager._bossEncounter.furyStacks, 0)
  assert.equal(manager.getBossTempoMultiplier(survivor), 1)
  assert.equal(survivor.hp, hpBefore)
  assert.equal(manager.bossInfo.formation.broken, true)
  assert.deepEqual(manager.game.formationBreaks.map((entry) => entry.id), ['blood_oath'])
  const secondDefeated = manager._bosses.find((boss) => boss.active && boss !== survivor)
  secondDefeated.vulnerableTimer = 1
  secondDefeated.destroy()
  manager.advanceBossEncounter(secondDefeated)
  assert.equal(manager.game.formationBreaks.length, 1)
  ok('破绽期击杀会截断血誓且每支编队只发放一次追击')
}

{
  const { manager } = createManager(endless)
  manager.wave = 35
  manager.spawnBossGroup(getBossWavePlan(endless, 35))
  const [caster, relay] = manager._bosses
  caster.specialState = 'recover'
  relay.specialCd = 5
  assert.equal(manager.claimBossCast(caster), true)
  manager.releaseBossCast(caster)
  assert.equal(manager._bossCaster, null)
  assert.equal(relay.specialCd, 0.65)
  assert.equal(manager._bossEncounter.relayTargetId, relay.bossMemberId)
  assert.match(manager.bossInfo.formation.status, /接力 .*击杀破阵/)
  relay.destroy()
  manager.advanceBossEncounter(relay)
  assert.deepEqual(manager.game.formationBreaks.map((entry) => entry.id), ['arcane_relay'])
  const [nextCaster, nextRelay] = manager._bosses.filter((boss) => boss.active)
  nextCaster.specialState = 'recover'
  nextRelay.specialCd = 5
  assert.equal(manager.claimBossCast(nextCaster), true)
  manager.releaseBossCast(nextCaster)
  assert.equal(nextRelay.specialCd, 5)
  ok('奥术接力会快速轮换强招，击杀接力目标后整队停止接力')
}

{
  const { manager } = createManager()
  manager.beginFinale()
  assert.equal(manager.activeBossCount, 2)
  assert.equal(manager.pendingBossCount, 1)
  assert.equal(manager.bossInfo.total, 3)
  assert.equal(manager.bossInfo.pending, 1)

  const first = manager._bosses.find((boss) => boss.active)
  first.destroy()
  assert.equal(manager.advanceBossEncounter(first), false)
  assert.equal(manager.activeBossCount, 2)
  assert.equal(manager.pendingBossCount, 0)
  assert.ok(manager._bosses.some((boss) => boss.active && boss.type === 'boss-final'))

  const survivors = manager._bosses.filter((boss) => boss.active)
  survivors[0].destroy()
  assert.equal(manager.advanceBossEncounter(survivors[0]), false)
  survivors[1].destroy()
  assert.equal(manager.advanceBossEncounter(survivors[1]), true)
  ok('限时终局维持两名在场，终审勇者补位且整队清空才完成')
}

console.log(`\n首领编队专项通过：${n} 组断言 ✓`)
