/**
 * Runner 融合效果解释层（Phase D0）。
 *
 * 存在的唯一理由：RUNNER_FUSION_WEAPONS 里写了字段，就必须有一处把它们变成真实行为。
 * 在此之前，行为散落在 RunnerGameplay 的 `fusion?.id === 'xxx'` 分支里，后果是
 * 9 个组合里 4 个只有数据没有实现、1 个条件永不可达、1 个冻结永不恢复，
 * 而且 Rules 改数值不会同步改行为。
 *
 * 三条约束：
 *  1. 纯函数。只读 Rules 数据与传入的 trigger，不碰 runtime、不生成随机、不排序目标。
 *  2. 单一来源。core 决定「什么时候结算」，Rules 的数据字段决定「结算什么」。
 *     本文件不出现任何 'pierce_lightning' 之类的组合 id——组合身份永远只存在于
 *     Rules 表里，Phase D1 扩到 27 组合时只需要加数据。
 *  3. 确定。目标挑选由调用方按固定顺序完成，本层只产出「该做什么」。
 */

/** core -> 该 core 的融合效果在什么时机结算。 */
const TRIGGERS_BY_CORE = {
  pierce: ['onPierce'],
  burst: ['onExplosion'],
  corrosion: ['onHit', 'onKill'],
}

/**
 * trigger -> 「Rules 的哪个字段」对应「哪个效果」。
 * 纯数据映射：字段不存在就没有这个效果，因此 Rules 删字段等于自动收回能力。
 */
const EFFECT_FIELDS = {
  onPierce: [
    { field: 'arcDamageRatio', kind: 'adjacentArc', pick: (v) => ({ damageRatio: v }) },
    { field: 'fireDuration', kind: 'groundFire', pick: (v, f) => ({ duration: v, damage: f.fireDamage }) },
    { field: 'slowRatio', kind: 'slow', pick: (v, f) => ({ ratio: v, duration: f.slowDuration }) },
    { field: 'armorBreak', kind: 'armorBreak', pick: (v) => ({ amount: v }) },
  ],
  onExplosion: [
    { field: 'radiusMultiplier', kind: 'blastRadius', pick: (v) => ({ multiplier: v }) },
    { field: 'freezeDuration', kind: 'freeze', pick: (v) => ({ duration: v }) },
    { field: 'sparksCount', kind: 'sparks', pick: (v, f) => ({ count: v, damage: f.sparkDamage }) },
    { field: 'fireDuration', kind: 'groundFire', pick: (v, f) => ({ duration: v, damage: f.fireDamage }) },
  ],
  onHit: [
    { field: 'slowRatio', kind: 'slow', pick: (v, f) => ({ ratio: v, duration: f.slowDuration }) },
    { field: 'shockThreshold', kind: 'corrosionShock', pick: (v, f) => ({ threshold: v, damage: f.shockDamage, duration: f.shockDuration }) },
    { field: 'vulnerabilityBonus', kind: 'vulnerability', pick: (v) => ({ bonus: v }) },
  ],
  onKill: [
    { field: 'explosionRadius', kind: 'deathBlast', pick: (v, f) => ({ radius: v, damage: f.explosionDamage }) },
  ],
}

const NO_EFFECTS = []

/**
 * 本模块不含任何随机：目标挑选全部由调用方按 (lane, depth, id) 固定顺序完成。
 * 因此融合效果不会消费 Director 的 RNG，岔口时刻、遭遇序列、编队选择保持逐字可复现。
 *
 * 列出某次结算应当执行的效果。
 * @param {object|null} fusion getRunnerFusionWeapon 的返回值
 * @param {'onHit'|'onPierce'|'onExplosion'|'onKill'} trigger
 * @returns {ReadonlyArray<object>} 空数组表示这次结算无事可做
 */
export function planRunnerEffects(fusion, trigger) {
  if (!fusion) return NO_EFFECTS
  const triggers = TRIGGERS_BY_CORE[fusion.primary]
  if (!triggers || !triggers.includes(trigger)) return NO_EFFECTS
  const table = EFFECT_FIELDS[trigger]
  const effects = []
  for (const entry of table) {
    const value = fusion[entry.field]
    if (value === undefined || value === null) continue
    effects.push({ kind: entry.kind, ...entry.pick(value, fusion) })
  }
  return effects
}

/** 从效果列表里取某一种效果，没有则返回 null。 */
export function findRunnerEffect(effects, kind) {
  for (const effect of effects) {
    if (effect.kind === kind) return effect
  }
  return null
}
