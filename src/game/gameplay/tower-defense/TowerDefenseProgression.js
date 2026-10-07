// Campaign lessons gate both the simulation and its UI. Replays keep the same rules.
export const CAMPAIGN_FEATURE_UNLOCKS = Object.freeze({
  branches: 4, sporeTrap: 6, leylines: 8, level4: 11,
  clearing: 22, targeting: 14, relocation: 24, geyserTrap: 18, crystalTrap: 29,
})

const LESSONS = [
  ['扩建防线', '先建一座熟悉攻击，波间补到两至三座守卫，覆盖前后两段道路；极寒可配合强酸减速。'],
  ['巩固防线', '沿用两种守卫，多一个塔位；试着把火力分布在前后两段。'],
  ['范围清场', '新守卫熔岩擅长范围攻击；后两波会出现少量群袭敌人。'],
  ['选择专精', '二级守卫可选择一个方向升至三级，先试熟悉建筑的新分支。'],
  ['首次小首领', '用已学会的范围火力清理裂殖先锋的幼体，守住最后一波。'],
  ['使用战术机关', '新路线开放毒孢子大蘑菇；敌人经过附近时点击引爆。'],
  ['连锁与结界', '雷鸣加入防线；第三波起尝试用连锁火力处理结界编队。'],
  ['地脉共鸣', '将强酸放在毒沼、极寒放在冰隙，观察契合地脉带来的加成。'],
  ['腐蚀与重装', '腐蚀孢子巢可以削甲；第三波开始出现少量重装，练习配合输出。'],
  ['重甲小首领', '用腐蚀或穿甲专精迎战重甲队长，复习前几关的配合。'],
  ['四级进化', '守卫现在可以升至四级；在补充塔位与强化主力之间分配养分。'],
  ['虚空守卫', '尝试虚空的牵引控制与破盾专精，处理混合编队。'],
  ['抑制再生', '再生者出现时，用腐蚀抑制回复，再配合主力火力。'],
  ['优先处理支援', '选中守卫切换索敌策略，用支援优先集中处理新出现的祷告者。'],
  ['护卫小首领', '先解决菌甲督军的随行治疗者，再集中火力击败督军。'],
  ['分段清理裂殖', '裂殖者倒下后会留下幼体；保留后段范围火力，完成第二次清场。'],
  ['光环协作', '炽阳加入防线；尝试震慑或邻塔攻速支援。'],
  ['定身机关', '高压黏液泉开放；在关键敌人经过时点击，将其留在火力范围内。'],
  ['首领前整备', '复习削甲、范围火力与定身机关，补齐防线短板，准备章节首领战。'],
  ['章节综合挑战', '综合运用已学会的守卫、专精与机关，击败章节首领。'],
]

const ADVANCED_LESSONS = {
  21: ['霜原跃袭', '先观察跃袭者的冲刺节奏，在后段保留拦截火力。'],
  22: ['开垦优势塔位', '支付养分打开封印塔位，比较扩建位置与升级主力的收益。'],
  24: ['弹跳换位', '守卫可以跳到空闲塔位；先练习把熟悉的火力调往道路后段。'],
  26: ['缠绕拦截', '荆棘缚足巢可以截停跃袭先锋，让输出守卫获得更多攻击时间。'],
  28: ['处理补盾护卫', '先观察晶盾护卫为邻军补盾；用打断或虚空火力突破护盾。'],
  29: ['母巢超载', '母巢晶石开放；等熟悉的敌军进入火力区，再强化全场攻速。'],
  34: ['分散应对压制', '电磁部队会短暂瘫痪附近守卫；分散火力，并用打断争取时间。'],
  46: ['贯穿阵线', '晶矛可以贯穿一列敌军；沿道路选择射线，用其他守卫保护近身盲区。'],
  61: ['观测与集火', '共鸣观测塔会标记弱点并显露隐匿敌人，先用熟悉编队练习协作。'],
  63: ['显露潜行者', '潜行者需要近身或观测才会显露；在主要火力区安排侦测。'],
  81: ['拦截压制机甲', '先观察机甲脉冲，安排分散的穿甲与打断火力，再处理混合精锐。'],
}

export function getCampaignProgression(stageId, { endless = false } = {}) {
  const features = Object.fromEntries(Object.entries(CAMPAIGN_FEATURE_UNLOCKS)
    .map(([id, stage]) => [id, endless || stageId >= stage]))
  const lesson = !endless && (LESSONS[stageId - 1] || ADVANCED_LESSONS[stageId])
  return {
    ...features,
    maxTowerLevel: features.level4 ? 4 : features.branches ? 3 : 2,
    lesson: lesson ? { name: lesson[0], hint: lesson[1] } : null,
    // Advanced saves retain their collection, but cannot skip early campaign lessons.
    restrictTowerRoster: !endless && stageId <= LESSONS.length,
  }
}
