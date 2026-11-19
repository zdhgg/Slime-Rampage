// Environment only: combat colors, lane geometry and spawn rules are shared.
// Each theme has a distinct silhouette as well as a restrained palette.
export const RUNNER_SCENE_PROFILES = {
  blitz_outer: { theme: 'highway', family: 'industrial', material: 'asphalt', seed: 11, density: 0.42, sky: '#b2cdd1', horizon: '#8ba9ac', road: '#728784', accent: '#dce6da', prop: '#4d6969', landmark: '#476664', lamp: '#d3b780' },
  blitz_mid: { theme: 'works', family: 'industrial', material: 'asphalt', seed: 12, density: 0.58, sky: '#d9d3ba', horizon: '#b3ac96', road: '#85877b', accent: '#ece3c2', prop: '#676d58', landmark: '#666d62', lamp: '#dcc393' },
  blitz_sprint: { theme: 'checkpoint', family: 'industrial', material: 'asphalt', seed: 13, density: 0.66, sky: '#e9c9b1', horizon: '#c4a394', road: '#8f7e7b', accent: '#f4dec4', prop: '#775f5b', landmark: '#785f60', lamp: '#e0b284' },
  outer: { theme: 'outskirts', family: 'fortress', material: 'paving', seed: 21, density: 0.65, sky: '#a5cae4', horizon: '#adcad3', road: '#788999', accent: '#e8eddc', prop: '#536c7b', landmark: '#526e87', lamp: '#d9ad79' },
  blockade: { theme: 'ramparts', family: 'fortress', material: 'paving', seed: 22, density: 0.78, sky: '#9cbadb', horizon: '#b7ced7', road: '#75869b', accent: '#e4edee', prop: '#4e657d', landmark: '#596d87', lamp: '#d6b17e' },
  pursuit: { theme: 'royal', family: 'fortress', material: 'paving', seed: 23, density: 0.92, sky: '#b3bcde', horizon: '#c5cbd5', road: '#797e96', accent: '#ebe3ce', prop: '#636b89', landmark: '#675f7d', lamp: '#d8b894' },
  sprint: { theme: 'citadel', family: 'fortress', material: 'paving', seed: 24, density: 1, sky: '#dbb6a5', horizon: '#c9b4b2', road: '#7e7f93', accent: '#f3dcc1', prop: '#6b607d', landmark: '#705c77', lamp: '#e0b889' },
  ruins: { theme: 'ruins', family: 'endless', material: 'fractured', seed: 31, density: 0.72, sky: '#a5c5bd', horizon: '#98b5a8', road: '#728a7d', accent: '#d6e6cb', prop: '#536e62', landmark: '#4d6c63', lamp: '#b5c6a2' },
  tunnel: { theme: 'tunnel', family: 'endless', material: 'metal', seed: 32, density: 0.9, sky: '#819eaf', horizon: '#7798a8', road: '#516b7b', accent: '#ccdde3', prop: '#4b6377', landmark: '#485e73', lamp: '#a3c4cb' },
  rift: { theme: 'rift', family: 'endless', material: 'fractured', seed: 33, density: 0.6, sky: '#b7a9cd', horizon: '#a199bb', road: '#756e8d', accent: '#e5dded', prop: '#655e81', landmark: '#626079', lamp: '#c0b0d5' },
}

// Roadside banners distinguish districts without using combat warning colors.
for (const profile of Object.values(RUNNER_SCENE_PROFILES)) {
  profile.sign = profile.family === 'industrial' ? '#8c7763' : profile.family === 'endless' ? '#796b99' : '#9b5a49'
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

