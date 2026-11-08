/** Six starting identities, four bounded tomes each. Rank values are totals. */
export const BOSS_TOME_MAX_LEVEL = 3
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
    tome('origin', 'boss_origin_reservoir', '蓄能原核', '◈', '保留较高异源能量获得持续增伤，满级后超载也能维持增益。', ['能量≥50：伤害 +10%', '能量门槛50 → 40；增伤10% → 15%', '超载后额外获得同等增伤3秒']),
    tome('origin', 'boss_origin_aftershock', '源质调谐', '◎', '强化被动超载释放的源质技能与原质环流，满级后超载赋予短暂机动。', ['被动超载的源质伤害 +8%', '源质伤害 +12% · 范围 +5%', '源质伤害 +15% · 超载后2秒移速 +20%']),
    tome('origin', 'boss_origin_membrane', '自适应膜', '🛡️', '成功超载后获得短时护盾，并为撤离创造机会。', ['超载后护盾1点 · 持续2秒', '护盾持续2 → 3秒', '超载后额外移速 +20% · 持续2秒']),
  ],
  glutton: [
    tome('glutton', 'boss_glutton_radiance', '辉胃', '☀️', '附近有敌人时周期释放胃辉；重咬加速脉冲，不返还猎食点。', ['每4秒：1倍基础攻击 · 半径140', '间隔4 → 3.5秒 · 伤害1 → 1.2倍 · 半径160', '重咬命中：脉冲计时−1秒（每2秒最多一次）']),
    tome('glutton', 'boss_glutton_thorns', '荆棘胃壁', '✹', '受击或捕食护甲挡伤后反震，满级后强化下一次普通咬击。', ['反震0.8倍基础攻击 · 半径120 · 冷却3秒', '反震0.8 → 1.2倍 · 半径120 → 150', '反震后3秒内，下一次普通咬击首击伤害 +30%']),
    tome('glutton', 'boss_glutton_rhythm', '猎食节律', '🦷', '获得猎食点带来短暂普攻加速；满级后下一次重咬起手更快。', ['获得猎食点：咬击攻速 +15% · 持续2秒', '攻速15% → 25% · 持续2 → 3秒', '获得猎食点后，下一次重咬前摇−20%']),
    tome('glutton', 'boss_glutton_jaw', '王猎重颚', '◆', '强化重咬直接伤害，并创造普通咬击追击窗口。', ['重咬直接伤害 +15%', '重咬增伤15% → 25%', '重咬命中后3秒，目标受到普通咬击伤害 +15%']),
  ],
  ricochet: [
    tome('ricochet', 'boss_rico_chamber', '扩容弹仓', '▣', '扩大普通齐射；弹数投资也参与路线主动的压缩伤害。', ['齐射弹数 +1', '额外使普通攻击间隔−8%', '齐射弹数总加成 +1 → +2']),
    tome('ricochet', 'boss_rico_stabilizer', '稳压原核', '◈', '提高单弹质量，满级后强化主弹首次命中。', ['单弹伤害 +12% · 弹速 +10%', '伤害12% → 20% · 弹速10% → 15%', '主弹首次命中伤害额外 +15%']),
    tome('ricochet', 'boss_rico_recharge', '冷凝弹腺', '❄️', '缩短当前空格技能冷却；主动命中可有限治疗。', ['空格冷却−8%', '冷却缩减8% → 15%', '主动命中且受伤时回血1点 · 治疗冷却20秒']),
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
    tome('shadow', 'boss_shadow_cloak', '长夜披风', '🌘', '闪避后的虚化窗口更长，满级后提高撤离速度。', ['闪避虚化0.2 → 0.3秒', '虚化0.3 → 0.4秒', '闪避后额外移速 +20% · 持续2秒']),
  ],
  summoner: [
    tome('summoner', 'boss_pet_unity', '群心契约', '🐾', '增强伙伴普通攻击，并强化每次鼓舞后的首次攻击。', ['伙伴普通攻击伤害 +12%', '伙伴普攻增伤12% → 20%', '每次鼓舞时存活伙伴的首次普攻额外 +40%']),
    tome('summoner', 'boss_pet_command', '疾令契约', '⚑', '加快鼓舞循环，满级后协同伙伴的支援技能。', ['鼓舞冷却−8%', '鼓舞冷却缩减8% → 15%', '成功鼓舞时，伙伴支援技能剩余冷却−2秒']),
    tome('summoner', 'boss_pet_vitality', '生命纽带', '♥', '提高本体生命上限，满级后鼓舞获得短时护盾。', ['本体生命上限 +1（补齐新增生命）', '生命上限总加成 +1 → +2', '鼓舞后护盾1点 · 持续3秒 · 独立冷却12秒']),
    tome('summoner', 'boss_pet_roster', '万灵契约', '♧', '随机招募未拥有的伙伴并培养全队；满员时招募转为一次伙伴治疗。', ['招募1名未拥有伙伴 · 伙伴生命 +10%', '再招募1名 · 伙伴生命总加成10% → 20%', '再招募1名 · 伙伴生命总加成30% · 复苏后2秒承伤−25%']),
  ],
}
export const BOSS_TOME_BY_ID = Object.fromEntries(Object.values(BOSS_TOMES).flat().map(s => [s.id, s]))
export const tomeLevel = (game, id) => Math.max(0, Math.min(3, game?.bossSkillLevels?.[id] || 0))
export const PARTNER_TOME_CHOICES = [
  ['pet_partner', '疾风芽芽'], ['pet_dew_partner', '甘露啵啵'], ['pet_spore_partner', '孢云菇菇'],
]
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
      const candidates = PARTNER_TOME_CHOICES.filter(([id]) => !(game.skillLevels?.[id] > 0))
      const recruit = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
      card.partnerSkillId = recruit?.[0] || null
      card.recruitName = recruit?.[1] || null
      card.stats += recruit ? ` · 本次招募：${recruit[1]}` : ' · 已满员：全体伙伴恢复25%生命'
    }
    cards.push(card)
  }
  return cards
}
