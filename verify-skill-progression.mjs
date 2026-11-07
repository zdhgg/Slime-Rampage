import assert from 'node:assert/strict'
import { getEffectiveSkillMaxLevel, getSoftRankMultiplier } from './src/game/SkillProgression.js'
import { RICOCHET_SKILL_BY_ID, ricochetSkillAvailable } from './src/game/RicochetRules.js'
import { ENDLESS_SKILLS, getEndlessSkillBonus } from './src/game/EndlessSkills.js'
import { createArena, dispose } from './test-support/arena-fixture.mjs'
import { rollSkills } from './src/game/SkillPool.js'

const game = (mode, difficulty, extra = {}) => ({ runSelection: { mode, difficulty }, startingStrain: 'ricochet', weaponSystem: { ricochetCombat: { route: 'split' } }, ...extra })
const core = RICOCHET_SKILL_BY_ID.rico_velocity
const common = RICOCHET_SKILL_BY_ID.rico_multishot

assert.equal(getEffectiveSkillMaxLevel(game('expedition', 'easy'), core, 'primary'), core.maxLevel)
assert.equal(getEffectiveSkillMaxLevel(game('expedition', 'normal'), core, 'primary'), core.maxLevel)
assert.equal(getEffectiveSkillMaxLevel(game('expedition', 'hard'), core, 'primary'), 8)
assert.equal(getEffectiveSkillMaxLevel(game('expedition', 'hell'), core, 'primary'), 12)
assert.equal(getEffectiveSkillMaxLevel(game('timed', 'hell'), core, 'primary'), 10)
assert.equal(getEffectiveSkillMaxLevel(game('timed', 'hell'), RICOCHET_SKILL_BY_ID.rico_hunt, 'primary'), 9)
assert.equal(getEffectiveSkillMaxLevel(game('endless', 'normal'), RICOCHET_SKILL_BY_ID.rico_hunt, 'primary'), 10)
assert.equal(getEffectiveSkillMaxLevel(game('expedition', 'hell'), common, 'common'), 4)
assert.equal(getEffectiveSkillMaxLevel(game('endless', 'normal'), core, 'primary'), 14)
assert.equal(getEffectiveSkillMaxLevel(game('endless', 'normal'), common, 'common'), common.maxLevel)
assert.equal(getEffectiveSkillMaxLevel(game('endless', 'normal'), ENDLESS_SKILLS[0], 'common'), Infinity)
assert.equal(ricochetSkillAvailable(game('endless', 'normal', {
  weaponSystem: { ricochetCombat: { route: 'split' } },
  skillLevels: { rico_hunt: 10 },
}), RICOCHET_SKILL_BY_ID.rico_hunt), false, 'a finite skill leaves the roll pool after its last meaningful rank')

const early = getSoftRankMultiplier(3, .08, 1, 1.5)
const late = getSoftRankMultiplier(100, .08, 1, 1.5)
assert.ok(late < 1.501 && late > early)
assert.ok(getEndlessSkillBonus({ endless_power: 1000 }) < .501)

const engine = createArena('origin')
try {
  engine.configureRun({ mode: 'expedition', difficulty: 'hell' })
  engine.reset()
  engine.player.level = 10
  assert.ok(!rollSkills(engine, 99).some(skill => /^(gat_|ele_|ass_|glut_|pet_|sym_)/.test(skill.id)),
    '原生重构后不再抽取任何职业树技能')
} finally {
  dispose(engine)
}

const endlessEngine = createArena('origin')
try {
  endlessEngine.configureRun({ mode: 'endless', difficulty: 'normal' })
  endlessEngine.reset()
  endlessEngine.player.level = 5
  assert.equal(endlessEngine.applySkill(rollSkills(endlessEngine, 3)[0]), true)
  endlessEngine.player.level = 9
  assert.equal(endlessEngine.applySkill(rollSkills(endlessEngine, 5)[0]), true)
  endlessEngine.player.level = 120
  endlessEngine.enemyManager.wave = 25
  const cards = rollSkills(endlessEngine, 99)
  const mastery = cards.find(skill => skill.id === 'endless_power')
  assert.ok(mastery)
  assert.equal(mastery.maxLevel, Infinity)
  assert.equal(cards.find(skill => skill.id === 'com_swift')?.maxLevel, Infinity)
  endlessEngine.applySkill(mastery)
  assert.equal(endlessEngine.skillLevels.endless_power, 1)
  endlessEngine.player.level = 1000
  endlessEngine.weaponSystem.refreshLevelMultiplier()
  assert.ok(endlessEngine.weaponSystem.levelMul < 9.01, 'endless player and mastery growth stay bounded')
} finally {
  dispose(endlessEngine)
}
console.log('技能成长规则验证通过：模式上限、无尽无限精通与软上限 ✓')
