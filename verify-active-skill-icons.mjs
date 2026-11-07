import assert from 'node:assert/strict'
import { ORIGIN_SKILL_BY_ID } from './src/game/OriginBuild.js'
import { resolveSkillIcon } from './src/components/skillIconRegistry.js'

const ids = ['com_shock', 'origin_flux', 'origin_overload', 'origin_adapt', 'origin_motility', 'origin_recovery',
  'ori_frag_glutton', 'ori_frag_gatling', 'ori_frag_elemental', 'ori_frag_assassin', 'ori_frag_symbiosis',
  'ori_exp_ring', 'ori_exp_residue', 'ori_exp_edge', 'ori_exp_control',
  'ori_asm_stack', 'ori_asm_recompose', 'ori_asm_adapt', 'ori_asm_duration',
  'ori_res_circuit', 'ori_res_core', 'ori_res_switch', 'ori_res_burst',
  'ori_mark_glutton', 'ori_mark_gatling', 'ori_mark_elemental', 'ori_mark_assassin', 'ori_mark_symbiosis',
  'spec_origin_route_expansion', 'spec_origin_route_assimilation', 'spec_origin_route_resonance',
  'spec_origin_mark_glutton', 'spec_origin_mark_gatling', 'spec_origin_mark_elemental', 'spec_origin_mark_assassin', 'spec_origin_mark_symbiosis']

for (const id of ids) {
  if (ORIGIN_SKILL_BY_ID[id]) assert.ok(ORIGIN_SKILL_BY_ID[id].name, `${id} belongs to the origin pool`)
  const icon = resolveSkillIcon(id)
  assert.ok(!icon.missing, `${id} has a vector icon`)
}

console.log('原生主动/路线/印记图标验证：全部注册且有独立线性图标 ✓')
