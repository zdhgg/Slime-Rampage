/**
 * 强招几何单一真源：预警绘制与命中结算读同一份数值，禁止各算一遍。
 *
 * 背景：此前箭雨绘制用 count=(phase2?11:9)+pb、spread=((count-1)/2)*0.12+0.06，
 * 实际弹道却用 count=(phase2?8:6)+pb+chain*2、step=max(0.16,0.22-chain*0.02)——
 * 困难/地狱三连段时实际比画宽约 50%；冲锋预警矩形固定 dashDistance=273px，
 * 连段实际要走到 speed*(0.42+chain*0.06)，二阶段第 2 段是 508px（+59%）。
 * 画与打分离的直接后果：玩家学会「别信地面标记、提前把距离拉满」，
 * 于是三名首领被压回同一个打法。所有几何只能从这里取。
 */

const TAU = Math.PI * 2

/** 预警时长（秒）：只随连段递增，不随难度缩短，守住公平底线。 */
export function telegraphSeconds(pattern, chain = 0) {
  const base = pattern === 'boss-mage' ? 0.95 : pattern === 'boss-archer' ? 0.78 : 0.72
  return base + (chain > 0 ? chain * 0.22 : 0)
}

/**
 * 王者冲锋：距离 = 冲锋速度 × 滞空时间，连段同时抬速与抬时。
 * 世界边缘会被 boss 位置夹取截短，因此实走 ≤ 画出的长度（安全方向），
 * 不会出现「画短了、打长了」。
 */
export function knightDash(phase, chain = 0, laneRadius = 0) {
  const speed = (phase === 2 ? 760 : 650) + chain * 90
  const duration = 0.42 + chain * 0.06
  return { speed, duration, distance: speed * duration, halfWidth: laneRadius }
}

/**
 * 王庭齐射（普攻）：弹数与相邻角间隔。强招已改为「三判」，扇形只用于日常压制，
 * 但同样只能从这里取数，避免以后又出现「画的比打的多」。
 */
export function archerFan(phase, chain = 0, patternBonus = 0) {
  const count = (phase === 2 ? 7 : 5) + patternBonus
  const step = 0.22
  return { count, step, spread: ((count - 1) / 2) * step, reach: 390, speed: 470 }
}

/** 奥术环爆：圆半径与环射弹数/初速（圆本来就是同一份数值，一并收口）。 */
export function mageBurst(phase, chain = 0, patternBonus = 0) {
  const count = (phase === 2 ? 16 : 12) + patternBonus * 2 + chain * 4
  const bulletSpeed = (phase === 2 ? 315 : 285) + chain * 20
  return { radius: 102, count, bulletSpeed, arc: TAU }
}

/**
 * 王庭三判：按玩家此刻的速度外推「0 / 0.8 / 1.6s 后的位置」，三个落点同时开火。
 * 站桩 → 三点叠在自己脚下；直线跑 → 撞上第二点；只有改变方向才三点全空。
 * 落点在预警开始时就冻结（不追着玩家滑动），所以它是一条「他以为你会这么跑」的
 * 假路线，而不是无法躲避的追踪弹。
 */
export function archerTribunal(px, py, vx, vy, { leads = [0, 0.8, 1.6], radius = 52 } = {}) {
  return {
    radius,
    leads: [...leads],
    points: leads.map((t) => ({ x: px + vx * t, y: py + vy * t, t })),
  }
}

/**
 * 一次强招的完整几何快照：telegraph 开始生成并冻结，execute 时读取。
 * 冲锋的半宽也进快照——狂暴期体型变化不再让「已画好的道」和「正在算的命中」错位。
 */
export function bossSpecialGeometry({ pattern, phase = 1, chain = 0, patternBonus = 0, laneRadius = 0 }) {
  const geo = { pattern, phase, chain, telegraph: telegraphSeconds(pattern, chain) }
  if (pattern === 'boss-knight') geo.lane = knightDash(phase, chain, laneRadius)
  else if (pattern === 'boss-mage') geo.burst = mageBurst(phase, chain, patternBonus)
  else geo.judgement = { leads: [0, 0.8, 1.6], radius: 52 }
  return Object.freeze(geo)
}
