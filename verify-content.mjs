// 地图主题、剧情对白与武器视觉的专项回归。运行：node verify-content.mjs
import assert from 'node:assert/strict'
import { DialogueManager } from './src/game/DialogueManager.js'
import { STORY_DIALOGUE } from './src/game/DialogueData.js'
import { MAP_THEME_IDS, generateDecor } from './src/game/MapDecor.js'
import { EXPEDITION_STAGES, getExpeditionStages } from './src/game/RunRules.js'
import { WeaponSystem } from './src/game/WeaponSystem.js'
import { Projectile } from './src/game/entities/Projectile.js'
import { resolveWeaponVisual, splitWeaponVisual } from './src/game/WeaponVisuals.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

assert.equal(EXPEDITION_STAGES.length, 6)
assert.ok(EXPEDITION_STAGES.every((stage) => MAP_THEME_IDS.includes(stage.theme)))
assert.equal(new Set(EXPEDITION_STAGES.map((stage) => stage.variant)).size, 6)
assert.equal(new Set(EXPEDITION_STAGES.map((stage) => stage.narrativeKey)).size, 6)
ok('远征六关均声明独立地图变体与叙事节点')

const decorByStage = EXPEDITION_STAGES.map((stage) =>
  generateDecor(2400, 1800, { seed: 20260816, themeId: stage.theme, variant: stage.variant })
)
const signatures = decorByStage.map(({ bg, fg }) => [...bg, ...fg].map((item) => item.type).join(','))
assert.equal(new Set(signatures).size, 6)
ok('六种地图变体生成不同的场景构成')

// 远征关卡表按难度递增（简单 6 / 普通 8 / 困难 10 / 地狱 12），插章插在统帅决战前
const stageLists = {
  easy: getExpeditionStages('easy'),
  normal: getExpeditionStages('normal'),
  hard: getExpeditionStages('hard'),
  hell: getExpeditionStages('hell'),
}
assert.deepEqual(
  Object.fromEntries(Object.entries(stageLists).map(([key, list]) => [key, list.length])),
  { easy: 6, normal: 8, hard: 10, hell: 12 }
)
for (const [difficulty, list] of Object.entries(stageLists)) {
  assert.equal(list.at(-1).type, 'boss', `${difficulty} 最后一关必须是统帅决战`)
  assert.equal(new Set(list.map((stage) => stage.variant)).size, list.length, `${difficulty} 关卡变体不得重复`)
  assert.equal(new Set(list.map((stage) => stage.narrativeKey)).size, list.length, `${difficulty} 叙事节点不得重复`)
  assert.ok(list.slice(0, 5).every((stage, index) => stage.id === EXPEDITION_STAGES[index].id))
}
const interludeSignatures = [
  ['royal', 'reliquary'],
  ['royal', 'sanctum'],
  ['blight', 'royal-crypt'],
  ['blight', 'seal-chamber'],
  ['royal', 'throne-gallery'],
  ['royal', 'war-camp'],
].map(([themeId, variant]) =>
  generateDecor(2400, 1800, { seed: 20260816, themeId, variant })
    .bg.map((item) => item.type)
    .join(',')
)
assert.equal(new Set(interludeSignatures).size, 6)
assert.equal(new Set([...interludeSignatures, ...signatures]).size, 12)
ok('远征关卡数随难度递增（6/8/10/12），插章拥有独立变体、叙事与场景构成')

const stage = EXPEDITION_STAGES[3]
const compact = generateDecor(1600, 1200, { seed: 42, themeId: stage.theme, variant: stage.variant })
const expanded = generateDecor(2400, 1800, { seed: 42, themeId: stage.theme, variant: stage.variant })
assert.deepEqual(compact.bg.map((item) => item.type), expanded.bg.map((item) => item.type))
assert.deepEqual(compact.fg.map((item) => item.type), expanded.fg.map((item) => item.type))
ok('同一局地图缩放时装饰拓扑稳定，不随机换景')

const dialogue = new DialogueManager()
const dialogueGame = {
  camera: { x: 0, y: 0 },
  width: 1280,
  height: 720,
  runState: 'active',
  runSelection: { mode: 'expedition' },
  expeditionStage: 4,
  enemyManager: { wave: 7, hasBoss: false },
}
dialogue.attach(dialogueGame)
dialogue.minionCooldown = 0
dialogue.random = () => 0
const minion = { active: true, isBoss: false, type: 'knight', x: 320, y: 280, radius: 16 }
assert.equal(dialogue.tryMinion(minion), true)
assert.ok(STORY_DIALOGUE.home.includes(dialogue.current.text))
assert.equal(minion._dialogueChecked, true)
const nextMinion = { active: true, isBoss: false, type: 'mage', x: 360, y: 280, radius: 16 }
assert.equal(dialogue.tryMinion(nextMinion), false)
ok('小兵对白遵守一次判定、低概率与全局冷却')

const boss = {
  active: true,
  type: 'boss-expedition',
  name: '王国统帅',
  x: 620,
  y: 320,
  radius: 30,
  isExpeditionBoss: true,
}
assert.ok(dialogue.sayBoss(boss, 'spawn'))
assert.equal(dialogue.sayBoss(boss, 'spawn'), null)
assert.ok(dialogue.sayBoss(boss, 'phase'))
assert.ok(dialogue.sayBoss(boss, 'defeat'))
assert.equal(dialogue.epilogue.text, '原来一路进犯的……是我们。')
ok('Boss 登场、转阶段与败亡台词必达且事件去重')

const base = resolveWeaponVisual()
assert.equal(base, resolveWeaponVisual())
const acidGluttony = resolveWeaponVisual({ primaryReaction: 'acid', primarySpec: 'gluttony', tier: 2 })
assert.equal(acidGluttony.shape, 'glob')
assert.equal(acidGluttony.lobes, true)
const lightningAssassin = resolveWeaponVisual({
  elements: ['lightning'],
  primarySpec: 'assassin',
  tier: 4,
})
assert.equal(lightningAssassin.shape, 'shard')
assert.equal(lightningAssassin.crescent, true)
const split = splitWeaponVisual(lightningAssassin)
assert.ok(split.radius < lightningAssassin.radius)
assert.equal(split, splitWeaponVisual(lightningAssassin))
ok('元素材质、专精轮廓、层级结构与分裂形态可组合且缓存复用')

const projectile = new Projectile({ x: 0, y: 0, visual: acidGluttony, radius: 4 })
assert.equal(projectile.radius, 4)
assert.equal(projectile.visual, acidGluttony)
ok('飞弹显式半径契约保留，视觉配置不覆盖玩法碰撞尺寸')

const visualPlayer = { _primaryReaction: null, elements: new Map() }
const weapon = new WeaponSystem({ player: visualPlayer, enemyManager: { enemies: [] } })
weapon.attach({ primarySpec: 'gatling' })
assert.equal(weapon.registerSkillEvolution({ spec: 'gatling', tier: 3 }), true)
assert.equal(weapon.visualTiers.gatling, 3)
assert.equal(weapon._muzzleVisual.spine, true)
assert.equal(weapon.registerSkillEvolution({ spec: 'assassin', tier: 4 }), false)
ok('主专精技能链驱动武器进化，副专精不会覆盖主武器身份')

console.log(`\n内容系统专项通过：${n} 组断言 ✓`)
