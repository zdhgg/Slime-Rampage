import assert from 'node:assert/strict'
import { CHAPTERS_META, getStageConfig, generateEndlessWaves } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { TOWER_DEFENSE_TOWER_TYPES, TOWER_DEFENSE_ENEMY_TYPES, TOWER_UNLOCK_MAP, getTowerStats } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'
import { ENEMY_UNLOCKS } from './src/game/gameplay/tower-defense/TowerDefenseContent.js'
import { loadCampaignSave, recordStageClear, createDefaultSave } from './src/game/gameplay/tower-defense/TowerDefenseSave.js'
import { TowerDefenseGameplay } from './src/game/gameplay/tower-defense/TowerDefenseGameplay.js'
import { TowerDefenseDirector } from './src/game/gameplay/tower-defense/TowerDefenseDirector.js'
import { simulate } from './tower-defense-simulation.mjs'

assert.equal(CHAPTERS_META.length, 5)
assert.equal(Object.keys(TOWER_DEFENSE_TOWER_TYPES).length, 10)
assert.equal(Object.keys(TOWER_DEFENSE_ENEMY_TYPES).length, 16)
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const data = new Map([['slime_rampage_td_campaign_save_v1', JSON.stringify({unlockedStage:99})]])
Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}})
try {
  assert.equal(loadCampaignSave().unlockedStage, 1, 'New campaign starts independently of retired saves')
  for (const [type, stage] of Object.entries(TOWER_UNLOCK_MAP)) {
    if (stage > 1) assert.ok(recordStageClear(stage - 1, 20).unlockedTowers.includes(type))
  }
  assert.ok(data.has('slime_rampage_td_campaign_save_v2'))
} finally {
  if(storageDescriptor) Object.defineProperty(globalThis,'localStorage',storageDescriptor)
  else delete globalThis.localStorage
}

const signatures = new Set()
const encountered = new Set()
for(let stage=1;stage<=99;stage++) {
  const config = getStageConfig(stage)
  assert.deepEqual(config,getStageConfig(stage),'Campaign generation is deterministic')
  assert.ok(config.tactic.description && config.assault.hint)
  const waves=config.waves
  for(const wave of waves) for(const group of wave.groups) {
    assert.ok(TOWER_DEFENSE_ENEMY_TYPES[group.type])
    assert.ok(group.count>0 && group.interval>0 && group.scale>0)
    if(group.type!=='boss') assert.ok(ENEMY_UNLOCKS[group.type]<=stage,`${group.type} appears before its introduction`)
    encountered.add(group.type)
  }
  signatures.add(JSON.stringify(waves))
  if(config.isBossStage) {
    assert.ok(waves.at(-1).groups.some(g=>g.type==='boss' && g.bossChapter===config.chapterId && g.coreDamage===20))
  }
}
assert.equal(signatures.size,99)
assert.equal(encountered.size,16)
assert.deepEqual(generateEndlessWaves(20),generateEndlessWaves(20))

