import { isTimedMode } from './RunRules.js'

/**
 * Run-aware skill rank limits. `growthClass` is deliberately opt-in: skills with
 * discrete or recursive mechanics keep their authored cap unless audited.
 */
export const SKILL_RANK_LIMITS = Object.freeze({
  expedition: Object.freeze({ easy: { common: 4, core: 6 }, normal: { common: 4, core: 8 }, hard: { common: 5, core: 9 }, hell: { common: 5, core: 10 } }),
  timed: Object.freeze({ easy: { common: 5, core: 8 }, normal: { common: 5, core: 8 }, hard: { common: 5, core: 8 }, hell: { common: 5, core: 8 } }),
  timed20: Object.freeze({ easy: { common: 5, core: 10 }, normal: { common: 5, core: 10 }, hard: { common: 5, core: 10 }, hell: { common: 5, core: 10 } }),
  endless: Object.freeze({ easy: { common: 5, core: 10 }, normal: { common: 5, core: 10 }, hard: { common: 5, core: 10 }, hell: { common: 5, core: 10 } }),
})

// The extended rank runway is authored per skill, not imposed as one universal
// target. Values are skill ceilings; card offers still remain random.
export const CORE_SKILL_RANK_CAPS = Object.freeze({
  glut_maw: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  glut_bulk: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 12 },
  glut_ram: { expedition: { hard: 10, hell: 12 }, timed: 10, endless: 14 },
  glut_bite_sweep: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  glut_acid_aura: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  glut_aftershock: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  glut_counter: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  gat_velocity: { expedition: { hard: 10, hell: 12 }, timed: 10, endless: 14 },
  ele_resonance: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_mastery: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_hot_streak: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 10 },
  fire_rain: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_infernal_pact: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_dest_cataclysm: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_dest_immolate: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_pyro_streak: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  fire_pyro_combust: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_mastery: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_shatter_lance: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 10 },
  ice_blizzard: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_comet_mastery: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_storm_hail: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_storm_veins: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_shatter_flurry: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ice_shatter_deep: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_mastery: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_overload: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 10 },
  lit_thunderstorm: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_keeper_pact: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_over_echo: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_over_arc: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_sky_barrage: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  lit_sky_totem: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_mastery: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_contagion: { expedition: { hard: 7, hell: 8 }, timed: 7, endless: 10 },
  poi_seed: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_rapture_pact: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_pan_burst: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_pan_spread: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_aff_siphon: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  poi_aff_agony: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  ass_lethal: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  ass_ward: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 12 },
  ass_stride: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  ass_execute: { expedition: { hard: 10, hell: 12 }, timed: 10, endless: 14 },
  pet_power: { expedition: { hard: 10, hell: 12 }, timed: 10, endless: 14 },
  pet_vitality: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  pet_haste: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 13 },
  sym_tactic_weaken: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_beast_seed: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_beast_frenzy: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_beast_cleave: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_beast_curse: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_beast_revive: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_ranger_seed: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_ranger_infuse: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_ranger_focus: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_ranger_escort: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_ranger_barrage: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_bond_seed: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_bond_chain: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_bond_volley: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_bond_aegis: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  sym_bond_surge: { expedition: { hard: 9, hell: 11 }, timed: 9, endless: 12 },
  origin_flux: { expedition: { hard: 9, hell: 11 }, timed: 10, endless: 11 },
  origin_overload: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  origin_concord: { expedition: { hard: 3, hell: 3 }, timed: 3, endless: 3 },
  origin_adapt: { expedition: { hard: 5, hell: 5 }, timed: 5, endless: 5 },
  origin_motility: { expedition: { hard: 5, hell: 5 }, timed: 5, endless: 5 },
  origin_recovery: { expedition: { hard: 4, hell: 4 }, timed: 4, endless: 4 },
  com_shock: { expedition: { hard: 6, hell: 6 }, timed: 6, endless: 6 },
  ori_exp_ring: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_exp_residue: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_exp_edge: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_exp_control: { expedition: { hard: 6, hell: 6 }, timed: 6, endless: 6 },
  ori_asm_stack: { expedition: { hard: 8, hell: 9 }, timed: 8, endless: 9 },
  ori_asm_recompose: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_asm_adapt: { expedition: { hard: 8, hell: 8 }, timed: 8, endless: 8 },
  ori_asm_duration: { expedition: { hard: 6, hell: 6 }, timed: 6, endless: 6 },
  ori_res_circuit: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_res_core: { expedition: { hard: 9, hell: 10 }, timed: 9, endless: 10 },
  ori_res_switch: { expedition: { hard: 6, hell: 6 }, timed: 6, endless: 6 },
  ori_res_burst: { expedition: { hard: 8, hell: 8 }, timed: 8, endless: 8 },
})

