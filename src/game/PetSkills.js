import { BOSS_TOMES } from './BossTomes.js'
import { PET_ROSTER, PET_PARTNER_TYPES, PET_PARTNER_SKILLS } from './PetRoster.js'

export { PET_PARTNER_TYPES, PET_PARTNER_SKILLS }

export const PET_RALLY_BASE = { duration: 5, cooldown: 9.5, damage: 0.3, haste: 0.4, move: 0.35 }

export function getPetRally(level = 0) {
  const lv = Math.max(0, level)
  return {
    ...PET_RALLY_BASE,
    duration: PET_RALLY_BASE.duration + Math.min(3, lv) * 0.8 + Math.max(0, lv - 3) * 0.45,
    damage: PET_RALLY_BASE.damage + Math.min(3, lv) * 0.12 + Math.max(0, lv - 3) * 0.06,
  }
}

// 伙伴三维 T1：前 3 级保持强反馈，之后递减；供卡片展示与战斗结算共用。
export const petPowerBonus = lv => Math.min(3, Math.max(0, lv)) * 0.2 + Math.max(0, lv - 3) * 0.12
export const petVitalityBonus = lv => Math.min(3, Math.max(0, lv)) * 3 + Math.max(0, lv - 3) * 2
export const petHasteBonus = lv => Math.min(3, Math.max(0, lv)) * 0.12 + Math.max(0, lv - 3) * 0.08

export const PET_SPEC_INFO = {
  key: 'symbiosis',
  name: '共生契约',
  icon: '🐾',
  color: '#edc479',
  desc: '8 选 4 小队选秀 · 猎人三极路线 · 人宠协同爆发',
  bonus: '伙伴伤害 +10% · 本体普攻附着【猎手印记】',
  subBonus: '🥈 副专精共鸣：解锁【残响伙伴(弱化护卫投影)】与【兽灵回响(伙伴强化)】',
  roadmap: [
    '探索：随等级阶梯开启 8 选 4 伙伴选秀，解锁本体猎人战术技与三极路线入口',
    '确认：第 6 波／远征第 3 章后锁定【万兽统领 / 借灵游侠 / 双生协奏】之一',
    '深潜：按路线激活对应太空主动进化、伙伴专属觉醒与小队羁绊',
    '🌟 终极：万兽天灾 / 苍穹猎星 / 永恒星阵（三选一互斥）',
  ],
}

const skill = (id, name, tier, maxLevel, desc, stats, requires = [], extra = {}) => ({
  id,
  name,
  spec: 'symbiosis',
  requiresStrain: 'summoner',
  icon: '🐾',
  tier,
  maxLevel,
  desc,
  stats,
  growthClass: tier === 1 && maxLevel > 1 ? 'core' : undefined,
  requires,
  tags: ['共生', `T${tier}`],
  apply(game) {
    game.weaponSystem.petCombat.sync()
  },
  ...extra,
})

const partnerCard = entry => ({
  ...skill(
    entry.partnerSkillId,
    entry.name,
    2,
    1,
    `${entry.attackDesc}；特技【${entry.specialName}】：${entry.specialDesc}`,
    `职能：${entry.roleLabel} · 鼓舞爆发：${entry.rallyDesc}`,
    [],
    {
      icon: entry.icon,
      color: entry.color,
      isPartnerChoice: true,
      discreteUnlock: true,
      partnerType: entry.id,
      partnerSkillId: entry.partnerSkillId,
      role: entry.role,
      roleLabel: entry.roleLabel,
      attackDesc: entry.attackDesc,
      specialName: entry.specialName,
      specialDesc: entry.specialDesc,
      rallyDesc: entry.rallyDesc,
      rangerInfuseDesc: entry.rangerInfuseDesc,
      tags: ['伙伴选秀', entry.roleLabel],
      apply(game) {
        game.weaponSystem.petCombat.registerPartner(entry.id)
      },
    }
  ),
})

const awakeningCard = entry => ({
  ...skill(
    entry.awakeId,
    entry.awakeName,
    3,
    1,
    entry.awakeDesc,
    `专属觉醒（${entry.name}）· 在场立即生效`,
    entry.starter ? [] : [entry.partnerSkillId],
    {
      icon: entry.icon,
      color: entry.color,
      isPartnerAwakening: true,
      discreteUnlock: true,
      partnerType: entry.id,
      tags: ['伙伴觉醒', entry.name],
    }
  ),
})

