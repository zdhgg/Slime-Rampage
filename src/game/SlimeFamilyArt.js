/**
 * Current visual contract for the six playable slime families.
 *
 * This file is the small, stable hand-off between art direction and UI.
 * Combat drawing lives in `slime-art/`; presentation code should read the
 * shared accent colours and identity anchors here instead of reviving the
 * archived V1–V3 palettes.
 *
 * `color` / `accent` are UI accents that must stay readable on the dark UI;
 * `body` is the in-world body base colour (trails, splashes).
 */
export const SLIME_FAMILY_ART_VERSION = 'current-r2'

export const SLIME_FAMILY_ART = {
  origin: {
    color: '#a8e06a', accent: '#a8e06a', body: '#a8e06a', light: '#d2f6a0', mid: '#a8e06a', dark: '#2c5228',
    identity: '矮圆顶、双叶芽',
  },
  glutton: {
    color: '#f0735c', accent: '#f0735c', body: '#ec5a42', light: '#ff9474', mid: '#ec5a42', dark: '#561616',
    identity: '横宽扁豆、头顶眼泡、整排獠牙巨口',
  },
  ricochet: {
    color: '#4cc6f0', accent: '#4cc6f0', body: '#4cc6f0', light: '#a6e8ff', mid: '#4cc6f0', dark: '#103a5a',
    identity: '紧凑小球、头顶三联喷口',
  },
  elemental: {
    color: '#c9c4f4', accent: '#c9c4f4', body: '#eceefc', light: '#ffffff', mid: '#b4b0da', dark: '#3a3468',
    identity: '弯尖法师帽、珍珠白元素染色、两侧元素球',
  },
  shadow: {
    color: '#a98bff', accent: '#a98bff', body: '#2f2749', light: '#41366a', mid: '#2f2749', dark: '#0b0916',
    identity: '前倾墨滴、后拖长影尾、发光细眼',
  },
  summoner: {
    color: '#f6a3c4', accent: '#f6a3c4', body: '#f6a3c4', light: '#ffd3e4', mid: '#d56f98', dark: '#5e2340',
    identity: '玫瑰粉母体、三芽冠、伙伴群像',
  },
}

export function getSlimeFamilyArt(id) {
  return SLIME_FAMILY_ART[id] || SLIME_FAMILY_ART.origin
}
