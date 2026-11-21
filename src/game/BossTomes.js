import { PET_ROSTER_BY_ID } from './PetRoster.js'
import { unlockedSquadSlots } from './SymbiosisBuild.js'

/** Six starting identities, four bounded tomes each. Rank values are totals. */
export const BOSS_TOME_MAX_LEVEL = 3
export const RICOCHET_RECHARGE_RANKS = [
  { skillReduction: 8, healAmount: 1, healCooldown: 30 },
  { skillReduction: 15, healAmount: 1.5, healCooldown: 25 },
  { skillReduction: 15, healAmount: 2, healCooldown: 20 },
]
const meta = {
  origin: ['原生', 'origin', '#8cffc8'], glutton: ['暴食', 'gluttony', '#ffb36b'],
  ricochet: ['弹射', 'gatling', '#83cbd9'], elemental: ['元素', 'elemental', '#b6a4ff'],
  shadow: ['暗影', 'assassin', '#c39be6'], summoner: ['共生', 'symbiosis', '#edc479'],
}
const tome = (strain, id, name, icon, desc, ranks) => ({
  id, name, icon, desc, strain, spec: meta[strain][1], color: meta[strain][2],
  tier: 5, maxLevel: 3, isBossSkill: true, bossTome: true,
  tags: ['BOSS秘典', `${meta[strain][0]}专属`], ranks,
})
export const BOSS_TOMES = {
  origin: [
    tome('origin', 'boss_origin_conduit', '异源导流', '⚡', '交替输出积蓄额外异源能量，满级后强化下一次普攻首击。', ['每3次有效异源充能，额外能量 +4', '额外能量 +4 → +6', '额外充能后3秒内，下一次普攻首击伤害 +30%']),
    tome('origin', 'boss_origin_reservoir', '蓄能原核', '◈', '超载后短时间内源质伤害提高，满级延长增益窗口。', ['超载后 3 秒：伤害 +10%', '增伤 10% → 15%', '增益窗口 3 → 5 秒']),
    tome('origin', 'boss_origin_aftershock', '源质调谐', '◎', '强化被动超载释放的源质技能与原质环流，满级后超载赋予短暂机动。', ['被动超载的源质伤害 +8%', '源质伤害 +12% · 范围 +5%', '源质伤害 +15% · 超载后2秒移速 +20%']),
    tome('origin', 'boss_origin_membrane', '自适应膜', '🛡️', '成功超载后获得短时护盾，并为撤离创造机会。', ['超载后护盾1点 · 持续2秒', '护盾持续2 → 3秒', '超载后额外移速 +20% · 持续2秒']),
  ],
  glutton: [
    tome('glutton', 'boss_glutton_radiance', '辉胃', '☀️', '强化腐蚀光环范围与伤害，并周期释放胃辉脉冲；深渊吸噬可缩短脉冲计时。', ['腐蚀光环半径 +14 · 伤害 +15%；每4秒：1倍基础攻击 · 半径140', '光环半径 +24 · 伤害 +25%；胃辉4 → 3.5秒 · 1 → 1.2倍 · 半径160', '吸噬重咬命中：胃辉脉冲计时−1秒（每2秒最多一次）']),
    tome('glutton', 'boss_glutton_thorns', '荆棘胃壁', '✹', '强化反伤脉冲与范围，受击或胃铠挡伤后额外反震，满级强化普通咬击。', ['反伤伤害 +15% · 半径 +15；额外反震0.8倍攻击（半径120 · 冷却3秒）', '反伤伤害 +28% · 半径 +25；反震0.8 → 1.2倍 · 半径120 → 150', '反震后3秒内，下一次普通咬击首击伤害 +30%']),
    tome('glutton', 'boss_glutton_rhythm', '猎食节律', '🦷', '吞噬敌怪或触发饱食酸浪时短暂加速攻速；满级加快吸噬蓄力并缩减冷却。', ['吞噬敌怪或酸浪：咬击攻速 +15% · 持续2秒', '攻速15% → 25% · 持续2 → 3秒', '深渊吸噬蓄力−20% · 冷却−10%；饱食酸浪返还吸噬1秒冷却']),
    tome('glutton', 'boss_glutton_jaw', '王猎重颚', '◆', '强化深渊吸噬重咬伤害，并让受创目标在短时间内承受额外贴身伤害。', ['深渊吸噬重咬伤害 +15%', '重咬增伤15% → 25%', '吸噬重咬命中后3秒，目标受到咬击、光环与反伤伤害 +18%']),
  ],
  ricochet: [
    tome('ricochet', 'boss_rico_chamber', '扩容弹仓', '▣', '扩大普通齐射；弹数投资也参与路线主动的压缩伤害。', ['齐射弹数 +1', '额外使普通攻击间隔−8%', '齐射弹数总加成 +1 → +2']),
    tome('ricochet', 'boss_rico_stabilizer', '稳压原核', '◈', '提高单弹质量，满级后强化主弹首次命中。', ['单弹伤害 +12% · 弹速 +10%', '伤害12% → 20% · 弹速10% → 15%', '主弹首次命中伤害额外 +15%']),
    tome('ricochet', 'boss_rico_recharge', '冷凝弹腺', '❄️', '缩短空格技能冷却。生命未满时，空格技能对敌人造成伤害可回血。',
      RICOCHET_RECHARGE_RANKS.map(({ skillReduction, healAmount, healCooldown }) =>
        `空格冷却 −${skillReduction}% · 回血 ${healAmount} 点 · 治疗冷却 ${healCooldown} 秒`)),
    tome('ricochet', 'boss_rico_echo', '回响弹壳', '↻', '每轮普通攻击独立判定一次有限追击，追击不会递归触发。', ['15%概率追加一轮40%威力追击', '概率15% → 20% · 威力40% → 50%', '连续4轮未触发后，第5轮必定追击']),
  ],
  elemental: [
    tome('elemental', 'boss_elemental_grimoire', '元素法典', '📖', '强化自动法术；满级后周期强化整次施法。', ['自动法术伤害 +12%', '自动法术增伤12% → 20%', '每第5次自动施法，本次威力额外 +30%']),
    tome('elemental', 'boss_elemental_circuit', '奥术回路', '↻', '增强空格法术与冷却循环，满级后衔接自动施法。', ['主动伤害 +10% · 冷却−8%', '主动伤害10% → 18% · 冷却缩减8% → 15%', '主动后5秒内，前三次自动施法伤害 +15%']),
    tome('elemental', 'boss_elemental_sigil', '余辉法印', '✦', '自动法术命中附加延迟范围法印；目标死亡仍在原处爆发。', ['每6秒附印：0.8秒后爆发0.8倍基础攻击 · 半径100', '间隔6 → 5秒 · 伤害0.8 → 1.2倍 · 半径120', '爆发命中的目标2秒内受到自动法术伤害 +15%']),
    tome('elemental', 'boss_elemental_veil', '魔力帷幕', '🛡️', '加快法术护盾重建，满级后破盾排斥普通敌人。', ['护盾重建时间−0.75秒', '重建时间缩减0.75 → 1.5秒（最低4秒）', '破盾释放半径160排斥波 · 首领免疫']),
  ],
  shadow: [
    tome('shadow', 'boss_assassin_mark', '处决印记', '🎯', '本体直接攻击收割残血目标；满级后传斩另一名敌人。', ['对生命≤40%的敌人，本体直接伤害 +25%', '残血增伤25% → 40%', '收割后传斩150范围内另一敌人：1倍基础攻击 · 冷却1秒']),
    tome('shadow', 'boss_shadow_pact', '影契缚身', '👥', '强化分身攻击，满级后新生分身首次普攻更强。', ['分身攻击伤害 +12%', '分身增伤12% → 20%', '新生分身首次普攻伤害额外 +50%（刷新寿命不重置）']),
    tome('shadow', 'boss_assassin_voidstep', '虚空步', '🌑', '缩短影袭冷却，满级后储存一次短时普攻必暴。', ['影袭冷却−8%', '影袭冷却缩减8% → 15%', '影袭结束后3秒内，下一次本体普攻必暴']),
    tome('shadow', 'boss_shadow_cloak', '长夜披风', '🌘', '闪避后的虚化窗口更长，满级后提高撤离速度并强化暗影魔盾充能。', ['闪避虚化0.2 → 0.3秒', '虚化0.3 → 0.4秒', '闪避后额外移速 +20% · 持续2秒 · 闪避额外加速魔盾充能 1 秒']),
  ],
  summoner: [
    tome('summoner', 'boss_pet_unity', '群心契约', '🐾', '全面强化本体与全体伙伴伤害，满级后鼓舞赋予以战养战暴击爆发。', [
      '本体与伙伴伤害 +12%',
      '本体与伙伴增伤 12% → 20%',
      '鼓舞开启后 4 秒内全队及本体暴击率 +20%',
    ]),
    tome('summoner', 'boss_pet_command', '疾令契约', '⚑', '加快鼓舞循环节奏，满级后开启鼓舞时减缩全队特技冷却。', [
      '鼓舞冷却 −8%',
      '鼓舞冷却缩减 8% → 15%',
      '成功鼓舞时，所有存活伙伴主动特技剩余冷却 −1 秒',
    ]),
    tome('summoner', 'boss_pet_vitality', '灵盾纽带', '♥', '提高本体生命上限并周期铸造真实灵盾，满级后护盾触发震荡波。', [
      '本体生命上限 +1 · 每 14 秒获 1 点真实护盾（持续 4 秒）',
      '生命上限总加成 +2 · 护盾周期缩至 10 秒',
      '灵盾挡伤/触发或释放鼓舞时，冲击周围 160px 敌群（1.5× 伤害＋轻推）',
    ]),
    tome('summoner', 'boss_pet_roster', '万灵契约', '♧', '强化全队生命韧性；未满编开启 3 选 1 伙伴选秀，满编 4 人晋升 🌟 星辰形态。', [
      '伙伴生命 +12% · 未满 4 人触发 3 选 1 选秀，满编则随机晋升 1 位 🌟 星辰形态',
      '伙伴生命总加成 +24% · 再触发 1 次选秀或 🌟 星辰晋升',
      '伙伴生命总加成 +36% · 复苏后 2 秒承伤 −25% · 再触发 1 次选秀或 🌟 星辰晋升',
    ]),
  ],
}
export const BOSS_TOME_BY_ID = Object.fromEntries(Object.values(BOSS_TOMES).flat().map(s => [s.id, s]))
export const tomeLevel = (game, id) => Math.max(0, Math.min(3, game?.bossSkillLevels?.[id] || 0))
export function rollBossTomes(game, count = 3, random = Math.random) {
  const strain = game.startingStrain || game.player?.strainId || 'origin'
  const pool = (BOSS_TOMES[strain] || []).filter(s => tomeLevel(game, s.id) < 3).slice()
  const cards = []
  while (pool.length && cards.length < count) {
    const weight = s => tomeLevel(game, s.id) ? 1.15 : 1
    let roll = random() * pool.reduce((sum, s) => sum + weight(s), 0)
    let index = pool.findIndex(s => (roll -= weight(s)) < 0)
    if (index < 0) index = pool.length - 1
    const s = pool.splice(index, 1)[0], level = tomeLevel(game, s.id)
    const card = { ...s, level, stats: s.ranks[level], buildNote: '随机职业秘典 · 可升级至 Lv.3 · 不占用普通升级次数' }
    if (s.id === 'boss_pet_roster') {
      const petCombat = game.weaponSystem?.petCombat
      const roster = petCombat?.squadTypes || ['guardian']
      if (roster.length < 4 && unlockedSquadSlots(game) < 4) {
        card.draftGrant = true
        card.stats += ' · 本次立即开启 3 选 1 伙伴选秀'
      } else {
        const candidates = roster.filter(type => !petCombat?.starPets?.has(type))
        const starType = candidates.length
          ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
          : null
        card.starPetType = starType
        card.starPetName = starType ? (PET_ROSTER_BY_ID[starType]?.name || starType) : null
        card.stats += card.starPetName ? ` · 本次晋升：🌟 ${card.starPetName}` : ' · 全队星辰圆满：全体恢复满血'
      }
    }
    cards.push(card)
  }
  return cards
}
