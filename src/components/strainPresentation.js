import { STRAINS } from '../game/Strains.js'
import { SLIME_PALETTES } from '../game/SlimeAppearance.js'

// Presentation only. Numeric traits continue to come from the combat definitions.
export const STRAIN_PRESENTATION = {
  summoner: {
    ...SLIME_PALETTES.summoner,
    label: '双生伙伴', epithet: '与你并肩的每一次成长',
    intro: '岩甲团团守住身旁，疾风芽芽追猎后排。培养长期伙伴，用协同狩猎改变战局。',
    awakening: 'Lv.5 自动觉醒共生契约',
  },
  origin: {
    ...SLIME_PALETTES.origin,
    label: '自由构筑', epithet: '一切进化的起点',
    intro: '用黏液震荡推开近敌，让每一次选择决定你的进化方向。',
    awakening: 'Lv.5 自由选择主专精',
  },
  glutton: {
    ...SLIME_PALETTES.glutton,
    label: '近身吞噬', epithet: '永不满足的猎食者',
    intro: '贴近猎物，咬击吞噬。以捕食积累猎食点，用重咬撕开包围，获得短时护甲。',
    awakening: 'Lv.5 自动觉醒暴食专精',
  },
  ricochet: {
    ...SLIME_PALETTES.ricochet,
    label: '多弹齐射', epithet: '弹幕中的精确回响',
    intro: '让更多、更快的飞弹铺开火力，用连续齐射压制敌人，并借短时加速拉开距离。',
    awakening: 'Lv.5 自动觉醒弹射专精',
  },
  elemental: {
    ...SLIME_PALETTES.elemental,
    label: '元素反应', epithet: '不稳定的原质之心',
    intro: '将元素汇聚于体内，用近身冲击击退并减速敌人，为元素反应争取空间。',
    awakening: 'Lv.5 自动觉醒元素专精',
  },
  shadow: {
    ...SLIME_PALETTES.shadow,
    label: '暴击分身', epithet: '虚实之间的围猎者',
    intro: '闪避后短暂虚化，暴击凝出分身诱敌挡弹。学习影袭留身后，空格空放也能留下分身自保，命中可指挥群影夹击。',
    awakening: 'Lv.5 自动觉醒暗影专精',
  },
}

const percent = (value) => Math.round(value * 100)

export function strainTraits(id) {
  const strain = STRAINS[id] || STRAINS.origin
  switch (strain.id) {
    case 'summoner': return [
      { label: '初始伙伴', value: '岩甲团团' },
      { label: '宠物上限', value: '2 只' },
      { label: '本体伤害', value: '−45%', cost: true },
    ]
    case 'glutton': return [
      { label: '生命上限', value: `+${strain.maxHp}` },
      { label: '吞噬范围', value: `+${percent(strain.devourRadius - 1)}%` },
      { label: '攻击方式', value: '近战咬击' },
    ]
    case 'ricochet': return [
      { label: '齐射飞弹', value: `+${strain.projectileCount}` },
      { label: '飞弹速度', value: `+${percent(strain.projectileSpeedMul - 1)}%` },
      { label: '开火间隔', value: `×${strain.fireIntervalMul}`, cost: true },
    ]
    case 'elemental': return [
      { label: '暴击率', value: `+${percent(strain.critChance)}%` },
      { label: '战斗核心', value: '元素反应' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    case 'shadow': return [
      { label: '暴击率', value: `+${percent(strain.critChance)}%` },
      { label: '闪避率', value: '15%' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    default: return [
      { label: '初期技能', value: '三系开放' },
      { label: 'Lv.5 觉醒', value: '自由选择' },
      { label: '专属主动', value: '黏液震荡' },
    ]
  }
}
