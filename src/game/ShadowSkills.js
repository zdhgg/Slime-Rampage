import { setCritSource } from './CritSources.js'
import { applyRankMultiplier, getSoftRankMultiplier } from './SkillProgression.js'

export const SHADOW_BASE_EVASION = 0.18
export const SHADOW_MAX_EVASION = 0.4
export const SHADOW_ASSAULT_EVASION_CAP = 0.72
export const SHADOW_EVADE_PITY_STEP = 0.08
export const SHADOW_EVADE_PITY_CAP = 0.4
export const SHADOW_CLONE_CHANCES = [0.6, 0.75, 0.9, 1.0]
// Baseline + authored ranks through the hardest/endless ceilings. Later ranks
// taper into a bounded plateau so the clone army never compounds without limit.
export const SHADOW_CLONE_POWERS = [0.52, 0.68, 0.84, 1.0, 1.09, 1.17, 1.24, 1.3, 1.35, 1.39, 1.42, 1.45, 1.47, 1.49, 1.5]
export const SHADOW_CLONE_LIFETIMES = [4, 5.5, 7]
export const SHADOW_CLONE_CAPS = [2, 3, 4]
export const SHADOW_CLONE_SKILL_IDS = ['ass_echo', 'ass_afterimage', 'ass_execute', 'ass_decoy', 'ass_legion', 'ass_capstone', 'ass_ward']

export const shadowLethalChanceAt = lv => lv <= 3 ? 0.08 * lv : 0.24 + Math.min(0.36, (lv - 3) * 0.04)
export const shadowLethalCritMulAt = lv => lv <= 3 ? 0.30 * lv : 0.90 + (lv - 3) * 0.14
export const shadowStrideHasteAt = lv => lv <= 3 ? 0.10 * lv : 0.30 + (lv - 3) * 0.06
export const shadowExecuteCritInheritAt = lv => lv <= 3 ? 0.08 * lv : 0.24 + Math.min(0.20, (lv - 3) * 0.03)
export const shadowEchoLifeBonusAt = lv => Math.max(0, Math.floor(Number(lv) || 0)) * 0.75
export const shadowDecoyBlockWearAt = lv => lv >= 2 ? 0.18 : lv === 1 ? 0.25 : 0.35
export const shadowDecoyMeleeWearAt = lv => lv >= 2 ? 0.25 : lv === 1 ? 0.35 : 0.45

export function syncShadowStrideBonuses(game) {
  if (!game || game.startingStrain !== 'shadow') return
  const overflow = game.player?.evasionOverflow || 0
  if (overflow <= 0 && !game.weaponSystem?._critSources?.stride_overflow) return
  setCritSource(game, 'stride_overflow', overflow > 0 ? { multiplier: Number((overflow * 2).toFixed(4)) } : {})
}

export const SHADOW_SPEC_INFO = {
  name: '暗影幻身', desc: '闪避韧性 · 影织魔盾 · 影魄回血 · 暴击生影',
  bonus: '👑 觉醒赋能：暴击率 +8% · 暴击伤害 +0.5 倍 · 分身移速 +15%',
  roadmap: [
    '前期：探索猎杀、群影、刃潮入口，积累暴击、虚化与噬法暗幕',
    '中期：选卡满 5 次并到第 6 波／远征第 3 章后，确认并锁定一条路线',
    '进阶：全路线共享分身强度与暴击成长，路线专属强化收割、护主或反刃',
    '终极：Lv.14、路线投入 4 级且到第 10 波／远征第 5 章后随机进入选卡池，三者互斥且不保证出现',
  ],
}

