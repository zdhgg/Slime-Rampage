import { DIFFICULTIES, MODES, getExpeditionStages, normalizeRunSelection } from './RunRules.js'
import { STRAINS } from './Strains.js'

const MODE_BRIEFINGS = {
  expedition: {
    code: '逆袭路线 01',
    location: '史莱姆巢界 · 破晓前',
    title: '讨伐队越过了巢穴边界',
    story: '巢心的黏液刚刚苏醒，前哨的火把已沿旧路逼近。他们仍把你写在任务单最末一行：史莱姆，经验值十点。',
    objective: '完成六个独立章节，击败讨伐统帅。',
    signal: '第一章：害兽讨伐令',
    tone: 'frontier',
  },
  timed: {
    code: '封锁协议 12',
    location: '地下城封锁区 · 钟声将至',
    title: '王国开始收紧最后一道包围圈',
    story: '出口已经封死，十二分钟后的钟声会召来终审勇者。在那之前，每支讨伐队都想从你身上换走一枚勋章。',
    objective: '坚守十二分钟，随后击败终审勇者。',
    signal: '封锁倒计时：12:00',
    tone: 'siege',
  },
  endless: {
    code: '灾变记录 ∞',
    location: '灾变裂口 · 无撤离时刻',
    title: '撤离信标已经熄灭',
    story: '勇者仍从裂口另一端涌入，公会却不再记录归队人数。这里没有终点，只剩下一轮比一轮更沉的脚步。',
    objective: '持续生存，突破自己的灾变纪录。',
    signal: '第二十波后，灾变每五波升级',
    tone: 'disaster',
  },
}

const DIFFICULTY_REPORTS = {
  easy: '侦察回报：先锋装备不整，你的黏液核心更加稳定。',
  normal: '侦察回报：标准讨伐编制；圣物库与圣殿已列入进攻路线。',
  hard: '侦察回报：精英比例提升，讨伐路线将深入王陵与封印地窖。',
  hell: '侦察回报：多重精英词缀出现，王庭已下达终焉动员令。',
}

const STAGE_COUNT_CN = { 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二' }

export function getRunIntro(selection, strainId = 'origin') {
  const value = normalizeRunSelection(selection)
  const briefing = MODE_BRIEFINGS[value.mode]
  const strain = STRAINS[strainId] || STRAINS.origin
  return {
    ...briefing,
    mode: value.mode,
    modeName: MODES[value.mode].name,
    difficulty: value.difficulty,
    difficultyName: DIFFICULTIES[value.difficulty].name,
    rewardMultiplier: DIFFICULTIES[value.difficulty].rewardMul,
    threatReport: DIFFICULTY_REPORTS[value.difficulty],
    strainNote: strain.id === 'origin' ? null : `作战血统：${strain.name} · ${strain.desc}`,
    objective:
      value.mode === 'expedition'
        ? `完成${STAGE_COUNT_CN[getExpeditionStages(value.difficulty).length] || getExpeditionStages(value.difficulty).length}个独立章节，击败讨伐统帅。`
        : briefing.objective,
  }
}
