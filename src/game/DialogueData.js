export const MINION_DIALOGUE_CHANCE = 0.01
export const MINION_DIALOGUE_COOLDOWN = 20

export const CLASS_DIALOGUE = {
  knight: ['保持阵型！', '盾在前，别让它近身！', '这不该只是一只史莱姆。'],
  mage: ['魔力读数还在上升。', '它在学习我们的法术！', '别碰那些元素核心！'],
  archer: ['拉开距离，瞄准核心。', '它的移动没有规律。', '下一箭一定能命中。'],
  assassin: ['影子会先割开它。', '它看不见我。应该吧。', '目标比情报里更大。'],
  priest: ['愿圣光宽恕我们。', '它也会害怕吗？', '伤员退后，我来掩护。'],
  berserker: ['终于有个耐打的！', '再来！别躲！', '这团东西在吞我的怒火！'],
  hound: ['放开猎犬！', '小心，它们专咬史莱姆！', '犬舍的肉干没白喂！'],
  golem: ['魔像出场了，别挡路！', '它的核心打不穿……', '造物塔就没有省油的灯。'],
  wraith: ['那是什么……亡魂？', '它刚才自己愈合了？！', '先王的卫兵为何而战？'],
}

export const STORY_DIALOGUE = {
  pest: ['不过是边境害兽。', '清掉它，午前就能回营。', '史莱姆也值得发讨伐令？', '别踩脏新靴子。'],
  alarm: ['它在切断信标！', '增援为什么还没到？', '快把坐标送回王城！', '信标失去回应了。'],
  reversal: ['队长们没有回信……', '等等，究竟谁在狩猎谁？', '精英队也挡不住它？', '撤退路线被黏液封住了。'],
  home: ['这里……是它的巢？', '我们闯进了它的栖地。', '命令是烧掉整个巢穴。', '小心，它在保护这里。'],
  war: ['城门不能失守！', '王国所有军团都在这里。', '它从地下城一路追来了。', '别让灾厄踏进王城。'],
  relic: ['圣物库失守了！', '那些是王国的圣物！', '它在吞噬王国的历史。', '快把圣物运走！'],
  sanctum: ['圣殿骑士团，列阵！', '以圣光之名，净化它。', '退后，这是圣殿的禁卫。', '连圣殿都守不住了吗？'],
  crypt: ['王陵的亡军醒了！', '这里安息着历代先王……', '它们不为王国而战。', '退出去，此地不该被惊扰。'],
  origin: ['封印在松动……', '这就是它逃出来的地方？', '第一块黏液从这里渗出。', '王国到底封印了什么？'],
  coronation: ['王座就在前面！', '拦住它，哪怕用尸体！', '全体军团，最后防线！', '王在看着我们。'],
  muster: ['所有军团，向王庭集结！', '这是最后的动员令。', '援军正从四面八方赶来。', '要么它死，要么王国亡。'],
  truth: ['统帅正在王庭等它。'],
}

export const THREAT_DIALOGUE = {
  early: ['发现魔物，讨伐开始！', '经验值就在前面。', '新手任务而已。'],
  rising: ['公会把危险等级改了。', '这不是训练任务！', '它已经记住我们的战术。'],
  disaster: ['世界级灾害确认。', '王国还剩多少支军团？', '不要让它继续进化。'],
}

export const SPEAKER_COLORS = {
  knight: '#9db8d0',
  mage: '#bca4d1',
  archer: '#9fc39a',
  assassin: '#a88bc7',
  priest: '#d8cfac',
  berserker: '#c88983',
  hound: '#c8a06a',
  golem: '#8fa9c2',
  wraith: '#8ad8bd',
  boss: '#c8a968',
}

export const CLASS_NAMES = {
  knight: '骑士',
  mage: '法师',
  archer: '弓手',
  assassin: '刺客',
  priest: '圣职者',
  berserker: '狂战士',
  hound: '战獒',
  golem: '魔像',
  wraith: '怨灵',
}

