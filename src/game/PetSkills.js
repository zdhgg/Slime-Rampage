export const PET_SPEC_INFO = {
  key: 'symbiosis', name: '共生契约', icon: '🐾', color: '#edc479',
  desc: '长期伙伴 · 牵制护卫 · 定向协同', bonus: '伙伴伤害 +20%', subBonus: '',
  roadmap: ['T1：兽灵共鸣／坚韧伙伴／默契步调', 'T2：疾风伙伴（第二只宠物）／迅速复苏', 'T3：协同猎令', '终极：双生守望'],
}
const skill = (id, name, tier, maxLevel, desc, stats, requires = []) => ({
  id, name, spec: 'symbiosis', requiresStrain: 'summoner', icon: '🐾', tier, maxLevel, desc, stats,
  requires, tags: ['共生', `T${tier}`], apply(game) { game.weaponSystem.petCombat.sync() },
})
export const PET_SKILLS = {
  primary: [
    skill('pet_power', '兽灵共鸣', 1, 3, '提高宠物普通攻击与协同攻击伤害', lv => `宠物伤害 +${(lv + 1) * 20}%`),
    skill('pet_vitality', '坚韧伙伴', 1, 3, '提高宠物生命上限，存活宠物补齐新增生命', lv => `宠物生命 +${(lv + 1) * 3}`),
    skill('pet_haste', '默契步调', 1, 3, '提高宠物攻击速度', lv => `宠物攻速 +${(lv + 1) * 12}%`),
    skill('pet_partner', '疾风伙伴', 2, 1, '召唤长期伙伴疾风芽芽，优先追击法师与弓手；最多两只宠物', '获得疾风芽芽 · 双伙伴', ['pet_power', 'pet_vitality', 'pet_haste']),
    skill('pet_recovery', '迅速复苏', 2, 3, '缩短宠物倒地后的恢复时间', lv => `恢复时间 ${7 - lv} 秒`, ['pet_vitality', 'pet_haste']),
    skill('pet_command', '协同猎令', 3, 3, '提高空格指令的特殊攻击伤害', lv => `协同伤害 +${(lv + 1) * 20}%`, ['pet_partner']),
    { ...skill('pet_capstone', '🌟 双生守望', 4, 1, '两只伙伴均存活时，宠物伤害额外提高 30%', '双伙伴存活 · 宠物伤害 ×1.3', ['pet_command']), isCapstone: true },
  ], secondary: [],
}
export const PET_BOSS_SKILLS = [
  { id: 'boss_pet_vitality', spec: 'symbiosis', name: '生命纽带', icon: '🐾', color: '#edc479', tier: 5, isBossSkill: true,
    desc: '本体生命上限 +2，恢复 2 点生命', stats: '生命上限 +2', tags: ['BOSS秘典', '共生'],
    apply(game) { game.player.maxHp += 2; game.player.hp = Math.min(game.player.maxHp, game.player.hp + 2) } },
  { id: 'boss_pet_command', spec: 'symbiosis', name: '疾令契约', icon: '🐾', color: '#edc479', tier: 5, isBossSkill: true,
    desc: '协同狩猎冷却缩短 20%', stats: '主动冷却 ×0.8', tags: ['BOSS秘典', '共生'],
    apply(game) { game.player.activeSkillCdMultiplier *= 0.8 } },
]
