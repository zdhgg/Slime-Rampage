import {
  RUNNER_ENTITY_SPAWN_DEPTH,
  RUNNER_ENTITY_TYPES,
  RUNNER_MAX_ENTITIES,
  RUNNER_MUTATION_ARM_DEPTH,
  RUNNER_SECONDARY_ELEMENTS,
  RUNNER_WEAPON_CORES,
  createRunnerSeed,
  getRunnerSection,
} from './RunnerRules.js'

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

  createEncounter(elapsed, activeCount = 0, submodeId = 'marathon') {
    if (activeCount >= RUNNER_MAX_ENTITIES) return []
    const section = getRunnerSection(elapsed, submodeId)
    const source = section.patterns[Math.floor(this.random() * section.patterns.length)]
    const pattern = this._shuffle(source)
    const rowId = this._nextRowId++
    const entities = []

    for (let lane = 0; lane < pattern.length; lane++) {
      const typeId = pattern[lane]
      if (!typeId || activeCount + entities.length >= RUNNER_MAX_ENTITIES) continue
      const config = RUNNER_ENTITY_TYPES[typeId]
      const count = Math.min(config.packCount || 1, RUNNER_MAX_ENTITIES - activeCount - entities.length)
      for (let member = 0; member < count; member++) {
        const depth = RUNNER_ENTITY_SPAWN_DEPTH + member * (config.packSpacing || 0)
        const maxHp = Math.max(1, Math.ceil(config.hp * section.hpMultiplier))
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
