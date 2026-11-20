export const RUNNER_LANE_COUNT = 3
export const RUNNER_DURATION = 90
export const RUNNER_DISTANCE = 1500
export const RUNNER_COUNTDOWN = 2.4

export const RUNNER_MAX_HP = 5
export const RUNNER_MAX_SHIELD = 3
export const RUNNER_MAX_ATTACK = 12
export const RUNNER_FIRE_INTERVAL = 1 / 5
export const RUNNER_RAPID_MULTIPLIER = 2
export const RUNNER_RAPID_DURATION = 6
export const RUNNER_BULLET_SPEED = 1.35
export const RUNNER_MAX_CATCH_UP_SHOTS = 3
export const RUNNER_MAX_ENTITIES = 26
export const RUNNER_MAX_BULLETS = 56
export const RUNNER_MAX_ENEMY_PROJECTILES = 18
export const RUNNER_MAX_DAMAGE_NUMBERS = 10
export const RUNNER_DAMAGE_AGGREGATE_WINDOW = 0.18
export const RUNNER_ENEMY_ATTACK_GAP = 1.15
export const RUNNER_DODGE_WINDOW = 0.72

export const RUNNER_FEVER_SHARDS_PER_CHARGE = 3
export const RUNNER_FEVER_MAX_CHARGES = 2
export const RUNNER_FEVER_DURATION = 5.0
export const RUNNER_FEVER_SCORE_MULTIPLIER = 2

export const RUNNER_MAX_GROUND_FIRES = 8
export const RUNNER_MAX_MINES = 6
export const RUNNER_MAX_CLONES = 2
export const RUNNER_MAX_TERRAINS = 4
export const RUNNER_MAX_MODULES = 2
export const RUNNER_MAX_KINETICS = 2

export const RUNNER_PLAYER_DEPTH = 0.98
export const RUNNER_ENTITY_SPAWN_DEPTH = 0.035
export const RUNNER_COLLISION_DEPTH = 0.965
export const RUNNER_LANE_LERP_PER_FRAME = 0.34
export const RUNNER_LANE_COMMIT_EPSILON = 0.035

export const RUNNER_CHARGE_GATE_THRESHOLDS = [0, 4, 9]
export const RUNNER_REROLL_CREDIT_COST = 1500

// ---------------------------------------------------------------------------
// 战前整备：6 大史莱姆突围底盘 + 先锋芯片 + 热度契约
// ---------------------------------------------------------------------------
export const RUNNER_STRAIN_IDS = ['origin', 'ricochet', 'glutton', 'shadow', 'elemental', 'summoner']

export const RUNNER_STRAINS = {
  origin: {
    id: 'origin',
    name: '原生黏液',
    roleTag: '全能适应',
    color: '#6ee7b7',
    hp: 5,
    maxShield: 3,
    laneSpeedMul: 1,
    bulletSpeedMul: 1,
    fireIntervalMul: 1,
    bodyDamageMul: 1,
    dodgeWindowMul: 1,
    gatePowerMul: 1.25,
    passiveName: '全能适应',
    passiveDesc: '补给强化门与经验收益 +25%，开局适应力拉满',
    feverName: '超频齐射',
    feverDesc: '三车道同时发射高能贯穿暴走弹',
  },
  ricochet: {
    id: 'ricochet',
    name: '弹射史莱姆',
    roleTag: '游击切道',
    color: '#56ccf2',
    hp: 5,
    maxShield: 3,
    laneSpeedMul: 1.35,
    bulletSpeedMul: 1.25,
    fireIntervalMul: 1,
    bodyDamageMul: 1,
    dodgeWindowMul: 1.1,
    switchRapidDuration: 1.2,
    passiveName: '游击切道',
    passiveDesc: '换道速度 +35%、弹速 +25%，每次换道后 1.2 秒内射速提升 50%',
    feverName: '棱镜风暴',
    feverDesc: '暴走期间所有子弹额外获得 +2 次跨道回弹与三线齐射',
  },
  glutton: {
    id: 'glutton',
    name: '暴食史莱姆',
    roleTag: '重装冲撞',
    color: '#ff9f43',
    hp: 7,
    maxShield: 2,
    laneSpeedMul: 0.92,
    bulletSpeedMul: 1,
    fireIntervalMul: 1,
    bodyDamageMul: 1,
    dodgeWindowMul: 1,
    ramThreshold: 0.25,
    passiveName: '胃酸冲角',
    passiveDesc: '生命上限 +2，可直接撞碎残血(<25%)敌兵与轻障碍免伤并汲取经验/充能',
    feverName: '巨化战车',
    feverDesc: '化身金身巨兽碾碎前方敌群与障碍，暴走伤害额外提升',
  },
  shadow: {
    id: 'shadow',
    name: '暗影史莱姆',
    roleTag: '残影刺杀',
    color: '#f18ba5',
    hp: 4,
    maxShield: 3,
    laneSpeedMul: 1.2,
    bulletSpeedMul: 1.1,
    fireIntervalMul: 0.95,
    bodyDamageMul: 1,
    dodgeWindowMul: 1.5,
    passiveName: '残影斩',
    passiveDesc: '闪避窗口 +50%，触发极限闪避或跳跃时在原车道斩出高伤暗影裂刃',
    feverName: '影袭连斩',
    feverDesc: '激活全场暗影时缓，持续在全车道释放瞬影斩击',
  },
  elemental: {
    id: 'elemental',
    name: '元素史莱姆',
    roleTag: '催化共鸣',
    color: '#b6a4ff',
    hp: 4,
    maxShield: 4,
    laneSpeedMul: 1,
    bulletSpeedMul: 1,
    fireIntervalMul: 1,
    bodyDamageMul: 1,
    dodgeWindowMul: 1,
    shieldRegenInterval: 8,
    elementDamageMul: 1.35,
    passiveName: '元素亲和',
    passiveDesc: '护盾上限 +1 且 8 秒无伤自动恢复 1 格，开局自带 1 级随机元素且元素伤害 +35%',
    feverName: '元素灾变',
    feverDesc: '暴走瞬间向三条车道倾泻对应元素灾变冲击波',
  },
  summoner: {
    id: 'summoner',
    name: '共生史莱姆',
    roleTag: '僚机协同',
    color: '#edc479',
    hp: 5,
    maxShield: 3,
    laneSpeedMul: 1,
    bulletSpeedMul: 1,
    fireIntervalMul: 1,
    bodyDamageMul: 0.85,
    dodgeWindowMul: 1,
    permanentDrone: true,
    passiveName: '常驻僚机',
    passiveDesc: '开局永久携带浮游史莱姆在相邻车道协同开火（本体伤害微降 15%）',
    feverName: '蜂群齐射',
    feverDesc: '暴走期间唤醒全部 3 道浮游护卫形成饱和弹幕网',
  },
}

export const RUNNER_STARTER_CHIP_IDS = ['magnet_engine', 'demolition_expert', 'mystery_pioneer']

export const RUNNER_STARTER_CHIPS = {
  magnet_engine: {
    id: 'magnet_engine',
    name: '磁力引擎',
    icon: '🧲',
    color: '#4db8ff',
    description: '撞击强化门时自动吸附同排相邻门/印记，进化经验获取 +15%',
    xpMul: 1.15,
  },
  demolition_expert: {
    id: 'demolition_expert',
    name: '爆破专家',
    icon: '💥',
    color: '#f97316',
    description: '炸药桶爆炸覆盖全三车道（伤害 +40%），遭遇额外补充炸药桶',
    barrelDamageMul: 1.4,
    barrelCrossLane: true,
  },
  mystery_pioneer: {
    id: 'mystery_pioneer',
    name: '盲盒先锋',
    icon: '🎲',
    color: '#ffd166',
    description: '开局立即随机搭载 1 个 Lv.1 主武器核心，且本局积分倍率 +20%',
    scoreBonus: 0.2,
  },
}

