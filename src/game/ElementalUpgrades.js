/** Modifiers of the two existing spell slots, never extra automatic skills. */
import { iceSlowAmount, iceSlowDuration, iceArrowCount, iceMultiDamageMul, iceFanAngle, iceShardCount, iceShardDamageMul, iceShatterRadius, iceShatterDamageMul, iceBrittleMul } from './IceSpellRules.js'
import { fireMultiDamageMul, fireBrittleMul, burnSpreadRange, burnSpreadTargets, burnSpreadDuration, burnSpreadInherit } from './FireSpellRules.js'
import { BASE_SPELL_PALETTES } from './SpellPalette.js'
// Round display values only; retain hundredths for short effects such as 0.15s stun.
const seconds = value => Number(value.toFixed(2))

const school = (element, id, name, icon, desc, maxLevel, stats, extra = {}) => ({
  id, element, name, icon, desc, maxLevel, stats, spec: 'elemental', tier: 1, apply() {}, ...extra,
  tags: [{ fire: '火焰·火球术', water: '寒冰·冰箭', lightning: '雷电·闪电链', poison: '毒素·毒雾' }[element], extra.requires ? '进阶效果' : '法术改造'],
  color: BASE_SPELL_PALETTES[element].main,
})

export const ELEMENTAL_SCHOOL_SKILLS = [
  school('fire', 'spell_fire_power', '火球增幅', '🔥', '提高火球爆炸及其燃烧伤害，融合后仍保留。', 3, lv => `火焰法术伤害 +${(lv + 1) * 20}%`),
  school('water', 'spell_water_power', '霜矢强化', '❄️', '提高冰箭与寒冰法术伤害，保持已有穿透和控制效果。', 3, lv => `寒冰法术伤害 +${(lv + 1) * 20}%`),
  school('lightning', 'spell_lightning_power', '雷霆强化', '⚡', '提高闪电及后续传导伤害，雷暴转化后继续生效。', 3, lv => `雷电法术伤害 +${(lv + 1) * 20}%`),
  school('poison', 'spell_poison_power', '剧毒浓缩', '🧪', '提高毒雾每跳与附着毒伤，传染继承强化后的毒素。', 3, lv => `毒素法术伤害 +${(lv + 1) * 20}%`),
  school('fire', 'spell_fire_size', '火球膨胀', '🔥', '火球体积与爆炸范围增大，覆盖更多敌人。', 3, lv => `火球体积、爆炸范围 +${(lv + 1) * 20}%`),
  school('fire', 'spell_fire_count', '多重火球', '☄️', '每轮追加一颗火球，分时发射；追加火球分摊到附近敌人，主目标是首领或精英时聚火，每颗伤害适当降低，总火力提高。', 2,
    lv => `每轮火球 ${lv + 1} → ${lv + 2} 颗 · 单颗伤害 ${Math.round(fireMultiDamageMul(lv + 2) * 100)}% · 普通敌人分摊`),
  school('fire', 'spell_fire_burn', '余烬附着', '♨️', '火球获得燃烧效果；后续升级提高持续时间与灼烧强度。', 3, lv => `命中燃烧 ${seconds(2 + lv * .5)} 秒 · 每跳伤害 ${12 + lv * 4}%`),
  school('fire', 'spell_fire_brittle', '炽燃', '🌡️', '提高火焰法术对燃烧中目标造成的伤害；燃烧对首领同样附着，这条强化在首领战同样生效。', 2,
    lv => `燃烧目标火焰伤害 +${Math.round((fireBrittleMul(lv + 1) - 1) * 100)}%`, { requires: ['spell_fire_burn'] }),
  school('fire', 'spell_fire_spread', '余烬蔓延', '🕯️', `燃烧中的敌人延迟 ${seconds(.6)} 秒后点燃附近敌人，只传播一代，后代继承来源每跳灼烧的 ${Math.round(burnSpreadInherit * 100)}%。`, 3,
    lv => `点燃近邻 ${burnSpreadTargets(lv + 1)} 个 · ${burnSpreadRange(lv + 1)}px · 持续 ${burnSpreadDuration} 秒`, { requires: ['spell_fire_burn'] }),
  school('water', 'spell_ice_pierce', '贯穿冰箭', '❄️', '冰箭穿透更多目标，沿直线清理追兵。', 3, lv => `冰箭命中目标 ${2 + lv} → ${3 + lv} 个`),
  school('water', 'spell_ice_slow', '寒霜附着', '🌨️', '冰箭使普通敌人减速，附着霜纹与雪花标记；首领和狂暴敌人免疫，为冰封积累提供前置。', 2, lv => `冰箭减速 ${Math.round(iceSlowAmount(lv + 1) * 100)}% · 持续 ${seconds(iceSlowDuration(lv + 1))} 秒`),
  school('water', 'spell_ice_freeze', '冰封积累', '🧊', '连续冰箭命中积累冰霜，三层冻结普通敌人；首领免疫冻结。', 2, lv => `三层冰霜冻结 ${seconds(.8 + lv * .4)} 秒 · 再次冻结间隔 3 秒`, { requires: ['spell_ice_slow'] }),
  school('water', 'spell_ice_multi', '多重冰箭', '🏹', '每轮追加一支冰箭，按扇形展开，各支保留完整穿透；单支伤害适当降低，散兵阵型不再浪费穿透。', 2,
    lv => `每轮冰箭 ${iceArrowCount(lv)} → ${iceArrowCount(lv + 1)} 支 · 单支伤害 ${Math.round(iceMultiDamageMul(iceArrowCount(lv + 1)) * 100)}% · 扇形 ±${Math.round(iceFanAngle * 180 / Math.PI)}°`),
  school('water', 'spell_ice_split', '分裂冰箭', '💠', '冰箭命中后分出碎晶追击附近敌人；碎晶只结算伤害，不附加霜纹与减速，也不会再次分裂。', 2,
    lv => `命中分裂 ${iceShardCount(lv + 1)} 枚碎晶 · 伤害为冰箭命中的 ${Math.round(iceShardDamageMul * 100)}%`, { requires: ['spell_ice_pierce'] }),
  school('water', 'spell_ice_shatter', '冰晶迸裂', '💥', '三层霜纹触发冰晶迸裂，对周围造成冰系范围伤害；首领与狂暴敌人照常承受迸裂伤害，只是不会被冻结。', 2,
    lv => `三层霜纹迸裂 ${iceShatterRadius(lv + 1)}px · 冰系伤害 ${Math.round(iceShatterDamageMul(lv + 1) * 100)}%`, { requires: ['spell_ice_freeze'] }),
  school('water', 'spell_ice_brittle', '霜纹脆化', '🥶', '提高冰系法术对带霜纹与冻结目标造成的伤害；霜纹对首领同样附着，这条强化在首领战同样生效。', 2,
    lv => `带霜纹目标冰系伤害 +${Math.round((iceBrittleMul(lv + 1) - 1) * 100)}%`, { requires: ['spell_ice_slow'] }),
  school('lightning', 'spell_lightning_chain', '连锁跃迁', '⚡', '闪电链增加跳跃目标，保留火球等飞行法术的攻击机会。', 3, lv => `连锁目标 ${2 + lv} → ${3 + lv} 个`),
  school('lightning', 'spell_lightning_reach', '远距传导', '↯', '扩大闪电在敌人之间的传导距离，连接分散怪群。', 2, lv => `传导距离 +${(lv + 1) * 20}%`),
  school('lightning', 'spell_lightning_stun', '电流麻痹', '💫', '闪电获得短暂麻痹；首领免疫，每个目标有独立再次麻痹间隔。', 2, lv => `普通敌人麻痹 ${seconds(.15 + lv * .15)} 秒 · 再次麻痹间隔 2 秒`),
  school('poison', 'spell_poison_area', '毒雾扩散', '☠️', '扩大毒雾覆盖范围，封锁更宽的追击路径。', 3, lv => `毒雾范围 +${(lv + 1) * 20}%`),
  school('poison', 'spell_poison_duration', '浓雾滞留', '🌫️', '延长毒雾持续时间，形成更稳定的区域覆盖。', 3, lv => `毒雾持续 +${(lv + 1) * 25}%`),
  school('poison', 'spell_poison_linger', '毒素附着', '🧪', '毒雾获得中毒附着，敌人离开毒雾后仍受到毒伤。', 3, lv => `离开毒雾后中毒 ${2 + lv} 秒 · 每跳伤害 ${15 + lv * 5}%`),
  school('poison', 'spell_poison_contagion', '毒素传染', '☣️', '毒雾使敌人染毒，0.6 秒后传给附近敌人；每轮感染只传播一次，后代毒伤继承来源的 70%。', 3,
    lv => `染毒 2 秒 · 传染 ${lv >= 2 ? 2 : 1} 个目标 · ${110 + lv * 20}px · 最多 ${lv >= 1 ? 2 : 1} 代`),
]

export function spellSkillAvailable(skill, game) {
  const elements = game.weaponSystem?.spellCombat?.elements || game.player?.elements
  return (!skill.element || !!elements?.has(skill.element)) && (!skill.requires || skill.requires.every(id => (game.skillLevels?.[id] || 0) > 0))
}

/** Select useful school cards first: two paths of a single spell, or one per school. */
export function prioritizeSpellChoices(pool, game, count) {
  const selected = [], elements = [...(game.weaponSystem?.spellCombat?.elements || game.player?.elements || [])]
  const add = option => { if (option && selected.length < count && !selected.includes(option)) selected.push(option) }
  if (elements.length === 1) {
    for (const option of pool.filter(s => s.element === elements[0]).slice(0, Math.min(2, count))) add(option)
  } else {
    for (const element of elements) add(pool.find(s => s.element === element))
  }
  if ((game.player?.level || 0) % 5 === 3) add(pool.find(s => s.id === 'spell_shield'))
  for (const option of pool) add(option)
  return selected
}
