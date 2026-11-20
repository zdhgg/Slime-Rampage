const V6_REFUND_PRICES = {
  giant: [200, 300, 500, 600], thorns: [200, 300, 500, 600], regen: [200, 300, 600],
  siphon: [300, 500, 900], leech: [300, 600, 1000], cocoon: [1400], gorged_origin: [2500],
  razor: [200, 300, 500, 800], rapid: [200, 300, 500, 800], hunt: [200, 300, 500, 600],
  hunter: [300, 600, 900], fury: [300, 500, 900], arsenal_origin: [2500],
  lore: [200, 300, 500, 600], swift: [200, 200, 300, 400], expand: [300, 500, 900],
  blueprint: [500, 900], magnet: [1300], horizon: [1600], flux_origin: [2200],
  stim: [800], serum: [800], greed: [600], glass: [1000], dicer: [800],
  shadow_step: [200, 300, 600], shadow_echo: [300, 600, 900], shadow_origin: [2500],
  symbiosis_bond: [200, 300, 600], symbiosis_vital: [300, 600, 900], symbiosis_origin: [2500],
}

const LEGACY_DROP_PRICES = {
  giant: [12, 24, 40, 64], regen: [18, 36, 60], swift: [10, 20, 34, 52], lore: [12, 24, 40, 64],
  split: [24, 50], resonance: [30, 60, 100], predator_origin: [120], kinetic_origin: [120], element_origin: [140],
}

export const hasPurchasedGenes = genes => Object.values(genes || {}).some(level => level >= 1)

function priceAtOwnedRanks(prices, level) {
  return prices.slice(0, Math.max(0, Math.floor(Number(level) || 0))).reduce((total, price) => total + price, 0)
}

/** 仅用于尚无实付记录的档案；新货架调价不改变这两张退款基准表。 */
export function estimateGeneInvestment(genes, sourceVersion, convertLegacyDrops) {
  const oldCurrency = Number(sourceVersion || 0) < 5
  const current = Object.entries(V6_REFUND_PRICES).reduce((total, [id, prices]) =>
    total + (oldCurrency && Object.hasOwn(LEGACY_DROP_PRICES, id) ? 0 : priceAtOwnedRanks(prices, genes[id])), 0)
  const legacy = Object.entries(LEGACY_DROP_PRICES).reduce((total, [id, prices]) =>
    total + (oldCurrency || !Object.hasOwn(V6_REFUND_PRICES, id) ? priceAtOwnedRanks(prices, genes[id]) : 0), 0)
  return current + convertLegacyDrops(legacy)
}