export const RUNNER_HEAT_PACT_IDS = ['turbo_scroll', 'heavy_armor', 'short_warning']

export const RUNNER_HEAT_PACTS = {
  turbo_scroll: {
    id: 'turbo_scroll',
    name: '极速狂飙',
    icon: '⚡',
    color: '#38bdf8',
    description: '基础滚屏速度 +20%，最终积分与战力点 +25%',
    speedMul: 1.2,
    rewardBonus: 0.25,
  },
  heavy_armor: {
    id: 'heavy_armor',
    name: '重甲防线',
    icon: '🛡️',
    color: '#f59e0b',
    description: '敌人血量 +25% 且重甲单位增多，最终积分与战力点 +25%',
    hpMul: 1.25,
    rewardBonus: 0.25,
  },
  short_warning: {
    id: 'short_warning',
    name: '高压雷区',
    icon: '⚠️',
    color: '#ef4444',
    description: '远程瞄准与塌陷预警时间缩短 25%，最终积分与战力点 +25%',
    telegraphMul: 0.75,
    rewardBonus: 0.25,
  },
}

// ---------------------------------------------------------------------------
// 路线岔口（保留并增强风险—收益与积分乘区）
// ---------------------------------------------------------------------------
export const RUNNER_ROUTE_IDS = ['blockade', 'armory', 'ruins']

export const RUNNER_ROUTES = {
  blockade: {
    id: 'blockade',
    lane: 0,
    label: '壁垒补给线',
    shortLabel: '壁垒',
    color: '#7fb2c8',
    spawnIntervalMultiplier: 1.4,
    hpMultiplier: 1,
    preferPatternKind: null,
    forkBonusCharges: 0,
    scoreMultiplier: 1.0,
    riskLabel: '低风险',
    rewardLabel: '稳健发育',
  },
  armory: {
    id: 'armory',
    lane: 1,
    label: '军械爆破线',
    shortLabel: '军械',
    color: '#f0b35f',
    spawnIntervalMultiplier: 0.9,
    hpMultiplier: 1,
    preferPatternKind: 'supply',
    forkBonusCharges: 0,
    scoreMultiplier: 1.2,
    riskLabel: '中风险',
    rewardLabel: '多蓄力门·1.2x分',
  },
  ruins: {
    id: 'ruins',
    lane: 2,
    label: '废墟悬赏线',
    shortLabel: '废墟',
    color: '#e07a5f',
    spawnIntervalMultiplier: 0.84,
    hpMultiplier: 1.25,
    preferPatternKind: 'danger',
    forkBonusCharges: 1,
    scoreMultiplier: 1.5,
    riskLabel: '高风险',
    rewardLabel: '充能+1·1.5x分',
  },
}

export const RUNNER_FORK_SELECT_DEPTH = 0.58
export const RUNNER_FORK_CLEAR_DEPTH = 0.93

export function getRunnerRoute(id) {
  return RUNNER_ROUTES[id] || null
}

export function getRunnerRouteByLane(lane) {
  const index = Math.max(0, Math.min(RUNNER_LANE_COUNT - 1, Math.round(Number(lane) || 0)))
  return RUNNER_ROUTES[RUNNER_ROUTE_IDS[index]] || null
}

export const RUNNER_WEAPON_CHOICE_TIME = 18
export const RUNNER_WEAPON_EVOLVE_TIME = 48
export const RUNNER_WEAPON_OVERDRIVE_TIME = 75
export const RUNNER_MUTATION_ARM_DEPTH = 0.38

// ---------------------------------------------------------------------------
// 四维构筑体系：Core (5) × Element (4) = 20 Fusions + Module (6, 2槽) + Kinetic (4, 2槽)
// ---------------------------------------------------------------------------
export const RUNNER_WEAPON_CORE_IDS = ['pierce', 'burst', 'corrosion', 'spread', 'beam']

export const RUNNER_WEAPON_CORES = {
  pierce: {
    id: 'pierce',
    name: '贯穿凝胶',
    shortName: '贯穿',
    shortLabel: '贯穿',
    color: '#79d9ee',
    description: '贯穿同路多名目标，每级增加穿透数与伤害保留率',
    levels: [
      { penetrations: 1, decay: 0.72 },
      { penetrations: 2, decay: 0.79 },
      { penetrations: 3, decay: 0.85 },
      { penetrations: 4, decay: 0.90 },
      { penetrations: 5, decay: 0.94 },
    ],
  },
  burst: {
    id: 'burst',
    name: '爆裂核心',
    shortName: '爆裂',
    shortLabel: '爆裂',
    color: '#f0b35f',
    description: '周期性引爆同路冲击波，升级缩短爆裂间隔并扩大范围',
    levels: [
      { every: 4, radius: 0.075, damage: 0.65 },
      { every: 3, radius: 0.09, damage: 0.8 },
      { every: 3, radius: 0.105, damage: 1.0 },
      { every: 2, radius: 0.12, damage: 1.2 },
      { every: 2, radius: 0.135, damage: 1.35 },
    ],
  },
  corrosion: {
    id: 'corrosion',
    name: '腐蚀弹体',
    shortName: '腐蚀',
    shortLabel: '腐蚀',
    color: '#9bdf6a',
    description: '连续命中叠加易伤并溶解重甲，对路障与护甲高效破防',
    levels: [
      { stackBonus: 0.12, maxStacks: 4, armorPierce: 0.55, barrierDamage: 1.5 },
      { stackBonus: 0.14, maxStacks: 5, armorPierce: 0.75, barrierDamage: 1.75 },
      { stackBonus: 0.16, maxStacks: 6, armorPierce: 1.0, barrierDamage: 2.0 },
      { stackBonus: 0.18, maxStacks: 7, armorPierce: 1.0, barrierDamage: 2.25 },
      { stackBonus: 0.2, maxStacks: 8, armorPierce: 1.0, barrierDamage: 2.5 },
    ],
  },
  spread: {
    id: 'spread',
    name: '散射棱镜',
    shortName: '散射',
    shortLabel: '散射',
    color: '#ff9ebb',
    description: '每次射击向本道与斜向相邻车道发射多枚散射弹丸，横扫三线敌群',
    levels: [
      { extraCount: 2, spreadDamage: 0.52, sidePenetrations: 0 },
      { extraCount: 2, spreadDamage: 0.64, sidePenetrations: 0 },
      { extraCount: 2, spreadDamage: 0.76, sidePenetrations: 1 },
      { extraCount: 4, spreadDamage: 0.68, sidePenetrations: 1 },
      { extraCount: 4, spreadDamage: 0.82, sidePenetrations: 2 },
    ],
  },
  beam: {
    id: 'beam',
    name: '聚能光束',
    shortName: '光束',
    shortLabel: '光束',
    color: '#93c5fd',
    description: '高初速焦点光矢，连续命中同一目标逐层叠加聚焦伤害，专克重甲与首领',
    levels: [
      { focusBonus: 0.2, maxFocus: 5, fireRateMul: 1.15 },
      { focusBonus: 0.24, maxFocus: 6, fireRateMul: 1.22 },
      { focusBonus: 0.28, maxFocus: 7, fireRateMul: 1.3 },
      { focusBonus: 0.32, maxFocus: 8, fireRateMul: 1.38 },
      { focusBonus: 0.36, maxFocus: 9, fireRateMul: 1.48 },
    ],
  },
}

