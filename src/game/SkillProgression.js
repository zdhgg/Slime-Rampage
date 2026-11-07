/**
 * Run-aware skill rank limits. `growthClass` is deliberately opt-in: skills with
 * discrete or recursive mechanics keep their authored cap unless audited.
 */
export const SKILL_RANK_LIMITS = Object.freeze({
  expedition: Object.freeze({ easy: { common: 3, core: 3 }, normal: { common: 3, core: 3 }, hard: { common: 3, core: 6 }, hell: { common: 4, core: 10 } }),
  timed: Object.freeze({ easy: { common: 3, core: 5 }, normal: { common: 3, core: 5 }, hard: { common: 3, core: 5 }, hell: { common: 3, core: 5 } }),
  endless: Object.freeze({ easy: { common: 5, core: 10 }, normal: { common: 5, core: 10 }, hard: { common: 5, core: 10 }, hell: { common: 5, core: 10 } }),
})

// The extended rank runway is authored per skill, not imposed as one universal
// target. Values are skill ceilings; card offers still remain random.
export const CORE_SKILL_RANK_CAPS = Object.freeze({
  glut_maw: { expedition: { hard: 6, hell: 10 }, timed: 8, endless: 12 },
  glut_bulk: { expedition: { hard: 6, hell: 9 }, timed: 8, endless: 12 },
  glut_ram: { expedition: { hard: 7, hell: 11 }, timed: 10, endless: 14 },
  gat_velocity: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 },
  ele_resonance: { expedition: { hard: 7, hell: 11 }, timed: 9, endless: 13 },
  ass_stride: { expedition: { hard: 7, hell: 10 }, timed: 9, endless: 12 },
  ass_execute: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 },
  pet_power: { expedition: { hard: 8, hell: 12 }, timed: 10, endless: 14 },
  pet_vitality: { expedition: { hard: 7, hell: 11 }, timed: 9, endless: 13 },
  pet_haste: { expedition: { hard: 7, hell: 11 }, timed: 9, endless: 13 },
  origin_flux: { expedition: { hard: 8, hell: 10 }, timed: 10, endless: 10 },
  origin_overload: { expedition: { hard: 8, hell: 8 }, timed: 8, endless: 8 },
  origin_concord: { expedition: { hard: 3, hell: 3 }, timed: 3, endless: 3 },
})

export function getEffectiveSkillMaxLevel(game, skill, role = skill?.role) {
  const base = Number.isFinite(skill?.maxLevel) ? Math.max(0, skill.maxLevel) : Infinity
  if (!skill || skill.isBossSkill || skill.isMilestone || skill.isCapstone || skill.isPartnerChoice) return base
  const progressionRole = skill.progressionRole || role

  const mode = game?.runSelection?.mode || 'timed'
  const difficulty = game?.runSelection?.difficulty || 'normal'
  const limits = SKILL_RANK_LIMITS[mode]?.[difficulty] || SKILL_RANK_LIMITS.timed.normal
  const authoredCaps = skill.rankCaps || CORE_SKILL_RANK_CAPS[skill.id]
  const authoredCap = authoredCaps?.[mode]?.[difficulty] ?? authoredCaps?.[mode]
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
      : skill.isElementalSkill
        ? !!game?.weaponSystem?.spellCombat?.route
        : !!game?.primarySpec)
    if (!committed) return base
    // Endless runs give authored core tracks a longer runway. They still
    // have a finite ceiling; only skills explicitly marked `endless` can
    // continue forever.
    if (mode === 'endless') return Math.max(base, authoredCap ?? limits.core)
    if (mode === 'expedition' && ['easy', 'normal'].includes(difficulty)) return Math.min(base, limits.core)
    if (mode === 'timed') return authoredCap ?? limits.core
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
