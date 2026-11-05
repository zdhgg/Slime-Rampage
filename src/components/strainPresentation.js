import { STRAINS } from '../game/Strains.js'
import { SLIME_FAMILY_ART } from '../game/SlimeFamilyArt.js'

// Presentation only. Numeric traits continue to come from the combat definitions.
export const STRAIN_PRESENTATION = {
  summoner: {
    ...SLIME_FAMILY_ART.summoner,
    label: '共生小队', epithet: '与你并肩的每一次成长',
    intro: '随机招募伙伴并探索追猎、孢潮、守望三条路线；第 6 波／远征第 3 章后确认方向。空格鼓舞全队，提高伙伴的攻击力、攻速与移速。',
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
    label: '随机弹道', epithet: '在随机中生长的弹幕',
    intro: '前期随机混搭分裂、贯穿与折射，中期根据已有入口确认路线。路线锁定后继续抽取进阶与混搭，后期有机会获得互斥终极，替换空格疾射。',
  },
  elemental: {
    ...SLIME_FAMILY_ART.elemental,
    label: '万象法师', epithet: '在体内孕育四系法术',
    intro: '以原质飞弹起步，局内随机掌握四系法术，可走单系极化、双系融合或多系轮转；中期确认路线后追寻互斥终极。自带破盾后自动重建的法术护盾。',
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
      { label: '法术配置', value: '三路线构筑' },
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