let testEnemyId=1
function enemy(overrides={}) {return {id:testEnemyId++,typeId:'grunt',active:true,x:.2,y:.2,hp:100,maxHp:100,shield:0,armor:0,progress:.2,baseSpeed:0,reward:0,damage:1,...overrides}}
const gp=new TowerDefenseGameplay()
gp.loadStage(99)
const a=enemy(),b=enemy({x:.23}),c=enemy({x:.26})
gp.enemies=[a,b,c]
gp._fireChain(a,getTowerStats('shock',4,'overload'))
assert.ok(a.hp<100 && b.hp<100 && c.hp<100,'All chain jumps deal finite damage')
assert.ok(a.freezeTimer>0 && a.silenceTimer>0,'Lightning interrupts')
const shielded=enemy({shield:50,armor:.8})
gp._applyDamage(shielded,20,getTowerStats('arcane',4,'void-rift'))
assert.equal(shielded.shield,50)
assert.equal(shielded.hp,80)
const corroded=enemy({armor:.5,regeneration:.1,hp:80})
gp.enemies=[corroded]
gp._resolveShotImpact({target:corroded,to:corroded,profile:getTowerStats('spore',3,'solvent')})
const afterHit=corroded.hp
gp._updateEnemies(.5)
assert.ok(corroded.hp<afterHit,'Corrosion deals damage while suppressing regeneration')
const armorDamage=gp._applyDamage(corroded,20).hpDamage
assert.ok(armorDamage>10,'Corrosion helps allied direct damage')
const root=enemy()
gp._resolveShotImpact({target:root,to:root,profile:getTowerStats('thorn',4,'grasp')})
const originalRoot=root.freezeTimer
root.freezeTimer=0
gp._resolveShotImpact({target:root,to:root,profile:getTowerStats('thorn',4,'grasp')})
assert.ok(originalRoot>0)
assert.equal(root.freezeTimer,0,'Repeated roots respect the escape immunity window')
const slot=[...gp.unlockedSlots][0]
gp.gold=10000
gp.placeTower(slot,'beacon')
const pos=gp.buildSlots[slot]
const hidden=enemy({cloaked:true,x:pos.x+.2,y:pos.y})
assert.equal(gp._isEnemyVisible(hidden,{x:0,y:0}),true)
gp.towers[0].disabledTimer=2
assert.equal(gp._isEnemyVisible(hidden,{x:0,y:0}),false)
gp.towers.length=0
gp.buildSlots=[{x:.1,y:.2}]
const first=enemy({x:.3}),behind=enemy({x:.4}),offLine=enemy({x:.35,y:.3})
gp.enemies=[first,behind,offLine]
gp._firePiercing({slotIndex:0},first,getTowerStats('ballista',3,'skewer'))
assert.ok(first.hp<100 && behind.hp<100)
assert.equal(offLine.hp,100,'Piercing respects the shot line')
// Support mechanics must be real, bounded and interruptible.
const warder=enemy({wardRadius:.2,wardAmount:12,wardTimer:0}), wardAlly=enemy()
gp.enemies=[warder,wardAlly]
gp._updateEnemies(.01)
assert.equal(wardAlly.shield,12)
warder.silenceTimer=2; warder.wardTimer=0
gp._updateEnemies(.01)
assert.equal(wardAlly.shield,12,'Silence prevents shield pulses')
const sprint=enemy({sprint:true,baseSpeed:.05}), walker=enemy({baseSpeed:.05})
gp.enemies=[sprint,walker]; gp._updateEnemies(.2)
assert.ok(sprint.progress>walker.progress)
const rage=enemy({berserk:true,hp:40,baseSpeed:.05}), healthy=enemy({berserk:true,baseSpeed:.05})
gp.enemies=[rage,healthy]; gp._updateEnemies(.2)
assert.ok(rage.progress>healthy.progress)
const novaNear=enemy(),novaFar=enemy({x:.8,y:.8})
gp.enemies=[novaNear,novaFar]
gp._resolveShotImpact({target:novaNear,to:{x:.2,y:.2},profile:getTowerStats('radiant',4,'solar-flare')})
assert.ok(novaNear.hp<100)
assert.equal(novaFar.hp,100,'Nova cannot accidentally hit the entire board')
gp.buildSlots=[{x:.2,y:.2},{x:.21,y:.2},{x:.22,y:.2}]
const gun={typeId:'rapid',level:1,slotIndex:0,cooldown:0}
gp.towers=[gun,{typeId:'radiant',level:4,branchId:'sanctuary',slotIndex:1,cooldown:100},{typeId:'radiant',level:4,branchId:'sanctuary',slotIndex:2,cooldown:100}]
gp.enemies=[enemy({x:.25})]
gp._updateTowers(.01)
assert.ok(Math.abs(gun.cooldown-getTowerStats('rapid',1).fireInterval/1.35)<1e-9,'Multiple support auras use the strongest bonus, not their sum')
const chapterPowers=[]
for(let chapter=1;chapter<=5;chapter++) {
  gp.towers=[]; gp.enemies=[]
  const boss=enemy({boss:true,bossChapter:chapter,baseSpeed:.03})
  gp._activateBossPhase(boss)
  chapterPowers.push([boss.regeneration||0, boss.wardRadius||0, boss.splitCount||0, boss.empPulse?.interval||0].join('/'))
}
assert.equal(new Set(chapterPowers).size,5,'Chapter bosses have different phase mechanics')
// All new portraits are drawable by the same renderer used on the battlefield and in menus.
const drawingContext=new Proxy({}, {get:()=>()=>({addColorStop(){}}),set:()=>true})
for(const typeId of Object.keys(TOWER_DEFENSE_TOWER_TYPES)) gp.renderer.drawGuardian(drawingContext,{typeId,level:4})
const director=new TowerDefenseDirector([{groups:[{type:'grunt',count:1,interval:1,scale:1}]}])
const event=director.update(5,0)
assert.equal(event.spawns.length,1)
assert.equal(event.allCompleted,false,'Final spawn cannot resolve a wave before entering the battlefield')
console.log('✓ Campaign v2: 99 distinct wave sets, 10 guardians, 16 enemies, reset progression and new combat mechanics')

