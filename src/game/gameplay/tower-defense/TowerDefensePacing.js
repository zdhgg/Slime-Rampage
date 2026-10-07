import { TOWER_DEFENSE_ENEMY_TYPES } from './TowerDefenseRules.js'
import { ENEMY_UNLOCKS } from './TowerDefenseContent.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const sum = values => values.reduce((a, b) => a + b, 0)

export const WAVE_ROLES = Object.freeze({
  probe: { name: '试探', hint: '观察路线，建立前后段火力。' },
  practice: { name: '练习', hint: '用熟悉编队检查火力，准备本关的应对手段。' },
  pressure: { name: '加压', hint: '敌军开始集中推进，补充火力或升级主力。' },
  recovery: { name: '缓冲', hint: '敌军暂缓推进，利用这段时间补齐防线。' },
  finale: { name: '决胜', hint: '最后一轮攻势，保留关键火力与可用机关。' },
})

const ROLE_SEQUENCES = {
  6: ['probe', 'practice', 'pressure', 'recovery', 'pressure', 'finale'],
  7: ['probe', 'practice', 'pressure', 'recovery', 'pressure', 'recovery', 'finale'],
  8: ['probe', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'finale'],
  9: ['probe', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'pressure', 'finale'],
  10: ['probe', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'pressure', 'practice', 'finale'],
  11: ['probe', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'finale'],
  12: ['probe', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'practice', 'pressure', 'recovery', 'pressure', 'finale'],
}

export function getCampaignWaveCount(stage) {
  if (stage <= 3) return 4
  if (stage <= 5) return 5
  if (stage <= 12) return 6
  if (stage < 20) return 7
  if (stage <= 30) return 8
  if (stage <= 50) return 9
  if (stage <= 70) return 10
  if (stage <= 90) return 11
  return 12
}

export function describeTeachingWaves(waves) {
  return waves.map((wave, index) => {
    const role = index === 0 ? 'probe' : index === waves.length - 1 ? 'finale' : index === 1 ? 'practice' : 'pressure'
    const load = measureWaveLoad(wave.groups)
    return { ...wave, pacing: { role, ...WAVE_ROLES[role], ...load, targetBudget: load.budget } }
  })
}

// This is a composition budget, not a player-difficulty score. Armor is discounted
// for mixed damage/penetration; support, summons and speed are costed separately.
// Normal-income, multi-strategy encounter tests remain the acceptance criterion.
export function measureWaveLoad(groups) {
  let physical = 0, budget = 0, support = 0, heavy = 0, count = 0, spawnSeconds = 0
  for (const g of groups) {
    const base = TOWER_DEFENSE_ENEMY_TYPES[g.type]
    const type = g.miniBoss ? { ...base, ...g.miniBoss, traits: { ...base.traits, ...g.miniBoss.traits } } : base
    const t = type.traits, scale = g.scale ?? 1, hp = type.hp * scale, shield = (t.shield || 0) * scale
    const armor = t.armor || 0
    const sustain = hp * (t.regeneration || 0) * 10 + (t.supportHeal || 0) * 8 + (t.wardAmount || 0) * 5
    const summons = ((t.splitCount || 0) + (t.broodThresholds?.length || 0) * 2) * 14 * scale
    const suppression = t.empPulse ? hp * t.empPulse.duration / t.empPulse.interval * 2 : 0
    const mobility = Math.sqrt(type.speed / .055) * (t.sprint ? 1.1 : 1) * (t.berserk ? 1.1 : 1) * (t.cloaked ? 1.2 : 1)
    const cost = (hp / (1 - armor * .55) + shield * .65 + sustain + summons + suppression) * mobility * (type.boss ? 1.25 : 1)
    physical += g.count * (shield + hp / (1 - armor))
    budget += g.count * cost
    support += g.count * (isSupport(g.type) ? 1 : 0)
    heavy += g.count * (isHeavy(g.type) ? 1 : 0)
    count += g.count
    spawnSeconds += g.count * g.interval + (g.gap || 0)
  }
  return { physical, budget, support, heavy, count, spawnSeconds }
}

const isSupport = type => ['support', 'warder', 'emp', 'siege'].includes(type)
const isHeavy = type => ['tank', 'shield', 'regenerator', 'warder', 'siege'].includes(type)
const chapterFodder = [ ['grunt', 'runner', 'swarm'], ['grunt', 'sprinter', 'shield'],
  ['runner', 'swarm', 'berserker'], ['runner', 'sprinter', 'grunt'], ['berserker', 'sprinter', 'grunt'] ]

function stageEnvelope(stage, chapter) {
  // Absolute chapter anchors avoid exponential growth over 99 stages.
  if (stage <= 10) {
    return { opening: [95, 145, 200, 245, 310][stage - 6], final: [410, 780, 1100, 1550, 2300][stage - 6] }
  }
  const progress = ((stage - 1) % 20) / 19
  if (chapter === 1) return { opening: 320 + (stage - 11) * 12, final: 2500 + (stage - 11) * 205 }
  const opening = [0, 0, 480, 540, 580, 580][chapter] + progress * 110
  const final = [0, 0, 4400, 5400, 6400, 7300][chapter] + progress * [0, 0, 1050, 1350, 1500, 1900][chapter]
  const position = (stage - 1) % 5
  const block = [.95, .98, 1, 1.02, 1.06][position]
  return { opening: opening * block, final: final * block }
}