export function getEffectiveSkillMaxLevel(game, skill, role = skill?.role) {
  const base = Number.isFinite(skill?.maxLevel) ? Math.max(0, skill.maxLevel) : Infinity
  if (!skill || skill.discreteUnlock || skill.isBossSkill || skill.isMilestone || skill.isCapstone || skill.isPartnerChoice) return base
  const progressionRole = skill.progressionRole || role

  const mode = game?.runSelection?.mode || 'timed'
  const difficulty = game?.runSelection?.difficulty || 'normal'
  const limits = SKILL_RANK_LIMITS[mode]?.[difficulty] || SKILL_RANK_LIMITS.timed.normal
  const authoredCaps = skill.rankCaps || CORE_SKILL_RANK_CAPS[skill.id]
  const authoredCap = mode === 'timed20'
    ? (authoredCaps?.timed20 ?? authoredCaps?.expedition?.hell ?? authoredCaps?.timed)
    : (authoredCaps?.[mode]?.[difficulty] ?? authoredCaps?.[mode])
  if (skill.growthClass === 'endless') {
    if (mode === 'endless') return Infinity
    if (progressionRole === 'common' || skill.kind === 'common') return Math.min(base, limits.common)
    return base
  }

  // 原生独立体系：路线/印记确认后才放开 core 跑道；碎片永远停在 1 级。
  if (typeof progressionRole === 'string' && progressionRole.startsWith('origin_')) {
    const commit = skill.originCommit
    const committed = commit === 'mark' ? !!game?.originMark : commit === 'route' ? !!game?.originRoute : true
    if (!committed) return base
    const cap = authoredCap ?? limits.core
    if (mode === 'endless') return Math.max(base, cap)
    if (mode === 'expedition' && ['easy', 'normal'].includes(difficulty)) return Math.min(base, limits.core)
    return Math.min(base, cap)
  }

  if (skill.growthClass === 'core') {
    const committed = (skill.originOnly && game?.startingStrain === 'origin'
      ? !!game?.primarySpec
      : progressionRole === 'primary') && (game?.startingStrain === 'shadow'
      ? !!game?.weaponSystem?.shadowCombat?.route
      : skill.isRicochetSkill
      ? !!game?.weaponSystem?.ricochetCombat?.route
      : skill.isSymbiosisSkill
      ? !!game?.weaponSystem?.petCombat?.route
      : skill.isElementalSkill
        ? !!game?.weaponSystem?.spellCombat?.route
        : !!game?.primarySpec)
    if (!committed) return base
    // Endless runs give authored core tracks a longer runway. They still
    // have a finite ceiling; only skills explicitly marked `endless` can
    // continue forever.
    if (mode === 'endless') return Math.max(base, authoredCap ?? limits.core)
    if (mode === 'expedition' && ['easy', 'normal'].includes(difficulty)) return Math.min(base, limits.core)
    if (isTimedMode(mode)) return authoredCap ?? limits.core
    return Math.max(base, authoredCap ?? limits.core)
  }

  if (progressionRole === 'common' || skill.growthClass === 'common' || skill.kind === 'common') {
    return mode === 'endless' ? base : Math.min(base, limits.common)
  }
  return base
}

/** A bounded multiplier that retains authored early ranks and tapers later ranks. */
export function getSoftRankMultiplier(rank, earlyStep, earlyRanks, asymptote) {
  const n = Math.max(0, Math.floor(Number(rank) || 0))
  if (n <= 0) return 1
  const early = Math.max(0, Math.floor(earlyRanks))
  const earlyValue = (1 + earlyStep) ** Math.min(n, early)
  if (n <= early) return earlyValue
  const tail = n - early
  const taper = 1 - 0.9 ** tail
  return earlyValue + (asymptote - earlyValue) * taper
}

export function applyRankMultiplier(target, key, previousRank, nextRank, multiplierAtRank) {
  if (!target || !key || typeof multiplierAtRank !== 'function') return
  const previous = Math.max(0, Number(previousRank) || 0)
  const next = Math.max(previous, Number(nextRank) || 0)
  const before = multiplierAtRank(previous)
  const after = multiplierAtRank(next)
  if (before > 0 && Number.isFinite(after)) target[key] *= after / before
}