export const RUNNER_SECONDARY_ELEMENT_IDS = ['lightning', 'flame', 'frost', 'void']

export const RUNNER_SECONDARY_ELEMENTS = {
  lightning: {
    id: 'lightning',
    name: '雷电附魔',
    shortName: '雷电',
    shortLabel: '雷电',
    color: '#ffea79',
    description: '折射连锁电弧与对空暴击，高机动跨道清场',
    icon: '⚡',
    levels: [
      { mul: 1 },
      { mul: 1.25 },
      { mul: 1.5 },
    ],
  },
  flame: {
    id: 'flame',
    name: '烈焰附魔',
    shortName: '烈焰',
    shortLabel: '烈焰',
    color: '#ff6b4a',
    description: '铺设炽热火海并触发猛烈殉爆，持续灼烧敌阵',
    icon: '🔥',
    levels: [
      { mul: 1 },
      { mul: 1.25 },
      { mul: 1.5 },
    ],
  },
  frost: {
    id: 'frost',
    name: '极寒附魔',
    shortName: '极寒',
    shortLabel: '极寒',
    color: '#7be3ff',
    description: '深度减速、绝对冻结并粉碎敌人护甲',
    icon: '❄️',
    levels: [
      { mul: 1 },
      { mul: 1.25 },
      { mul: 1.5 },
    ],
  },
  void: {
    id: 'void',
    name: '虚空附魔',
    shortName: '虚空',
    shortLabel: '虚空',
    color: '#c084fc',
    description: '制造引力奇点将相邻车道的敌人拖拽聚拢到同一路线集中歼灭',
    icon: '🌀',
    levels: [
      { mul: 1 },
      { mul: 1.25 },
      { mul: 1.5 },
    ],
  },
}

export const RUNNER_WEAPON_MODULE_IDS = ['split', 'ricochet', 'amplify', 'cross_prism', 'mine_layer', 'siege_hammer']

export const RUNNER_WEAPON_MODULES = {
  split: {
    id: 'split',
    name: '分裂弹头',
    shortLabel: '分裂',
    color: '#7ce0c3',
    icon: '⑂',
    description: '直接命中时迸发弹片自动打击附近其它目标（绕过正面盾牌）',
    levels: [
      { splitCount: 2, splitDamage: 0.45, splitRange: 0.22 },
      { splitCount: 3, splitDamage: 0.55, splitRange: 0.25 },
      { splitCount: 4, splitDamage: 0.65, splitRange: 0.28 },
    ],
    splitCount: 2,
    splitDamage: 0.45,
    splitRange: 0.22,
  },
  ricochet: {
    id: 'ricochet',
    name: '回弹弹芯',
    shortLabel: '回弹',
    color: '#c9a6ff',
    icon: '↩',
    description: '击破目标后弹体转向下一个目标继续飞行并打击侧翼',
    levels: [
      { ricochetCount: 2, ricochetDecay: 0.7 },
      { ricochetCount: 3, ricochetDecay: 0.78 },
      { ricochetCount: 4, ricochetDecay: 0.85 },
    ],
    ricochetCount: 2,
    ricochetDecay: 0.7,
  },
  amplify: {
    id: 'amplify',
    name: '斩杀棱镜',
    shortLabel: '斩杀',
    color: '#ffd166',
    icon: '◆',
    description: '对生命低于阈值的受伤目标造成巨额处决增伤',
    levels: [
      { amplifyHpRatio: 0.4, amplifyBonus: 0.6 },
      { amplifyHpRatio: 0.5, amplifyBonus: 0.8 },
      { amplifyHpRatio: 0.6, amplifyBonus: 1.0 },
    ],
    amplifyHpRatio: 0.4,
    amplifyBonus: 0.6,
  },
  cross_prism: {
    id: 'cross_prism',
    name: '跨道折光',
    shortLabel: '折光',
    color: '#60a5fa',
    icon: '🔀',
    description: '命中时斜向折光打击相邻车道前方敌人并绕过正面防盾',
    levels: [
      { crossCount: 1, crossDamage: 0.65, crossRange: 0.24 },
      { crossCount: 2, crossDamage: 0.75, crossRange: 0.28 },
      { crossCount: 2, crossDamage: 0.9, crossRange: 0.32 },
    ],
    crossCount: 1,
    crossDamage: 0.65,
    crossRange: 0.24,
  },
  mine_layer: {
    id: 'mine_layer',
    name: '感应地雷',
    shortLabel: '地雷',
    color: '#fb923c',
    icon: '💣',
    description: '穿透出界的子弹在赛道远端布下感应爆破雷，拦截后续冲锋敌群',
    levels: [
      { mineInterval: 3, mineDamage: 1.35, mineRadius: 0.085 },
      { mineInterval: 2, mineDamage: 1.65, mineRadius: 0.1 },
      { mineInterval: 2, mineDamage: 2.0, mineRadius: 0.115 },
    ],
    mineInterval: 3,
    mineDamage: 1.35,
    mineRadius: 0.085,
  },
  siege_hammer: {
    id: 'siege_hammer',
    name: '破障重锤',
    shortLabel: '破障',
    color: '#f87171',
    icon: '🔨',
    description: '对护甲、路障、激光闸门与首领部位造成倍增破拆伤害，击碎障碍触发震波',
    levels: [
      { siegeBonus: 1.5, shatterDamage: 1.2 },
      { siegeBonus: 2.0, shatterDamage: 1.6 },
      { siegeBonus: 2.5, shatterDamage: 2.0 },
    ],
    siegeBonus: 1.5,
    shatterDamage: 1.2,
  },
}

export function getRunnerWeaponModule(id, level = 1) {
  const base = RUNNER_WEAPON_MODULES[id]
  if (!base) return null
  const lv = Math.max(1, Math.min(3, Math.round(level || 1)))
  const lvlData = base.levels?.[lv - 1] || {}
  return { ...base, ...lvlData, level: lv }
}

export const RUNNER_KINETIC_TRIGGER_IDS = ['lane_pulse', 'lane_clone', 'aerial_slam', 'dodge_overdrive']

export const RUNNER_KINETIC_TRIGGERS = {
  lane_pulse: {
    id: 'lane_pulse',
    name: '换道脉冲',
    shortLabel: '脉冲',
    icon: '⚡',
    color: '#38bdf8',
    description: '每次完成左右换道时，立即向新车道发射一发重型穿透脉冲炮',
    levels: [
      { damageMul: 2.8, cooldown: 0.45 },
      { damageMul: 3.6, cooldown: 0.35 },
      { damageMul: 4.5, cooldown: 0.25 },
    ],
  },
  lane_clone: {
    id: 'lane_clone',
    name: '换道残影',
    shortLabel: '残影',
    icon: '👥',
    color: '#a78bfa',
    description: '换道离开时在原车道留下黏液分身，持续协同射击拦截追兵',
    levels: [
      { duration: 2.0, fireRatio: 0.55 },
      { duration: 2.8, fireRatio: 0.7 },
      { duration: 3.5, fireRatio: 0.85 },
    ],
  },
  aerial_slam: {
    id: 'aerial_slam',
    name: '凌空轰炸',
    shortLabel: '空爆',
    icon: '🦘',
    color: '#34d399',
    description: '跳跃滞空期间射速 +60%，落地瞬间震荡全三车道敌人造成伤害与眩晕',
    levels: [
      { airRapidBonus: 0.6, slamDamage: 2.2, stunDuration: 0.8 },
      { airRapidBonus: 0.8, slamDamage: 3.0, stunDuration: 1.0 },
      { airRapidBonus: 1.0, slamDamage: 4.0, stunDuration: 1.2 },
    ],
  },
  dodge_overdrive: {
    id: 'dodge_overdrive',
    name: '闪避超载',
    shortLabel: '超载',
    icon: '💫',
    color: '#fbbf24',
    description: '极限闪避额外返还暴走印记，并在接下来数秒内触发弹道伤害倍增',
    levels: [
      { duration: 3.0, damageBonus: 0.45, bonusShards: 1 },
      { duration: 3.8, damageBonus: 0.65, bonusShards: 1 },
      { duration: 4.5, damageBonus: 0.85, bonusShards: 2 },
    ],
  },
}

