// Shared by combat and upgrade descriptions; no display-only balance values.
// 多重火球：每轮支数不变，伤害按支数补偿（与战斗中的实际乘算同源）。
export const fireMultiDamageMul = count => .82 ** (count - 1)
// 炽燃：对燃烧中的目标提高火焰伤害，燃烧对首领同样生效。
export const fireBrittleMul = level => 1 + Math.min(2, level) * .1
// 余烬蔓延：点燃后延迟传播给近邻，只传一代，后代继承每跳灼烧的一部分。
export const burnSpreadRange = level => 90 + Math.min(3, level) * 20
export const burnSpreadTargets = level => level >= 3 ? 2 : 1
export const burnSpreadDuration = 2
export const burnSpreadInherit = .7
export const burnSpreadDelay = .6
