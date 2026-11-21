import { ECHO_PET_SPEC, PET_ROSTER_BY_ID } from './PetRoster.js'

export const PET_SUPPORT = Object.freeze({
  ...Object.fromEntries(
    Object.values(PET_ROSTER_BY_ID).map(entry => [
      entry.id,
      {
        kind: entry.id,
        name: entry.specialName,
        cooldown: entry.specialCooldown,
        duration: entry.specialDuration,
        radius: entry.id === 'guardian' ? 180 : entry.id === 'dew' ? 165 : entry.id === 'frost' ? 160 : 220,
        limit: entry.id === 'guardian' ? 6 : entry.id === 'frost' ? 10 : 8,
        windup: 0.22,
        desc: entry.specialDesc,
      },
    ])
  ),
  echo: {
    kind: 'taunt',
    name: ECHO_PET_SPEC.specialName,
    cooldown: ECHO_PET_SPEC.specialCooldown,
    duration: ECHO_PET_SPEC.specialDuration,
    radius: 190,
    limit: 2,
    windup: 0.28,
    desc: ECHO_PET_SPEC.specialDesc,
  },
})

export function petSupportStats(type, levels = {}, opts = {}) {
  const base = PET_SUPPORT[type] || PET_SUPPORT.guardian
  const stats = { ...base }
  const awakeId = PET_ROSTER_BY_ID[type]?.awakeId
  const awakened = !!(awakeId && levels?.[awakeId] > 0)
  if (type === 'guardian' && awakened) {
    stats.cooldown = Math.max(4, stats.cooldown - 2.5)
    stats.limit = 8
  }
  if (type === 'dew' && awakened) {
    stats.cooldown = 7.5
  }
  const cdMul = (opts.cdMul || 1) * (opts.star ? 0.8 : 1)
  stats.cooldown = Math.max(2.5, Number((stats.cooldown * cdMul).toFixed(2)))
  if (opts.radiusMul) stats.radius = Math.round(stats.radius * opts.radiusMul)
  return stats
}

export function petSupportDescription(stats) {
  return stats?.desc || ''
}