export function getRunnerKineticTrigger(id, level = 1) {
  const base = RUNNER_KINETIC_TRIGGERS[id]
  if (!base) return null
  const lv = Math.max(1, Math.min(3, Math.round(level || 1)))
  const lvlData = base.levels?.[lv - 1] || {}
  return { ...base, ...lvlData, level: lv }
}

export const RUNNER_BOSS_RELIC_IDS = [
  'twin_core_resonance',
  'infinite_fever_engine',
  'quantum_barrel',
  'omni_shield_core',
]

export const RUNNER_BOSS_RELICS = {
  twin_core_resonance: {
    id: 'twin_core_resonance',
    name: '双核共振秘典',
    shortLabel: '共振',
    icon: '💠',
    color: '#f472b6',
    description: '所有子弹额外附带 +35% 伤害，融合特效范围与强度提升 30%',
    damageBonus: 0.35,
  },
  infinite_fever_engine: {
    id: 'infinite_fever_engine',
    name: '永动暴走炉',
    shortLabel: '永动',
    icon: '🔥',
    color: '#fbbf24',
    description: '暴走上限 +1 且立刻满充能，暴走持续时间延长 2 秒',
    extraFeverCharge: 1,
    extraFeverDuration: 2,
  },
  quantum_barrel: {
    id: 'quantum_barrel',
    name: '超频弹匣',
    shortLabel: '超频',
    icon: '⚙️',
    color: '#38bdf8',
    description: '基础射速永久 +25%，并额外增加 1 个免费选卡刷新次数',
    fireRateBonus: 0.25,
    extraRerolls: 1,
  },
  omni_shield_core: {
    id: 'omni_shield_core',
    name: '圣盾矩阵',
    shortLabel: '圣盾',
    icon: '🛡️',
    color: '#70d8d3',
    description: '生命上限 +1、护盾上限 +1 并立刻回满护盾，受击仅损耗半数连破',
    bonusMaxHp: 1,
    bonusMaxShield: 1,
  },
}

// ---------------------------------------------------------------------------
// 5 Cores × 4 Elements = 20 种双核融合超武（全数由 RunnerEffects 数据驱动执行）
// ---------------------------------------------------------------------------
export const RUNNER_FUSION_WEAPONS = {
  'pierce:lightning': {
    id: 'pierce_lightning',
    primary: 'pierce',
    secondary: 'lightning',
    name: '超导轨道炮',
    color: '#7be8ff',
    description: '贯穿目标时向相邻车道释放折射雷弧（60% 溅射）',
    arcDamageRatio: 0.6,
  },
  'pierce:flame': {
    id: 'pierce_flame',
    primary: 'pierce',
    secondary: 'flame',
    name: '熔岩钻头弹',
    color: '#ff8552',
    description: '穿透目标后在车道留下持续燃烧的熔岩火海',
    fireDuration: 3.5,
    fireDamage: 0.8,
  },
  'pierce:frost': {
    id: 'pierce_frost',
    primary: 'pierce',
    secondary: 'frost',
    name: '极光冰晶锥',
    color: '#90f0ef',
    description: '穿透使敌人减速 50% 并彻底粉碎护甲',
    slowRatio: 0.5,
    slowDuration: 3.0,
    armorBreak: 1.0,
  },
  'pierce:void': {
    id: 'pierce_void',
    primary: 'pierce',
    secondary: 'void',
    name: '奇点贯星矢',
    color: '#c084fc',
    description: '穿透敌人后张开引力漩涡，将邻道敌群拉入当前车道串烧收割',
    pullRange: 0.22,
    vortexDamage: 0.45,
  },
  'burst:lightning': {
    id: 'burst_lightning',
    primary: 'burst',
    secondary: 'lightning',
    name: '雷暴集束弹',
    color: '#ffd859',
    description: '爆裂时向周围迸发 4 枚自动锁敌雷电火花',
    sparksCount: 4,
    sparkDamage: 0.75,
  },
  'burst:flame': {
    id: 'burst_flame',
    primary: 'burst',
    secondary: 'flame',
    name: '地狱火核弹',
    color: '#ff4d4d',
    description: '爆炸范围扩大 1.5 倍并在地面留下持续核爆焦土',
    radiusMultiplier: 1.5,
    fireDuration: 3.0,
    fireDamage: 1.0,
  },
  'burst:frost': {
    id: 'burst_frost',
    primary: 'burst',
    secondary: 'frost',
    name: '绝对零度弹',
    color: '#a0ebff',
    description: '大范围极寒冰爆，将主目标及周边敌人深度冻结 1.2 秒',
    freezeDuration: 1.2,
    radiusMultiplier: 1.25,
  },
  'burst:void': {
    id: 'burst_void',
    primary: 'burst',
    secondary: 'void',
    name: '坍缩黑洞弹',
    color: '#a855f7',
    description: '爆裂范围扩增 1.35 倍，引爆前将三道敌群强行吸聚至爆炸核心',
    radiusMultiplier: 1.35,
    pullRange: 0.26,
    vortexDamage: 0.55,
  },
  'corrosion:lightning': {
    id: 'corrosion_lightning',
    primary: 'corrosion',
    secondary: 'lightning',
    name: '等离子风暴',
    color: '#c0ff73',
    description: '腐蚀叠满 3 层时触发过载电击，造成大硬直与 2.5 倍爆发',
    shockThreshold: 3,
    shockDamage: 2.5,
    shockDuration: 1.2,
  },
  'corrosion:flame': {
    id: 'corrosion_flame',
    primary: 'corrosion',
    secondary: 'flame',
    name: '酸焰殉爆',
    color: '#ff9a42',
    description: '被腐蚀的敌人阵亡时发生猛烈殉爆，清空周围怪群',
    explosionRadius: 0.1,
    explosionDamage: 2.2,
  },
  'corrosion:frost': {
    id: 'corrosion_frost',
    primary: 'corrosion',
    secondary: 'frost',
    name: '脆化霜蚀',
    color: '#76e5b5',
    description: '被减速的腐蚀目标受到所有子弹伤害额外提升 40%',
    vulnerabilityBonus: 0.4,
    slowRatio: 0.45,
    slowDuration: 3.0,
  },
  'corrosion:void': {
    id: 'corrosion_void',
    primary: 'corrosion',
    secondary: 'void',
    name: '蚀渊传染体',
    color: '#9d7bff',
    description: '带腐蚀的目标阵亡时释放虚空引力波，聚拢邻道敌人并传染腐蚀层数',
    explosionRadius: 0.11,
    explosionDamage: 1.2,
    pullRange: 0.24,
  },
  'spread:lightning': {
    id: 'spread_lightning',
    primary: 'spread',
    secondary: 'lightning',
    name: '电弧霰弹网',
    color: '#fde047',
    description: '散射弹丸命中后在相邻目标间迸发 2 道连锁雷火花',
    sparksCount: 2,
    sparkDamage: 0.55,
  },
  'spread:flame': {
    id: 'spread_flame',
    primary: 'spread',
    secondary: 'flame',
    name: '龙息喷焰弹',
    color: '#fb7185',
    description: '散射弹丸引燃命中车道地面，在三线铺开烈焰火带',
    fireDuration: 2.6,
    fireDamage: 0.7,
  },
  'spread:frost': {
    id: 'spread_frost',
    primary: 'spread',
    secondary: 'frost',
    name: '冰霰冲击幕',
    color: '#67e8f9',
    description: '扇形冰霰大面积减速敌群 45% 并削弱护甲 50%',
    slowRatio: 0.45,
    slowDuration: 2.8,
    armorBreak: 0.5,
  },
  'spread:void': {
    id: 'spread_void',
    primary: 'spread',
    secondary: 'void',
    name: '扭曲星尘霰',
    color: '#d8b4fe',
    description: '散射命中时将两侧游离目标向中心拉扯，并在交汇点引爆坍缩波',
    pullRange: 0.2,
    vortexDamage: 0.5,
  },
  'beam:lightning': {
    id: 'beam_lightning',
    primary: 'beam',
    secondary: 'lightning',
    name: '聚变离子束',
    color: '#fef08a',
    description: '聚焦光束每 3 层触发高频过载放电，震慑目标并向邻道折射电弧',
    shockThreshold: 3,
    shockDamage: 2.1,
    shockDuration: 0.9,
    arcDamageRatio: 0.5,
  },
  'beam:flame': {
    id: 'beam_flame',
    primary: 'beam',
    secondary: 'flame',
    name: '太阳熔毁射线',
    color: '#f97316',
    description: '持续光束熔穿目标在地面留下灼热焦痕，对带聚焦层数目标产生殉爆',
    fireDuration: 2.5,
    fireDamage: 0.9,
    explosionRadius: 0.09,
    explosionDamage: 1.8,
  },
  'beam:frost': {
    id: 'beam_frost',
    primary: 'beam',
    secondary: 'frost',
    name: '绝对射线棱柱',
    color: '#a5f3fc',
    description: '光束瞬间挂上 50% 深度霜蚀减速，并对减速目标额外造成 35% 聚焦暴击',
    slowRatio: 0.5,
    slowDuration: 3.0,
    vulnerabilityBonus: 0.35,
  },
  'beam:void': {
    id: 'beam_void',
    primary: 'beam',
    secondary: 'void',
    name: '终末视界光矛',
    color: '#c084fc',
    description: '聚能光矛击穿护甲 60%，并持续将旁道敌人拖入光束射线路径',
    armorBreak: 0.6,
    pullRange: 0.22,
    vortexDamage: 0.45,
  },
}

