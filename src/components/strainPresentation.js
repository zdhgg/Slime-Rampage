import { STRAINS } from '../game/Strains.js'
import { SLIME_FAMILY_ART } from '../game/SlimeFamilyArt.js'

// Presentation only. Numeric traits continue to come from the combat definitions.
export const STRAIN_PRESENTATION = {
  summoner: {
    ...SLIME_FAMILY_ART.summoner,
    label: '共生小队', epithet: '与你并肩的每一次成长',
    intro: '团团嘲讽、疾风减攻、孢云减速、甘露治疗，逐只招募伙伴保护本体。空格鼓舞全队，提高伙伴的攻击力、攻速与移速。',
  },
  origin: {
    ...SLIME_FAMILY_ART.origin,
    label: '祖细胞拟态', epithet: '一切进化的起点',
    intro: '未分化的原始形态。Lv.5 拟态任意一条血统的独占机制——吞噬、伙伴、弹幕、元素或暗影，由你写下进化方向。',
  },
  glutton: {
    ...SLIME_FAMILY_ART.glutton,
    label: '近身吞噬', epithet: '永不满足的猎食者',
    intro: '贴近猎物，咬击吞噬。以捕食积累猎食点，用重咬撕开包围，获得短时护甲。',
  },
  ricochet: {
    ...SLIME_FAMILY_ART.ricochet,
    label: '多弹齐射', epithet: '弹幕中的精确回响',
    intro: '让更多、更快的飞弹铺开火力，用连续齐射压制敌人，并借短时加速拉开距离。',
  },
  elemental: {
    ...SLIME_FAMILY_ART.elemental,
    label: '双元素法师', epithet: '在体内孕育融合的法术',
    intro: '以原质飞弹起步，局内逐步掌握两系自动法术，空格释放融合爆发。自带破盾后自动重建的法术护盾。',
  },
  shadow: {
    ...SLIME_FAMILY_ART.shadow,
    label: '暴击分身', epithet: '虚实之间的围猎者',
    intro: '闪避后短暂虚化，暴击凝出分身诱敌挡弹。学习影袭留身后，空格空放也能留下分身自保，命中可指挥群影夹击。',
  },
}

const percent = (value) => Math.round(value * 100)

export function strainTraits(id) {
  const strain = STRAINS[id] || STRAINS.origin
  switch (strain.id) {
    case 'summoner': return [
      { label: '初始伙伴', value: '岩甲团团' },
      { label: '伙伴上限', value: '4 只' },
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
      { label: '法术配置', value: '双元素融合' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    case 'shadow': return [
      { label: '暴击率', value: `+${percent(strain.critChance)}%` },
      { label: '闪避率', value: '15%' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    default: return [
      { label: 'Lv.5 拟态', value: '五系任选' },
      { label: 'Lv.9 独占', value: '副专精共鸣' },
      { label: '专属主动', value: '黏液震荡' },
    ]
  }
}