export const BOSS_DIALOGUE = {
  'boss-knight': {
    spawn: '王旗所指，寸步不退！',
    phase: '以血立誓，我还没有败！',
    defeat: '王冠……为何这样沉……',
  },
  'boss-mage': {
    spawn: '让我看看，你违背了哪条法则。',
    phase: '很好。现在烧掉所有法则。',
    defeat: '原来无法解释的，是恐惧。',
  },
  'boss-archer': {
    spawn: '猎物越危险，箭就越准。',
    phase: '风停之前，你无处可藏。',
    defeat: '这一次，是我走进了陷阱。',
  },
  'boss-final': {
    spawn: '以世界之名，判你不应存在。',
    phase: '审判无效？那就连世界一起重写！',
    defeat: '也许，被审判的从来不是你。',
  },
  'boss-expedition': {
    spawn: '退回巢穴。我不愿再添一场屠杀。',
    phase: '身后是王城，我没有第二条路。',
    defeat: '原来一路进犯的……是我们。',
  },
  'expedition-border_warden': {
    spawn: '这道边界之后，不该再有魔物。',
    phase: '关门！我亲自把缺口合上！',
    defeat: '情报说……它只是一只害兽。',
  },
  'expedition-beacon_engineer': {
    spawn: '信标记得每一条回家的路。除了你的。',
    phase: '烧掉回路，让整片边境一起过载！',
    defeat: '王城早就收到了坐标……为何无人来？',
  },
  'expedition-hunt_captain': {
    spawn: '队长们的血迹，都指向了你。',
    phase: '收网！猎物不可能逃出八支箭！',
    defeat: '原来被围猎的……一直是我们。',
  },
  'expedition-nest_inquisitor': {
    spawn: '奉净化令，巢中不留一滴活物。',
    phase: '圣火成环，把它和巢穴一同焚尽！',
    defeat: '它只是在……守自己的家。',
  },
  'expedition-gate_marshal': {
    spawn: '城门在我身后，你一步也过不去。',
    phase: '盾墙合拢！用我们的命堵住缺口！',
    defeat: '门没有倒……是守门的人倒了。',
  },
  'expedition-relic_keeper': {
    spawn: '你吞下的不是宝物，是王国的记忆。',
    phase: '圣物会彼此呼应，历史不会任你抹去！',
    defeat: '也许真正被藏起来的……不是荣耀。',
  },
  'expedition-ash_paladin': {
    spawn: '圣殿已经烧尽，我便是最后的圣火。',
    phase: '让我的灰烬，画完这道十字！',
    defeat: '信仰若只剩焚烧……还算光吗？',
  },
  'expedition-tomb_regent': {
    spawn: '生者惊扰王陵，死者替王开战。',
    phase: '历代王魂，听我再下一次诏令！',
    defeat: '我们守的不是陵墓……是不能见光的罪。',
  },
  'expedition-seal_archbishop': {
    spawn: '你从封印里诞生，也该在这里消失。',
    phase: '四象逆转，把王国的原罪重新锁回去！',
    defeat: '你不是灾厄……你是封印漏出的证词。',
  },
  'expedition-throne_guard': {
    spawn: '觐见王座之前，先学会低头。',
    phase: '王命不容直视，背身者亦要受裁！',
    defeat: '王座上……究竟还有谁在看？',
  },
  'expedition-last_marshal': {
    spawn: '能站起来的人，都已写进最后的点兵册。',
    phase: '举国皆兵！哪怕只剩最后一个名字！',
    defeat: '册上最后一人……原来是我。',
  },
  'expedition-court_commander': {
    spawn: '退回巢穴。我不愿再添一场屠杀。',
    phase: '身后是王城，我没有第二条路。',
    defeat: '原来一路进犯的……是我们。',
  },
}

const choose = (pool, random) => pool[(random() * pool.length) | 0]

export function pickMinionDialogue({ type, narrativeKey, wave = 1, mode }, random = Math.random) {
  const classPool = CLASS_DIALOGUE[type] || CLASS_DIALOGUE.knight
  if (mode === 'expedition' && STORY_DIALOGUE[narrativeKey] && random() < 0.72) {
    return choose(STORY_DIALOGUE[narrativeKey], random)
  }
  const threatKey = wave >= 15 ? 'disaster' : wave >= 5 ? 'rising' : 'early'
  return random() < 0.55 ? choose(classPool, random) : choose(THREAT_DIALOGUE[threatKey], random)
}

export function getBossDialogue(type, event) {
  return BOSS_DIALOGUE[type]?.[event] || null
}