const t1 = ['ass_lethal', 'ass_stride', 'ass_echo', 'ass_afterimage', 'ass_ward']
export const SHADOW_SKILL_VARIANTS = {
  ass_lethal: {
    desc: '同时提高本体暴击率与暴击伤害；暴击率超过 100% 时每溢出 1% 自动转化为 +2% 暴击伤害',
    growthClass: 'core',
    rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 12 },
    stats(lv) {
      const cNext = shadowLethalChanceAt(lv + 1) - shadowLethalChanceAt(lv)
      const mNext = shadowLethalCritMulAt(lv + 1) - shadowLethalCritMulAt(lv)
      return `暴击率 +${Math.round(cNext * 100)} 个百分点 · 暴伤 +${mNext.toFixed(2)} 倍`
    },
    apply(game, lv) {
      setCritSource(game, 'lethal', {
        chance: shadowLethalChanceAt(lv),
        multiplier: shadowLethalCritMulAt(lv),
      })
    },
  },
  ass_stride: {
    name: '虚化身躯', icon: '🌫️',
    desc: '提高闪避率、移速与影织魔盾充能速度；闪避达到 40% 上限后，每溢出 1% 转为 +2.5% 魔盾充能与 +2% 暴伤',
    tags: ['暗影·T1', '闪避·充能'],
    growthClass: 'core',
    rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 9, endless: 12 },
    stats(lv) {
      const hasteDelta = Math.round((shadowStrideHasteAt(lv + 1) - shadowStrideHasteAt(lv)) * 100)
      return `闪避率 +5 个百分点 · 魔盾充能 +${hasteDelta}% · 移速提升`
    },
    apply(game, lv) {
      game.player.shadowEvasionBonus = 0.05 * lv
      game.player.shadowStrideLevel = lv
      if (game.weaponSystem?.shadowCombat) game.weaponSystem.shadowCombat.strideLevel = lv
      applyRankMultiplier(game.player, 'speed', lv - 1, lv, rank => getSoftRankMultiplier(rank, 0.03, 4, 1.35))
      syncShadowStrideBonuses(game)
    },
  },
  ass_execute: {
    name: '影刃凝实', icon: '🗡️',
    desc: '提高每只分身的攻击伤害、影袭夹击威力与分身暴击继承率（全暗影路线通用）',
    tags: ['暗影·T2', '分身强度'], requires: t1,
    growthClass: 'core',
    rankCaps: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 },
    stats(lv) {
      const power = SHADOW_CLONE_POWERS[Math.min(SHADOW_CLONE_POWERS.length - 1, lv + 1)]
      const inheritPct = Math.round((0.4 + shadowExecuteCritInheritAt(lv + 1)) * 100)
      return `分身攻击 ${Math.round(power * 100)}% · 夹击 ${Math.round(power * 200)}% · 暴击继承 ${inheritPct}%`
    },
    apply(game, lv) { game.player.shadowClonePowerLevel = lv },
  },
  ass_decoy: {
    name: '长夜留影', icon: '🌘', tier: 2, requires: t1,
    desc: '延长分身与击杀残影持续时间，并降低分身拦截普通弹幕与分流近战攻击时的寿命消耗（全暗影路线通用）',
    tags: ['暗影·T2', '分身续航'],
    stats(lv) {
      const life = SHADOW_CLONE_LIFETIMES[Math.min(SHADOW_CLONE_LIFETIMES.length - 1, lv + 1)]
      const wear = shadowDecoyBlockWearAt(lv + 1)
      const meleeWear = shadowDecoyMeleeWearAt(lv + 1)
      return `分身时长 ${life} 秒 · 挡弹耗损 ${wear.toFixed(2)} 秒 · 近战承伤耗损 ${meleeWear.toFixed(2)} 秒`
    },
    apply(game, lv) { game.player.shadowCloneLifeLevel = lv },
  },
  ass_cleave: { requires: t1 },
  ass_capstone: {
    name: '🌟 群影共舞', requires: ['ass_legion'], tags: ['终极觉醒', '群影'],
    desc: '分身普攻贯穿最多 3 敌，后续伤害 50%；影袭协同进化为十字斩并若分身未满自动补足 1 只分身',
    stats: () => '分身贯穿 · 影袭十字夹击 · 影袭自动补影',
    apply(game) { game.player.shadowCloneLord = true },
  },
}

