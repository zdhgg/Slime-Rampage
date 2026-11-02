/* =========================================================================
 * Boss cast registry — same current-r2 contract as `enemy-cast.js`, plus:
 *   unique: true  (no per-instance hue tint, size jitter, variants, elite rim)
 *   topY          (head/headgear top in draw units; the HP bar stacks above it)
 *   motionMul     (motion-overlay amplitude multiplier, ~2.2 for boss weight)
 * Cast ids are `boss:<name>` so they can never collide with `boss_knight` /
 * `boss-knight` sprite keys. Roster of 16 ids: twelve expedition stage bosses
 * plus the four generics; every expedition boss falls back to its archetype
 * generic until its own cast lands (all sixteen now do).
 * ========================================================================= */
import { borderWarden } from './cast-boss-border-warden.js'
import { beaconEngineer } from './cast-boss-beacon-engineer.js'
import { huntCaptain } from './cast-boss-hunt-captain.js'
import { gateMarshal } from './cast-boss-gate-marshal.js'
import { ashPaladin } from './cast-boss-ash-paladin.js'
import { throneGuard } from './cast-boss-throne-guard.js'
import { courtCommander } from './cast-boss-court-commander.js'
import { knightKing } from './cast-boss-knight.js'
import { nestInquisitor } from './cast-boss-nest-inquisitor.js'
import { relicKeeper } from './cast-boss-relic-keeper.js'
import { tombRegent } from './cast-boss-tomb-regent.js'
import { sealArchbishop } from './cast-boss-seal-archbishop.js'
import { archMage } from './cast-boss-mage.js'
import { lastMarshal } from './cast-boss-last-marshal.js'
import { bowKing } from './cast-boss-archer.js'
import { finalHero } from './cast-boss-final.js'

export const BOSS_CAST = {
  'boss:border_warden': borderWarden,
  'boss:beacon_engineer': beaconEngineer,
  'boss:hunt_captain': huntCaptain,
  'boss:gate_marshal': gateMarshal,
  'boss:ash_paladin': ashPaladin,
  'boss:throne_guard': throneGuard,
  'boss:court_commander': courtCommander,
  'boss:knight': knightKing,
  'boss:nest_inquisitor': nestInquisitor,
  'boss:relic_keeper': relicKeeper,
  'boss:tomb_regent': tombRegent,
  'boss:seal_archbishop': sealArchbishop,
  'boss:mage': archMage,
  'boss:last_marshal': lastMarshal,
  'boss:archer': bowKing,
  'boss:final': finalHero,
}

/** Generic Boss types -> their cast id (stage bosses resolve by stageBossId first). */
const GENERIC_ART = {
  'boss-knight': 'boss:knight',
  'boss-mage': 'boss:mage',
  'boss-archer': 'boss:archer',
  'boss-final': 'boss:final',
  'boss-expedition': 'boss:court_commander',
}

/**
 * Resolve a boss entity to its cast id: expedition stage bosses take their own
 * cast when registered, else the archetype generic; generic bosses map by type.
 * The id may point at a cast that does not exist yet — the renderer falls back.
 */
export function bossArtId(entity) {
  if (entity.stageBossId) {
    const own = `boss:${entity.stageBossId}`
    return BOSS_CAST[own] ? own : `boss:${entity.encounter?.archetype}`
  }
  return GENERIC_ART[entity.type]
}

/** Pose parameters for a frame key, used by both the cache build and the realtime fallback. */
export function bossFramePose(type, key) {
  return BOSS_CAST[type]?.frames.find(([k]) => k === key)?.[1] || { pose: 'idle' }
}
