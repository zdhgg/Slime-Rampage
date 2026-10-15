/** Stable palettes shared by both spell slots; pair IDs make selection order irrelevant. */
export const BASE_SPELL_PALETTES = {
  fire: { main: '#ffae70', accent: '#ef8253', core: '#fff0d8', shade: '#684036', name: '火焰橙' },
  water: { main: '#94dbef', accent: '#76cce9', core: '#e9faff', shade: '#3a6278', name: '寒冰蓝' },
  lightning: { main: '#dce3ed', accent: '#b8c5d8', core: '#f5f7fc', shade: '#4e586b', name: '淡白' },
  poison: { main: '#c3e78d', accent: '#ba9bd6', core: '#efffd2', shade: '#5a347a', name: '毒素绿' },
}
export const FUSION_SPELL_PALETTES = {
  burst: { main: '#f16e65', accent: '#efb65e', core: '#fff0d1', shade: '#763d46', name: '赤红·金白' },
  gel: { main: '#e0edf7', accent: '#92cce8', core: '#f6fcff', shade: '#536b83', name: '亮银·冰蓝' },
  venom: { main: '#a6dc72', accent: '#d2e69a', core: '#f1ffe0', shade: '#58664b', name: '黄绿·淡白' },
  steam: { main: '#e5eef3', accent: '#ef9c73', core: '#fff5e9', shade: '#786271', name: '霜白·橙红' },
  acid: { main: '#ed955e', accent: '#b6d66c', core: '#fff1c5', shade: '#705446', name: '橙红·酸绿' },
  corrode: { main: '#8cdbc4', accent: '#c6e4de', core: '#effffa', shade: '#426b70', name: '青绿·银白' },
}
export const spellPalette = (fusionId, element = 'fire') => FUSION_SPELL_PALETTES[fusionId] || BASE_SPELL_PALETTES[element] || BASE_SPELL_PALETTES.fire
export function spellColorAlpha(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
