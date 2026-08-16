const CACHE = new Map()
const TINT_CACHE = new Map()

const MATERIALS = {
  base: { shape: 'orb', color: '#8cffc8', core: '#effff7', impact: '#8cffc8', radius: 6, sound: 'base' },
  fire: { shape: 'ember', color: '#ffad66', core: '#fff1c7', impact: '#ff9854', radius: 6.2, sound: 'ember' },
  water: { shape: 'drop', color: '#80d8ed', core: '#eefcff', impact: '#71cce2', radius: 6.2, sound: 'fluid' },
  poison: { shape: 'glob', color: '#91dc6a', core: '#eaffc9', impact: '#83cf62', radius: 6.4, sound: 'fluid' },
  lightning: { shape: 'shard', color: '#f0d96c', core: '#fffbd4', impact: '#e8d15f', radius: 6, sound: 'spark' },
  acid: { shape: 'glob', color: '#b8dc4e', core: '#f1ffc1', impact: '#acd244', radius: 6.8, sound: 'fluid' },
  gel: { shape: 'drop', color: '#65d2df', core: '#edfdff', impact: '#5cc7d6', radius: 6.7, sound: 'spark' },
  burst: { shape: 'shard', color: '#eeb65a', core: '#fff1bd', impact: '#eba84a', radius: 6.5, sound: 'ember' },
  corrode: { shape: 'spore', color: '#83d262', core: '#e8ffc7', impact: '#77c557', radius: 6.6, sound: 'fluid' },
  steam: { shape: 'puff', color: '#c8e3e8', core: '#fbffff', impact: '#bed9de', radius: 6.9, sound: 'mist' },
  venom: { shape: 'core', color: '#a993d2', core: '#edffd0', impact: '#9e86c6', radius: 6.7, sound: 'spark' },
  chaos: { shape: 'core', color: '#a77ad2', core: '#f2ffc4', impact: '#c08ce0', radius: 7.5, sound: 'chaos' },
}

const FORMS = {
  base: { scaleX: 1, scaleY: 1, trail: 3.2, radius: 1 },
  gluttony: { scaleX: 1.08, scaleY: 1.08, trail: 2.7, radius: 1.12 },
  gatling: { scaleX: 1.35, scaleY: 0.78, trail: 4.2, radius: 0.88 },
  elemental: { scaleX: 1, scaleY: 1, trail: 3.4, radius: 1.04 },
  assassin: { scaleX: 1.28, scaleY: 0.68, trail: 4.5, radius: 0.92 },
}

const rgba = (hex, alpha) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

function materialKey(state) {
  if (state.chaos) return 'chaos'
  if (MATERIALS[state.primaryReaction]) return state.primaryReaction
  for (const id of state.elements || []) {
    if (MATERIALS[id]) return id
  }
  return 'base'
}

function buildProfile(materialId, spec, tier, split = false) {
  const material = MATERIALS[materialId] || MATERIALS.base
  const form = FORMS[spec] || FORMS.base
  const level = Math.max(0, Math.min(4, Number(tier) || 0))
  const tierScale = 1 + level * 0.035
  const splitScale = split ? 0.68 : 1
  const radius = material.radius * form.radius * tierScale * splitScale
  return Object.freeze({
    id: `${materialId}:${spec}:${level}${split ? ':split' : ''}`,
    material: materialId,
    shape: material.shape,
    spec,
    tier: level,
    radius,
    scaleX: form.scaleX * (split ? 0.92 : 1),
    scaleY: form.scaleY * (split ? 0.92 : 1),
    trailLength: form.trail * (1 + level * 0.08) * (split ? 0.75 : 1),
    trailWidth: Math.max(1.5, radius * (spec === 'gatling' || spec === 'assassin' ? 0.42 : 0.66)),
    color: material.color,
    core: material.core,
    impact: material.impact,
    outer: rgba(material.color, 0.16),
    middle: rgba(material.color, 0.36),
    trail: rgba(material.color, 0.5),
    faint: rgba(material.color, 0.22),
    sound: material.sound,
    impactCount: split ? 3 : spec === 'gatling' && level >= 3 ? 4 : 8,
    orbit: !split && spec === 'elemental' && level >= 2,
    crescent: !split && spec === 'assassin' && level >= 2,
    lobes: !split && spec === 'gluttony' && level >= 2,
    spine: !split && spec === 'gatling' && level >= 2,
  })
}

/** 返回缓存的不可变视觉 Profile；元素材质与专精形态可自由组合。 */
export function resolveWeaponVisual(state = {}) {
  const material = materialKey(state)
  const spec = FORMS[state.primarySpec] ? state.primarySpec : 'base'
  const tier = Math.max(0, Math.min(4, Number(state.tier) || 0))
  const key = `${material}:${spec}:${tier}`
  let profile = CACHE.get(key)
  if (!profile) {
    profile = buildProfile(material, spec, tier)
    CACHE.set(key, profile)
  }
  return profile
}

export function splitWeaponVisual(parent) {
  const source = parent || BASE_PROJECTILE_VISUAL
  const key = `${source.material}:${source.spec}:${source.tier}:split`
  let profile = CACHE.get(key)
  if (!profile) {
    profile = buildProfile(source.material, source.spec, source.tier, true)
    CACHE.set(key, profile)
  }
  return profile
}

/** 兼容特殊技能和旧调用的单色飞弹，同色 Profile 只创建一次。 */
export function tintedWeaponVisual(color = '#8cffc8') {
  let profile = TINT_CACHE.get(color)
  if (!profile) {
    const material = {
      ...MATERIALS.base,
      color,
      impact: color,
    }
    profile = Object.freeze({
      ...buildProfile('base', 'base', 0),
      id: `tint:${color}`,
      color,
      impact: color,
      outer: rgba(color, 0.16),
      middle: rgba(color, 0.36),
      trail: rgba(color, 0.5),
      faint: rgba(color, 0.22),
      core: material.core,
    })
    TINT_CACHE.set(color, profile)
  }
  return profile
}

export const BASE_PROJECTILE_VISUAL = resolveWeaponVisual()