export const RUNNER_TACTICAL_ITEMS = {
  magnet: {
    id: 'magnet',
    name: '全息磁暴仪',
    reward: 'item_magnet',
    color: '#4db8ff',
    icon: '🧲',
    description: '瞬间吸纳全屏三路所有强化道具与印记',
  },
  bullet_time: {
    id: 'bullet_time',
    name: '时空力场',
    reward: 'item_bullet_time',
    duration: 3.5,
    dilation: 0.4,
    color: '#6ee7b7',
    icon: '⏳',
    description: '全场环境慢速 40%，畅享子弹时间微操',
  },
  booster: {
    id: 'booster',
    name: '超频踏板',
    reward: 'item_booster',
    duration: 2.5,
    crushDamage: 15,
    color: '#f59e0b',
    icon: '🚀',
    description: '金身无敌高速冲刺，撞碎前方一切障碍',
  },
  drone: {
    id: 'drone',
    name: '浮游炮护卫',
    reward: 'item_drone',
    duration: 10.0,
    color: '#ec4899',
    icon: '🤖',
    description: '在相邻车道召唤浮游史莱姆协同射击',
  },
}

// ---------------------------------------------------------------------------
// 地面战术带 & 技巧段位 & 积分里程碑
// ---------------------------------------------------------------------------
export const RUNNER_TERRAIN_TYPES = {
  accel: {
    id: 'accel',
    name: '超导加速轨',
    shortLabel: '加速轨',
    color: '#38bdf8',
    fireRateMul: 1.4,
    enemySpeedMul: 1.15,
    description: '身处加速轨射速 +40%，敌人推进小幅加速',
  },
  mire: {
    id: 'mire',
    name: '黏液减速沼',
    shortLabel: '减速沼',
    color: '#a855f7',
    laneSpeedMul: 0.65,
    enemySlowRatio: 0.5,
    description: '冲锋怪与刺客踏入减速沼时失去突进能力并减速 50%',
  },
  launchpad: {
    id: 'launchpad',
    name: '跳板弹射垫',
    shortLabel: '弹射垫',
    color: '#f59e0b',
    jumpDuration: 1.1,
    description: '驶过自动触发超级滞空大跳并强化空中火力',
  },
}

export const RUNNER_STYLE_RANKS = [
  { id: 'C', min: 0, multiplier: 1.0, color: '#94a3b8' },
  { id: 'B', min: 20, multiplier: 1.2, color: '#38bdf8' },
  { id: 'A', min: 45, multiplier: 1.5, color: '#34d399' },
  { id: 'S', min: 75, multiplier: 1.8, color: '#fbbf24' },
  { id: 'SS', min: 110, multiplier: 2.1, color: '#fb7185' },
  { id: 'SSS', min: 150, multiplier: 2.5, color: '#f472b6' },
]

export const RUNNER_SCORE_MILESTONES = [8000, 20000, 40000, 70000, 110000, 160000, 220000, 300000]

export function getRunnerStyleRank(stylePoints = 0) {
  let rank = RUNNER_STYLE_RANKS[0]
  for (const item of RUNNER_STYLE_RANKS) {
    if (stylePoints >= item.min) rank = item
  }
  return rank
}

// ---------------------------------------------------------------------------
// 阶段守关三道部位破坏 Boss
// ---------------------------------------------------------------------------
export const RUNNER_BOSSES = {
  fortress_warden: {
    id: 'fortress_warden',
    name: '铁幕壁垒要塞',
    kicker: '阶段守关巨像',
    color: '#ef4444',
    baseHp: 90,
    parts: [
      { lane: 0, role: 'missile_pod', name: '追踪飞弹巢', hpRatio: 0.55, attackCooldown: 2.2 },
      { lane: 1, role: 'core_reactor', name: '主核心装甲炉', hpRatio: 1.0, armoredReduction: 0.72 },
      { lane: 2, role: 'pulse_hammer', name: '脉冲重锤塔', hpRatio: 0.6, attackCooldown: 3.1 },
    ],
  },
  citadel_colossus: {
    id: 'citadel_colossus',
    name: '王庭裁决巨像',
    kicker: '终局决战首领',
    color: '#f59e0b',
    baseHp: 145,
    parts: [
      { lane: 0, role: 'missile_pod', name: '左翼圣弩台', hpRatio: 0.62, attackCooldown: 1.9 },
      { lane: 1, role: 'core_reactor', name: '王庭核心炉', hpRatio: 1.15, armoredReduction: 0.75 },
      { lane: 2, role: 'pulse_hammer', name: '裁决震荡塔', hpRatio: 0.65, attackCooldown: 2.7 },
    ],
  },
  void_juggernaut: {
    id: 'void_juggernaut',
    name: '虚空灭世战舰',
    kicker: '无尽深渊领主',
    color: '#a855f7',
    baseHp: 170,
    parts: [
      { lane: 0, role: 'missile_pod', name: '虚空追踪舱', hpRatio: 0.65, attackCooldown: 1.8 },
      { lane: 1, role: 'core_reactor', name: '奇点主反应堆', hpRatio: 1.25, armoredReduction: 0.75 },
      { lane: 2, role: 'pulse_hammer', name: '裂隙激光阵列', hpRatio: 0.68, attackCooldown: 2.5 },
    ],
  },
}

