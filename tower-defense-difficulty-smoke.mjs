import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getStageConfig } from './src/game/gameplay/tower-defense/TowerDefenseCampaignRules.js'
import { simulate } from './tower-defense-simulation.mjs'
import { campaignStrategies } from './tower-defense-strategies.mjs'

const report = [], failures = []
for (let stage = 1; stage <= 99; stage++) {
  const config = getStageConfig(stage)
  assert.equal(config.waves.length, config.waveCount)
  assert.equal(config.waves[0].pacing.role, 'probe')
  assert.equal(config.waves.at(-1).pacing.role, 'finale')
  for (const [index, wave] of config.waves.entries()) {
    assert.ok(wave.pacing.budget > 0 && Number.isFinite(wave.pacing.physical))
    assert.ok((wave.reward ?? 0) >= 0)
    if (wave.pacing.role === 'recovery') {
      assert.ok(wave.pacing.budget < config.waves[index - 1].pacing.budget * .9,
        `Stage ${stage} wave ${index + 1}: a recovery must actually reduce composition load`)
      assert.equal(wave.pacing.support, 0, 'Recovery waves cannot stack healing or disabling units')
      assert.ok(wave.intermission >= 4)
    }
  }
  // Evaluate every family. Never stop after finding the first winning lineup.
  const cases = campaignStrategies(stage).map(strategy => {
    const fast = simulate(stage, { line: strategy.line, traps: true })
    const paced = simulate(stage, { line: strategy.line, traps: true,
      actionInterval: stage <= 20 ? 3 : 1.5, maxActionsPerTurn: 1 })
    assert.ok(fast.outcome && paced.outcome, `Stage ${stage} must settle`)
    return { family: strategy.id, line: strategy.line, fast, paced }
  })
  const minimum = stage <= 2 || config.isBossStage ? 2 : 3
  const winners = cases.filter(r => r.fast.outcome === 'victory')
  if (winners.length < minimum) failures.push(`Stage ${stage}: ${winners.length}/${minimum} strategic families`)
  if (!cases.some(r => r.paced.outcome === 'victory')) failures.push(`Stage ${stage}: no paced solution`)
  report.push({ stage, waves: config.waveCount, winners: winners.map(r => r.family), cases })
}
for (const last of [20, 40, 60, 80, 99]) {
  assert.ok(getStageConfig(last).waveCount >= getStageConfig(last - 1).waveCount,
    'A chapter finale must not accidentally lose two waves to a different formula')
}
if (process.env.TD_REPORT_FILE) fs.writeFileSync(process.env.TD_REPORT_FILE, JSON.stringify(report, null, 2))
assert.deepEqual(failures, [])
console.log(`✓ 99 stages: ${report.reduce((n, r) => n + r.cases.length * 2, 0)} normal-income runs; diverse strategies, paced input and explicit recovery waves`)