export const SHADOW_EXTRA_SKILLS = [
  {
    id: 'ass_ward', spec: 'assassin', tier: 1, requiresStrain: 'shadow', name: '噬法暗幕', icon: '🛡️',
    desc: '强化暗影魔盾层数与重建速度，并缩短「影魄汲取」回血冷却；挡下法术攻击后返还影袭冷却、强化噬法必暴并召影反击',
    tags: ['暗影·T1', '法术护盾'], maxLevel: 3, growthClass: 'core',
    rankCaps: { expedition: { hard: 7, hell: 10 }, timed: 8, endless: 12 },
    stats(lv) {
      const next = lv + 1
      const healCd = Math.max(8, 12 - next)
      if (next === 1) return `魔盾上限 1 → 2 层 · 重建 7.5 秒 · 返还影袭 1.0 秒 · 影魄回血冷却 ${healCd} 秒`
      if (next === 2) return `重建 7.5 → 6.5 秒 · 噬法反制暴伤 +0.60 倍 · 影魄回血冷却 ${healCd} 秒`
      if (next === 3) return `魔盾上限 2 → 3 层 · 重建 5.5 秒 · 返还影袭 1.5 秒 · 影魄回血冷却 ${healCd} 秒`
      return `重建缩至 ${Math.max(3.5, 5.5 - (next - 3) * 0.25).toFixed(2)} 秒 · 破法震波 · 影魄回血冷却 ${healCd} 秒`
    },
    apply(game, lv) {
      if (game.startingStrain !== 'shadow') return
      game.player.shadowWardLevel = lv
      const combat = game.weaponSystem?.shadowCombat
      if (combat) {
        combat.wardLevel = lv
        combat.shield?.upgrade()
      }
    },
  },
  {
    id: 'ass_afterimage', spec: 'assassin', tier: 1, requiresStrain: 'shadow', name: '影袭双影', icon: '👤',
    desc: '强化固有空格起手留影：起点分身额外获得 +2 次免费挡伤护甲；影袭落地时再于落点唤出 1 只分身（满额时强化并刷新现有分身）',
    tags: ['暗影·T1', '双影强化'], maxLevel: 1,
    stats: () => '起点分身 +2 免费挡伤 · 落地额外生影／满额强袭刷新',
    apply(game) { if (game.startingStrain === 'shadow') game.player.shadowAssaultClone = true },
  },
  {
    id: 'ass_echo', spec: 'assassin', tier: 1, requiresStrain: 'shadow', name: '影生共鸣', icon: '👥',
    desc: '暴击生影概率提升至最高 100%，并同步延长分身存续时间；满额生影时会强化分身下一击并加快魔盾充能',
    tags: ['暗影·T1', '分身共鸣'], maxLevel: 3,
    stats(lv) {
      const next = Math.min(3, lv + 1)
      return `暴击生影概率 ${Math.round(SHADOW_CLONE_CHANCES[next] * 100)}% · 额外寿命 +${shadowEchoLifeBonusAt(next).toFixed(2)} 秒`
    },
    apply(game, lv) {
      if (game.startingStrain !== 'shadow') return
      game.player.shadowCloneChanceLevel = lv
      game.player.shadowEchoLifeBonus = shadowEchoLifeBonusAt(lv)
    },
  },
  {
    id: 'ass_legion', spec: 'assassin', tier: 3, requiresStrain: 'shadow', requires: ['ass_execute', 'ass_decoy'],
    name: '群影增殖', icon: '👤', desc: '提高同时作战的分身数量上限，并强化分身在场时对暗影魔盾的充能加速',
    tags: ['暗影·T3', '分身数量'], maxLevel: 2,
    stats(lv) {
      const cap = SHADOW_CLONE_CAPS[Math.min(SHADOW_CLONE_CAPS.length - 1, lv + 1)]
      const haste = lv + 1 >= 2 ? 15 : 10
      return `分身上限 ${cap} 个 · 每只分身加速魔盾充能 +${haste}%`
    },
    apply(game, lv) { if (game.startingStrain === 'shadow') game.player.shadowCloneCapLevel = lv },
  },
]

/** Keep IDs stable while presenting the actual role-specific mechanics. */
export function resolveShadowSkill(skill, game) {
  if (skill.bossTome || game.startingStrain !== 'shadow') return skill
  const variant = SHADOW_SKILL_VARIANTS[skill.id]
  if (variant) return { ...skill, ...variant, isShadowSkill: true, apply: skill.apply }
  if (skill.id === 'boss_assassin_voidstep') return {
    ...skill,
    desc: '闪避率提升，影袭结束后储存一次普通攻击必暴',
    stats: '闪避率 +10 个百分点（上限 40%，溢出转暴伤与魔盾充能）· 影袭后普攻必暴',
  }
  return skill
}
