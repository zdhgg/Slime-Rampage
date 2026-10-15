// Shared by combat and upgrade descriptions; no display-only balance values.
export const iceSlowAmount = level => level >= 2 ? .55 : .4
export const iceSlowDuration = level => level >= 2 ? 2.5 : 2
export const iceArrowVisualScale = level => 1 + Math.min(3, level) * .1

// 多重冰箭：每轮支数，以及按支数补偿的单支伤害（对齐多重火球的 0.82 递减）。
export const iceArrowCount = level => 1 + Math.min(2, level)
export const iceMultiDamageMul = count => .82 ** (count - 1)
// 扇形按角度展开而非平行偏移：冰箭靠直线穿透，三支箭要覆盖三条不同的线。
export const iceFanAngle = Math.PI / 30
// 分裂冰箭：碎晶数量取等级，伤害按冰箭单次命中的比例结算。
export const iceShardCount = level => Math.min(2, level)
export const iceShardDamageMul = .4
export const iceShardRange = 200
// 冰晶迸裂：三层霜纹触发，普通敌人被冻结，首领只承受迸裂伤害。
export const iceShatterRadius = level => 45 + Math.max(0, level - 1) * 10
export const iceShatterDamageMul = level => .5 + Math.max(0, level - 1) * .2
// 霜纹脆化：霜纹对首领同样生效，这条增伤因此在首领战有效。
export const iceBrittleMul = level => 1 + Math.min(2, level) * .1