export function getRunnerFusionWeapon(primary, secondary) {
  if (!primary || !secondary) return null
  const key = `${primary}:${secondary}`
  return RUNNER_FUSION_WEAPONS[key] || null
}

export function getRunnerFusionCodex() {
  const result = []
  for (const [key, fusion] of Object.entries(RUNNER_FUSION_WEAPONS)) {
    const core = RUNNER_WEAPON_CORES[fusion.primary]
    const elem = RUNNER_SECONDARY_ELEMENTS[fusion.secondary]
    result.push({
      key,
      id: fusion.id,
      name: fusion.name,
      color: fusion.color,
      description: fusion.description,
      primaryId: fusion.primary,
      primaryName: core?.name || fusion.primary,
      primaryColor: core?.color || '#79d9ee',
      secondaryId: fusion.secondary,
      secondaryName: elem?.name || fusion.secondary,
      secondaryIcon: elem?.icon || '⚡',
      secondaryColor: elem?.color || '#ffd859',
    })
  }
  return result
}

export const RUNNER_ENTITY_TYPES = {
  scout: {
    id: 'scout',
    kind: 'enemy',
    name: '追猎骑士',
    hp: 4,
    damage: 1,
    score: 90,
    xp: 8,
    sprite: 'char_knight_0',
    color: '#e88765',
  },
  hound: {
    id: 'hound',
    kind: 'enemy',
    name: '王庭战獒',
    hp: 3,
    damage: 1,
    score: 110,
    xp: 8,
    sprite: 'char_hound_0',
    color: '#df775e',
  },
  swarm: {
    id: 'swarm',
    kind: 'enemy',
    name: '猎犬蜂群',
    hp: 2,
    damage: 1,
    score: 55,
    xp: 5,
    sprite: 'char_hound_0',
    color: '#d98269',
    packCount: 3,
    packSpacing: 0.065,
    renderScale: 0.78,
  },
  shield: {
    id: 'shield',
    kind: 'enemy',
    name: '王庭塔盾卫',
    hp: 12,
    damage: 2,
    score: 260,
    xp: 16,
    sprite: 'char_knight_0',
    color: '#7eafc8',
    armor: 0.68,
    behavior: 'shield',
  },
  charger: {
    id: 'charger',
    kind: 'enemy',
    name: '裂阵冲锋兵',
    hp: 7,
    damage: 2,
    score: 240,
    xp: 14,
    sprite: 'char_berserker_0',
    color: '#e47759',
    behavior: 'charge',
    chargeAt: 0.5,
    chargeDelay: 0.72,
    chargeMultiplier: 2.65,
  },
  priest: {
    id: 'priest',
    kind: 'enemy',
    name: '灵能祭司',
    hp: 8,
    damage: 1,
    score: 280,
    xp: 16,
    sprite: 'char_mage_0',
    color: '#ecc969',
    behavior: 'support',
    supportReduction: 0.55,
  },
  link_priest: {
    id: 'link_priest',
    kind: 'enemy',
    name: '护盾链路祭司',
    hp: 9,
    damage: 1,
    score: 340,
    xp: 20,
    sprite: 'char_mage_0',
    color: '#facc15',
    behavior: 'support',
    supportReduction: 0.85,
  },
  splitter: {
    id: 'splitter',
    kind: 'enemy',
    name: '聚合分裂体',
    hp: 10,
    damage: 2,
    score: 300,
    xp: 18,
    sprite: 'char_berserker_0',
    color: '#70cfb5',
    behavior: 'split',
    splitCount: 2,
  },
  archer: {
    id: 'archer',
    kind: 'enemy',
    name: '王庭游侠',
    hp: 6,
    damage: 1,
    score: 220,
    xp: 14,
    sprite: 'char_ranger_0',
    color: '#8fd7ac',
    behavior: 'archer',
    attackAt: 0.44,
    attackDelay: 0.8,
    projectileDamage: 1,
    projectileHp: 1,
  },
  mage: {
    id: 'mage',
    kind: 'enemy',
    name: '王庭魔导士',
    hp: 7,
    damage: 1,
    score: 260,
    xp: 16,
    sprite: 'char_mage_0',
    color: '#c59bf0',
    behavior: 'mage',
    attackAt: 0.46,
    attackDelay: 1.05,
    projectileDamage: 1,
  },
  gunship: {
    id: 'gunship',
    kind: 'enemy',
    name: '空域炮艇',
    hp: 9,
    damage: 1,
    score: 320,
    xp: 20,
    color: '#60a5fa',
    behavior: 'aerial',
    aerialEvasion: 0.45,
    attackAt: 0.42,
    attackDelay: 0.9,
    projectileDamage: 1,
    projectileHp: 1,
    renderScale: 1.06,
  },
  fragment: {
    id: 'fragment',
    kind: 'enemy',
    name: '魔像碎体',
    hp: 2,
    damage: 1,
    score: 45,
    xp: 4,
    sprite: 'char_wraith_0',
    color: '#ad92cf',
    renderScale: 0.68,
  },
  brute: {
    id: 'brute',
    kind: 'enemy',
    name: '重装禁卫',
    hp: 16,
    damage: 2,
    score: 320,
    xp: 20,
    sprite: 'char_berserker_0',
    color: '#d66b57',
  },
  elite: {
    id: 'elite',
    kind: 'enemy',
    name: '王庭统领',
    hp: 30,
    damage: 3,
    score: 650,
    xp: 34,
    sprite: 'char_knight_0',
    color: '#f0965d',
    elite: true,
    renderScale: 1.18,
  },
  carrier_boss: {
    id: 'carrier_boss',
    kind: 'enemy',
    name: '破阵要塞',
    hp: 42,
    damage: 3,
    score: 1100,
    xp: 45,
    sprite: 'char_berserker_0',
    color: '#e0533c',
    elite: true,
    renderScale: 1.35,
  },
  gold_convoy: {
    id: 'gold_convoy',
    kind: 'enemy',
    name: '皇家运宝车',
    hp: 26,
    damage: 1,
    score: 1500,
    xp: 42,
    color: '#fbbf24',
    behavior: 'convoy',
    elite: true,
    renderScale: 1.35,
  },
  twin_assassin: {
    id: 'twin_assassin',
    kind: 'enemy',
    name: '暗影变道刺客',
    hp: 13,
    damage: 1,
    score: 450,
    xp: 26,
    color: '#a855f7',
    behavior: 'assassin',
    shiftAt: 0.44,
    shiftDelay: 0.65,
    elite: true,
    renderScale: 0.95,
  },
  barrel: {
    id: 'barrel',
    kind: 'obstacle',
    name: '高能炸药桶',
    hp: 3,
    damage: 0,
    score: 200,
    xp: 12,
    color: '#f97316',
    behavior: 'barrel',
    explosionDamage: 12,
    explosionRadius: 0.12,
  },
  crystal_ice: {
    id: 'crystal_ice',
    kind: 'obstacle',
    name: '极寒共鸣晶柱',
    hp: 4,
    damage: 0,
    score: 220,
    xp: 14,
    color: '#7be3ff',
    behavior: 'crystal_ice',
    freezeDuration: 1.8,
  },
  crystal_volt: {
    id: 'crystal_volt',
    kind: 'obstacle',
    name: '雷电过载晶柱',
    hp: 4,
    damage: 0,
    score: 220,
    xp: 14,
    color: '#fde047',
    behavior: 'crystal_volt',
    shockDamage: 8,
  },
  roller_mine: {
    id: 'roller_mine',
    kind: 'hazard',
    name: '贴地滚雷',
    hp: 999,
    damage: 1,
    score: 120,
    xp: 10,
    color: '#fb7185',
    behavior: 'roller_mine',
    isGround: true,
  },
  switch_gate: {
    id: 'switch_gate',
    kind: 'hazard',
    name: '可翻转脉冲闸',
    hp: 3,
    damage: 1,
    score: 240,
    xp: 14,
    color: '#ef4444',
    behavior: 'switch_gate',
    isGround: true,
  },
  laser_gate: {
    id: 'laser_gate',
    kind: 'hazard',
    name: '脉冲激光',
    hp: 999,
    damage: 1,
    score: 0,
    xp: 0,
    color: '#ef4444',
    behavior: 'laser_gate',
    isGround: true,
    warnTime: 1.2,
    activeTime: 1.5,
    period: 3.2,
  },
  barrier: {
    id: 'barrier',
    kind: 'obstacle',
    name: '封锁路障',
    hp: 36,
    damage: 2,
    score: 70,
    xp: 8,
    color: '#d1685b',
  },
  attack: {
    id: 'attack',
    kind: 'gate',
    name: '攻击蓄力门',
    reward: 'attack',
    chargeable: true,
    hp: 7,
    score: 150,
    xp: 10,
    color: '#66c9e8',
  },
  rapid: {
    id: 'rapid',
    kind: 'gate',
    name: '急速蓄力门',
    reward: 'rapid',
    chargeable: true,
    hp: 6,
    score: 140,
    xp: 10,
    color: '#b794e8',
  },
  repair: {
    id: 'repair',
    name: '胶核修复门',
    kind: 'gate',
    reward: 'repair',
    chargeable: true,
    hp: 5,
    score: 120,
    xp: 9,
    color: '#8bd46c',
  },
  guard: {
    id: 'guard',
    kind: 'gate',
    name: '护盾蓄力门',
    reward: 'shield',
    chargeable: true,
    hp: 6,
    score: 130,
    xp: 10,
    color: '#70d8d3',
  },
  bounty_gate: {
    id: 'bounty_gate',
    kind: 'gate',
    name: '黑市悬赏门',
    reward: 'bounty_upgrade',
    creditCost: 1500,
    hp: 5,
    score: 300,
    xp: 22,
    color: '#fbbf24',
  },
  fever_shard: {
    id: 'fever_shard',
    kind: 'gate',
    name: '暴走印记',
    reward: 'fever_shard',
    hp: 4,
    score: 180,
    xp: 12,
    color: '#ffd166',
  },
  gate_magnet: {
    id: 'gate_magnet',
    kind: 'gate',
    name: '全息磁暴',
    reward: 'item_magnet',
    hp: 4,
    score: 160,
    xp: 12,
    color: '#4db8ff',
  },
  gate_bullet_time: {
    id: 'gate_bullet_time',
    kind: 'gate',
    name: '时空力场',
    reward: 'item_bullet_time',
    hp: 4,
    score: 160,
    xp: 12,
    color: '#6ee7b7',
  },
  gate_booster: {
    id: 'gate_booster',
    kind: 'gate',
    name: '超频冲刺',
    reward: 'item_booster',
    hp: 4,
    score: 160,
    xp: 12,
    color: '#f59e0b',
  },
  gate_drone: {
    id: 'gate_drone',
    kind: 'gate',
    name: '浮游护卫',
    reward: 'item_drone',
    hp: 4,
    score: 160,
    xp: 12,
    color: '#ec4899',
  },
  element_lightning: {
    id: 'element_lightning',
    kind: 'secondary_mutation',
    element: 'lightning',
    name: '雷电附魔',
    hp: 1,
    color: '#ffea79',
  },
  element_flame: {
    id: 'element_flame',
    kind: 'secondary_mutation',
    element: 'flame',
    name: '烈焰附魔',
    hp: 1,
    color: '#ff6b4a',
  },
  element_frost: {
    id: 'element_frost',
    kind: 'secondary_mutation',
    element: 'frost',
    name: '极寒附魔',
    hp: 1,
    color: '#7be3ff',
  },
}

