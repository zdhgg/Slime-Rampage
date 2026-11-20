import { getRunnerFusionWeapon } from './RunnerRules.js'

/**
 * Runner 四维构筑效果解释层（Core × Element × Modules × Kinetics）。
 *
 * 约束：
 *  1. 纯函数。只读 Rules 数据与传入的 trigger，不碰 runtime、不生成随机、不排序目标。
 *  2. 单一来源。Core 决定主融合的结算时机，Rules 的数据字段决定结算什么。
 *  3. 向下兼容：`build` 可传 `{ fusion, module }` 或 `{ fusion, modules, kinetics }`。
 */

const TRIGGERS_BY_CORE = {
  pierce: ['onPierce'],
  burst: ['onExplosion'],
  corrosion: ['onHit', 'onKill'],
  spread: ['onHit'],
  beam: ['onHit', 'onKill'],
}

const TRIGGERS_BY_MODULE = {
  split: ['onHit'],
  amplify: ['onHit'],
  cross_prism: ['onHit'],
  siege_hammer: ['onHit', 'onKill'],
}

const MODULE_EFFECT_FIELDS = {
  onHit: [
    { field: 'splitCount', kind: 'split', pick: (v, m) => ({ count: v, damage: m.splitDamage, range: m.splitRange }) },
    { field: 'amplifyBonus', kind: 'amplify', pick: (v, m) => ({ bonus: v, hpRatio: m.amplifyHpRatio }) },
    { field: 'crossCount', kind: 'crossPrism', pick: (v, m) => ({ count: v, damage: m.crossDamage, range: m.crossRange }) },
    { field: 'siegeBonus', kind: 'siegeBreaker', pick: (v, m) => ({ bonus: v, shatterDamage: m.shatterDamage }) },
  ],
  onKill: [
    { field: 'shatterDamage', kind: 'siegeShatter', pick: (v) => ({ damage: v }) },
  ],
}

const EFFECT_FIELDS = {
  onPierce: [
    { field: 'arcDamageRatio', kind: 'adjacentArc', pick: (v) => ({ damageRatio: v }) },
    { field: 'fireDuration', kind: 'groundFire', pick: (v, f) => ({ duration: v, damage: f.fireDamage }) },
    { field: 'slowRatio', kind: 'slow', pick: (v, f) => ({ ratio: v, duration: f.slowDuration }) },
    { field: 'armorBreak', kind: 'armorBreak', pick: (v) => ({ amount: v }) },
    { field: 'pullRange', kind: 'voidPull', pick: (v, f) => ({ range: v, damage: f.vortexDamage || 0.45 }) },
  ],
  onExplosion: [
    { field: 'radiusMultiplier', kind: 'blastRadius', pick: (v) => ({ multiplier: v }) },
    { field: 'freezeDuration', kind: 'freeze', pick: (v) => ({ duration: v }) },
    { field: 'sparksCount', kind: 'sparks', pick: (v, f) => ({ count: v, damage: f.sparkDamage }) },
    { field: 'fireDuration', kind: 'groundFire', pick: (v, f) => ({ duration: v, damage: f.fireDamage }) },
    { field: 'pullRange', kind: 'voidPull', pick: (v, f) => ({ range: v, damage: f.vortexDamage || 0.5 }) },
  ],
  onHit: [
    { field: 'slowRatio', kind: 'slow', pick: (v, f) => ({ ratio: v, duration: f.slowDuration }) },
    { field: 'shockThreshold', kind: 'corrosionShock', pick: (v, f) => ({ threshold: v, damage: f.shockDamage, duration: f.shockDuration }) },
    { field: 'vulnerabilityBonus', kind: 'vulnerability', pick: (v) => ({ bonus: v }) },
    { field: 'sparksCount', kind: 'sparks', pick: (v, f) => ({ count: v, damage: f.sparkDamage }) },
    { field: 'fireDuration', kind: 'groundFire', pick: (v, f) => ({ duration: v, damage: f.fireDamage }) },
    { field: 'armorBreak', kind: 'armorBreak', pick: (v) => ({ amount: v }) },
    { field: 'pullRange', kind: 'voidPull', pick: (v, f) => ({ range: v, damage: f.vortexDamage || 0.45 }) },
    { field: 'arcDamageRatio', kind: 'adjacentArc', pick: (v) => ({ damageRatio: v }) },
  ],
  onKill: [
    { field: 'explosionRadius', kind: 'deathBlast', pick: (v, f) => ({ radius: v, damage: f.explosionDamage }) },
    { field: 'pullRange', kind: 'voidPull', pick: (v, f) => ({ range: v, damage: f.vortexDamage || 0.35 }) },
  ],
}

