const CACHE = new Map()
const TINT_CACHE = new Map()

const MATERIALS = {
  base: { shape: 'orb', color: '#8cffc8', core: '#effff7', impact: '#8cffc8', radius: 6, sound: 'base' },
  // 共生史莱姆的契约色：与本体金（SLIME_PALETTES.summoner.color）同源。
  // 共生没有元素权限（canUseElements 恒 false），若不显式给材质，
  // 它打出的弹体、出膛火花与命中音色会和所有非元素角色一样是薄荷绿——
  // 玩家无法把这一发认成"我的"。这一条只改共生身份的观感，不动数值。
  symbiote: { shape: 'orb', color: '#edc479', core: '#fff1cc', impact: '#f0cf8a', radius: 6, sound: 'base' },
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
  // 共生：圆润饱满的"契约核心"，拖尾略长。
  // 缺少这一条时 resolveWeaponVisual 会静默回退 base，
  // 共生就成了唯一没有任何弹体形态进化的角色。
  // radius 刻意保持 1：这个字段经 Projectile.radius 进入命中判定
  // （WeaponSystem 的 `p.radius + e.radius`），"更饱满"只由 scaleX/scaleY 表达。
  symbiosis: { scaleX: 1.06, scaleY: 1.06, trail: 3.5, radius: 1 },
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
  // 共生契约色。刻意排在元素之后：元素联动是更强的视觉事件，
  // 未来若给共生开放元素权限，这里也不会把元素色短路掉。
  if (state.strain === 'summoner') return 'symbiote'
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
    halo: !split && spec === 'symbiosis' && level >= 2,
    // 虚线段长由 profile 预算：避免每发每帧在 render 里新建数组（本仓库热路径零分配口径）
    haloDash: Object.freeze([radius * 0.55, radius * 0.4]),
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