export const RUNNER_SUBMODES = {
  blitz: {
    id: 'blitz',
    name: '极速闪击',
    duration: 60,
    distance: 1200,
    kicker: '60 秒肉鸽闪击突围',
    description: '高密度进化经验、动态机关与终极部位Boss，60 秒极限爽局！',
    badge: '⚡ 60s 极速闪击',
    xpScale: 1.45,
    weaponChoiceTime: 10,
    weaponEvolveTime: 25,
    weaponOverdriveTime: 42,
    weaponModuleTime: 34,
    forkTimes: [20, 40],
    bossSchedule: [{ time: 46, bossId: 'fortress_warden' }],
    collapseSchedule: [28],
    sections: [
      {
        id: 'blitz_outer',
        name: '破门闪击',
        start: 0,
        end: 20,
        spawnInterval: 2.6,
        advanceSpeed: 0.15,
        hpMultiplier: 0.9,
        patterns: [
          ['scout', 'attack', 'fever_shard'],
          ['barrel', 'gate_bullet_time', 'rapid'],
          ['archer', 'attack', 'fever_shard'],
          ['swarm', 'gate_magnet', 'crystal_ice'],
        ],
      },
      {
        id: 'blitz_mid',
        name: '穿越封锁',
        start: 20,
        end: 42,
        spawnInterval: 2.1,
        advanceSpeed: 0.195,
        hpMultiplier: 1.15,
        patterns: [
          ['switch_gate', 'twin_assassin', 'fever_shard'],
          ['charger', 'gate_booster', 'elite'],
          ['mage', 'gate_bullet_time', 'crystal_volt'],
          ['swarm', 'gate_booster', 'attack'],
          ['twin_assassin', 'guard', 'gate_magnet'],
          ['link_priest', 'brute', 'link_priest'],
        ],
      },
      {
        id: 'blitz_sprint',
        name: '极限冲关',
        start: 42,
        end: 60,
        spawnInterval: 1.75,
        advanceSpeed: 0.24,
        hpMultiplier: 1.35,
        patterns: [
          ['carrier_boss', 'shield', 'gate_drone'],
          ['elite', 'twin_assassin', 'fever_shard'],
          ['archer', 'mage', 'barrel'],
          ['twin_assassin', 'gate_drone', 'attack'],
          ['swarm', 'guard', 'gate_magnet'],
          ['rapid', 'elite', 'priest'],
          ['roller_mine', 'bounty_gate', 'gunship'],
        ],
      },
    ],
  },
  marathon: {
    id: 'marathon',
    name: '决战远征',
    duration: 180,
    distance: 3600,
    kicker: '180 秒深度远征战役',
    description: '4 阶段战役进军、双部位守关 Boss、四维构筑全展开！',
    badge: '🛡️ 180s 决战远征',
    xpScale: 1.0,
    weaponChoiceTime: 25,
    weaponEvolveTime: 65,
    weaponOverdriveTime: 110,
    weaponModuleTime: 74,
    forkTimes: [30, 60, 95, 130],
    bossSchedule: [
      { time: 76, bossId: 'fortress_warden' },
      { time: 152, bossId: 'citadel_colossus' },
    ],
    collapseSchedule: [46, 112, 140],
    sections: [
      {
        id: 'outer',
        name: '突破外环',
        start: 0,
        end: 35,
        spawnInterval: 3.1,
        advanceSpeed: 0.13,
        hpMultiplier: 0.95,
        patterns: [
          ['scout', 'attack', 'fever_shard'],
          ['barrel', 'rapid', 'crystal_ice'],
          ['archer', 'guard', 'gate_magnet'],
          ['swarm', 'gate_bullet_time', 'fever_shard'],
        ],
      },
      {
        id: 'blockade',
        name: '穿越封锁',
        start: 35,
        end: 85,
        spawnInterval: 2.6,
        advanceSpeed: 0.165,
        hpMultiplier: 1.1,
        patterns: [
          ['shield', 'switch_gate', 'attack'],
          ['charger', 'gate_booster', 'fever_shard'],
          ['mage', 'scout', 'barrel'],
          ['repair', 'gold_convoy', 'rapid'],
          ['swarm', 'gate_drone', 'crystal_volt'],
          ['gunship', 'guard', 'roller_mine'],
        ],
      },
      {
        id: 'pursuit',
        name: '王城激战',
        start: 85,
        end: 140,
        spawnInterval: 2.25,
        advanceSpeed: 0.205,
        hpMultiplier: 1.25,
        patterns: [
          ['link_priest', 'shield', 'link_priest'],
          ['laser_gate', 'splitter', 'fever_shard'],
          ['carrier_boss', 'repair', 'charger'],
          ['twin_assassin', 'gate_magnet', 'bounty_gate'],
          ['rapid', 'priest', 'barrel'],
          ['mage', 'gate_bullet_time', 'crystal_ice'],
        ],
      },
      {
        id: 'sprint',
        name: '决战冲锋',
        start: 140,
        end: 180,
        spawnInterval: 1.9,
        advanceSpeed: 0.245,
        hpMultiplier: 1.4,
        patterns: [
          ['elite', 'laser_gate', 'fever_shard'],
          ['carrier_boss', 'guard', 'gate_booster'],
          ['switch_gate', 'repair', 'twin_assassin'],
          ['swarm', 'brute', 'gate_drone'],
          ['rapid', 'elite', 'crystal_volt'],
          ['gunship', 'mage', 'barrel'],
        ],
      },
    ],
  },
  endless: {
    id: 'endless',
    name: '无尽狂飙',
    duration: Infinity,
    distance: Infinity,
    kicker: '无限距离极限挑战',
    description: '动态地形、循环虚空战舰Boss与无限成长词条，冲击全服排行榜！',
    badge: '♾️ 无尽狂飙',
    xpScale: 1.0,
    weaponChoiceTime: 25,
    weaponEvolveTime: 60,
    weaponOverdriveTime: 100,
    weaponModuleTime: 69,
    forkTimes: null,
    bossSchedule: null,
    collapseSchedule: null,
    sections: [],
  },
}