// The introductory stage stays simple on first play, skipped tutorial, and replay.
const intro = new TowerDefenseGameplay()
intro.loadStage(1)
intro.attach({
  width: 1280, height: 720,
  canvas: { addEventListener() {}, removeEventListener() {} },
  sound: { shoot() {}, levelUp() {}, gameOver() {} },
  _pushGameplayHud() {}, finishGameplay() {},
})
const preparation = intro.director.timer
for (let i = 0; i < 100; i++) intro.updateWorld(0.25)
assert.equal(intro.director.timer, preparation, 'New players have time to place their first tower')
assert.equal(intro.enemies.length, 0)
assert.equal(intro.getHudSnapshot().earlyCallBonus, 0)
assert.equal(intro.callNextWaveEarly(), false)
assert.equal(intro.placeTower(0, 'rapid'), true)
assert.equal(intro.tutorial.step, 2)
assert.equal(intro.getTowerAtSlot(0).shinyTrait, null)
assert.equal(intro.getHudSnapshot().selectedSlot.leyline, null)
assert.equal(intro.getHudSnapshot().selectedTower.resonance.isResonant, false)
assert.equal(intro.upgradeSelectedTower(), true)
assert.equal(intro.tutorial.step, 3)
assert.equal(intro.getHudSnapshot().selectedTower.maxLevel, 2)
assert.equal(intro.upgradeSelectedTower(), false)
assert.deepEqual(intro.getHudSnapshot().selectedTower.branchOptions, [])
assert.equal(intro.relocateTower(0, 1), false)
assert.equal('selectMutation' in intro, false)
intro.saveUnlockedTowers = new Set(Object.keys(TOWER_DEFENSE_TOWER_TYPES))
assert.equal(intro.placeTower(1, 'blast'), false, 'Late-game saves still get a simple first stage')
intro.advanceTutorial()
assert.equal(intro.tutorial.active, false)
intro.director.waveIndex = 0
intro.director.phase = 'waiting'
intro.director.spawned = 4
intro.updateWorld(0.05)
assert.equal(intro.director.completedWaves, 1)
assert.equal(intro.director.timer, 8, 'First-wave intermission leaves time to build a second guardian')
assert.equal('pendingMutationOffers' in intro, false)
assert.equal(intro.lastWaveReport.interest, 0)
intro.skipTutorial()
assert.equal(intro.buildSlots.length, 4)
intro.reset()
assert.equal(intro.buildSlots.length, 4)
assert.equal(intro.traps.length, 0)

// Sealed slots remain usable, off-road and hit-testable after opening and resizing.
for (let stageId = 2; stageId <= 99; stageId++) {
  intro.loadStage(stageId)
  for (const slot of intro.buildSlots.filter(s => s.locked)) {
    const index = slot.slotIndex
    intro.gold = 10000
    assert.equal(intro.clearObstacle(index), true)
    assert.equal(intro.placeTower(index, 'rapid'), true)
    assert.equal(intro.getHudSnapshot().selectedTower.resonance.leylineId, slot.leyline)
    intro.game.width = 390
    intro.game.height = 844
    intro.renderer.ensureLayout()
    const point = intro.renderer.project(intro.buildSlots[index])
    assert.equal(intro.renderer.getSlotIndexAt(point.x, point.y, true), index)
    assert.equal(intro.unlockedSlots.has(index), true)
    assert.equal(intro.getTowerAtSlot(index).slotIndex, index)
    intro.game.width = 1280
    intro.game.height = 720
    intro.renderer.ensureLayout()
  }
}
intro.startEndlessMode(1)
assert.equal(intro.introductory, false, 'Endless mode retains the full map and advanced mechanics')
assert.equal(intro.buildSlots.length, 10)
assert.equal(intro.traps.length, 3)
assert.equal(intro.getHudSnapshot().towerTypes.length, 10)
intro.reset()
assert.equal(intro.introductory, false)
intro.loadStage(2)
intro.director.waveIndex = 0
intro.director.phase = 'waiting'
intro.updateWorld(0.05)
assert.equal('pendingMutationOffers' in intro, false)
intro.loadStage(1)
assert.equal(intro.introductory, true)
assert.equal(intro.buildSlots.length, 4)
intro.destroy()
console.log('✓ First-stage tutorial, replay, sealed-slot construction, resize and advanced-mode transitions verified')

