import { TOWER_UNLOCK_MAP } from './src/game/gameplay/tower-defense/TowerDefenseRules.js'

// Different primary damage engines, not branch variants of a lightning formation.
// Revelation is deployed before damage in the stealth chapters, for every family.
export function campaignStrategies(stage) {
  if (stage <= 2) return [
    { id: 'output', line: [['rapid', null], ['rapid', null], ['rapid', null]] },
    { id: 'control', line: [['rapid', null], ['slow', null], ['rapid', null]] },
  ]
  const strategies = [
    { id: 'chain', line: [['shock', 'overload'], ['shock', 'overload'], ['rapid', 'sniper'], ['spore', 'solvent'], ['blast', 'burn-zone']] },
    { id: 'corrosion', line: [['rapid', 'sniper'], ['spore', 'solvent'], ['blast', 'burn-zone'], ['slow', 'ice-chain'], ['arcane', 'void-rift'], ['radiant', 'sanctuary']] },
    { id: 'piercing', line: [['rapid', 'sniper'], ['rapid', 'sniper'], ['slow', 'ice-chain'], ['spore', 'solvent'], ['ballista', 'lance'], ['radiant', 'sanctuary']] },
    { id: 'area', line: [['blast', 'burn-zone'], ['blast', 'burn-zone'], ['slow', 'ice-chain'], ['spore', 'bloom'], ['radiant', 'sanctuary'], ['arcane', 'void-rift']] },
    { id: 'control', line: [['rapid', 'gatling'], ['slow', 'ice-chain'], ['thorn', 'bramble'], ['blast', 'burn-zone'], ['spore', 'solvent'], ['radiant', 'sanctuary']] },
  ]
  return strategies.map(s => ({ ...s, line: [
    ...(stage >= 63 ? [['beacon', 'expose']] : []),
    ...s.line.filter(([type]) => TOWER_UNLOCK_MAP[type] <= stage),
  ] })).filter(s => s.line.length >= 2)
}
