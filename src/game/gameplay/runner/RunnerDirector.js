import {
  RUNNER_ENTITY_SPAWN_DEPTH,
  RUNNER_ENTITY_TYPES,
  RUNNER_MAX_ENTITIES,
  RUNNER_MUTATION_ARM_DEPTH,
  RUNNER_ROUTE_IDS,
  RUNNER_ROUTES,
  RUNNER_SECONDARY_ELEMENTS,
  RUNNER_WEAPON_CORES,
  RUNNER_WEAPON_MODULE_IDS,
  createRunnerSeed,
  getRunnerRoute,
  getRunnerSection,
  getRunnerWeaponModule,
} from './RunnerRules.js'

/** 单个编队实体的分类：强化门 / 精英与障碍。 */
function classifyPatternEntity(typeId) {
  const config = RUNNER_ENTITY_TYPES[typeId]
  if (!config) return { gate: false, danger: false }
  return {
    gate: config.kind === 'gate',
    danger: !!config.elite || config.kind === 'hazard' || config.kind === 'obstacle',
  }
}

/**
 * 编队分类。全部从既有 section.patterns 推导，不新增内容。
 *   gate    至少一个强化门
 *   supply  两个以上强化门（构筑机会密度更高）
 *   danger  至少一个精英/障碍
 *   safe    完全不含精英/障碍
 */
function classifyPattern(pattern) {
  let gateCount = 0
  let danger = false
  for (const typeId of pattern) {
    if (!typeId) continue
    const flags = classifyPatternEntity(typeId)
    if (flags.gate) gateCount += 1
    if (flags.danger) danger = true
  }
  return { gate: gateCount >= 1, supply: gateCount >= 2, danger, safe: !danger }
}

/**
 * 路线偏好只对既有 section.patterns 做编队池筛选，不额外消费 RNG：
 * 未选路线（routeId 为 null）时返回原池，draw 次数与 Phase B 前完全一致。
 */
function selectRoutePatternPool(patterns, route) {
  const kind = route?.preferPatternKind
  if (!kind) return patterns
  const preferred = patterns.filter((pattern) => classifyPattern(pattern)[kind])
  return preferred.length ? preferred : patterns
}

export class RunnerDirector {
  constructor(seed) {
    this.reset(seed)
  }

  reset(seed) {
    this.seed = createRunnerSeed(seed)
    this._state = this.seed
    this._nextEntityId = 1
    this._nextRowId = 1
  }

  random() {
    this._state = (Math.imul(this._state, 1664525) + 1013904223) >>> 0
    return this._state / 0x100000000
  }

