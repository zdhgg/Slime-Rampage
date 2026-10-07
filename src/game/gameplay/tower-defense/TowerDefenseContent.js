// Content unlocked by campaign progress. Each guardian has a distinct combat job.
export const CAMPAIGN_TOWER_UNLOCKS = Object.freeze({
  rapid: 1, slow: 1, blast: 3, shock: 7, spore: 9,
  arcane: 12, radiant: 17, thorn: 26, ballista: 46, beacon: 61,
})

export const EXTRA_TOWERS = {
  spore: {
    name: '腐蚀孢子巢', description: '持续毒蚀并削弱护甲，协助其他守卫突破重装', color: '#a8ce58', cost: 80, targeting: 'strong', shape: 'spore',
    levels: [
      { damage: 3, range: .23, fireInterval: .9, fireKind: 'corrode', corrosion: .15, poisonDps: 5, effectDuration: 3 },
      { damage: 5, range: .24, fireInterval: .8, fireKind: 'corrode', corrosion: .22, poisonDps: 7, effectDuration: 3 },
    ], upgradeCosts: [65, 110, 230],
    branches: {
      solvent: { name: '深层溶解', description: '专注一个目标，大幅削甲并抑制再生',
        level3: { damage: 7, range: .26, fireInterval: .85, fireKind: 'corrode', corrosion: .35, poisonDps: 12, effectDuration: 4 },
        level4: { damage: 8, range: .27, fireInterval: .8, fireKind: 'corrode', corrosion: .45, poisonDps: 18, effectDuration: 4 } },
      bloom: { name: '孢子扩散', description: '群体施毒，削甲与毒伤弱于单体分支',
        level3: { damage: 4, range: .24, fireInterval: 1.1, fireKind: 'corrode', splashRadius: .10, corrosion: .18, poisonDps: 8, effectDuration: 3 },
        level4: { damage: 5, range: .25, fireInterval: 1, fireKind: 'corrode', splashRadius: .13, corrosion: .25, poisonDps: 12, effectDuration: 3 } },
    },
  },
  thorn: {
    name: '荆棘缚足巢', description: '缠绕前排敌人；同一敌人挣脱后短暂免疫缠绕', color: '#65b58a', cost: 85, targeting: 'first', shape: 'thorn',
    levels: [
      { damage: 6, range: .20, fireInterval: 1.8, fireKind: 'root', rootDuration: 1.1 },
      { damage: 10, range: .21, fireInterval: 1.7, fireKind: 'root', rootDuration: 1.4 },
    ], upgradeCosts: [70, 115, 223],
    branches: {
      grasp: { name: '深根囚笼', description: '延长单体缠绕，适合拦截突进精英',
        level3: { damage: 17, range: .23, fireInterval: 1.7, fireKind: 'root', rootDuration: 2.2 },
        level4: { damage: 21, range: .24, fireInterval: 1.6, fireKind: 'root', rootDuration: 2.8 } },
      bramble: { name: '荆棘围栏', description: '同时缠绕小范围敌人，单次控制较短',
        level3: { damage: 12, range: .22, fireInterval: 2.2, fireKind: 'root', splashRadius: .11, rootDuration: 1.2 },
        level4: { damage: 17, range: .23, fireInterval: 2, fireKind: 'root', splashRadius: .14, rootDuration: 1.6 } },
    },
  },
  ballista: {
    name: '晶矛穿刺塔', description: '沿射线贯穿敌军；近身盲区需要其他守卫保护', color: '#e0bf94', cost: 110, targeting: 'strong', shape: 'ballista',
    levels: [
      { damage: 22, range: .34, minRange: .10, fireInterval: 1.4, fireKind: 'piercing', pierceCount: 2, armorPierce: .35 },
      { damage: 32, range: .36, minRange: .10, fireInterval: 1.3, fireKind: 'piercing', pierceCount: 3, armorPierce: .4 },
    ], upgradeCosts: [85, 130, 250],
    branches: {
      lance: { name: '攻城晶矛', description: '高穿甲重矛，仅贯穿两个目标',
        level3: { damage: 60, range: .38, minRange: .13, fireInterval: 1.5, fireKind: 'piercing', pierceCount: 2, armorPierce: .8 },
        level4: { damage: 76, range: .40, minRange: .13, fireInterval: 1.4, fireKind: 'piercing', pierceCount: 2, armorPierce: .9 } },
      skewer: { name: '贯阵连矛', description: '穿过整列敌人，牺牲单体伤害和穿甲',
        level3: { damage: 35, range: .37, minRange: .10, fireInterval: 1.1, fireKind: 'piercing', pierceCount: 5, armorPierce: .25 },
        level4: { damage: 38, range: .39, minRange: .10, fireInterval: 1, fireKind: 'piercing', pierceCount: 7, armorPierce: .3 } },
    },
  },
  beacon: {
    name: '共鸣观测塔', description: '显露附近隐匿敌军，标记弱点协助集火', color: '#82dbe4', cost: 90, targeting: 'support', shape: 'beacon',
    levels: [
      { damage: 3, range: .27, fireInterval: 1, fireKind: 'mark', revealRadius: .27, vulnerability: .15, effectDuration: 3 },
      { damage: 5, range: .29, fireInterval: .9, fireKind: 'mark', revealRadius: .29, vulnerability: .2, effectDuration: 3 },
    ], upgradeCosts: [70, 110, 209],
    branches: {
      expose: { name: '弱点透镜', description: '扩大侦测范围，提高标记目标受到的伤害',
        level3: { damage: 7, range: .32, fireInterval: .85, fireKind: 'mark', revealRadius: .32, vulnerability: .3, effectDuration: 4 },
        level4: { damage: 8, range: .35, fireInterval: .8, fireKind: 'mark', revealRadius: .35, vulnerability: .4, effectDuration: 4 } },
      silence: { name: '静默脉冲', description: '短暂打断治疗、护盾和电磁技能；增伤较低',
        level3: { damage: 8, range: .29, fireInterval: 1.8, fireKind: 'mark', revealRadius: .29, vulnerability: .15, effectDuration: 3, silenceDuration: 1.2 },
        level4: { damage: 10, range: .31, fireInterval: 1.7, fireKind: 'mark', revealRadius: .31, vulnerability: .2, effectDuration: 3, silenceDuration: 1.6 } },
    },
  },
}

