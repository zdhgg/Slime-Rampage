/* Extended enemy art registry — keeps ENEMY_CAST strictly locked to the 9 base casts
 * while routing tiered class evolutions (rank 1/3) and the three new vanguard/support
 * classes (bulwark / alchemist / bannerman) through the same EnemyFrameCache pipeline. */
import { TIER_CAST } from './cast-tiers.js'
import { bulwark } from './cast-bulwark.js'
import { alchemist } from './cast-alchemist.js'
import { bannerman } from './cast-bannerman.js'

export const ENEMY_EXTENDED_CAST = {
  ...TIER_CAST,
  bulwark,
  alchemist,
  bannerman,
}

export function extendedEnemyFramePose(type, key) {
  return ENEMY_EXTENDED_CAST[type]?.frames.find(([k]) => k === key)?.[1] || { pose: 'idle' }
}
