import assert from 'node:assert/strict'
import { createArena, spawn, dispose } from './test-support/arena-fixture.mjs'
import { createOriginInjectionToken, skillInjectionToken, originInjectionPlan } from './src/game/OriginInjection.js'

const g = createArena('origin')
try {
  g.player.absorbElement('fire')
  assert.equal(g.player.originOverloadElement, 'fire', '主注入 = 元素排名第 1 名')
  g.player.absorbElement('water')
  const plan = originInjectionPlan(g)
  assert.equal(plan.primary, 'fire')
  assert.equal(plan.secondary, 'water')
  assert.equal(plan.reaction, 'steam', '主反应连招 = 排名前两名的组合')
  const enemy = spawn(g, { x: 30, hp: 1000 })
  const cs = g.weaponSystem.originSourceCombat
  const shared = createOriginInjectionToken(g)
  const token = skillInjectionToken(shared)
  cs._hit(enemy, 2, token)
  assert.equal(shared.injected.get('fire').size, 1)
  cs._hit(enemy, 2, token)
  assert.equal(shared.injected.get('fire').size, 1, 'same target is processed once per overload')
  const aux = skillInjectionToken(shared, true, 'auxiliary')
  assert.equal(aux.element, 'water', '协同注入 = 元素排名第 2 名')
  cs._hit(enemy, 2, aux)
  assert.ok(enemy.primeSlow > 0, 'water injection slows a regular enemy')
  assert.equal(shared.reactionUsed, true, '主+协同注入同一目标触发主反应连招')
  const hp = enemy.hp
  cs._hit(enemy, 1, aux)
  assert.equal(enemy.hp, hp - 1, 'reaction cannot trigger twice')

  // 六种组合全可作为主反应连招：两元素排名直接决定注入与连招
  for (const [reaction, a, b] of [
    ['gel', 'water', 'lightning'], ['acid', 'fire', 'poison'], ['steam', 'fire', 'water'],
    ['burst', 'fire', 'lightning'], ['corrode', 'water', 'poison'], ['venom', 'poison', 'lightning'],
  ]) {
    g.player.elements.clear()
    g.player.elements.set(a, 2); g.player.elements.set(b, 1)
    g.player._refreshElements()
    assert.equal(g.player._primaryReaction, reaction, `排名驱动主反应 ${reaction}`)
    const combo = createOriginInjectionToken(g)
    cs._hit(enemy, 1, skillInjectionToken(combo))
    assert.equal(combo.reactionUsed, false)
    cs._hit(enemy, 1, skillInjectionToken(combo, true, 'auxiliary'))
    assert.equal(combo.reactionUsed, true, reaction)
  }

  // 副反应连招：第三技能注入第 3 名元素，集齐副反应组合时触发一次（60% 强度）
  g.player.elements.clear()
  g.player.elements.set('fire', 3); g.player.elements.set('water', 2); g.player.elements.set('lightning', 1)
  g.player._refreshElements()
  const triple = createOriginInjectionToken(g)
  assert.equal(g.player._primaryReaction, 'steam')
  assert.equal(skillInjectionToken(triple, true, 'third').element, 'lightning', '第三技能注入第 3 名元素')
  cs._hit(enemy, 1, skillInjectionToken(triple)) // fire
  cs._hit(enemy, 1, skillInjectionToken(triple, true, 'auxiliary')) // water → 主连招 steam
  assert.equal(triple.reactionUsed, true)
  assert.equal(triple.secondaryUsed, false)
  cs._hit(enemy, 1, skillInjectionToken(triple, true, 'third')) // lightning → 集齐 fire+lightning（burst 副反应）
  assert.equal(triple.secondaryUsed, true, '第三技能注入触发副反应连招')
  g.reset()
  assert.equal(g.player.originOverloadElement, null)
  assert.deepEqual(g.player._elementRanks, [])
  console.log('原生元素注入排名派生、六种主连招、副反应连招与重开清理通过')
} finally { dispose(g) }
