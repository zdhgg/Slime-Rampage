export const PET_SUPPORT = {
  guardian: { kind: 'taunt', name: '岩甲挑衅', cooldown: 20, duration: 3, radius: 240, limit: 4, windup: .28 },
  hunter: { kind: 'weaken', name: '柔风抑敌', cooldown: 14, duration: 4, radius: 300, limit: 3, reduction: .25, windup: .24 },
  dew: { kind: 'heal', name: '甘露回春', cooldown: 12, duration: .6, windup: .3 },
  spore: { kind: 'slow', name: '孢云缓行', cooldown: 16, duration: 3, radius: 260, limit: 5, windup: .3 },
}

export function petSupportStats(type, levels = {}) {
  const stats = { ...PET_SUPPORT[type] }
  if (type === 'guardian' && levels.pet_taunt) { stats.cooldown = 16; stats.limit = 5 }
  if (type === 'hunter' && levels.pet_wind_guard) { stats.reduction = .35; stats.duration = 5 }
  if (type === 'dew' && levels.pet_dew_spring) stats.cooldown = 9
  if (type === 'spore' && levels.pet_spore_bloom) { stats.radius += 30; stats.duration = 4.5 }
  return stats
}

export function petSupportDescription(stats) {
  const interval = `冷却 ${stats.cooldown} 秒`
  if (stats.kind === 'heal') return `${interval}，恢复 1 点生命，优先本体；无人受伤时保留技能`
  const targets = `最多 ${stats.limit} 名附近普通敌人`, duration = `持续 ${stats.duration} 秒`
  if (stats.kind === 'taunt') return `${interval}，嘲讽${targets}，${duration}；首领免疫，团团倒地时解除`
  if (stats.kind === 'weaken') return `${interval}，使${targets}的攻击力降低 ${Math.round(stats.reduction * 100)}%，${duration}；首领免疫`
  return `${interval}，使${targets}的移速降低 40%，${duration}；首领与狂暴敌人免疫`
}
