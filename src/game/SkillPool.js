/**
 * 技能池：流派化专精技能体系（阶段式里程碑觉醒架构）
 *
 * 核心升级节奏：
 *  - Lv. 1 ~ 4【初生自由探索期】：4 大流派的所有 T1 基础技能 + 通用生存技能全部开放，自由混搭尝试，绝不锁定流派；
 *  - Lv. 5【主专精觉醒里程碑】：触发「主专精觉醒仪式」，4 大流派并排陈列，预览未来技能树后主动确立【主专精】；
 *  - Lv. 6 ~ 8【主专精深潜期】：主专精解锁 T2、T3 进阶技能，通用池持续兜底；
 *  - Lv. 9【副专精共鸣里程碑】：触发「副专精觉醒仪式」，从剩余 3 个流派中主动选定 1 个【副专精】；
 *  - Lv. 10+【深潜与终极觉醒】：主专精开放 T4 终极质变大招（Capstone），副专精开放专属共鸣挂件。
 */

export const SPEC_INFO = {
  gluttony: {
    key: 'gluttony',
    name: '暴食巨兽',
    icon: '🦖',
    color: '#ff9f43',
    desc: '近战冲撞 · 胃袋吞噬 · 自愈肉盾',
    bonus: '👑 觉醒赋能：吞噬阈值提升至 28% · 生命上限 +1',
    roadmap: [
      'T1: 深渊胃囊 (吞噬强化 · 攻击逐级降低) / 硬化甲壳 (受击反震)',
      'T2: 腐蚀重碾 (冲刺冷却大幅缩短 & 撞击 4 倍伤害)',
      'T3: 胃酸迸发 (吞噬向周围喷发 10 团强酸弹)',
      '🌟 终极觉醒: 荒古吞噬领主 (体型+30% · 冲刺无敌且秒杀吞噬 <=50% 残血怪)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【坚韧肉壁(生命上限)】与【消化代谢(吞噬必回血+减伤)】',
  },
  gatling: {
    key: 'gatling',
    name: '机枪风暴',
    icon: '🌪️',
    color: '#00d2d3',
    desc: '全屏弹幕 · 极速连射 · 有丝分裂',
    bonus: '👑 觉醒赋能：齐射飞弹 +1 · 基础射速 +15%',
    roadmap: [
      'T1: 多重喷射腔 (齐射弹数) / 喷射增压 (弹速伤害)',
      'T2: 有丝分裂 (命中 100% 分裂 2 枚小弹)',
      'T3: 连锁弹射 (分裂微弹穿透弹射 2 次)',
      '🌟 终极觉醒: 加特林风暴母体 (0.12s 极速机枪连射 · 全屏飞弹强力追踪)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【增压副弹夹(弹数+1/弹速+75%)】与【动能穿透(穿透+2)】',
  },
  elemental: {
    key: 'elemental',
    name: '元素炼金',
    icon: '🔮',
    color: '#a29bfe',
    desc: '四系附魔 · 反应扩散 · 传染核爆',
    bonus: '👑 觉醒赋能：四系附魔概率 +20% · 反应伤害 +35%',
    roadmap: [
      'T1: 四象亲和 (四系附魔概率) / 反应共鸣 (复合反应增伤)',
      'T2: 瘟疫传染 (死者异常状态 100% 扩散给周围 8 个目标)',
      'T3: 元素过载 (反应额外引发爆轰震荡波)',
      '🌟 终极觉醒: 四象混沌原质 (命中同时触发四系全反应 · 召唤混沌引力黑洞)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【元素共鸣体(反应伤害+90%)】与【霜火护体(自动冻结引燃贴脸怪)】',
  },
  assassin: {
    key: 'assassin',
    name: '暗影刺客',
    icon: '🗡️',
    color: '#ff3838',
    desc: '5倍暴击 · 瞬身假人 · 影分身斩',
    bonus: '👑 觉醒赋能：暴击率提升至 25% · 暴击伤害倍率提升至 3.5x',
    roadmap: [
      'T1: 致命毒腺 (暴击率 55%) / 暗影疾行 (移速与冲刺冷却)',
      'T2: 穿心绞杀 (暴击倍率提升至 5.0 倍)',
      'T3: 残影替身 (冲刺留下暗影假人嘲讽怪海 2.5 秒)',
      '🌟 终极觉醒: 暗影无相主宰 (暴击召唤暗影分身交叉斩 · 冲刺隐匿且下次必暴)',
    ],
    subBonus: '🥈 副专精共鸣：解锁【弱点洞悉(残血暴伤翻倍)】与【影袭连环(击杀移速爆发)】',
  },
}

export const SKILL_DATABASE = {
  // ==========================================
  // 1. 暴食巨兽流 (Gluttony)
  // ==========================================
  gluttony: {
    primary: [
      {
        id: 'glut_maw',
        spec: 'gluttony',
        tier: 1,
        name: '深渊胃囊',
        icon: '🕳️',
        desc: '主动抑制攻击强度，换取更高吞噬线与更大的吞噬引力范围',
        tags: ['暴食·T1', '吞噬'],
        maxLevel: 3,
        stats(lv) {
          const t = [28, 32, 36][lv] || 36
          const r = [20, 40, 60][lv] || 60
          const damagePenalty = [10, 20, 30][lv] || 30
          return `吞噬阈值 ${t}% · 吸附 +${r}% · 攻击 -${damagePenalty}%`
        },
        apply(game, lv) {
          const damageMultipliers = [0.9, 0.8, 0.7]
          const previousDamageMul = lv > 1 ? damageMultipliers[lv - 2] : 1
          const nextDamageMul = damageMultipliers[lv - 1]
          game.devourThreshold = [0.28, 0.32, 0.36][lv - 1]
          game.player.devourRadiusBonus = [1.2, 1.4, 1.6][lv - 1]
          game.weaponSystem.damage *= nextDamageMul / previousDamageMul
        },
      },
      {
        id: 'glut_bulk',
        spec: 'gluttony',
        tier: 1,
        name: '硬化甲壳',
        icon: '🛡️',
        desc: '增加生命上限，受击时震退周围所有敌人',
        tags: ['暴食·T1', '体魄'],
        maxLevel: 3,
        stats(lv, game) {
          return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1}`
        },
        apply(game) {
          game.player.maxHp += 1
          game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1)
          game.player.thornsPulse = true
        },
      },
      {
        id: 'glut_ram',
        spec: 'gluttony',
        tier: 2,
        requires: ['glut_maw', 'glut_bulk'],
        name: '腐蚀重碾',
        icon: '🚜',
        desc: '冲刺冷却缩短，冲刺时对沿途敌人造成强力撞击伤害',
        tags: ['暴食·T2', '冲撞'],
        maxLevel: 3,
        stats(lv) {
          const cd = [15, 30, 45][lv] || 45
          const dmg = [2, 3, 4][lv] || 4
          return `冲刺冷却 -${cd}% · 冲撞伤害 ×${dmg}`
        },
        apply(game, lv) {
          game.player.dashCdMultiplier = [0.85, 0.7, 0.55][lv - 1]
          game.player.dashImpactDmg = [2, 3, 4][lv - 1]
        },
      },
      {
        id: 'glut_eruption',
        spec: 'gluttony',
        tier: 3,
        requires: ['glut_ram'],
        name: '胃酸迸发',
        icon: '🧪',
        desc: '每次成功吞噬敌人时，向四周喷发强酸腐蚀弹',
        tags: ['暴食·T3', '酸液'],
        maxLevel: 2,
        stats(lv) {
          const n = [6, 10][lv] || 10
          return `吞噬喷发 ${n} 团酸弹`
        },
        apply(game, lv) {
          game.player.devourAcidSpray = [6, 10][lv - 1]
        },
      },
      {
        id: 'glut_capstone',
        spec: 'gluttony',
        tier: 4,
        isCapstone: true,
        requires: ['glut_eruption'],
        name: '🌟 荒古吞噬领主',
        icon: '👑',
        desc: '体型增大 30% 且常驻吸力黑洞；冲刺期间无敌并直接秒杀吞噬沿途 ≤50% 生命的敌人！',
        tags: ['终极觉醒', '暴食领主'],
        maxLevel: 1,
        stats() {
          return '领主觉醒 · 冲刺秒杀吞噬 ≤50% 残血'
        },
        apply(game) {
          game.player.isGluttonyLord = true
          game.player.radius *= 1.3
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 荒古吞噬领主 觉醒!', null, '#ff9f43', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'glut_sub_armor',
        spec: 'gluttony',
        name: '坚韧肉壁',
        icon: '🧱',
        desc: '生命上限 +1 并立即回满生命',
        tags: ['暴食共鸣', '生命'],
        maxLevel: 3,
        stats(lv, game) {
          return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1}`
        },
        apply(game) {
          game.player.maxHp += 1
          game.player.hp = game.player.maxHp
        },
      },
      {
        id: 'glut_sub_digest',
        spec: 'gluttony',
        name: '消化代谢',
        icon: '🍖',
        desc: '每次吞噬必定恢复 1 点生命值，并获得 3 秒 15% 减伤',
        tags: ['暴食共鸣', '自愈'],
        maxLevel: 2,
        stats(lv) {
          return `吞噬回血 +1 · 减伤 ${lv === 0 ? 15 : 25}%`
        },
        apply(game, lv) {
          game.player.devourHeal = true
          game.player.devourDamageReduction = lv === 1 ? 0.15 : 0.25
        },
      },
    ],
  },

  // ==========================================
  // 2. 机枪风暴流 (Gatling)
  // ==========================================
  gatling: {
    primary: [
      {
        id: 'gat_multishot',
        spec: 'gatling',
        tier: 1,
        name: '多重喷射腔',
        icon: '🔱',
        desc: '额外喷射黏液飞弹，并缩短射击间隔',
        tags: ['机枪·T1', '弹幕'],
        maxLevel: 3,
        stats(lv, game) {
          const n = game.weaponSystem.projectileCount
          return `弹数 ${n} → ${n + 1} · 射速 +15%`
        },
        apply(game) {
          game.weaponSystem.projectileCount += 1
          game.weaponSystem.fireInterval *= 0.85
        },
      },
      {
        id: 'gat_velocity',
        spec: 'gatling',
        tier: 1,
        name: '喷射增压',
        icon: '💨',
        desc: '飞弹速度与伤害协同提升',
        tags: ['机枪·T1', '弹速'],
        maxLevel: 3,
        stats(lv, game) {
          const v = Math.round(game.weaponSystem.projectileSpeed)
          return `弹速 ${v} → ${Math.round(v * 1.2)} · 伤害 +15%`
        },
        apply(game) {
          game.weaponSystem.projectileSpeed *= 1.2
          game.weaponSystem.damage *= 1.15
        },
      },
      {
        id: 'gat_split',
        spec: 'gatling',
        tier: 2,
        requires: ['gat_multishot', 'gat_velocity'],
        name: '有丝分裂',
        icon: '💥',
        desc: '飞弹命中敌人后必定迸发分裂小弹追踪临近目标',
        tags: ['机枪·T2', '分裂'],
        maxLevel: 3,
        stats(lv) {
          const rate = [40, 70, 100][lv] || 100
          return `分裂概率 ${rate}%`
        },
        apply(game, lv) {
          game.weaponSystem.splitChance = [0.4, 0.7, 1.0][lv - 1] + game.weaponSystem.baseSplitChance
        },
      },
      {
        id: 'gat_chain',
        spec: 'gatling',
        tier: 3,
        requires: ['gat_split'],
        name: '连锁弹射矩阵',
        icon: '⚡',
        desc: '分裂出的微弹命中后可额外穿透/弹射',
        tags: ['机枪·T3', '穿透'],
        maxLevel: 2,
        stats(lv) {
          const p = [1, 2][lv] || 2
          return `分裂弹穿透 +${p} 次`
        },
        apply(game, lv) {
          game.weaponSystem.splitPierces = [1, 2][lv - 1]
        },
      },
      {
        id: 'gat_capstone',
        spec: 'gatling',
        tier: 4,
        isCapstone: true,
        requires: ['gat_chain'],
        name: '🌟 加特林风暴母体',
        icon: '👑',
        desc: '射击间隔骤降至 0.12 秒（每秒扫射近 10 发），全屏飞弹自动强力追踪！',
        tags: ['终极觉醒', '加特林'],
        maxLevel: 1,
        stats() {
          return '母体觉醒 · 射击间隔 0.12s · 全屏追踪'
        },
        apply(game) {
          game.weaponSystem.isGatlingMother = true
          game.weaponSystem.fireInterval = 0.12
          game.weaponSystem.projectileCount += 2
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 加特林风暴母体 觉醒!', null, '#00d2d3', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'gat_sub_mag',
        spec: 'gatling',
        name: '增压副弹夹',
        icon: '🔋',
        desc: '齐射飞弹数 +1，弹速提升 25%',
        tags: ['机枪共鸣', '齐射'],
        maxLevel: 3,
        stats(lv, game) {
          return `齐射数 +1 · 弹速 +${(lv + 1) * 25}%`
        },
        apply(game) {
          game.weaponSystem.projectileCount += 1
          game.weaponSystem.projectileSpeed *= 1.25
        },
      },
      {
        id: 'gat_sub_pierce',
        spec: 'gatling',
        name: '动能穿透',
        icon: '🏹',
        desc: '所有飞弹获得额外穿透目标能力',
        tags: ['机枪共鸣', '穿透'],
        maxLevel: 2,
        stats(lv) {
          return `穿透目标数 +${lv + 1}`
        },
        apply(game, lv) {
          game.weaponSystem.basePierces = [1, 2][lv - 1]
        },
      },
    ],
  },

  // ==========================================
  // 3. 元素炼金流 (Elemental)
  // ==========================================
  elemental: {
    primary: [
      {
        id: 'ele_affinity',
        spec: 'elemental',
        tier: 1,
        name: '四象亲和',
        icon: '🔮',
        desc: '大幅提升火、水、雷、毒附魔概率与状态跳伤',
        tags: ['元素·T1', '附魔'],
        maxLevel: 3,
        stats(lv) {
          const p = [15, 30, 45][lv] || 45
          return `附魔概率 +${p}% · 状态伤害 +${p * 2}%`
        },
        apply(game, lv) {
          const b = [0.15, 0.3, 0.45][lv - 1]
          game.weaponSystem.freezeChance += b
          game.weaponSystem.burnChance += b
          game.weaponSystem.poisonChance += b
        },
      },
      {
        id: 'ele_resonance',
        spec: 'elemental',
        tier: 1,
        name: '反应共鸣',
        icon: '🌀',
        desc: '复合元素反应（蒸汽/酸池/麻痹/毒雷）伤害与范围提升',
        tags: ['元素·T1', '反应'],
        maxLevel: 3,
        stats(lv) {
          const d = [35, 70, 100][lv] || 100
          return `反应伤害 +${d}%`
        },
        apply(game, lv) {
          game.weaponSystem.reactionDmgMul = [1.35, 1.7, 2.0][lv - 1]
        },
      },
      {
        id: 'ele_spread',
        spec: 'elemental',
        tier: 2,
        requires: ['ele_affinity', 'ele_resonance'],
        name: '瘟疫传染',
        icon: '☣️',
        desc: '带有燃烧/中毒/麻痹状态的敌人死亡时，将状态传染扩散给周围敌人',
        tags: ['元素·T2', '扩散'],
        maxLevel: 3,
        stats(lv) {
          const n = [3, 5, 8][lv] || 8
          return `传染扩散至周围 ${n} 个目标`
        },
        apply(game, lv) {
          game.weaponSystem.plagueSpreadCount = [3, 5, 8][lv - 1]
        },
      },
      {
        id: 'ele_overload',
        spec: 'elemental',
        tier: 3,
        requires: ['ele_spread'],
        name: '元素过载爆轰',
        icon: '🎆',
        desc: '任何元素反应触发时，在目标脚底额外炸开强力震荡波',
        tags: ['元素·T3', '爆轰'],
        maxLevel: 2,
        stats(lv) {
          return `爆轰震荡波伤害 ×${[1.5, 2.5][lv] || 2.5}`
        },
        apply(game, lv) {
          game.weaponSystem.reactionShockwave = [1.5, 2.5][lv - 1]
        },
      },
      {
        id: 'ele_capstone',
        spec: 'elemental',
        tier: 4,
        isCapstone: true,
        requires: ['ele_overload'],
        name: '🌟 四象混沌原质',
        icon: '👑',
        desc: '飞弹命中必定同时触发四系全反应（蒸汽+酸池+麻痹+毒雷），并生成牵引怪海的【混沌奇点】！',
        tags: ['终极觉醒', '混沌原质'],
        maxLevel: 1,
        stats() {
          return '原质觉醒 · 四系全反应全开 · 混沌黑洞'
        },
        apply(game) {
          game.weaponSystem.isChaosOrigin = true
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 四象混沌原质 觉醒!', null, '#5f27cd', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'ele_sub_boost',
        spec: 'elemental',
        name: '元素共鸣体',
        icon: '💠',
        desc: '全元素附魔概率 +20%，反应伤害提升',
        tags: ['元素共鸣', '附魔'],
        maxLevel: 3,
        stats(lv) {
          return `反应伤害 +${(lv + 1) * 30}%`
        },
        apply(game, lv) {
          game.weaponSystem.reactionDmgMul = (game.weaponSystem.reactionDmgMul || 1) + 0.3
        },
      },
      {
        id: 'ele_sub_aura',
        spec: 'elemental',
        name: '霜火护体',
        icon: '❄️',
        desc: '周期性自动冻结并引燃贴脸 140px 内的近战敌人',
        tags: ['元素共鸣', '控场'],
        maxLevel: 2,
        stats(lv) {
          return `每 ${lv === 0 ? 3 : 2} 秒自动爆发霜火光环`
        },
        apply(game, lv) {
          game.player.frostFireAura = lv === 1 ? 3 : 2
        },
      },
    ],
  },

  // ==========================================
  // 4. 暗影刺客流 (Assassin)
  // ==========================================
  assassin: {
    primary: [
      {
        id: 'ass_lethal',
        spec: 'assassin',
        tier: 1,
        name: '致命毒腺',
        icon: '🎯',
        desc: '大幅提高暴击概率',
        tags: ['刺客·T1', '暴击率'],
        maxLevel: 3,
        stats(lv) {
          const rate = [25, 40, 55][lv] || 55
          return `暴击率提升至 ${rate}%`
        },
        apply(game, lv) {
          game.weaponSystem.critChance = [0.25, 0.4, 0.55][lv - 1]
        },
      },
      {
        id: 'ass_stride',
        spec: 'assassin',
        tier: 1,
        name: '暗影疾行',
        icon: '👟',
        desc: '移动速度与冲刺冷却全面强化',
        tags: ['刺客·T1', '机动'],
        maxLevel: 3,
        stats(lv, game) {
          const s = Math.round(game.player.speed)
          return `移速 ${s} → ${Math.round(s * 1.15)} · 冲刺冷却 -15%`
        },
        apply(game) {
          game.player.speed *= 1.15
          game.player.dashCdMultiplier = (game.player.dashCdMultiplier || 1) * 0.85
        },
      },
      {
        id: 'ass_execute',
        spec: 'assassin',
        tier: 2,
        requires: ['ass_lethal', 'ass_stride'],
        name: '穿心绞杀',
        icon: '🗡️',
        desc: '暴击伤害倍率由 3 倍大幅提升',
        tags: ['刺客·T2', '暴伤'],
        maxLevel: 3,
        stats(lv) {
          const mul = [3.5, 4.2, 5.0][lv] || 5.0
          return `暴击倍率 ×${mul}`
        },
        apply(game, lv) {
          game.weaponSystem.critMul = [3.5, 4.2, 5.0][lv - 1]
        },
      },
      {
        id: 'ass_decoy',
        spec: 'assassin',
        tier: 3,
        requires: ['ass_execute'],
        name: '残影替身',
        icon: '👤',
        desc: '冲刺后在原地留下暗影假人嘲讽吸引周围敌人',
        tags: ['刺客·T3', '替身'],
        maxLevel: 2,
        stats(lv) {
          const t = [1.5, 2.5][lv] || 2.5
          return `假人嘲讽持续 ${t} 秒`
        },
        apply(game, lv) {
          game.player.shadowDecoyDuration = [1.5, 2.5][lv - 1]
        },
      },
      {
        id: 'ass_capstone',
        spec: 'assassin',
        tier: 4,
        isCapstone: true,
        requires: ['ass_decoy'],
        name: '🌟 暗影无相主宰',
        icon: '👑',
        desc: '暴击时在目标身旁瞬间召唤【暗影分身交叉斩击】；冲刺获得 1.5 秒潜行且下一次攻击必暴击！',
        tags: ['终极觉醒', '暗影主宰'],
        maxLevel: 1,
        stats() {
          return '主宰觉醒 · 暴击影分身连斩 · 冲刺隐匿必暴'
        },
        apply(game) {
          game.weaponSystem.isShadowLord = true
          game.enemyManager.addText(game.player.x, game.player.y - 24, '🌟 暗影无相主宰 觉醒!', null, '#ff3838', 18)
        },
      },
    ],
    secondary: [
      {
        id: 'ass_sub_insight',
        spec: 'assassin',
        name: '弱点洞悉',
        icon: '👁️',
        desc: '暴击率提升，对生命值低于 50% 的敌人暴伤额外翻倍',
        tags: ['刺客共鸣', '斩杀'],
        maxLevel: 3,
        stats(lv) {
          return `暴击率 +${(lv + 1) * 15}% · 残血暴伤翻倍`
        },
        apply(game, lv) {
          game.weaponSystem.critChance += 0.15
          game.weaponSystem.executeCrit = true
        },
      },
      {
        id: 'ass_sub_rush',
        spec: 'assassin',
        name: '影袭连环',
        icon: '⚡',
        desc: '击杀任何敌人后获得 2 秒移速与暴击率加成',
        tags: ['刺客共鸣', '爆发'],
        maxLevel: 2,
        stats(lv) {
          return `击杀后 +${lv === 0 ? 25 : 40}% 移速爆发`
        },
        apply(game, lv) {
          game.player.killRushSpeed = lv === 1 ? 0.25 : 0.4
        },
      },
    ],
  },

  // ==========================================
  // 5. 通用生存池 (Common)
  // ==========================================
  common: [
    {
      id: 'com_vital',
      name: '细胞增殖',
      icon: '❤️',
      desc: '生命上限 +1 并立即回复 1 点生命',
      tags: ['通用', '生命'],
      maxLevel: 5,
      stats(lv, game) {
        return `生命上限 ${game.player.maxHp} → ${game.player.maxHp + 1}`
      },
      apply(game) {
        game.player.maxHp += 1
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1)
      },
    },
    {
      id: 'com_swift',
      name: '流体滑行',
      icon: '🌊',
      desc: '移动速度提升 12%，走位更灵动',
      tags: ['通用', '移速'],
      maxLevel: 5,
      stats(lv, game) {
        const s = Math.round(game.player.speed)
        return `移速 ${s} → ${Math.round(s * 1.12)}`
      },
      apply(game) {
        game.player.speed *= 1.12
      },
    },
    {
      id: 'com_magnet',
      name: '引力细胞',
      icon: '🧲',
      desc: '经验宝石与道具吸附半径提升 25%',
      tags: ['通用', '磁力'],
      maxLevel: 5,
      stats(lv, game) {
        const r = Math.round(game.player.pickupRadius)
        return `拾取半径 ${r} → ${Math.round(r * 1.25)}`
      },
      apply(game) {
        game.player.pickupRadius *= 1.25
      },
    },
    {
      id: 'com_regen',
      name: '再生核心',
      icon: '🌱',
      desc: '每 8 秒自动缓慢修复 1 点生命值',
      tags: ['通用', '自愈'],
      maxLevel: 3,
      stats(lv) {
        return `自愈周期 ${[8, 6, 4][lv] || 4} 秒`
      },
        apply(game, lv) {
          game.player.regenInterval = [8, 6, 4][lv - 1]
          game.player._regenTimer = game.player.regenInterval
        },
    },
    {
      id: 'com_adrenaline',
      name: '肾上腺素',
      icon: '⚡',
      desc: '受击时触发移速爆发——把「挨打」转化为走位资源，越危险越灵活',
      tags: ['通用', '机动'],
      maxLevel: 3,
      stats(lv) {
        const b = [30, 45, 60][lv] || 60
        return `受击后移速 +${b}%（持续 3 秒）`
      },
      apply(game, lv) {
        game.player.adrenalineSpeed = [0.3, 0.45, 0.6][lv - 1]
      },
    },
  ],
}

/**
 * 智能抽取算法（支持里程碑觉醒机制）
 */
export function rollSkills(game, count = 3) {
  const pLevel = game.player?.level || 1
  const levels = game.skillLevels || {}
  const primarySpec = game.primarySpec
  const secondarySpec = game.secondarySpec

  // ===================================================
  // 1. Lv. 5 里程碑：主专精觉醒仪式（四系陈列）
  // ===================================================
  if (pLevel >= 5 && !primarySpec) {
    return Object.keys(SKILL_DATABASE)
      .filter((k) => k !== 'common')
      .map((k) => {
        const info = SPEC_INFO[k]
        return {
          id: `milestone_pri_${k}`,
          spec: k,
          isMilestone: true,
          milestoneType: 'primary',
          name: `确立【${info.name}】`,
          icon: info.icon,
          color: info.color,
          desc: info.desc,
          bonus: info.bonus,
          roadmap: info.roadmap,
          tags: ['👑 主专精觉醒', info.name],
          stats: info.bonus,
        }
      })
  }

  // ===================================================
  // 2. Lv. 9 里程碑：副专精共鸣仪式（剩余三系陈列）
  // ===================================================
  if (pLevel >= 9 && primarySpec && !secondarySpec) {
    return Object.keys(SKILL_DATABASE)
      .filter((k) => k !== 'common' && k !== primarySpec)
      .map((k) => {
        const info = SPEC_INFO[k]
        return {
          id: `milestone_sec_${k}`,
          spec: k,
          isMilestone: true,
          milestoneType: 'secondary',
          name: `确立【${info.name}】`,
          icon: info.icon,
          color: info.color,
          desc: info.desc,
          bonus: info.subBonus,
          roadmap: [info.subBonus],
          tags: ['🥈 副专精共鸣', info.name],
          stats: info.subBonus,
        }
      })
  }

  // ===================================================
  // 3. 常规升级抽取
  // ===================================================
  const candidatePool = []

  // 通用池技能
  for (const s of SKILL_DATABASE.common) {
    const curLv = levels[s.id] || 0
    if (curLv < s.maxLevel) {
      candidatePool.push({ ...s, role: 'common', level: curLv })
    }
  }

  // 流派技能
  for (const [specKey, tree] of Object.entries(SKILL_DATABASE)) {
    if (specKey === 'common') continue

    // 尚未确立主专精（Lv 1~4 探索期）：所有 4 大专精的 T1 技能全部开放探索！
    if (!primarySpec) {
      for (const s of tree.primary.filter((sk) => sk.tier === 1)) {
        const curLv = levels[s.id] || 0
        if (curLv < s.maxLevel) {
          candidatePool.push({ ...s, role: 't1_free', level: curLv })
        }
      }
    } else if (specKey === primarySpec) {
      // 当前是【主专精】：按 T1~T4 深度阶梯展开
      for (const s of tree.primary) {
        const curLv = levels[s.id] || 0
        if (curLv >= s.maxLevel) continue

        // 终极觉醒需要构筑深度和战局进度同时达标，防止单次经验暴涨或慢打
        // 单独提前大招；远征用关卡进度替代计时波次。
        if (s.isCapstone) {
          const pLevel = game.player?.level || 1
          const wave = game.enemyManager?.wave || 1
          const expedition = game.runSelection?.mode === 'expedition'
          const progressReady = expedition ? (game.expeditionStage || 1) >= 5 : wave >= 10
          if (pLevel < 14 || !progressReady) continue
        }

        // 检查前置条件
        let reqMet = true
        if (s.requires && s.requires.length > 0) {
          reqMet = s.requires.some((reqId) => (levels[reqId] || 0) > 0)
        }

        if (reqMet) {
          candidatePool.push({ ...s, role: 'primary', level: curLv })
        }
      }
    } else if (secondarySpec && specKey === secondarySpec) {
      // 当前是【副专精】：开放副专精共鸣技能
      for (const s of tree.secondary) {
        const curLv = levels[s.id] || 0
        if (curLv < s.maxLevel) {
          candidatePool.push({ ...s, role: 'secondary', level: curLv })
        }
      }
    }
  }

  // 洗牌算法
  for (let i = candidatePool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]]
  }

  // 终极觉醒大招优先排在前列
  candidatePool.sort((a, b) => {
    if (a.isCapstone) return -1
    if (b.isCapstone) return 1
    return 0
  })

  return candidatePool.slice(0, count).map((s) => ({
    ...s,
    stats: typeof s.stats === 'function' ? s.stats(s.level, game) : s.stats || '',
  }))
}
