/* =========================================================================
 * Slime Rampage · enemy cast registry (current-r2 language for hostile units)
 * -------------------------------------------------------------------------
 * Same material kit as the slime family (`slime-art/slime-painter.js`: shade /
 * base / light + one specular + tinted outline at constant screen width), but
 * with a hostile reading: round chibi bodies, hard-edged gear, an always-visible
 * face with slanted brows, and one warm kingdom accent so human enemies read as
 * one faction against the green forest.
 *
 * Space contract: the caller translates to the body centre and scales by
 * `r * cast.scale / 100`; the character is drawn facing +x ("radius = 100"
 * units, ground contact at y = +feetY). `setScale` must be called first so
 * outlines and LOD follow screen size. Frames are fixed (type x pose), never
 * per entity. Each cast owns its `frames` table and the `frameKey` that picks a
 * frame from read-only combat state.
 *
 * Roster (the anchor must read at r14 before any facial detail):
 *  knight    — steel open-face helmet + red plume, blue tunic, blue shield, gold sword
 *  mage      — floppy violet hood with glowing eyes, bell-sleeved robe, gold-orb staff
 *  hound     — side-on four-legged tan silhouette, pointed ear, red studded collar
 *  assassin  — plum hood with red slit eyes, magenta scarf streaming back, twin daggers
 *  archer    — feathered brown cap, amber scarf, orange jerkin, quiver and recurve bow
 *  priest    — white-and-gold robe, floating halo, gold-cross staff with a sun orb
 *  berserker — bare chest with crossed straps, wolf pelt, spiky red hair, double axe
 *  golem     — stacked stone slabs, cyan chest core, boulder fists, moss
 *  wraith    — hooded shroud dissolving into wisps, ghost-fire eyes, clawed reach
 * ========================================================================= */
import { knight } from './cast-knight.js'
import { mage } from './cast-mage.js'
import { hound } from './cast-hound.js'
import { assassin } from './cast-assassin.js'
import { archer } from './cast-archer.js'
import { priest } from './cast-priest.js'
import { berserker } from './cast-berserker.js'
import { golem } from './cast-golem.js'
import { wraith } from './cast-wraith.js'

export { ENEMY_PAL } from './enemy-kit.js'

export const ENEMY_CAST = { knight, mage, hound, assassin, archer, priest, berserker, golem, wraith }

/** Pose parameters for a frame key, used by both the cache build and the realtime fallback. */
export function enemyFramePose(type, key) {
  return ENEMY_CAST[type]?.frames.find(([k]) => k === key)?.[1] || { pose: 'idle' }
}
