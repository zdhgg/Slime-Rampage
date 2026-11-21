/** Palettes for the 4 elemental specializations (plus legacy fusion palette compatibility). */
export const BASE_SPELL_PALETTES = {
  fire: { main: '#ff9e5e', accent: '#ff5e4d', core: '#fff2d6', shade: '#6e2d24', name: '烈焰橙红' },
  water: { main: '#84d9f5', accent: '#4cb6eb', core: '#ecfbff', shade: '#2a5876', name: '极寒冰蓝' },
  ice: { main: '#84d9f5', accent: '#4cb6eb', core: '#ecfbff', shade: '#2a5876', name: '极寒冰蓝' },
  lightning: { main: '#f3d97d', accent: '#9fd4ff', core: '#ffffff', shade: '#485675', name: '雷霆金白' },
  poison: { main: '#a8e46b', accent: '#b77ee8', core: '#eeffcf', shade: '#462863', name: '灾厄毒绿' },
}

export const FUSION_SPELL_PALETTES = {
  burst: { main: '#f16e65', accent: '#efb65e', core: '#fff0d1', shade: '#763d46', name: '赤红·金白' },
  gel: { main: '#e0edf7', accent: '#92cce8', core: '#f6fcff', shade: '#536b83', name: '亮银·冰蓝' },
  venom: { main: '#a6dc72', accent: '#d2e69a', core: '#f1ffe0', shade: '#58664b', name: '黄绿·淡白' },
  steam: { main: '#e5eef3', accent: '#ef9c73', core: '#fff5e9', shade: '#786271', name: '霜白·橙红' },
  acid: { main: '#ed955e', accent: '#b6d66c', core: '#fff1c5', shade: '#705446', name: '橙红·酸绿' },
  corrode: { main: '#8cdbc4', accent: '#c6e4de', core: '#effffa', shade: '#426b70', name: '青绿·银白' },
}

export const spellPalette = (fusionId, element = 'fire') =>
  (fusionId && FUSION_SPELL_PALETTES[fusionId]) || BASE_SPELL_PALETTES[element] || BASE_SPELL_PALETTES.fire

export function spellColorAlpha(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