// Calibrated against normal-income formations, including control and no-lightning
// defenses. Teaching openings stay fixed while later waves test reinvestment.
function pressureGain(stage, chapter) {
  if (stage <= 12) return 1
  if (stage === 15) return 1.5
  if (chapter === 1) return 1.3
  if (stage === 99) return 1.6
  return [1, 1, 1.25, 1.35, 1.18, 1.25][chapter]
}

export function shapeCampaignWaves(stage, chapter, source) {
  const roles = ROLE_SEQUENCES[source.length]
  const envelope = stageEnvelope(stage, chapter)
  const available = chapterFodder[chapter - 1].filter(type => ENEMY_UNLOCKS[type] < stage)
  const newEnemy = Object.keys(ENEMY_UNLOCKS).find(type => ENEMY_UNLOCKS[type] === stage)
  const waves = []
  for (let index = 0; index < source.length; index++) {
    const wave = source[index], role = roles[index], final = role === 'finale'
    const recovery = role === 'recovery', opening = index < 2
    const progress = index / (source.length - 1)
    let target = (envelope.opening + (envelope.final - envelope.opening) * progress ** 1.65)
      * (index < 2 ? 1 : pressureGain(stage, chapter))
    if (recovery) target = waves[index - 1].pacing.targetBudget * .82
    const groups = wave.groups.map(g => ({ ...g }))
    const leaderIndex = groups.findIndex(g => g.miniBoss)
    const escorts = new Set(leaderIndex < 0 ? [] : groups[leaderIndex].miniBoss.escorts.map((_, i) => leaderIndex + 1 + i))
    const reservedSupport = [...escorts].filter(i => isSupport(groups[i]?.type)).length
    // Limit overlapping support instead of stacking healing, shielding and EMP.
    const supportLimit = Math.max(0, (opening || recovery ? 0 : chapter === 1 ? 2 : 3) - reservedSupport)
    const heavyLimit = Math.floor(groups.length * (opening ? .2 : recovery ? .15 : .4))
    let supports = 0, heavies = 0, lastSupport = -10
    for (let n = 0; n < groups.length; n++) {
      const g = groups[n]
      if (g.type === 'boss' || g.miniBoss || escorts.has(n)) continue
      const firstExample = index === 2 && g.type === newEnemy
      const tooHeavy = isHeavy(g.type) && heavies >= heavyLimit
      const tooMuchSupport = isSupport(g.type) && (supports >= supportLimit || n - lastSupport < 4)
      if (!firstExample && (tooHeavy || tooMuchSupport || (recovery && ['splitter', 'broodmother', 'stalker'].includes(g.type)))) {
        g.type = available[n % available.length] || 'grunt'
        if (isHeavy(g.type) && heavies >= heavyLimit) g.type = 'grunt'
      }
      if (isSupport(g.type)) { supports++; lastSupport = n }
      if (isHeavy(g.type)) heavies++
      if (recovery) g.interval *= chapter === 5 ? 1.5 : 1.25
      if (isSupport(g.type)) g.gap = Math.max(g.gap || 0, 1.2)
    }
    // Fit the whole encounter, including its elite, to the budget. Bisection also
    // accounts for support healing that does not scale with the enemy's HP.
    const originalScales = groups.map(g => g.scale)
    let low = .25, high = 3
    for (let step = 0; step < 16; step++) {
      const multiplier = (low + high) / 2
      groups.forEach((g, n) => { g.scale = originalScales[n] * multiplier })
      if (measureWaveLoad(groups).budget > target) high = multiplier
      else low = multiplier
    }
    groups.forEach((g, n) => { g.scale = originalScales[n] * (low + high) / 2 })
    // The first support checkpoint also reviews armor: concentrated physical
    // fire needs corrosion or an additional line of defense before the commander.
    if (stage === 15 && index === 4) {
      let replaced = 0
      for (const g of groups) if (g.type === 'regenerator' && replaced < 2) { g.type = 'tank'; replaced++ }
    }
    // Let the first chapter's boss be fought between escort packets. Its healing
    // phase must be readable without the crystal, which is now introduced at 29.
    if (stage === 20 && final) {
      const bossIndex = groups.findIndex(g => g.type === 'boss')
      groups[bossIndex].scale *= .85 / pressureGain(stage, chapter)
      groups[bossIndex].gap = 4
      groups[bossIndex - 1].gap = 4
    }
    const load = measureWaveLoad(groups)
    const roleInfo = WAVE_ROLES[role]
    const title = final ? wave.preview.title : `第 ${index + 1} 波 · ${roleInfo.name}`
    const nextRole = roles[index + 1]
    // Shift supply into the preparation before pressure, with lower later payouts.
    const reward = 22 + (index + 1) * 3 + (index < 2 ? 12 : recovery ? 8 : final ? -16 : -4)
    waves.push({ ...wave, groups, reward,
      intermission: nextRole === 'pressure' || nextRole === 'finale' ? 6 : 4,
      pacing: { role, name: roleInfo.name, hint: index === 2 && newEnemy
        ? '新敌人开始出现，先观察它的特点，再调整防线。' : roleInfo.hint,
        targetBudget: target, ...load },
      preview: { ...wave.preview, title, count: sum(groups.map(g => g.count)) },
    })
  }
  // Bring the same supply forward to buy counters BEFORE these pressure waves.
  // Total wave-clear income is unchanged by the transfer.
  if ([15, 29, 30].includes(stage)) {
    waves[1].reward += 30
    waves[3].reward += 30
    const fromFinal = Math.min(60, waves.at(-1).reward)
    waves.at(-1).reward -= fromFinal
    waves.at(-2).reward -= 60 - fromFinal
  }
  return waves
}
