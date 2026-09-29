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
 *  3. 确定。目标挑选全部由调用方按 (lane, depth, id) 固定顺序完成，本层不排序、
 *     不生成随机。因此融合与模块效果都不会消费 Director 的 RNG，
 *     岔口时刻、遭遇序列、编队选择保持逐字可复现。
 */

/** core -> 该 core 的融合效果在什么时机结算。 */
const TRIGGERS_BY_CORE = {
  pierce: ['onPierce'],
  burst: ['onExplosion'],
  corrosion: ['onHit', 'onKill'],
}

/**
 * module -> 该 module 的效果在什么时机结算。
 * 三个 module 各自只有一个触发点，没有任何 module 会同时占用多个 trigger，
 * 所以 3 Module × 任意 Core/Element 都不会互相抢触发时机。
 */
const TRIGGERS_BY_MODULE = {
  split: ['onHit'],
  amplify: ['onHit'],
}

/**
 * Module 的字段映射。与融合字段同表机制，但字段名互不重叠，
 * 因此 Rules 里同时带 splitCount 与 arcDamageRatio 的构筑可以一次规划出两者。
 */
const MODULE_EFFECT_FIELDS = {
  onHit: [
    { field: 'splitCount', kind: 'split', pick: (v, m) => ({ count: v, damage: m.splitDamage, range: m.splitRange }) },
    { field: 'amplifyBonus', kind: 'amplify', pick: (v, m) => ({ bonus: v, hpRatio: m.amplifyHpRatio }) },
  ],
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
 * 列出某次结算应当执行的效果。融合与模块各自按自己的触发时机贡献，互不覆盖：
 * 一次 plan 里同时出现 blastRadius（融合）和 split（模块）正是「正交」的定义。
 * @param {{fusion?: object|null, module?: object|null}} build 当前构筑
 * @param {'onHit'|'onPierce'|'onExplosion'|'onKill'} trigger
 * @returns {ReadonlyArray<object>} 空数组表示这次结算无事可做
 */
export function planRunnerEffects(build, trigger) {
  if (!build || !trigger) return NO_EFFECTS
  const effects = []
  collect(effects, EFFECT_FIELDS[trigger], build.fusion, TRIGGERS_BY_CORE[build.fusion?.primary], trigger)
  collect(effects, MODULE_EFFECT_FIELDS[trigger], build.module, TRIGGERS_BY_MODULE[build.module?.id], trigger)
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

/**
 * 弹体级参数：回弹不是「在某次结算里多打一个目标」，而是弹体自身在击破后继续飞行，
 * 因此走独立的弹道通道而不新增 trigger。返回 null 表示该构筑没有回弹。
 */
export function getRunnerBulletProfile(build) {
  const module = build?.module
  if (!module?.ricochetCount) return null
  return { ricochetCount: module.ricochetCount, ricochetDecay: module.ricochetDecay }
}

/** 从效果列表里取某一种效果，没有则返回 null。 */
export function findRunnerEffect(effects, kind) {
  for (const effect of effects) {
    if (effect.kind === kind) return effect
  }
  return null
}