export function getRunnerSubmode(id) {
  return RUNNER_SUBMODES[id] || RUNNER_SUBMODES.marathon
}

export function getRunnerForkTimes(submodeId) {
  const submode = getRunnerSubmode(submodeId)
  if (Array.isArray(submode.forkTimes)) return submode.forkTimes
  if (submode.id === 'endless') {
    const times = []
    for (let t = 30; t <= 3600; t += 30) times.push(t)
    return times
  }
  return RUNNER_SUBMODES.marathon.forkTimes
}

export function getRunnerBossSchedule(submodeId) {
  const submode = getRunnerSubmode(submodeId)
  if (Array.isArray(submode.bossSchedule)) return submode.bossSchedule
  if (submode.id === 'endless') {
    const list = []
    const ids = ['fortress_warden', 'citadel_colossus', 'void_juggernaut']
    for (let i = 0; i < 40; i++) {
      list.push({ time: (i + 1) * 65, bossId: ids[i % ids.length] })
    }
    return list
  }
  return []
}

export function getRunnerCollapseSchedule(submodeId) {
  const submode = getRunnerSubmode(submodeId)
  if (Array.isArray(submode.collapseSchedule)) return submode.collapseSchedule
  if (submode.id === 'endless') {
    const times = []
    for (let t = 45; t <= 3600; t += 45) times.push(t)
    return times
  }
  return []
}

export function getRunnerSection(elapsed, submodeId = 'marathon') {
  const submode = getRunnerSubmode(submodeId)
  const time = Math.max(0, elapsed)

  if (submode.id === 'endless') {
    const waveIndex = Math.floor(time / 30)
    const baseSpeed = Math.min(0.29, 0.14 + waveIndex * 0.014)
    const spawnInterval = Math.max(1.6, 3.1 - waveIndex * 0.11)
    const hpMultiplier = 1 + waveIndex * 0.13
    const stageNames = ['起步试炼', '封锁外围', '要塞突破', '王城突袭', '深渊狂飙', '虚空极速']
    const name = waveIndex < stageNames.length ? stageNames[waveIndex] : `狂飙第 ${waveIndex + 1} 区`
    const pool = [
      ['scout', 'fever_shard', 'gate_magnet'],
      ['carrier_boss', 'repair', 'charger'],
      ['switch_gate', 'barrier', 'gate_bullet_time'],
      ['elite', 'fever_shard', 'splitter'],
      ['swarm', 'barrel', 'gate_booster'],
      ['gold_convoy', 'twin_assassin', 'guard'],
      ['gunship', 'mage', 'gate_drone'],
      ['link_priest', 'brute', 'link_priest'],
      ['roller_mine', 'crystal_ice', 'bounty_gate'],
    ]
    return {
      id: `endless_${waveIndex}`,
      name,
      index: waveIndex,
      start: waveIndex * 30,
      end: (waveIndex + 1) * 30,
      spawnInterval,
      advanceSpeed: baseSpeed,
      hpMultiplier,
      patterns: pool,
    }
  }

  const sections = submode.sections || RUNNER_SUBMODES.marathon.sections
  for (let i = sections.length - 1; i >= 0; i--) {
    if (time >= sections[i].start) return { ...sections[i], index: i }
  }
  return { ...sections[0], index: 0 }
}

export function getRunnerWeaponCore(id) {
  return RUNNER_WEAPON_CORES[id] || null
}

export function getRunnerStrain(id) {
  return RUNNER_STRAINS[id] || RUNNER_STRAINS.origin
}

export function getRunnerStarterChip(id) {
  return RUNNER_STARTER_CHIPS[id] || null
}

export function runnerProgress(elapsed, duration = 180) {
  if (!duration || duration === Infinity) return 0
  return Math.min(1, Math.max(0, elapsed / duration))
}

export function runnerDistanceRemaining(elapsed, duration = 180, totalDistance = 3600) {
  if (!duration || duration === Infinity) return Math.floor(elapsed * 85)
  return Math.max(0, Math.ceil((1 - runnerProgress(elapsed, duration)) * totalDistance))
}

export function createRunnerSeed(value = Date.now()) {
  const seed = Number(value) >>> 0
  return seed || 0x6d2b79f5
}