export const PET_SKILLS = {
  primary: [
    skill(
      'pet_power',
      '兽灵共鸣',
      1,
      8,
      '提高全体伙伴攻击伤害（借灵游侠路线按 50% 反哺本体伤害，双生协奏按 35% 增益灵链）',
      lv => `伙伴伤害 +${Math.round(petPowerBonus(lv + 1) * 100)}%`
    ),
    skill(
      'pet_vitality',
      '坚韧伙伴',
      1,
      8,
      '提高全体伙伴生命上限并立即补齐差值；4 级后增幅递减',
      lv => `伙伴生命 +${petVitalityBonus(lv + 1)}`
    ),
    skill(
      'pet_haste',
      '默契步调',
      1,
      8,
      '提高全体伙伴攻击速度（借灵游侠路线按 50% 反哺本体攻速）',
      lv => `伙伴攻速 +${Math.round(petHasteBonus(lv + 1) * 100)}%`
    ),
    skill(
      'sym_tactic_weaken',
      '震荡威慑',
      1,
      8,
      '本体自动周期释放猎手威慑声波：减速敌军并压低其攻速、弹速与对伙伴伤害；波及 ≥4 敌时为本体凝聚 1 点灵能护盾',
      lv => {
        const next = lv + 1
        const cd = Math.max(4.5, 7.5 - next * 0.35).toFixed(1)
        const radius = Math.min(292, 180 + next * 14)
        const petDr = Math.min(50, 25 + next * 3)
        return `冷却 ${cd} 秒 · 半径 ${radius}px · 伙伴减伤 ${petDr}% · 敌攻/弹速 −30%`
      },
      [],
      {
        growthClass: 'core',
        icon: '📡',
        tags: ['猎人战术', '削弱护盾'],
        apply(game, lv) {
          game.weaponSystem.petCombat.tacticWeakenLevel = lv
        },
      }
    ),
    skill(
      'pet_recovery',
      '迅速复苏',
      2,
      6,
      '缩短伙伴倒地后的恢复时间（最低 2.5 秒），复苏瞬间自带短暂无敌护佑',
      lv => `恢复时间 ${Math.max(2.5, 8 - (lv + 1)).toFixed(1)} 秒`,
      ['pet_vitality', 'pet_haste']
    ),
    skill(
      'sym_tactic_misdirect',
      '狩猎误导',
      2,
      3,
      '本体自动周期触发误导：将近身非首领敌人强制牵引至前排伙伴，赋予其临时护盾并提高攻速',
      lv => {
        const next = lv + 1
        return `冷却 ${(11 - next * 1.5).toFixed(1)} 秒 · 误导 ${3 + next} 敌 · 伙伴护盾 +${3 + next * 2}`
      },
      [],
      {
        icon: '🎯',
        tags: ['猎人战术', '误导'],
        apply(game, lv) {
          game.weaponSystem.petCombat.tacticMisdirectLevel = lv
        },
      }
    ),
    skill(
      'sym_tactic_mend',
      '灵能愈合',
      2,
      3,
      '本体普攻累计命中自动治疗血量最低的伙伴；全员满血时改为加速倒地复苏或缩短空格冷却',
      lv => {
        const next = lv + 1
        return `每 ${9 - next} 次命中治疗 ${(1.5 + next * 0.5).toFixed(1)} 生命`
      },
      [],
      {
        icon: '💚',
        tags: ['猎人战术', '治疗'],
        apply(game, lv) {
          game.weaponSystem.petCombat.tacticMendLevel = lv
        },
      }
    ),
    skill(
      'pet_command',
      '鼓舞强化',
      2,
      8,
      '延长共生空格技能的增益持续时间，并提高期间的全队攻击力加成',
      lv => {
        const rally = getPetRally(lv + 1)
        return `持续 ${rally.duration.toFixed(1)} 秒 · 攻击力 +${Math.round(rally.damage * 100)}%`
      },
      [],
      { tags: ['共生', '主动强化'] }
    ),
    ...PET_ROSTER.filter(entry => !entry.starter).map(partnerCard),
    ...PET_ROSTER.map(awakeningCard),
  ],
  // 共鸣挂件保留历史数据兼容（不进入共生主池）
  secondary: [
    {
      id: 'sym_sub_echo',
      spec: 'symbiosis',
      name: '残响伙伴',
      icon: '🐚',
      desc: '召唤一只残响团团协同作战：岩甲团团的弱化投影，近战护卫并可周期残响挑衅',
      tags: ['共生共鸣', '伙伴'],
      maxLevel: 2,
      stats(lv) {
        return lv === 0 ? '残响团团 ×1（弱化投影）' : '残响团团生命与伤害 +50%'
      },
      apply(game) {
        game.weaponSystem.petCombat.sync()
      },
    },
    {
      id: 'sym_sub_surge',
      spec: 'symbiosis',
      name: '兽灵回响',
      icon: '🔊',
      desc: '所有在场伙伴（含残响）的攻击伤害与移动速度提升',
      tags: ['共生共鸣', '强化'],
      maxLevel: 2,
      stats(lv) {
        return `伙伴伤害 +${(lv + 1) * 40}% · 伙伴移速 +${(lv + 1) * 15}%`
      },
      apply(game) {
        game.weaponSystem.petCombat.sync()
      },
    },
  ],
}

export const PET_BOSS_SKILLS = BOSS_TOMES.summoner
