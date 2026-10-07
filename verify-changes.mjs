// 本轮改动验证脚本（输入挂起 / 局内觉醒 / 分裂继承 / 冲撞附魔）。运行：node verify-changes.mjs
import assert from 'node:assert/strict'

const gradient = { addColorStop() {} }
const ctx2d = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      return () => {}
    },
    set() {
      return true
    },
  }
)
const canvasStub = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  getContext: () => ctx2d,
}
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
globalThis.document = {
  createElement: () => canvasStub,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const { GameEngine } = await import('./src/game/GameEngine.js')
const { Enemy } = await import('./src/game/entities/Enemy.js')
const { Projectile } = await import('./src/game/entities/Projectile.js')
const { SKILL_DATABASE, rollSkills } = await import('./src/game/SkillPool.js')

const engine = GameEngine.create(canvasStub)
for (const k of ['onStats', 'onLevelUp', 'onGameOver', 'onBossSpawn', 'onWaveChanged', 'onEvolution']) {
  engine[k] = () => {}
}
let n = 0
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`)

// —— 1. 输入挂起：暂停期间按键不入队，恢复后无幽灵操作 ——
assert.equal(engine.input.suspended, true, '构造后（未开局）应处于挂起态')
const evSpace = { code: 'Space', repeat: false, preventDefault() { this.prevented = true } }
engine.input._onKeyDown(evSpace)
assert.equal(engine.input._feverQueued, false, '挂态按下 Space 不应入队')
assert.equal(evSpace.prevented, undefined, '挂态不应 preventDefault（放行给 UI 按钮）')
engine.reset()
engine.start()
assert.equal(engine.input.suspended, false, 'start 后应接管键盘')
engine.input._onKeyDown(evSpace)
assert.equal(engine.input._feverQueued, true)
engine.pause()
assert.equal(engine.input.suspended, true, '暂停后应挂起')
assert.equal(engine.input._feverQueued, false, '暂停应清空队列（无幽灵冲刺）')
engine.resume()
ok('输入挂起：UI 期间不劫持 Space、恢复后无幽灵操作')

// —— 2. 主专精只在局内觉醒（origin 路径）：开局无专精，Lv.5 三系陈列且不附赠 T1 ——
// 第四批：origin 无 canDevour，暴食主树已从候选池排除（见下方 2b 与第 3 组）
assert.equal(engine.primarySpec, null)
assert.equal(engine.weaponSystem.projectileCount, 1, '开局保持基础单弹')
assert.equal(typeof engine.applyStartingSpec, 'undefined', '引擎不再暴露开局预选通道')
engine.player.level = 5
engine.player.exp = 0
engine.player.maxExp = 1
let options = rollSkills(engine, 3)
assert.equal(options.length, 3, 'Lv.5 展示三个可选主专精（暴食已排除）')
assert.ok(options.every((o) => o.isMilestone && o.milestoneType === 'primary'))
assert.ok(!options.some((o) => o.spec === 'gluttony'), 'origin 不得选择暴食主专精')
engine.applySkill(options.find((o) => o.spec === 'gatling'))
assert.equal(engine.primarySpec, 'gatling')
assert.equal(engine.weaponSystem.projectileCount, 2, '机枪觉醒只应用专精赋能，不附赠 T1')
assert.ok(Math.abs(engine.weaponSystem.fireInterval - 0.85) < 1e-9)
assert.equal(engine.skillLevels['gat_multishot'] || 0, 0, '局内觉醒不白送 T1')

// 暴食的核心技能保留攻击成长，逐级强化吞噬与充能；重开后不残留。
// 第四批：暴食主树归暴食角色，改用 glutton 角色走 Lv.5 自动觉醒路径。
engine.applyStartingStrain('glutton')
engine.reset()
engine.player.level = 5
engine._ensureRoleAwakening()
assert.equal(engine.primarySpec, 'gluttony', '暴食角色 Lv.5 自动觉醒暴食主专精')
assert.equal(engine.weaponSystem.damage, 1, '暴食觉醒本身不附赠深渊胃囊')
assert.equal(engine.weaponSystem.projectileCount, 1, '暴食觉醒不附赠飞弹')
const maw = SKILL_DATABASE.gluttony.primary.find((skill) => skill.id === 'glut_maw')
maw.apply(engine, 1)
assert.equal(engine.weaponSystem.damage, 1, '深渊胃囊 Lv.1 保留攻击成长')
maw.apply(engine, 2)
maw.apply(engine, 3)
assert.equal(engine.weaponSystem.damage, 1, '深渊胃囊 Lv.3 保留攻击成长')
assert.equal(engine.devourThreshold, 0.36)
assert.equal(engine.player.devourRadiusBonus, 1.6)

// 重开回到无专精基线，再由 Lv.5 选择另一条路线（第四批：origin 视角，暴食已排除）
engine.applyStartingStrain('origin')
engine.reset()
assert.equal(engine.weaponSystem.damage, 1, '重开后暴食攻击回到基础值')
assert.equal(engine.primarySpec, null)
assert.equal(engine.roleSpec, null)
engine.player.level = 5
options = rollSkills(engine, 3)
engine.applySkill(options.find((o) => o.spec === 'elemental'))
assert.equal(engine.primarySpec, 'elemental')
assert.equal(engine.weaponSystem.projectileCount, 1, '机枪赋能不残留')
assert.ok(Math.abs(engine.weaponSystem.freezeChance - 0.2) < 1e-9, '元素觉醒只应用 +20% 基础赋能')
assert.equal(engine.skillLevels['ele_affinity'] || 0, 0, '元素路线同样不附赠 T1')
ok('主专精仅在 Lv.5 局内选择（origin 三选一），开局无预选与附赠技能')

// —— 2b. 角色化（阶段十九）：角色绑定技能树、Lv.5 自动觉醒、吞噬独占、F 冷却 ——
// 候选池只含本角色 T1 + 通用：其它树的 T1 不得出现（这是角色差异的骨架）
const roleT1 = (opt) => opt.tier === 1 || opt.role === 'role_t1' || !!SKILL_DATABASE.common.find((s) => s.id === opt.id)
for (const [strainId, spec] of [
  ['glutton', 'gluttony'],
  ['ricochet', 'gatling'],
  ['elemental', 'elemental'],
  ['shadow', 'assassin'],
]) {
  engine.applyStartingStrain(strainId)
  engine.reset()
  assert.equal(engine.roleSpec, spec, `${strainId} 绑定 ${spec}`)
  assert.equal(engine.primarySpec, null, '开局不设 primarySpec（T2/T3 不得提前进池）')
  engine.player.level = 4
  const pool = rollSkills(engine, 20)
  assert.ok(pool.length > 0, `${strainId} Lv.4 候选池非空`)
  assert.ok(
    pool.every((o) => o.spec === spec || o.role === 'common'),
    `${strainId} Lv.4 只开放本角色与通用技能（实际：${[...new Set(pool.map((o) => o.spec || o.role))].join('/')}）`
  )
  assert.ok(pool.every(roleT1), `${strainId} Lv.4 只有 T1 与通用，不含 T2/T3`)
  assert.ok(!pool.some((o) => o.isCapstone), `${strainId} Lv.4 不含终极觉醒`)

  // Lv.5：觉醒发生在 openFreeSkillPanel 内部（抽卡之前），不再弹四选一
  engine.player.level = 5
  engine.player.exp = 0
  engine.player.maxExp = 1
  assert.equal(engine.primarySpec, null, `${strainId} Lv.5 之前不设 primarySpec`)
  engine.onLevelUp = () => {}
  engine.openFreeSkillPanel()
  assert.equal(engine.primarySpec, spec, `${strainId} Lv.5 抽卡前必须已自动觉醒`)
  const lv5 = rollSkills(engine, 3)
  assert.ok(!lv5.some((o) => o.isMilestone), `${strainId} Lv.5 不再弹四选一里程碑`)
  assert.ok(lv5.every((o) => o.spec === spec || o.role === 'common'), `${strainId} Lv.5 候选仍限于本树与通用`)
  engine.resume()
}
// 觉醒必须发生在 openFreeSkillPanel 内部（王级秘籍等其它抽卡入口同样覆盖）
engine.applyStartingStrain('ricochet')
engine.reset()
assert.equal(engine.primarySpec, null)
engine.player.level = 5
engine.onLevelUp = () => {}
engine.openFreeSkillPanel()
assert.equal(engine.primarySpec, 'gatling', 'openFreeSkillPanel 内部完成觉醒（覆盖秘籍入口）')
// T2 门槛：觉醒后才能看到 gat_split（requires 满足时）
engine.skillLevels['gat_multishot'] = 1
assert.ok(rollSkills(engine, 30).some((o) => o.id === 'gat_split'), '觉醒后 T2 进入候选')
engine.resume()

// origin：无角色身份 → 保留四系 T1 自由探索与 Lv.5 四选一
// 第四批修正：origin 无 canDevour，暴食主树从候选池排除（glut_maw 是纯负面卡）
engine.applyStartingStrain('origin')
engine.reset()
assert.equal(engine.roleSpec, null)
assert.equal(engine.primarySpec, null)
engine.player.level = 4
const originPool = rollSkills(engine, 30)
const originSpecs = [...new Set(originPool.map((o) => o.spec).filter(Boolean))]
assert.equal(originSpecs.length, 3, 'origin Lv.4 开放三系 T1（不含暴食）')
assert.ok(!originSpecs.includes('gluttony'), 'origin Lv.4 不得出现暴食主树')
engine.player.level = 5
const originMilestone = rollSkills(engine, 3)
assert.equal(originMilestone.length, 3, 'origin Lv.5 三选一（暴食已排除）')
assert.ok(originMilestone.every((o) => o.isMilestone && o.milestoneType === 'primary'))
assert.ok(!originMilestone.some((o) => o.spec === 'gluttony'), 'origin Lv.5 不得出现暴食主专精')
ok('角色化：四角色绑定技能树并在 Lv.5 自动觉醒，origin 保留三系自由探索与三选一')

// —— 2c. 吞噬独占：只有暴食角色能吞噬，且白旗标记只对暴食出现 ——
engine.applyStartingStrain('glutton')
engine.reset()
engine.enemyManager._enemies.length = 0
const readyKnight = engine.enemyManager.spawnAt(engine.player.x + 10, engine.player.y, 'knight')
readyKnight.hp = 1
readyKnight.hit(0)
assert.equal(engine.canDevour, true)
assert.equal(readyKnight.devourable, true, '暴食角色：残血敌人进入可吞噬状态')
engine.enemyManager._checkDevour()
assert.equal(readyKnight.devouring, true, '暴食角色：残血敌人被吸入')
assert.equal(engine.weaponSystem.devours, 1)

for (const strainId of ['origin', 'ricochet', 'elemental', 'shadow']) {
  engine.applyStartingStrain(strainId)
  engine.reset()
  engine.enemyManager._enemies.length = 0
  const blocked = engine.enemyManager.spawnAt(engine.player.x + 10, engine.player.y, 'knight')
  blocked.hp = 1
  blocked.hit(0)
  assert.equal(engine.canDevour, false, `${strainId} 不能吞噬`)
  assert.equal(blocked.devourable, false, `${strainId}：白旗/呼吸环标记不得出现`)
  engine.enemyManager._checkDevour()
  assert.equal(blocked.devouring, false, `${strainId}：吞噬吸附不得触发`)
  assert.equal(engine.weaponSystem.devours, 0)
}
// 吞噬线封顶：血统 + 专精叠加后不得超过 DEVOUR_THRESHOLD_CAP
engine.applyStartingStrain('glutton')
engine.reset()
engine.primarySpec = null
engine.roleSpec = 'gluttony'
engine._ensureRoleAwakening()
assert.ok(engine.devourThreshold <= 0.4, `吞噬线封顶生效（实际 ${engine.devourThreshold}）`)
ok('吞噬独占：仅暴食可吞噬，其它角色无白旗/无 HUD/不触发吸附，且吞噬线封顶生效')

// —— 2d. F 角色技能框架：边沿触发、自身冷却、重开归位 ——
engine.applyStartingStrain('shadow')
engine.reset()
const wasRunning = engine.running
engine.running = true
const shadowSkill = engine.strainSkill
assert.ok(shadowSkill, '暗影角色有 F 技能')
engine.input.queueFever()
engine._updateStrainSkill(0.016)
assert.equal(engine.player.strainSkillCd, shadowSkill.cooldown, 'F 触发后进入冷却')
assert.equal(engine.player.strainSkillMax, shadowSkill.cooldown)
assert.equal(engine.weaponSystem.shadowCombat.assault?.phase, 'windup', '影袭：进入定向穿行前摇')
assert.equal(engine.player.guaranteedCrit, false, '影袭不把必暴状态留给之后的普通攻击')
engine.input.queueFever()
engine._updateStrainSkill(0.016)
assert.ok(
  engine.player.strainSkillCd > shadowSkill.cooldown - 0.05 &&
    engine.player.strainSkillCd < shadowSkill.cooldown,
  '冷却中再按 F 不重复施放（只按 dt 递减）'
)
engine._updateStrainSkill(shadowSkill.cooldown + 0.1)
assert.equal(engine.player.strainSkillCd, 0, '冷却随 dt 递减到 0')
engine.running = wasRunning

// origin 没有 F 技能：F 通道对它无效，冷却恒为 0
engine.applyStartingStrain('origin')
engine.reset()
assert.equal(engine.strainSkill.id, 'slime_shock', '原生拥有黏液震荡')
engine.input.queueFever()
engine._updateStrainSkill(0.016)
assert.equal(engine.player.strainSkillCd, 8, '原生空格释放黏液震荡')

// 冷却不得跨局残留
engine.applyStartingStrain('elemental')
engine.reset()
engine.running = true
engine.input.queueFever()
engine._updateStrainSkill(0.016)
assert.ok(engine.player.strainSkillCd > 0)
engine.running = wasRunning
engine.reset()
assert.equal(engine.player.strainSkillCd, 0, '重开后 F 冷却归零')
assert.equal(engine.player.strainSkillMax, 0)
ok('F 角色技能框架：边沿触发 + 自身冷却 + origin 短路 + 重开归位')

// —— 2e. 早期元素入口（第二批）：第 2 波保底一只精英，掉落规则不变 ——
// 不写死秒数：只锁定「第 2 波存在早期入口」这个结构事实与它的边界。
{
  const { EnemyManager } = await import('./src/game/EnemyManager.js')
  const { getRunProfile } = await import('./src/game/RunRules.js')
  const probeRun = { mode: 'timed', difficulty: 'normal' }
  const probeGame = {
    runSelection: probeRun,
    runProfile: getRunProfile(probeRun),
    width: 1280,
    height: 720,
    worldWidth: 2400,
    worldHeight: 1800,
    camera: { x: 0, y: 0 },
    player: {
      x: 1200, y: 900, radius: 26, hp: 5, maxHp: 5, level: 1, dead: false, invincible: 0,
      getEnemyTarget() { return this },
    },
    weaponSystem: { kills: 0 },
    sound: { wave() {}, bossRoar() {}, enemyShoot() {} },
    dialogue: { tryMinion() {}, sayBoss() {} },
    shakeScreen() {},
    mapFeatures: null,
  }
  const probe = new EnemyManager()
  probe.attach(probeGame)
  probeGame.enemyManager = probe

  // 第 1 波：没有保底精英（保底是第 2 波的事，不影响开局节奏）
  probe.beginWave(1)
  assert.equal(probe._enemies.filter((en) => en.isElite).length, 0, '第 1 波不投放保底精英')

  // 第 2 波：恰好一只保底精英，且走常规 isElite 路径（掉落核心的既有规则即由此触发）
  probe._enemies.length = 0
  probe.beginWave(2)
  const early = probe._enemies.filter((en) => en.isElite)
  assert.equal(early.length, 1, '第 2 波必须有一只保底精英（早期元素入口）')
  assert.equal(early[0].isElite, true, '保底精英走既有 elite 路径 → 沿用既有核心掉落，不新增掉率')
  assert.ok((early[0].affixes || []).length > 0, '保底精英带词缀，与常规精英同构')
  const earlyDist = Math.hypot(early[0].x - probeGame.player.x, early[0].y - probeGame.player.y)
  assert.ok(earlyDist > 60 && earlyDist < 900, `保底精英应出现在玩家视野附近（实际 ${earlyDist.toFixed(0)}px）`)

  // 每局至多一次：第 3 波不再投放保底精英（此时常规精英概率照旧生效）
  probe._enemies.length = 0
  probe.beginWave(3)
  assert.equal(probe._enemies.filter((en) => en.isElite).length, 0, '第 3 波不得再投放保底精英')

  // 重置后闸门归位：下一局重新拥有一次早期入口
  probe.reset()
  probeGame.player.x = 1200
  probeGame.player.y = 900
  probe.beginWave(2)
  assert.equal(
    probe._enemies.filter((en) => en.isElite).length,
    1,
    '重开归位：下一局重新拥有保底精英'
  )
}
ok('早期元素入口：第 2 波保底精英每局一次，沿用既有核心掉落且不影响第 3 波以后')

// —— 2f. 元素权限角色化（第三批）：只有 elemental / origin 能用元素 ——
{
  const { STRAINS, STRAIN_IDS, canUseElements } = await import('./src/game/Strains.js')
  const allowance = STRAIN_IDS.filter((id) => canUseElements(id))
  assert.deepEqual(allowance, ['origin', 'elemental'], '元素权限矩阵：只有 origin 与 elemental 为真')
  for (const id of ['glutton', 'ricochet', 'shadow']) {
    assert.equal(canUseElements(id), false, `${id} 不得使用元素`)
  }
  // 权限不得与角色绑定冲突：有权限的角色必须真的绑到元素树或为 origin
  assert.ok(
    STRAINS.elemental.roleSpec === 'elemental' && STRAINS.origin.roleSpec === null,
    '元素权限与 roleSpec 一致'
  )
}

// 可吸收 vs 不可吸收：五角色逐一验证 absorbElement 与权限闸门
{
  const { canUseElements } = await import('./src/game/Strains.js')
  for (const strainId of ['elemental', 'origin']) {
    engine.applyStartingStrain(strainId)
    engine.reset()
    assert.equal(engine.canUseElements, true, `${strainId} 可以使用元素`)
    engine.player.absorbElement('fire')
    assert.equal(engine.player.elements.get('fire'), 1, `${strainId} 可吸收元素`)
  }
  for (const strainId of ['glutton', 'ricochet', 'shadow']) {
    engine.applyStartingStrain(strainId)
    engine.reset()
    assert.equal(engine.canUseElements, false, `${strainId} 不可以使用元素`)
    // 四条元素逐一尝试：等级、反应缓存、附魔缓存都必须毫无变化
    for (const el of ['fire', 'water', 'poison', 'lightning']) engine.player.absorbElement(el)
    assert.equal(engine.player.elements.size, 0, `${strainId}：absorbElement 无副作用（等级）`)
    assert.equal(engine.player._reactions.length, 0, `${strainId}：无反应缓存`)
    assert.equal(engine.player._reactionIds.size, 0, `${strainId}：无激活反应`)
    assert.deepEqual(engine.player._procs, {}, `${strainId}：无附魔缓存`)
    assert.equal(engine.player._primaryReaction, null, `${strainId}：未锁定主形态`)
  }
}
ok('元素权限：elemental/origin 可吸收，glutton/gatling/shadow 的 absorbElement 完全无副作用')

// 四条核心产出路径（精英 / Boss / 吞噬 / hunt 事件）逐一对五角色核验
{
  const { Enemy } = await import('./src/game/entities/Enemy.js')
  const countCores = () => engine.gemManager._gems.filter((g) => g.type !== 'exp' && g.type !== 'tome').length
  const spawnElite = () => {
    const e = new Enemy({ x: engine.player.x + 40, y: engine.player.y, speed: 80, hp: 5, type: 'knight', elite: true })
    e.attach(engine)
    return e
  }
  for (const strainId of ['elemental', 'origin', 'glutton', 'ricochet', 'shadow']) {
    engine.applyStartingStrain(strainId)
    engine.reset()
    const allowed = engine.canUseElements
    const tag = `${strainId}(${allowed ? '有' : '无'}权限)`

    // ① 普通精英击杀
    engine.gemManager.reset()
    engine.weaponSystem._settleKill(spawnElite())
    assert.equal(countCores() > 0, allowed, `精英核心产出与权限一致：${tag}`)

    // ② Boss 击杀
    engine.gemManager.reset()
    const boss = spawnElite()
    boss.isBoss = true
    engine.weaponSystem._settleKill(boss)
    assert.equal(countCores() > 0, allowed, `Boss 核心产出与权限一致：${tag}`)

    // ③ 吞噬（法师必掉核心那条分支）
    engine.gemManager.reset()
    const mage = new Enemy({ x: engine.player.x + 40, y: engine.player.y, speed: 80, hp: 5, type: 'mage' })
    mage.attach(engine)
    engine.weaponSystem.onDevoured(mage)
    assert.equal(countCores() > 0, allowed, `吞噬核心产出与权限一致：${tag}`)

    // ④ hunt 世界事件奖励
    engine.gemManager.reset()
    const ev = engine.worldEvents
    ev.current = {
      type: 'hunt',
      state: 'active',
      x: engine.player.x,
      y: engine.player.y,
      def: { title: '讨伐队猎营', reward: (g) => (g?.canUseElements === false ? '大型经验' : '元素核心 + 大型经验'), color: '#d6a642' },
      timeLeft: 1,
      goal: 3,
      progress: 3,
    }
    ev._complete(ev.current)
    assert.equal(countCores() > 0, allowed, `hunt 事件核心产出与权限一致：${tag}`)
    // 文案必须与实发一致：不允许「说有核心但实际没有」
    const rewardText = ev.objectiveInfo?.reward
    if (rewardText !== undefined && rewardText !== null) {
      assert.equal(rewardText.includes('核心'), allowed, `hunt 奖励文案与实发一致：${tag}`)
    }

    // ⑤ 吞噬 → 消化链：非元素角色不再累计/转化，有权限角色照旧
    assert.equal(
      engine.weaponSystem.digestCharge > 0,
      allowed,
      `消化链与权限一致：${tag}`
    )
  }
}
ok('元素产出入口：精英/Boss/吞噬/hunt 四条路径与权限矩阵完全一致，且暴食不再累计消化')

// 保底精英只服务有元素权限的角色
{
  const { EnemyManager } = await import('./src/game/EnemyManager.js')
  const { getRunProfile } = await import('./src/game/RunRules.js')
  const probeRun = { mode: 'timed', difficulty: 'normal' }
  const makeProbe = (canUseElementsValue) => {
    const g = {
      runSelection: probeRun,
      runProfile: getRunProfile(probeRun),
      width: 1280, height: 720, worldWidth: 2400, worldHeight: 1800,
      camera: { x: 0, y: 0 },
      player: {
        x: 1200, y: 900, radius: 26, hp: 5, maxHp: 5, level: 1, dead: false, invincible: 0,
        getEnemyTarget() { return this },
      },
      weaponSystem: { kills: 0 },
      sound: { wave() {}, bossRoar() {}, enemyShoot() {} },
      dialogue: { tryMinion() {}, sayBoss() {} },
      shakeScreen() {}, mapFeatures: null,
      canUseElements: canUseElementsValue,
      canDevour: false,
    }
    const m = new EnemyManager()
    m.attach(g)
    g.enemyManager = m
    return m
  }
  const allowed = makeProbe(true)
  allowed.beginWave(2)
  assert.equal(allowed._enemies.filter((e) => e.isElite).length, 1, '有元素权限：第 2 波出现保底精英')

  const denied = makeProbe(false)
  denied.beginWave(2)
  assert.equal(denied._enemies.filter((e) => e.isElite).length, 0, '无元素权限：第 2 波不额外生成保底精英')
  denied.beginWave(3)
  assert.equal(denied._enemies.filter((e) => e.isElite).length, 0, '无元素权限：后续波次同样不补发')
}
ok('早期保底精英：只对有元素权限的角色生成，无权限角色第 2 波不额外加压')

// 重置归位：权限与元素状态都不得跨局残留
{
  engine.applyStartingStrain('elemental')
  engine.reset()
  engine.player.absorbElement('fire')
  engine.player.absorbElement('water')
  assert.equal(engine.canUseElements, true)
  assert.equal(engine.player.elements.size, 2, '元素角色已累积元素')

  engine.applyStartingStrain('shadow')
  engine.reset()
  assert.equal(engine.canUseElements, false, '切角色后权限归位')
  assert.equal(engine.player.elements.size, 0, '切角色后元素清空')
  assert.equal(engine.player._reactions.length, 0)
  assert.deepEqual(engine.player._procs, {})
  assert.equal(engine.player._primaryReaction, null)
  assert.equal(engine.player.strainSkillCd, 0)

  engine.applyStartingStrain('elemental')
  engine.reset()
  assert.equal(engine.canUseElements, true, '切回元素角色后权限恢复')
  assert.equal(engine.player.elements.size, 0, '重开后元素不残留')
}
ok('重置归位：元素权限、元素等级、反应与附魔缓存在换角色/重开后全部归零')

// —— 2g. 技能池权限过滤（第四批）——
// 权限只影响「候选池」，不影响任何战斗数值；池子必须与独占能力对齐。
{
  const { canDevour, canUseElements, STRAIN_IDS } = await import('./src/game/Strains.js')

  // ① origin Lv.1~4 不得出现暴食主树（glut_maw 对无吞噬角色是纯负面卡）
  engine.applyStartingStrain('origin')
  engine.reset()
  engine.player.level = 4
  for (let i = 0; i < 40; i++) {
    const pool = rollSkills(engine, 50)
    assert.ok(
      pool.every((o) => o.spec !== 'gluttony'),
      `origin Lv.1~4 候选池不得含暴食主树（出现 ${pool.filter((o) => o.spec === 'gluttony').map((o) => o.id).join(',')}）`
    )
    assert.ok(pool.every((o) => o.id !== 'glut_maw' && o.id !== 'glut_bulk'))
  }

  // ② origin Lv.5 不得出现暴食主专精
  engine.player.level = 5
  const pri = rollSkills(engine, 10)
  assert.ok(pri.every((o) => o.spec !== 'gluttony'), 'origin Lv.5 不得出现暴食主专精')
  assert.equal(pri.length, 3, 'origin Lv.5 恰好三选一')

  // ③ 所有 canDevour=false 的角色：secondary 池不得出现 glut_sub_digest
  // ④ 所有 canUseElements=false 的角色：secondary 池不得出现 ele_sub_boost
  // 直接设置 secondarySpec 来检验「逐技能过滤」，不依赖里程碑候选（里程碑 id 只编码目标系）
  for (const strainId of STRAIN_IDS) {
    const devour = canDevour(strainId)
    const elements = canUseElements(strainId)
    const elementalStrain = strainId === 'elemental'
    engine.applyStartingStrain(strainId)
    engine.reset()
    engine.primarySpec = 'gatling' // 任意主系，避开 Lv.9 里程碑分支
    engine.secondarySpec = 'gluttony'
    const gluttonPool = rollSkills(engine, 30).map((o) => o.id)
    assert.equal(
      gluttonPool.includes('glut_sub_digest'),
      devour,
      `${strainId}(canDevour=${devour})：glut_sub_digest 仅在 canDevour 时进池`
    )
    assert.ok(gluttonPool.includes('glut_sub_armor'), `${strainId}：glut_sub_armor 不依赖权限，必须保留`)

    engine.secondarySpec = 'elemental'
    const elePool = rollSkills(engine, 30).map((o) => o.id)
    assert.equal(
      elePool.includes('ele_sub_boost'),
      elementalStrain,
      `${strainId}(元素血统=${elementalStrain})：元素共鸣体仅在元素血统时进池`
    )
    assert.equal(elePool.includes('ele_sub_aura'), elementalStrain,
      `${strainId}：元素共鸣光环仅在元素血统时进池`)

    // 本角色自己的 secondary 系不受影响
    if (engine.roleSpec) {
      engine.secondarySpec = engine.roleSpec
      const ownPool = rollSkills(engine, 30).map((o) => o.id)
      assert.ok(ownPool.length > 0, `${strainId}：本系 secondary 池非空`)
    }
  }

  // ⑤ 角色血统在 Lv.9 不再开启副专精；只有原生黏液保留组合构筑。
  engine.applyStartingStrain('glutton')
  engine.reset()
  engine.primarySpec = 'gluttony'
  engine.secondarySpec = null
  engine.player.level = 9
  const gluttonSec = rollSkills(engine, 10)
  assert.ok(!gluttonSec.some((o) => o.isMilestone && o.milestoneType === 'secondary'),
    '暴食 Lv.9 不得开启副专精里程碑')
  assert.ok(!gluttonSec.some((o) => o.role === 'secondary'),
    '暴食 Lv.9 不得出现副专精技能')

  engine.applyStartingStrain('origin')
  engine.reset()
  engine.primarySpec = 'gatling'
  engine.secondarySpec = null
  engine.player.level = 9
  const originSec = rollSkills(engine, 10)
  assert.ok(originSec.some((o) => o.isMilestone && o.milestoneType === 'secondary'),
    '原生黏液 Lv.9 保留副专精组合构筑')
}
ok('技能池权限过滤：职业血统单一专精，原生黏液保留组合构筑')

// —— 2h. Lv.4 / Lv.8 槽位里程碑提示只对有元素权限的角色显示 ——
{
  const { canUseElements, STRAIN_IDS } = await import('./src/game/Strains.js')
  // 提示是 UI 层依据 stats.canUseElements 决定的；这里锁定「引擎快照口径」与权限一致，
  // 以及 UI 判定所依赖的字段确实存在（形状契约由 verify-p2 兜底）。
  for (const strainId of STRAIN_IDS) {
    engine.applyStartingStrain(strainId)
    engine.reset()
    assert.equal(
      engine.canUseElements,
      canUseElements(strainId),
      `${strainId}：快照口径 canUseElements 与 Strains 权限一致`
    )
    const stats = {}
    // 直接读引擎快照，确认字段存在（UI 的 v-if 依赖它）
    engine.onStats = (s) => Object.assign(stats, s)
    engine._pushStats()
    assert.equal(
      stats.canUseElements,
      canUseElements(strainId),
      `${strainId}：_pushStats 必须下发 canUseElements（槽位提示据此隐藏）`
    )
  }
  engine.onStats = null
}
ok('槽位里程碑提示：canUseElements 随角色正确下发，非元素角色不会看到空槽承诺')

// —— 2i. 黑市永久基因：购买规则不随当前角色变化 ——
{
  const { getGenePurchaseState, GENES } = await import('./src/game/GenePool.js')
  const { STRAIN_IDS } = await import('./src/game/Strains.js')
  const richDrops = 100000
  // 对每个角色重复同一组判定：结果必须与角色无关（黑市是档案级永久成长）
  for (const geneId of ['predator_origin', 'element_origin', 'resonance', 'giant']) {
    const gene = GENES.find((g) => g.id === geneId)
    const perStrain = STRAIN_IDS.map((strainId) => {
      engine.applyStartingStrain(strainId)
      engine.reset()
      const st = getGenePurchaseState(gene, {}, richDrops)
      return { strainId, canBuy: st.canBuy, locked: st.locked, reason: st.reason, cost: st.cost }
    })
    const first = perStrain[0]
    for (const p of perStrain) {
      assert.equal(p.canBuy, first.canBuy, `${geneId}：canBuy 不得随角色变化（${p.strainId}）`)
      assert.equal(p.locked, first.locked, `${geneId}：locked 不得随角色变化（${p.strainId}）`)
      assert.equal(p.cost, first.cost, `${geneId}：cost 不得随角色变化（${p.strainId}）`)
      assert.ok(!String(p.reason || '').includes('史莱姆'), `${geneId}：reason 不得引入角色限制（${p.strainId}）`)
    }
  }
  // 只加了「适用范围提示」，不动购买/exclusiveGroup 规则
  for (const geneId of ['predator_origin', 'resonance', 'element_origin']) {
    const gene = GENES.find((g) => g.id === geneId)
    assert.ok(
      typeof gene.scope === 'string' && gene.scope.length > 0,
      `${geneId} 必须有适用范围提示文案`
    )
  }
  assert.equal(GENES.find((g) => g.id === 'giant').scope, undefined, '通用基因不需要适用范围提示')
  // exclusiveGroup 规则不变：买到捕食原核后，另两个原核仍被互斥挡住
  const afterPredator = getGenePurchaseState(
    GENES.find((g) => g.id === 'kinetic_origin'),
    { predator_origin: 1 },
    richDrops
  )
  assert.equal(afterPredator.locked, true, 'exclusiveGroup 互斥规则保持不变')
  assert.ok(afterPredator.reason.includes('捕食原核'), '互斥原因文案保持不变')
}
ok('黑市永久基因：购买与互斥规则完全不随当前角色变化，仅新增适用范围提示')

// —— 2j. 刺客觉醒的「暴击保证触发元素 proc」受能力闸门控制（第五批）——
// 关键区分：critGuaranteesElement 只作用于 player._procs（已吸收元素的等级累积附魔），
// 与飞弹自带的 freeze/burn/poisonChance（武器状态附加）是两套东西。
{
  const { Enemy } = await import('./src/game/entities/Enemy.js')
  const { Projectile } = await import('./src/game/entities/Projectile.js')
  const { CELL_SIZE, GRID_KEY_SCALE } = await import('./src/game/EnemyManager.js')

  // 固定随机数：永不自然暴击（由弹体 critChance=1 强制必暴）、永不自然触发概率
  const realRandom = Math.random
  Math.random = () => 0.999

  /**
   * 打一发必暴击的飞弹，观察敌人身上的元素状态。
   * 用真实碰撞管线（_resolveCollisions + 空间哈希网格），不走私有捷径。
   */
  const fireCrit = (elements) => {
    engine.player.elements.clear()
    for (const [id, lv] of elements) engine.player.elements.set(id, lv)
    engine.player._refreshElements()
    engine.enemyManager._enemies.length = 0
    const target = new Enemy({ x: 0, y: 0, speed: 0, hp: 500, type: 'knight' })
    target.attach(engine)
    engine.enemyManager._enemies.push(target)
    const bullet = new Projectile({ x: 0, y: 0, target, damage: 1, critChance: 1, vx: 0, vy: 0 })
    engine.weaponSystem._projectiles.length = 0
    engine.weaponSystem._projectiles.push(bullet)
    const grid = engine.enemyManager.grid
    grid.clear()
    const cx = (bullet.x / CELL_SIZE) | 0
    const cy = (bullet.y / CELL_SIZE) | 0
    grid.set(cx * GRID_KEY_SCALE + cy, [target])
    engine.weaponSystem._resolveCollisions()
    return {
      flag: engine.weaponSystem.critGuaranteesElement,
      burnHits: target.burnHits,
      poisonHits: target.poisonHits,
    }
  }

  // ① shadow（elemental 之外唯一能拿到 assassin 觉醒的角色）：完全不触发元素
  engine.applyStartingStrain('shadow')
  engine.reset()
  engine.player.level = 5
  engine._ensureRoleAwakening()
  assert.equal(engine.roleSpec, 'assassin')
  assert.equal(engine.canUseElements, false)
  assert.equal(engine.weaponSystem.critChance >= 0.25, true, '暗影刺客觉醒：暴击率 ≥ 25%')
  assert.equal(engine.weaponSystem.critMul >= 3.5, true, '暗影刺客觉醒：暴击倍率 ≥ 3.5×')
  assert.equal(engine.weaponSystem.critGuaranteesElement, false, '暗影不获得元素规则')
  // 即便强行塞入元素数据（现实中拿不到），标记为 false → 暴击也不产生元素 proc
  const shadowCrit = fireCrit([['fire', 3], ['poison', 3]])
  assert.equal(shadowCrit.flag, false)
  assert.equal(shadowCrit.burnHits, 0, 'Shadow Assassin 暴击不触发元素 proc')
  assert.equal(shadowCrit.poisonHits, 0, 'Shadow Assassin 暴击不触发元素 proc')

  // ② origin + assassin + 已吸收元素：暴击保证触发元素 proc
  engine.applyStartingStrain('origin')
  engine.reset()
  engine.player.level = 5
  engine.primarySpec = 'assassin'
  engine._applyPrimarySpecBonus('assassin')
  assert.equal(engine.canUseElements, true)
  assert.equal(engine.weaponSystem.critGuaranteesElement, true, 'origin 获得元素规则')
  const originCrit = fireCrit([['fire', 3], ['poison', 3]])
  assert.ok(originCrit.burnHits > 0, 'Origin Assassin + 已吸收元素：暴击保证触发引燃 proc')
  assert.ok(originCrit.poisonHits > 0, 'Origin Assassin + 已吸收元素：暴击保证触发中毒 proc')

  // ③ origin + assassin 未吸收元素：无额外效果（_procs 为空，闸门无处可作用）
  engine.applyStartingStrain('origin')
  engine.reset()
  engine.player.level = 5
  engine.primarySpec = 'assassin'
  engine._applyPrimarySpecBonus('assassin')
  const originEmpty = fireCrit([])
  assert.equal(originEmpty.flag, true, '标记仍然为真')
  assert.equal(originEmpty.burnHits, 0, '未吸收元素时无额外效果')
  assert.equal(originEmpty.poisonHits, 0, '未吸收元素时无额外效果')

  // ④ 无元素权限的角色即使被误设 primarySpec='assassin' 也拿不到标记
  for (const strainId of ['glutton', 'ricochet']) {
    engine.applyStartingStrain(strainId)
    engine.reset()
    engine.primarySpec = 'assassin'
    engine._applyPrimarySpecBonus('assassin')
    assert.equal(
      engine.weaponSystem.critGuaranteesElement,
      false,
      `${strainId}（无元素权限）不得获得元素规则`
    )
  }
  // ⑤ 重开归位
  engine.applyStartingStrain('origin')
  engine.reset()
  engine.primarySpec = 'assassin'
  engine._applyPrimarySpecBonus('assassin')
  assert.equal(engine.weaponSystem.critGuaranteesElement, true)
  engine.reset()
  assert.equal(engine.weaponSystem.critGuaranteesElement, false, '重开后元素规则归位')
  engine.onStats = null
  Math.random = realRandom
}
ok('暴击 × 元素协同：仅 canUseElements 角色获得，暗影恒不触发，未吸收元素时无副作用')

// —— 2k. Gatling Capstone 射速为「乘算语义」（不再绝对覆盖）——
// 锁定的是语义本身：觉醒后的间隔 = 觉醒前 × GATLING_CAPSTONE_RATE，
// 而不是某个 Build 的绝对最终值（旧实现是 fireInterval = 0.12）。
{
  const { GATLING_CAPSTONE_RATE, SKILL_DATABASE } = await import('./src/game/SkillPool.js')
  const cap = SKILL_DATABASE.gatling.primary.find((s) => s.id === 'gat_capstone')

  assert.equal(typeof GATLING_CAPSTONE_RATE, 'number')
  assert.ok(GATLING_CAPSTONE_RATE > 0 && GATLING_CAPSTONE_RATE < 1, '倍率必须是 (0,1) 的乘数')
  assert.equal(GATLING_CAPSTONE_RATE, 0.4, '采用消融实验选定的 ×0.40')

  // 文案不得再出现固定秒数或「每秒近 10 发」
  assert.ok(!cap.desc.includes('0.12'), '技能描述不得再写死 0.12 秒')
  assert.ok(!cap.stats().includes('0.12'), 'stats 不得再写死 0.12 秒')
  assert.ok(!/近\s*10\s*发|10\s*发/.test(cap.desc), '描述不得再写「每秒近 10 发」')
  assert.ok(cap.desc.includes('60%'), '描述应体现「射击间隔缩短 60%」')
  assert.ok(cap.desc.includes('+2') || cap.desc.includes('2 齐射'), '描述应体现 +2 齐射飞弹')
  assert.ok(cap.desc.includes('追踪'), '描述应体现全屏强追踪')

  // 乘算语义：对任意 X，应用后必须是 X × 0.4（不是 0.12）
  for (const X of [0.4, 0.522, 0.6141, 0.6264, 0.7225, 1.0, 1.2]) {
    const probe = {
      weaponSystem: {
        fireInterval: X, projectileCount: 3, isGatlingMother: false,
      },
      enemyManager: { addText() {} },
      player: { x: 0, y: 0 },
    }
    cap.apply(probe)
    assert.ok(
      Math.abs(probe.weaponSystem.fireInterval - X * GATLING_CAPSTONE_RATE) < 1e-12,
      `乘算语义：间隔 ${X} → ${X * GATLING_CAPSTONE_RATE}（实际 ${probe.weaponSystem.fireInterval}）`
    )
    assert.notEqual(probe.weaponSystem.fireInterval, 0.12, '不得再收敛到 0.12 绝对终点')
    assert.equal(probe.weaponSystem.projectileCount, 5, '齐射 +2 保持不变')
    assert.equal(probe.weaponSystem.isGatlingMother, true, 'isGatlingMother 保持不变')
  }

  // 乘算真的保留了「前期射速 Build 的差异」：两条路径的间隔比值不变
  const mkProbe = (X) => ({
    weaponSystem: { fireInterval: X, projectileCount: 4, isGatlingMother: false },
    enemyManager: { addText() {} }, player: { x: 0, y: 0 },
  })
  const fast = mkProbe(0.6264)   // 弹射路径（含血统 ×1.2 惩罚）
  const slow = mkProbe(0.5220)   // origin→Gatling 路径（无血统惩罚）
  const ratioBefore = slow.weaponSystem.fireInterval / fast.weaponSystem.fireInterval
  cap.apply(fast); cap.apply(slow)
  const ratioAfter = slow.weaponSystem.fireInterval / fast.weaponSystem.fireInterval
  assert.ok(Math.abs(ratioBefore - ratioAfter) < 1e-12, '觉醒前后两条路径的间隔比值必须不变（保留 Build 差异）')
  // 0.5220 / 0.6264 = 1/1.2 → origin 路径的间隔本就更短（更快），觉醒后仍保持同一比值
  assert.ok(Math.abs(ratioAfter - 1 / 1.2) < 1e-9, `比值应保持在 0.833（实际 ${ratioAfter.toFixed(3)}）`)
  // 绝对终点不再相同：两条路径觉醒后仍是两个不同的间隔
  assert.ok(Math.abs(fast.weaponSystem.fireInterval - slow.weaponSystem.fireInterval) > 1e-6,
    '两条路径不得被压到同一个绝对间隔（旧 0.12 实现的失效模式）')

  // 契约保护：maxLevel 1 + 真实引擎里「已满级不再进候选池」
  assert.equal(cap.maxLevel, 1, 'Capstone 仍为一次性觉醒')
  engine.player.level = 20
  engine.enemyManager.wave = 20
  engine.primarySpec = 'gatling'
  // 先越过 Lv.9 副专精里程碑（否则 rollSkills 会一直只返回里程碑候选）
  engine.secondarySpec = 'assassin'
  assert.ok(
    !rollSkills(engine, 30).some((o) => o.id === 'gat_capstone'),
    '未点前置（gat_chain）时 Capstone 不进候选'
  )
  for (const id of ['gat_multishot', 'gat_split', 'gat_chain']) engine.skillLevels[id] = 1
  const withPrereq = rollSkills(engine, 40)
  assert.ok(withPrereq.some((o) => o.id === 'gat_capstone'), '前置齐备且 Lv.14+/波 10+ 时进候选')
  engine.skillLevels['gat_capstone'] = cap.maxLevel
  assert.ok(
    !rollSkills(engine, 40).some((o) => o.id === 'gat_capstone'),
    '已点满（maxLevel 已达）后不再进候选 → 不会重复乘算'
  )
  // 直接设字段的幂等性也一并确认（防止未来新增调用点绕过 maxLevel）
  const repeat = mkProbe(0.6)
  cap.apply(repeat)
  const once = repeat.weaponSystem.fireInterval
  repeat.weaponSystem.fireInterval = 0.6
  cap.apply(repeat)
  assert.ok(Math.abs(repeat.weaponSystem.fireInterval - once) < 1e-12, '单次效果本身可复现（幂等性由 maxLevel 契约负责）')
}
ok('Capstone 射速乘算语义：间隔 = 觉醒前 × 0.40，齐射 +2 与全屏追踪不变，且不会重复叠加')

// —— 2l. Capstone 文案的百分比必须来自单一来源 ——
// 上一版 desc / roadmap 写死「60%」，只改了 stats()；调整倍率时必然漂移。
{
  const { GATLING_CAPSTONE_RATE, SKILL_DATABASE, SPEC_INFO, getGatlingCapstoneCutPercent } =
    await import('./src/game/SkillPool.js')
  const cap = SKILL_DATABASE.gatling.primary.find((s) => s.id === 'gat_capstone')
  const pct = getGatlingCapstoneCutPercent()
  assert.equal(pct, Math.round((1 - GATLING_CAPSTONE_RATE) * 100), '派生值与倍率一致')

  // 三处文案都必须包含派生值本身（而不是任何写死的数字）
  const capstoneRoadmapLine = SPEC_INFO.gatling.roadmap.find((l) => l.includes('加特林风暴母体'))
  assert.ok(capstoneRoadmapLine, 'roadmap 里应存在加特林母体条目')
  const surfaces = [
    ['desc', cap.desc],
    ['stats()', cap.stats()],
    ['roadmap', capstoneRoadmapLine],
  ]
  for (const [name, text] of surfaces) {
    assert.ok(text.includes(`${pct}%`), `${name} 必须包含派生百分比 ${pct}%`)
  }

  // 单一来源探针：三处只能出现「派生值」这一个百分比。
  // 只要有任何一处写死别的数字（例如旧版的 60% 而倍率已改成 0.45），这条就会失败。
  const percentTokens = (text) => (text.match(/\d+%/g) || [])
  for (const [name, text] of surfaces) {
    const tokens = percentTokens(text)
    assert.ok(tokens.length > 0, `${name} 应包含百分比`)
    assert.ok(
      tokens.every((t) => t === `${pct}%`),
      `${name} 只允许出现派生百分比 ${pct}%（实际 ${tokens.join(',')}）`
    )
  }

  // 反向保护：倍率与派生值的函数关系必须成立（改动倍率时三处会同步跟着变）
  assert.equal(pct, Math.round((1 - GATLING_CAPSTONE_RATE) * 100), '派生百分比必须由倍率推导')
}
ok('Capstone 文案单一来源：desc / stats / roadmap 的百分比全部由 GATLING_CAPSTONE_RATE 派生')



// —— 3. 分裂弹继承母弹特效概率 ——
const ws = engine.weaponSystem
ws.freezeChance = 0.5
ws.burnChance = 0.5
ws.critChance = 0.4
const em = engine.enemyManager
const origin = new Enemy({ x: 400, y: 400, speed: 80, hp: 50, type: 'knight' })
origin.attach(engine)
const otherA = new Enemy({ x: 480, y: 400, speed: 80, hp: 50, type: 'knight' })
otherA.attach(engine)
const otherB = new Enemy({ x: 400, y: 480, speed: 80, hp: 50, type: 'knight' })
otherB.attach(engine)
em._enemies.push(origin, otherA, otherB)
const parent = new Projectile({ x: 400, y: 400, damage: 10, freezeChance: 0.5, burnChance: 0.5, critChance: 0.4 })
ws._split(origin, parent)
const splits = ws._projectiles.filter((p) => p.isSplit)
assert.equal(splits.length, 2)
assert.ok(splits.every((s) => Math.abs(s.freezeChance - 0.25) < 1e-9), '分裂弹继承 50% 冰冻概率')
assert.ok(splits.every((s) => Math.abs(s.burnChance - 0.25) < 1e-9), '分裂弹继承 50% 燃烧概率')
assert.ok(splits.every((s) => Math.abs(s.critChance - 0.2) < 1e-9), '分裂弹继承 50% 暴击概率')
assert.equal(splits[0].damage, 5, '分裂弹伤害仍为母弹 50%')
ok('分裂弹：按 50% 继承母弹暴击/元素附魔概率（机枪×元素协同打通）')

// —— 4. 主动震荡击杀走统一结算 ——
engine.applyStartingStrain('origin'); engine.reset(); engine.running = true
ws.damage = 40
const killsBefore = ws.kills, gemsBefore = engine.gemManager.count
const victim = new Enemy({ x: engine.player.x + 60, y: engine.player.y, speed: 80, hp: 10, type: 'knight' })
victim.attach(engine); em._enemies.push(victim)
engine.input.queueFever(); engine._updateStrainSkill(0)
assert.equal(victim.active, false)
assert.equal(ws.kills, killsBefore + 1)
assert.ok(engine.gemManager.count > gemsBefore)
ok('主动震荡击杀进入统一计数与掉落')

// —— 5. 重开统一回到 Lv.1 自由探索期 ——
engine.reset()
assert.equal(engine.primarySpec, null, '重开后主专精为空')
assert.equal(engine.skillLevels['gat_multishot'] || 0, 0, '无附赠 T1')
assert.equal(engine.weaponSystem.projectileCount, 1, '无觉醒加成')
ok('重开回到自由探索期，等待 Lv.5 再次觉醒')

engine.destroy()
console.log(`\n改动验证全部通过：${n} 组 ✓`)
