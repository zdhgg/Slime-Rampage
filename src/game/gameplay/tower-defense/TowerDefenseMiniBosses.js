// Six readable mechanics, reused with chapter-specific escorts rather than stacked abilities.
export const MINI_BOSS_TYPES = Object.freeze({
  brood: { name: '裂殖先锋', baseType: 'grunt', hp: 140, speed: .041, color: '#cc8aac',
    mechanic: '生命降至 70% 与 35% 时各释放两只幼体。', counter: '保留范围火力，及时清理幼体。',
    traits: { broodThresholds: [.7, .35] } },
  armor: { name: '重甲队长', baseType: 'grunt', hp: 180, speed: .036, color: '#c2a889',
    mechanic: '厚重装甲抵消 62% 普通伤害，行军缓慢。', counter: '用穿甲专精或腐蚀削甲集中输出。',
    traits: { armor: .62 } },
  commander: { name: '菌甲督军', baseType: 'grunt', hp: 240, speed: .047, color: '#a6bf72',
    mechanic: '两名随行祷告者为督军治疗并提供加速。', counter: '切换支援优先，先击杀或打断治疗者。',
    traits: {}, escorts: ['support', 'support'] },
  charger: { name: '霜原追猎长', baseType: 'runner', hp: 170, speed: .053, color: '#9dd6ec',
    mechanic: '每四秒冲刺一秒，冲刺时速度提升 70%。', counter: '在后段保留减速或缠绕，截停冲刺。',
    traits: { sprint: true } },
  ward: { name: '晶盾执旗官', baseType: 'grunt', hp: 230, speed: .043, color: '#a8c6f2',
    mechanic: '周期性为附近护卫补充护盾，护盾累积有上限。', counter: '用雷鸣打断，或虚空裂隙绕过护盾。',
    traits: { wardRadius: .18, wardAmount: 18 } },
  disruptor: { name: '电磁监察官', baseType: 'grunt', hp: 230, speed: .042, color: '#b3a0d3',
    mechanic: '每六秒释放一次短程脉冲，瘫痪附近守卫 1.2 秒。', counter: '分散部署，在脉冲前打断或沉默。',
    traits: { empPulse: { interval: 6, duration: 1.2, radius: .22 } } },
})

const CHAPTER_ROSTERS = [
  ['brood', 'armor', 'commander'],
  ['charger', 'ward', 'disruptor'],
  ['brood', 'armor', 'commander'],
  ['charger', 'ward', 'disruptor'],
  ['armor', 'commander', 'disruptor'],
]
const CHAPTER_ESCORTS = [ ['grunt', 'runner'], ['sprinter', 'shield'], ['berserker', 'swarm'], ['stalker', 'shield'], ['berserker', 'warder'] ]

export function getStageMiniBoss(stageId) {
  if (!Number.isInteger(stageId) || stageId < 5 || stageId > 95 || stageId % 5 || stageId % 20 === 0) return null
  const chapter = Math.floor((stageId - 1) / 20)
  const index = Math.floor(((stageId - 1) % 20) / 5)
  const id = CHAPTER_ROSTERS[chapter][index]
  const type = MINI_BOSS_TYPES[id]
  return {
    ...type, id, hp: Math.round(type.hp * (1 + chapter * .1)),
    size: 1.5, reward: 40 + chapter * 8, damage: 5 + Math.floor(chapter / 2),
    traits: { armor: 0, slowResistance: .25, ...type.traits },
    escorts: type.escorts || CHAPTER_ESCORTS[chapter],
  }
}