// Regression: the second stage used to triple health pressure and enable every subsystem.
const openings = Array.from({ length: 5 }, (_, i) => getStageConfig(i + 1))
const pressure = openings.map(config => config.waves.flatMap(w => w.groups)
  .reduce((sum, g) => sum + g.count * (g.miniBoss?.hp || TOWER_DEFENSE_ENEMY_TYPES[g.type].hp) * g.scale, 0))
for (let i = 1; i < openings.length; i++) {
  assert.ok(pressure[i] > pressure[i - 1], 'Opening pressure should grow')
  assert.ok(pressure[i] / pressure[i - 1] <= 1.35, `Stage ${i + 1} must not spike health pressure`)
  assert.ok(openings[i].buildSlots.length - openings[i - 1].buildSlots.length <= 1)
}
assert.equal(openings[1].waveCount, 4)
assert.equal(openings[1].startingGold, openings[0].startingGold)
assert.deepEqual([...new Set(openings[1].waves.flatMap(w => w.groups.map(g => g.type)))].sort(), ['grunt', 'runner'])
for (const stage of [1, 2]) {
  const result = simulate(stage, { plan: [[0, 'rapid'], [1, 'slow'], [2, 'rapid']] })
  assert.equal(result.outcome, 'victory', 'A basic, fixed three-tower defense should carry across the first two stages without traps')
  assert.ok(result.hp >= 16)
}

// A tutorial must teach expanding the defense, even with an optimally upgraded single tower.
for (const stage of [1, 2]) {
  for (let slot = 0; slot < getStageConfig(stage).buildSlots.length; slot++) {
    for (const type of ['rapid', 'slow']) {
      const single = simulate(stage, { plan: [[slot, type]] })
      assert.equal(single.outcome, 'defeat', `Stage ${stage}: ${type} at slot ${slot} must need reinforcements`)
      if (stage === 1) assert.equal(single.reports[0].hp, 20, 'One tower still handles the first teaching wave')
    }
  }
}
const twoTowers = simulate(1, { plan: [[0, 'rapid'], [3, 'rapid']], deployAfterWaves: [0, 1] })
assert.equal(twoTowers.outcome, 'victory', 'Two output towers can clear without a mandatory three-tower gate')
assert.ok(twoTowers.hp < 20, 'A minimal defense should have a reason to add more coverage')
for (const plan of [
  [[0, 'rapid'], [1, 'slow'], [3, 'rapid']],
  [[2, 'slow'], [0, 'rapid'], [3, 'rapid']],
  [[0, 'rapid'], [1, 'rapid'], [2, 'rapid']],
]) {
  const gradual = simulate(1, { plan, deployAfterWaves: [0, 1, 2] })
  assert.equal(gradual.outcome, 'victory')
  assert.equal(gradual.hp, 20, 'Several basic formations should allow a perfect clear without deploying everything at the start')
  assert.deepEqual(gradual.reports.slice(0, 3).map(w => w.levels.length), [1, 2, 3])
}
const continued = simulate(2, { plan: [[0, 'rapid'], [1, 'slow'], [2, 'rapid']], deployAfterWaves: [0, 1, 2] })
assert.equal(continued.outcome, 'victory')
assert.ok(continued.hp >= 16, 'The same gradual three-tower approach must carry into stage 2')
for (const [width, height] of [[390, 844], [844, 390], [1920, 1080]]) {
  const viewport = { width, height }
  for (let slot = 0; slot < 4; slot++) for (const type of ['rapid', 'slow']) {
    assert.equal(simulate(1, { plan: [[slot, type]], viewport }).outcome, 'defeat', `${width}x${height}: responsive tower placement must not allow a single-tower clear`)
  }
  const gradual = simulate(1, { plan: [[0, 'rapid'], [1, 'slow'], [3, 'rapid']], deployAfterWaves: [0, 1, 2], viewport })
  assert.equal(gradual.hp, 20, 'The gradual mixed defense remains forgiving at different aspect ratios')
}
console.log('✓ Single-tower openings fail; gradual two/three-tower defenses clear with normal economy')

