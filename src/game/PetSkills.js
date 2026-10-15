export const PET_RALLY_BASE = { duration: 5, cooldown: 12, damage: 0.3, haste: 0.4, move: 0.35 }
export function getPetRally(level = 0) {
  return { ...PET_RALLY_BASE, duration: PET_RALLY_BASE.duration + level, damage: PET_RALLY_BASE.damage + level * 0.1 }
}

export const PET_SPEC_INFO = {
  key: 'symbiosis', name: '共生契约', icon: '🐾', color: '#edc479',
  desc: '岩甲护卫 · 逐步招募四人小队 · 全队鼓舞', bonus: '伙伴伤害 +20%', subBonus: '',
  roadmap: ['T1：伤害／生命／攻速基础培养', 'T2：升级或 BOSS 秘典招募伙伴，最多四只', 'T3：伙伴专属被动与鼓舞强化', '终极：共生守望'],
}
export const PET_PARTNER_TYPES = { pet_partner: 'hunter', pet_dew_partner: 'dew', pet_spore_partner: 'spore' }
export const PET_PARTNER_SKILLS = Object.keys(PET_PARTNER_TYPES)
const skill = (id, name, tier, maxLevel, desc, stats, requires = []) => ({
  id, name, spec: 'symbiosis', requiresStrain: 'summoner', icon: '🐾', tier, maxLevel, desc, stats,
  requires, tags: ['共生', `T${tier}`], apply(game) { game.weaponSystem.petCombat.sync() },
})
const partner = (id, name, icon, color, desc, stats) => ({
  ...skill(id, name, 2, 1, desc, stats), icon, color, isPartnerChoice: true,
  partnerSkillId: id, tags: ['招募伙伴', '在场 +1'],
})
export const PET_SKILLS = {
  primary: [
    skill('pet_power', '兽灵共鸣', 1, 3, '提高伙伴攻击伤害，可与共生鼓舞叠加', lv => `伙伴伤害 +${(lv + 1) * 20}%`),
    skill('pet_vitality', '坚韧伙伴', 1, 3, '提高宠物生命上限，存活宠物补齐新增生命', lv => `宠物生命 +${(lv + 1) * 3}`),
    skill('pet_haste', '默契步调', 1, 3, '提高宠物攻击速度', lv => `宠物攻速 +${(lv + 1) * 12}%`),
    partner('pet_partner', '疾风伙伴', '🍃', '#8edacb', '召唤疾风芽芽：远程叶刃追击后排；每 14 秒使附近最多 3 名普通敌人攻击力降低 25%，持续 4 秒', '远程叶刃 · 周期减攻'),
    partner('pet_dew_partner', '甘露伙伴', '💧', '#8fd7e8', '召唤甘露啵啵：水滴命中蓄能治疗；每 12 秒自动恢复 1 点生命，优先本体，无人受伤时保留技能', '远程治疗 · 优先本体'),
    partner('pet_spore_partner', '孢云伙伴', '🍄', '#c3a4dc', '召唤孢云菇菇：孢子弹扩散减速；每 16 秒使附近最多 5 名普通敌人移速降低 40%，持续 3 秒，首领与狂暴敌人免疫', '范围控场 · 周期减速'),
    skill('pet_bulwark', '岩甲庇护', 2, 1, '岩甲团团受到的伤害降低 25%', '岩甲团团承伤 −25%', ['pet_vitality']),
    skill('pet_taunt', '岩甲坚守', 2, 1, '强化岩甲挑衅：冷却由 20 秒缩短至 16 秒，最多嘲讽 5 名普通敌人，持续 3 秒；首领免疫', '嘲讽冷却 16 秒 · 最多 5 名', ['pet_vitality']),
    skill('pet_recovery', '迅速复苏', 2, 3, '缩短宠物倒地后的恢复时间', lv => `恢复时间 ${7 - lv} 秒`, ['pet_vitality', 'pet_haste']),
    { ...skill('pet_volley', '疾风连射', 3, 1, '疾风芽芽每第三次远程攻击追加一枚 55% 伤害的叶刃', '每 3 次射击追加叶刃', ['pet_partner']), icon: '🍃' },
    { ...skill('pet_wind_guard', '柔风护佑', 3, 1, '柔风抑敌的攻击力降低效果由 25% 提高至 35%，持续时间由 4 秒延长至 5 秒', '敌人攻击力 −35% · 持续 5 秒', ['pet_partner']), icon: '🍃' },
    { ...skill('pet_dew_spring', '甘露泉涌', 3, 1, '命中蓄能治疗由每 5 次缩短至每 3 次；甘露回春的自动治疗冷却由 12 秒缩短至 9 秒', '蓄能 3 次 · 回春冷却 9 秒', ['pet_dew_partner']), icon: '💧' },
    { ...skill('pet_spore_bloom', '孢云绽放', 3, 1, '孢子扩散与缓行范围 +30；命中减速延长至 1.3 秒，周期缓行延长至 4.5 秒', '范围 +30 · 缓行持续 4.5 秒', ['pet_spore_partner']), icon: '🍄' },
    skill('pet_command', '鼓舞强化', 3, 3, '延长共生鼓舞持续时间，提高鼓舞期间的攻击力加成', lv => {
      const rally = getPetRally(lv + 1)
      return `鼓舞 ${rally.duration} 秒 · 攻击力 +${Math.round(rally.damage * 100)}%`
    }, PET_PARTNER_SKILLS),
    { ...skill('pet_capstone', '🌟 共生守望', 4, 1, '至少两只伙伴存活时，全体伙伴伤害额外提高 30%', '两只以上存活 · 全体伤害 ×1.3', ['pet_command']), isCapstone: true },
  ], secondary: [],
}
export const PET_BOSS_SKILLS = [
  ...PET_SKILLS.primary.filter(s => s.isPartnerChoice).map(s => ({
    ...s, id: `boss_${s.id}`, name: `${s.name}契约`, tier: 5, isBossSkill: true,
    tags: ['BOSS契约', '在场 +1'],
    apply(game) {
      game.skillLevels[s.id] = Math.max(1, game.skillLevels[s.id] || 0)
      game.weaponSystem.petCombat.sync()
    },
  })),
  { id: 'boss_pet_vitality', spec: 'symbiosis', name: '生命纽带', icon: '🐾', color: '#edc479', tier: 5, isBossSkill: true,
    desc: '本体生命上限 +2，恢复 2 点生命', stats: '生命上限 +2', tags: ['BOSS秘典', '共生'],
    apply(game) { game.player.maxHp += 2; game.player.hp = Math.min(game.player.maxHp, game.player.hp + 2) } },
  { id: 'boss_pet_command', spec: 'symbiosis', name: '疾令契约', icon: '🐾', color: '#edc479', tier: 5, isBossSkill: true,
    desc: '共生鼓舞冷却缩短 20%', stats: '鼓舞冷却 ×0.8', tags: ['BOSS秘典', '共生'],
    apply(game) { game.player.activeSkillCdMultiplier *= 0.8 } },
]
