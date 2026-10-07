// Environment only: combat colors, lane geometry and spawn rules are shared.
// Each theme has a distinct silhouette as well as a restrained palette.
export const RUNNER_SCENE_PROFILES = {
  blitz_outer: { theme: 'highway', family: 'industrial', material: 'asphalt', seed: 11, density: 0.42, sky: '#08171d', horizon: '#25434a', road: '#203239', accent: '#73b9bd', prop: '#5f7e85', landmark: '#152d36', lamp: '#d3b780' },
  blitz_mid: { theme: 'works', family: 'industrial', material: 'asphalt', seed: 12, density: 0.58, sky: '#12191d', horizon: '#3b4140', road: '#303435', accent: '#b9b18a', prop: '#7c8070', landmark: '#252f31', lamp: '#dcc393' },
  blitz_sprint: { theme: 'checkpoint', family: 'industrial', material: 'asphalt', seed: 13, density: 0.66, sky: '#1b191b', horizon: '#4c4141', road: '#363033', accent: '#c0a18b', prop: '#8b7770', landmark: '#342d32', lamp: '#e0b284' },
  outer: { theme: 'outskirts', family: 'fortress', material: 'asphalt', seed: 21, density: 0.65, sky: '#080e20', horizon: '#29344e', road: '#1d283b', accent: '#61b7c9', prop: '#526883', landmark: '#17253c', lamp: '#d9ad79' },
  blockade: { theme: 'ramparts', family: 'fortress', material: 'asphalt', seed: 22, density: 0.78, sky: '#0c1024', horizon: '#303751', road: '#222b3e', accent: '#70b6cc', prop: '#566c88', landmark: '#1b2940', lamp: '#d6b17e' },
  pursuit: { theme: 'royal', family: 'fortress', material: 'asphalt', seed: 23, density: 0.92, sky: '#120e25', horizon: '#393454', road: '#272a40', accent: '#80b6d1', prop: '#68658d', landmark: '#242640', lamp: '#d8b894' },
  sprint: { theme: 'citadel', family: 'fortress', material: 'asphalt', seed: 24, density: 1, sky: '#170d25', horizon: '#40334f', road: '#2a293d', accent: '#82b9cf', prop: '#776487', landmark: '#2b2540', lamp: '#e0b889' },
  ruins: { theme: 'ruins', family: 'endless', material: 'fractured', seed: 31, density: 0.72, sky: '#101c1b', horizon: '#304941', road: '#293b36', accent: '#8eafa1', prop: '#688b7d', landmark: '#1b302b', lamp: '#b5c6a2' },
  tunnel: { theme: 'tunnel', family: 'endless', material: 'metal', seed: 32, density: 0.9, sky: '#0b1820', horizon: '#243e4d', road: '#233541', accent: '#8badbd', prop: '#648797', landmark: '#162c39', lamp: '#a3c4cb' },
  rift: { theme: 'rift', family: 'endless', material: 'fractured', seed: 33, density: 0.6, sky: '#191528', horizon: '#413955', road: '#322e42', accent: '#aaa0c8', prop: '#827a9c', landmark: '#2c263d', lamp: '#c0b0d5' },
}

// Neon signage is environmental; saturated combat colors remain unchanged.
for (const profile of Object.values(RUNNER_SCENE_PROFILES)) {
  profile.sign = profile.family === 'industrial' ? '#ae82b1' : profile.family === 'endless' ? '#9a85c6' : '#c67bab'
}

const ENDLESS_THEMES = ['ruins', 'tunnel', 'rift']

export function runnerSceneProfile(gameplay) {
  const sectionId = gameplay.section?.id || ''
  if (gameplay.submode === 'endless' || sectionId.startsWith('endless_')) {
    const index = Number(gameplay.section?.index ?? sectionId.slice(8))
    const wave = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
    // Two waves per district: time to inhabit an environment before moving on.
    return RUNNER_SCENE_PROFILES[ENDLESS_THEMES[Math.floor(wave / 2) % ENDLESS_THEMES.length]]
  }
  return RUNNER_SCENE_PROFILES[sectionId]
    || RUNNER_SCENE_PROFILES[gameplay.submode === 'blitz' ? 'blitz_outer' : 'outer']
}

const COLORS = ['sky', 'horizon', 'road', 'accent', 'prop', 'landmark', 'lamp', 'sign']
export function blendRunnerScene(from, to, progress) {
  if (!from || progress >= 1) return to
  const amount = Math.max(0, progress)
  const blended = { ...to }
  for (const key of COLORS) {
    const a = parseInt(from[key].slice(1), 16), b = parseInt(to[key].slice(1), 16)
    const channels = [16, 8, 0].map(shift => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount))
    blended[key] = '#' + channels.map(c => c.toString(16).padStart(2, '0')).join('')
  }
  return blended
}