const NO_EFFECTS = []

export function planRunnerEffects(build, trigger) {
  if (!build || !trigger) return NO_EFFECTS
  const effects = []
  collect(effects, EFFECT_FIELDS[trigger], build.fusion, TRIGGERS_BY_CORE[build.fusion?.primary], trigger)
  const modules = Array.isArray(build.modules)
    ? build.modules
    : build.module
    ? [build.module]
    : []
  for (const mod of modules) {
    if (!mod) continue
    collect(effects, MODULE_EFFECT_FIELDS[trigger], mod, TRIGGERS_BY_MODULE[mod.id], trigger)
  }
  return effects
}

function collect(into, table, source, triggers, trigger) {
  if (!source || !table || !triggers || !triggers.includes(trigger)) return
  for (const entry of table) {
    const value = source[entry.field]
    if (value === undefined || value === null) continue
    into.push({ kind: entry.kind, ...entry.pick(value, source) })
  }
}

export function getRunnerBulletProfile(build) {
  const modules = Array.isArray(build?.modules)
    ? build.modules
    : build?.module
    ? [build.module]
    : []
  let ricochetCount = 0
  let ricochetDecay = 1
  let mineInterval = 0
  let mineDamage = 0
  let mineRadius = 0
  for (const mod of modules) {
    if (!mod) continue
    if (mod.ricochetCount) {
      ricochetCount = mod.ricochetCount
      ricochetDecay = mod.ricochetDecay
    }
    if (mod.mineInterval) {
      mineInterval = mod.mineInterval
      mineDamage = mod.mineDamage
      mineRadius = mod.mineRadius
    }
  }
  if (!ricochetCount && !mineInterval) return null
  return { ricochetCount, ricochetDecay, mineInterval, mineDamage, mineRadius }
}

export function findRunnerEffect(effects, kind) {
  for (const effect of effects) {
    if (effect.kind === kind) return effect
  }
  return null
}

/**
 * 为选卡界面生成纯正交协同提示文案。
 */
export function getRunnerDraftSynergyHint(state, candidate) {
  if (!state || !candidate) return ''
  if (candidate.category === 'element' && state.weaponCore) {
    const fusion = getRunnerFusionWeapon(state.weaponCore, candidate.id)
    if (fusion) return `✨ 融合觉醒：${fusion.name}`
  }
  if (candidate.category === 'core' && state.secondaryElement) {
    const fusion = getRunnerFusionWeapon(candidate.id, state.secondaryElement)
    if (fusion) return `✨ 重组融合：${fusion.name}`
  }
  if (candidate.category === 'module') {
    if (candidate.id === 'cross_prism' && state.weaponCore === 'pierce') return '🔗 协同：贯穿+折光跨道穿刺'
    if (candidate.id === 'siege_hammer' && state.weaponCore === 'corrosion') return '🔗 协同：双倍破甲拆盾'
    if (candidate.id === 'mine_layer' && state.secondaryElement === 'void') return '🔗 协同：虚空聚怪踩雷引爆'
  }
  if (candidate.category === 'kinetic') {
    if (candidate.id === 'aerial_slam' && state.strainId === 'shadow') return '🔗 血统共鸣：跳跃兼触发残影斩'
    if (candidate.id === 'lane_pulse' && state.strainId === 'ricochet') return '🔗 血统共鸣：切道连携爆发'
  }
  return ''
}
