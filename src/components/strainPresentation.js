import { STRAINS } from '../game/Strains.js'
import { SLIME_FAMILY_ART } from '../game/SlimeFamilyArt.js'

// Presentation only. Numeric traits continue to come from the combat definitions.
export const STRAIN_PRESENTATION = {
  summoner: {
    ...SLIME_FAMILY_ART.summoner,
    label: '共生小队', epithet: '与你并肩的每一次成长',
    intro: '前期按等级阶梯 8 选 4 组建共生小队，掌握威慑/误导/愈合猎人战术；第 6 波／远征第 3 章后从【万兽统领 / 借灵游侠 / 双生协奏】三极方向择一锁定。空格释放【共生鼓舞】震退近敌并同步全队爆发。',
  },
  origin: {
    ...SLIME_FAMILY_ART.origin,
    label: '液态变异', epithet: '没有固定形态，只有适应',
    intro: '用固定主技能与随机协同组成超载连招，吸收稀有元素核心改造技能。升级时可发现原生能力，击败首领可吸收源质；Lv.5 确立路线，Lv.9 选择印记。空格震荡控场并催化充能，超载自动释放。',
  },
  glutton: {
    ...SLIME_FAMILY_ART.glutton,
    label: '重装吞噬', epithet: '愈战愈厚的活体腐渊',
    intro: '自带贴身腐蚀光环与可破防反震胃铠，主动释放「深渊吸噬」聚怪重咬并压入吞噬线；吞噬积累饱食度自动爆发酸浪与生命续航。',
  },
  ricochet: {
    ...SLIME_FAMILY_ART.ricochet,
    label: '随机弹道', epithet: '在随机中生长的弹幕',
    intro: '前期随机混搭分裂、贯穿与折射，中期根据已有入口确认路线。路线锁定后继续抽取进阶与混搭，后期有机会获得互斥终极，替换空格疾射。',
  },
  elemental: {
    ...SLIME_FAMILY_ART.elemental,
    label: '四系法师', epithet: '执掌火冰雷毒的奥法化身',
    intro: 'Lv.2 四选一确定火／冰／电／毒主系专精与专属护盾，主系强化同时解锁至多 2 门他系基础法术兼修（火法也能放寒冰箭）；第 6 波／远征第 3 章进行专精分支升华并冲击互斥终极奥义。',
  },
  shadow: {
    ...SLIME_FAMILY_ART.shadow,
    label: '暴击分身', epithet: '虚实织盾的围猎者',
    intro: '高机动近战刺客：基础移速提升且落地 2 秒疾行；普攻每 3 刀斩出影波且可刀光破箭；闪避虚化，未闪避物理攻击由【影刃格挡】−1 伤震退，法术由【影织魔盾】专防；场上有分身时可触发【替身移影】致命换位保命；空格 影袭天生留影破弹。',
  },
}

const percent = (value) => Math.round(value * 100)

export function strainTraits(id) {
  const strain = STRAINS[id] || STRAINS.origin
  switch (strain.id) {
    case 'summoner': return [
      { label: '初始 / 上限', value: '岩甲团团 · 8 选 4' },
      { label: '猎人协同', value: '威慑·误导·愈合' },
      { label: '本体基础伤', value: '−28%', cost: true },
    ]
    case 'glutton': return [
      { label: '生命上限', value: `+${strain.maxHp}` },
      { label: '近战光环', value: '腐蚀+反伤' },
      { label: '吞噬范围', value: `+${percent(strain.devourRadius - 1)}%` },
    ]
    case 'ricochet': return [
      { label: '齐射飞弹', value: `+${strain.projectileCount}` },
      { label: '飞弹速度', value: `+${percent(strain.projectileSpeedMul - 1)}%` },
      { label: '开火间隔', value: `×${strain.fireIntervalMul}`, cost: true },
    ]
    case 'elemental': return [
      { label: '暴击率', value: `+${percent(strain.critChance)}%` },
      { label: '专精构筑', value: '四系＋兼修' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    case 'shadow': return [
      { label: '暴击率', value: `+${percent(strain.critChance)}%` },
      { label: '基础移速', value: `+${percent((strain.speedMul || 1) - 1)}%` },
      { label: '闪避 / 格挡', value: '18% / 1 层' },
      { label: '法术护盾', value: '1 层' },
      { label: '生命上限', value: String(strain.maxHp).replace('-', '−'), cost: true },
    ]
    default: return [
      { label: 'Lv.5 原生路线', value: '三选一' },
      { label: 'Lv.9 异源印记', value: '五选一' },
      { label: '专属主动', value: '黏液震荡' },
    ]
  }
}