const progression = new TowerDefenseGameplay()
for (let stage = 1; stage <= 20; stage++) {
  progression.loadStage(stage)
  progression.skipTutorial()
  // A collected late-game roster must not bypass the current lesson, even on replay.
  progression.saveUnlockedTowers = new Set(Object.keys(TOWER_DEFENSE_TOWER_TYPES))
  const hud = progression.getHudSnapshot()
  assert.deepEqual(hud.towerTypes.map(t => t.id).sort(), Object.keys(TOWER_UNLOCK_MAP).filter(id => TOWER_UNLOCK_MAP[id] <= stage).sort())
  for (const [type, unlock] of Object.entries(TOWER_UNLOCK_MAP)) if (unlock > stage) {
    assert.equal(progression.selectTowerType(type), false)
    assert.equal(progression.placeTower(0, type), false)
    progression.selectSlot(0)
    assert.equal(progression.previewTowerType(type), false)
  }
  assert.equal(progression.traps.length, stage < 6 ? 0 : stage < 18 ? 1 : stage < 29 ? 2 : 3)
  assert.equal(progression.buildSlots.some(s => s.locked), stage >= 22)
  assert.equal(progression.buildSlots.some(s => s.leyline !== 'none'), stage >= 8)
  progression.gold = 10000
  assert.equal(progression.placeTower(0, 'rapid'), true)
  assert.equal(progression.upgradeSelectedTower(), true)
  assert.equal(progression.selectTowerBranch('sniper'), stage >= 4)
  assert.equal(progression.upgradeSelectedTower(), stage >= 4)
  assert.equal(progression.upgradeSelectedTower(), stage >= 11)
  assert.equal(progression.upgradeSelectedTower(), false)
  assert.equal(progression.getHudSnapshot().selectedTower.upgradePreview, null)
  assert.equal(progression.setSelectedTowerStrategy('support'), stage >= 14)
  const free = [...progression.unlockedSlots].find(index => index !== 0)
  assert.equal(progression.relocateTower(0, free), stage >= 24)
}
for (const stage of [21, 22, 23, 24, 28, 29]) {
  progression.loadStage(stage)
  assert.equal(progression.traps.length, stage < 29 ? 2 : 3)
  assert.equal(progression.buildSlots.length, 10)
  assert.equal(progression.buildSlots.some(s => s.locked), stage >= 22)
  progression.gold = 10000
  const free = [...progression.unlockedSlots]
  progression.placeTower(free[0], 'rapid')
  assert.equal(progression.relocateTower(free[0], free[1]), stage >= 24)
  if (stage >= 22) assert.equal(progression.clearObstacle(progression.buildSlots.findIndex(s => s.locked)), true)
}
progression.startEndlessMode(2)
assert.equal(progression.progression.maxTowerLevel, 4)
assert.equal(progression.traps.length, 3)
assert.equal(progression.progression.restrictTowerRoster, false)
progression.destroy()

// New specialists get two familiar waves, then a small demonstration before mixed formations.
for (const [type, stage] of Object.entries(ENEMY_UNLOCKS).filter(([, stage]) => stage >= 6)) {
  const config = getStageConfig(stage)
  assert.ok(config.waves.slice(0, 2).every(w => w.groups.every(g => g.type !== type)))
  assert.equal(config.waves[2].groups.filter(g => g.type === type).reduce((sum, g) => sum + g.count, 0), 1, `${type} needs a small first encounter`)
  for (const wave of config.waves.slice(3)) assert.ok(wave.groups.filter(g => g.type === type).reduce((sum, g) => sum + g.count, 0) <= 2)
}
console.log('✓ Opening pressure, gradual feature gates, collected-roster replays and small enemy introductions verified')
