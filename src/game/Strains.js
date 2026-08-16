/**
 * 史莱姆血统：开局先天属性（第三维 build 轴——专精管技能走向，基因管局外成长，
 * 血统管「你这团身体本身是什么」）。每个特化血统都是一强一弱的明确交换，
 * 保证「原生黏液」始终是合理选择；与黑市基因同层叠加（reset 末尾在基因/难度/专精之后应用）。
 */
export const STRAINS = {
  origin: {
    id: 'origin',
    name: '原生黏液',
    icon: '🫧',
    desc: '无修正的原始形态。',
  },
  stone: {
    id: 'stone',
    name: '岩壳血统',
    icon: '🪨',
    desc: '生命 +3，移速 −12%。',
    maxHp: 3,
    speedMul: 0.88,
    tint: 'rgba(148, 168, 190, 0.30)',
    deco: 'stone',
  },
  volt: {
    id: 'volt',
    name: '电光血统',
    icon: '⚡',
    desc: '移速 +15%，生命 −2。',
    maxHp: -2,
    speedMul: 1.15,
    tint: 'rgba(120, 224, 255, 0.26)',
    deco: 'volt',
  },
  glutton: {
    id: 'glutton',
    name: '贪噬血统',
    icon: '🍽️',
    desc: '吞噬范围 +35% · 吞噬线 +4%，攻击 −15%。',
    devourRadius: 1.35,
    devourBonus: 0.04,
    damageMul: 0.85,
    tint: 'rgba(150, 232, 120, 0.26)',
    deco: 'glutton',
  },
}

export const STRAIN_IDS = ['origin', 'stone', 'volt', 'glutton']

/**
 * 应用血统修正（引擎 reset 末尾调用，叠加在基因与难度加成之上）：
 * 速度取整防浮点漂移；生命修正在改 maxHp 后回满（开局语义）；
 * 攻击乘在武器基础伤害上，后续成长性升级自然叠加。
 */
export function applyStrain(engine, id) {
  const strain = STRAINS[id] || STRAINS.origin
  const p = engine.player
  p.strainId = strain.id
  p.strainTint = strain.tint || null
  p.strainDeco = strain.deco || null
  p.strainDevourRadius = strain.devourRadius || 1
  engine.strainDevourBonus = strain.devourBonus || 0
  if (strain.maxHp) p.maxHp = Math.max(1, p.maxHp + strain.maxHp)
  if (strain.speedMul) p.speed = Math.round(p.speed * strain.speedMul)
  if (strain.damageMul) engine.weaponSystem.damage *= strain.damageMul
  p.hp = p.maxHp
}
