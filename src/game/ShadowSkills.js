import { setCritSource } from './CritSources.js'

export const SHADOW_BASE_EVASION = 0.15
export const SHADOW_MAX_EVASION = 0.4
export const SHADOW_CLONE_CHANCES = [0.6, 0.7, 0.8, 0.9]
export const SHADOW_CLONE_POWERS = [0.4, 0.55, 0.7, 0.85]
export const SHADOW_CLONE_LIFETIMES = [4, 5.5, 7]
export const SHADOW_CLONE_CAPS = [2, 3, 4]
export const SHADOW_CLONE_SKILL_IDS = ['ass_echo', 'ass_afterimage', 'ass_execute', 'ass_decoy', 'ass_legion', 'ass_capstone']

export const SHADOW_SPEC_INFO = {
  name: '暗影幻身', desc: '概率闪避 · 暴击生影 · 群影夹击',
  bonus: '👑 觉醒赋能：基础暴击保底 25% · 基础暴伤保底 3.5 倍 · 分身移速 +15%',
  roadmap: [
    'T1：致命锋芒（暴击）／虚化身躯（闪避率）／影生共鸣（暴击后分身概率）／影袭留身（空格 起点生影）',
    'T2：影刃凝实（分身伤害）／长夜留影（持续时间）／裂影横斩（本体群攻）',
    'T3：群影增殖（分身上限 3／4 个）',
    '终极：群影共舞（分身贯穿 · 影袭十字夹击）',
  ],
}

const t1 = ['ass_lethal', 'ass_stride', 'ass_echo', 'ass_afterimage']
export const SHADOW_SKILL_VARIANTS = {
  ass_lethal: {
    desc: '提高本体暴击率，与血统、觉醒及秘典独立叠加',
    stats: () => '本体暴击率 +8 个百分点',
    apply(game, lv) { setCritSource(game, 'lethal', { chance: 0.08 * lv }) },
  },
  ass_stride: {
    name: '虚化身躯', icon: '🌫️', desc: '概率闪避敌方攻击，成功后虚化 0.2 秒，期间免疫敌方攻击且不刷新保护', tags: ['暗影·T1', '闪避率'],
    stats: () => '闪避率 +5 个百分点（总上限 40%）',
    apply(game, lv) { game.player.shadowEvasionBonus = 0.05 * lv },
  },
  ass_execute: {
    name: '影刃凝实', icon: '🗡️', desc: '提高每只分身的攻击伤害，影袭夹击同步增强', tags: ['暗影·T2', '分身强度'], requires: t1,
    stats(lv) { return `分身攻击 ${Math.round(SHADOW_CLONE_POWERS[lv + 1] * 100)}% · 夹击 ${Math.round(SHADOW_CLONE_POWERS[lv + 1] * 200)}% 攻击力` },
    apply(game, lv) { game.player.shadowClonePowerLevel = lv },
  },
  ass_decoy: {
    name: '长夜留影', icon: '🌘', tier: 2, requires: t1, desc: '延长新生成或刷新的分身存续时间；分身每挡一发普通弹幕消耗 0.5 秒', tags: ['暗影·T2', '分身时间'],
    stats(lv) { return `分身持续 ${SHADOW_CLONE_LIFETIMES[lv + 1]} 秒` },
    apply(game, lv) { game.player.shadowCloneLifeLevel = lv },
  },
  ass_cleave: { requires: t1 },
  ass_capstone: {
    name: '🌟 群影共舞', requires: ['ass_legion'], tags: ['终极觉醒', '群影'],
    desc: '分身普攻贯穿最多 3 敌，后续伤害 50%；影袭协同进化为十字斩，同一目标不重复受伤',
    stats: () => '分身贯穿 · 影袭十字夹击',
    apply(game) { game.player.shadowCloneLord = true },
  },
}

export const SHADOW_EXTRA_SKILLS = [
  {
    id: 'ass_afterimage', spec: 'assassin', tier: 1, requiresStrain: 'shadow', name: '影袭留身', icon: '👤',
    desc: '成功施放 空格 即在起点留下分身，无需命中；满额时将最短寿命分身移回起点并刷新，不参与当次夹击',
    tags: ['暗影·T1', '主动生影'], maxLevel: 1,
    stats: () => '空格 起点生成 1 个分身 · 继承分身成长 · 可诱敌挡弹',
    apply(game) { if (game.startingStrain === 'shadow') game.player.shadowAssaultClone = true },
  },
  {
    id: 'ass_echo', spec: 'assassin', tier: 1, requiresStrain: 'shadow', name: '影生共鸣', icon: '👥',
    desc: '暴击生影概率每级增加 10 个百分点，最高 90%；满额刷新最短寿命，分身诱敌挡弹、优先追击射手', tags: ['暗影·T1', '分身概率'], maxLevel: 3,
    stats(lv) { return `暴击后分身概率 ${Math.round(SHADOW_CLONE_CHANCES[lv + 1] * 100)}%` },
    apply(game, lv) { if (game.startingStrain === 'shadow') game.player.shadowCloneChanceLevel = lv },
  },
  {
    id: 'ass_legion', spec: 'assassin', tier: 3, requiresStrain: 'shadow', requires: ['ass_execute', 'ass_decoy'],
    name: '群影增殖', icon: '👤', desc: '提高同时作战的分身数量上限', tags: ['暗影·T3', '分身数量'], maxLevel: 2,
    stats(lv) { return `分身上限 ${SHADOW_CLONE_CAPS[lv + 1]} 个` },
    apply(game, lv) { if (game.startingStrain === 'shadow') game.player.shadowCloneCapLevel = lv },
  },
]

/** Keep IDs stable while presenting the actual role-specific mechanics. */
export function resolveShadowSkill(skill, game) {
  if (game.startingStrain !== 'shadow') return skill
  const variant = SHADOW_SKILL_VARIANTS[skill.id]
  if (variant) return { ...skill, ...variant, apply: skill.apply }
  if (skill.id === 'boss_assassin_voidstep') return { ...skill,
    desc: '闪避率提升，影袭结束后储存一次普通攻击必暴', stats: '闪避率 +10 个百分点（上限 40%）· 影袭后普攻必暴' }
  return skill
}