  _shuffle(values) {
    const result = values.slice()
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1))
      const temp = result[i]
      result[i] = result[j]
      result[j] = temp
    }
    return result
  }

  /**
   * 生成一次遭遇行。
   * routeId 为 null 时与 Phase B 前逐字一致（同一 draw 次数 + 同一编队池）；
   * 选中路线后按路线 modifier 缩放血量并筛选编队池，从而真实改变后续遭遇。
   */
  createEncounter(elapsed, activeCount = 0, submodeId = 'marathon', routeId = null) {
    if (activeCount >= RUNNER_MAX_ENTITIES) return []
    const section = getRunnerSection(elapsed, submodeId)
    const route = getRunnerRoute(routeId)
    const pool = selectRoutePatternPool(section.patterns, route)
    const source = pool[Math.floor(this.random() * pool.length)]
    const pattern = this._shuffle(source)
    // 每排保留一条无伤通路，普通换道即可通过，不依赖已移除的急闪。
    if (pattern.every(id => id && RUNNER_ENTITY_TYPES[id]?.damage > 0)) pattern[1] = null
    const rowId = this._nextRowId++
    const hpScale = section.hpMultiplier * (route?.hpMultiplier || 1)
    const entities = []

    for (let lane = 0; lane < pattern.length; lane++) {
      const typeId = pattern[lane]
      if (!typeId || activeCount + entities.length >= RUNNER_MAX_ENTITIES) continue
      const config = RUNNER_ENTITY_TYPES[typeId]
      const count = Math.min(config.packCount || 1, RUNNER_MAX_ENTITIES - activeCount - entities.length)
      for (let member = 0; member < count; member++) {
        const depth = RUNNER_ENTITY_SPAWN_DEPTH + member * (config.packSpacing || 0)
        const maxHp = Math.max(1, Math.ceil(config.hp * hpScale))
        entities.push({
          id: this._nextEntityId++,
          rowId,
          lane,
          type: config.id,
          kind: config.kind,
          reward: config.reward || null,
          name: config.name,
          sprite: config.sprite || null,
          color: config.color,
          elite: !!config.elite,
          behavior: config.behavior || null,
          armor: config.armor || 0,
          supportReduction: config.supportReduction || 0,
          renderScale: config.renderScale || 1,
          depth,
          previousDepth: depth,
          speed: section.advanceSpeed,
          baseSpeed: section.advanceSpeed,
          chargeAt: config.chargeAt || 0,
          chargeDelay: config.chargeDelay || 0,
          chargeMultiplier: config.chargeMultiplier || 1,
          chargeTelegraph: 0,
          charging: false,
          attackAt: config.attackAt || 0,
          attackDelay: config.attackDelay || 0,
          attackTimer: 0,
          attackLane: null,
          attackLanes: null,
          attacking: false,
          hasAttacked: false,
          projectileDamage: config.projectileDamage || 0,
          projectileHp: config.projectileHp || 0,
          corrosionStacks: 0,
          hp: maxHp,
          maxHp,
          damage: config.damage || 0,
          score: config.score || 0,
          hitFlash: 0,
          active: true,
        })
      }
    }
    return entities
  }

  /**
   * 生成一次岔口：三条车道各一块路线牌，lane -> route 为固定映射，永不随机重排。
   * 本方法完全不调用 random()——这是「第一次岔口之前 encounter 随机序列
   * 不被无意义扰动」的前提；只有 rowId / entityId 计数器会前进。
   */
  createForkRow(forkId, elapsed, submodeId = 'marathon') {
    const section = getRunnerSection(elapsed, submodeId)
    const rowId = this._nextRowId++
    return RUNNER_ROUTE_IDS.map((routeId, lane) => {
      const route = RUNNER_ROUTES[routeId]
      return {
        id: this._nextEntityId++,
        rowId,
        forkId,
        lane,
        type: `fork-${routeId}`,
        kind: 'fork',
        routeId,
        name: route.label,
        shortName: route.shortLabel,
        color: route.color,
        depth: RUNNER_ENTITY_SPAWN_DEPTH,
        previousDepth: RUNNER_ENTITY_SPAWN_DEPTH,
        speed: section.advanceSpeed,
        baseSpeed: section.advanceSpeed,
        // 路线牌不可被子弹命中、不参与碰撞、不计分
        hp: 0,
        maxHp: 0,
        damage: 0,
        score: 0,
        reward: null,
        behavior: null,
        elite: false,
        hitFlash: 0,
        active: true,
      }
    })
  }

  createWeaponChoice() {
    const rowId = this._nextRowId++
    const coreIds = this._shuffle(Object.keys(RUNNER_WEAPON_CORES))
    return coreIds.map((coreId, lane) => {
      const core = RUNNER_WEAPON_CORES[coreId]
      return {
        id: this._nextEntityId++,
        rowId,
        lane,
        type: `mutation-${coreId}`,
        kind: 'mutation',
        reward: 'weapon',
        weaponCore: coreId,
        name: core.name,
        color: core.color,
        depth: 0.08,
        previousDepth: 0.08,
        speed: 0.115,
        baseSpeed: 0.115,
        armedDepth: RUNNER_MUTATION_ARM_DEPTH,
        hp: 3,
        maxHp: 3,
        damage: 0,
        score: 250,
        hitFlash: 0,
        active: true,
      }
    })
  }

  createSecondaryChoice() {
    const rowId = this._nextRowId++
    const elemIds = this._shuffle(Object.keys(RUNNER_SECONDARY_ELEMENTS))
    return elemIds.map((elemId, lane) => {
      const elem = RUNNER_SECONDARY_ELEMENTS[elemId]
      return {
        id: this._nextEntityId++,
        rowId,
        lane,
        type: `secondary-${elemId}`,
        kind: 'secondary_mutation',
        reward: 'element',
        secondaryElement: elemId,
        name: elem.name,
        color: elem.color,
        depth: 0.08,
        previousDepth: 0.08,
        speed: 0.115,
        baseSpeed: 0.115,
        armedDepth: RUNNER_MUTATION_ARM_DEPTH,
        hp: 3,
        maxHp: 3,
        damage: 0,
        score: 300,
        hitFlash: 0,
        active: true,
      }
    })
  }

  /**
   * D1 第三槽：module 三选一。刻意使用独立 kind `module_mutation` 而不是 'gate'——
   * B.1 已经证明磁暴只应该吸普通奖励门，让 module 门冒充 gate 等于把同一个
   * 冻结 bug 重新埋一遍。这里让两者在数据上就不可能互相误伤。
   */
  createModuleChoice() {
    const rowId = this._nextRowId++
    const moduleIds = this._shuffle(RUNNER_WEAPON_MODULE_IDS)
    return moduleIds.map((moduleId, lane) => {
      const module = getRunnerWeaponModule(moduleId)
      return {
        id: this._nextEntityId++,
        rowId,
        lane,
        type: `module-${moduleId}`,
        kind: 'module_mutation',
        reward: 'module',
        weaponModule: moduleId,
        name: module.name,
        color: module.color,
        depth: 0.08,
        previousDepth: 0.08,
        speed: 0.115,
        baseSpeed: 0.115,
        armedDepth: RUNNER_MUTATION_ARM_DEPTH,
        hp: 3,
        maxHp: 3,
        damage: 0,
        score: 300,
        hitFlash: 0,
        active: true,
      }
    })
  }

  createFragments(parent, elapsed, activeCount = 0) {
    const config = RUNNER_ENTITY_TYPES.fragment
    const section = getRunnerSection(elapsed)
    const count = Math.min(2, RUNNER_MAX_ENTITIES - activeCount)
    const fragments = []
    for (let member = 0; member < count; member++) {
      const depth = Math.max(0.03, parent.depth - 0.025 - member * 0.045)
      const maxHp = Math.max(1, Math.ceil(config.hp * section.hpMultiplier))
      fragments.push({
        id: this._nextEntityId++,
        rowId: parent.rowId,
        lane: parent.lane,
        type: config.id,
        kind: config.kind,
        reward: null,
        name: config.name,
        sprite: config.sprite,
        color: config.color,
        elite: false,
        behavior: null,
        armor: 0,
        supportReduction: 0,
        renderScale: config.renderScale,
        depth,
        previousDepth: depth,
        speed: parent.baseSpeed * 1.3,
        baseSpeed: parent.baseSpeed * 1.3,
        chargeAt: 0,
        chargeDelay: 0,
        chargeMultiplier: 1,
        chargeTelegraph: 0,
        charging: false,
        attackAt: 0,
        attackDelay: 0,
        attackTimer: 0,
        attackLane: null,
        attackLanes: null,
        attacking: false,
        hasAttacked: false,
        projectileDamage: 0,
        projectileHp: 0,
        corrosionStacks: 0,
        hp: maxHp,
        maxHp,
        damage: config.damage,
        score: config.score,
        hitFlash: 0,
        active: true,
      })
    }
    return fragments
  }
}