export const EXTRA_ENEMIES = {
  regenerator: { name: '菌甲再生者', shortName: '再生', color: '#82b96b', shape: 'hex', hp: 72, speed: .052, reward: 15, damage: 2, size: 1.12, traits: { regeneration: .035, armor: .2 } },
  sprinter: { name: '霜原跃袭者', shortName: '跃袭', color: '#9dd6ec', shape: 'arrow', hp: 32, speed: .075, reward: 10, damage: 1, size: .85, traits: { sprint: true, slowResistance: .35 } },
  warder: { name: '晶盾护卫', shortName: '护卫', color: '#a8c6f2', shape: 'shield', hp: 75, speed: .046, reward: 20, damage: 2, size: 1.12, traits: { shield: 40, wardRadius: .15, wardAmount: 12 } },
  berserker: { name: '熔血狂战士', shortName: '狂战', color: '#ec7752', shape: 'hex', hp: 90, speed: .05, reward: 17, damage: 2, size: 1.1, traits: { berserk: true, armor: .18 } },
  broodmother: { name: '裂殖母体', shortName: '母体', color: '#cc8aac', shape: 'split', hp: 105, speed: .045, reward: 19, damage: 3, size: 1.3, traits: { splitCount: 5, armor: .1 } },
  stalker: { name: '暮影潜行者', shortName: '潜行', color: '#b3a0d3', shape: 'diamond', hp: 42, speed: .077, reward: 13, damage: 2, size: .9, traits: { cloaked: true } },
  siege: { name: '圣城压制机甲', shortName: '压制', color: '#e1c980', shape: 'boss', hp: 180, speed: .034, reward: 30, damage: 4, size: 1.45, traits: { armor: .5, slowResistance: .6, empPulse: { interval: 7, duration: 1.5, radius: .32 } } },
}

export const ENEMY_UNLOCKS = Object.freeze({ grunt: 1, runner: 1, shield: 7, support: 14, tank: 9, splitter: 16, swarm: 3, regenerator: 13, sprinter: 21, warder: 28, emp: 34, berserker: 41, broodmother: 48, stalker: 63, siege: 81 })

export const CHAPTER_TACTICS = [
  { name: '林地合围', description: '群袭、重装与治疗编队交替推进；腐蚀抑制再生。', pool: ['grunt', 'runner', 'swarm', 'shield', 'tank', 'support', 'splitter', 'regenerator'] },
  { name: '霜原突击', description: '跃袭敌军周期冲刺，晶盾护卫为邻近敌军补盾；缠绕与连锁打断可截停先锋。', pool: ['sprinter', 'shield', 'warder', 'tank', 'support', 'emp', 'regenerator'] },
  { name: '熔血军团', description: '狂战士半血加速，母体死亡分裂；穿刺与范围火力分段清场。', pool: ['berserker', 'broodmother', 'swarm', 'tank', 'regenerator', 'warder', 'runner'] },
  { name: '暮影电网', description: '潜行者仅在近身或观测范围内显露，电磁部队压制密集塔群。', pool: ['stalker', 'emp', 'sprinter', 'warder', 'shield', 'support', 'splitter'] },
  { name: '王庭协同', description: '压制机甲掩护混合精锐，重点打断后排并安排多段火力。', pool: ['siege', 'stalker', 'warder', 'berserker', 'broodmother', 'emp', 'support', 'sprinter'] },
]

export const ASSAULT_PATTERNS = [
  { id: 'rush', name: '急行突袭', hint: '短间隔快兵，保留末段拦截火力。' },
  { id: 'escort', name: '护卫纵队', hint: '辅助与前排交错出场，优先处理支援。' },
  { id: 'swarm', name: '密集围攻', hint: '连续密集小队，需要范围清场。' },
  { id: 'armor', name: '重装推进', hint: '重甲精英配合快兵，兼顾穿甲与补漏。' },
  { id: 'combined', name: '联合攻势', hint: '交替兵种与精英终局，检查阵容短板。' },
]
