/** Permanent critical bonuses have independent sources; acquisition order cannot erase one. */
export function setCritSource(game, key, values) {
  const ws = game.weaponSystem
  if (!ws._critSources) {
    ws._critSources = {}
    ws._critBase = { chance: ws.critChance, multiplier: ws.critMul }
  }
  ws._critSources[key] = values
  const sources = Object.values(ws._critSources)
  ws.critChance = Math.min(1, Math.max(ws._critBase.chance, ...sources.map(s => s.chanceFloor || 0)) +
    sources.reduce((sum, s) => sum + (s.chance || 0), 0))
  ws.critMul = Math.max(ws._critBase.multiplier, ...sources.map(s => s.multiplierFloor || 0)) +
    sources.reduce((sum, s) => sum + (s.multiplier || 0), 0)
}
