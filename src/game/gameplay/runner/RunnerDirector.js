import {
  RUNNER_BOSSES,
  RUNNER_BOSS_RELIC_IDS,
  RUNNER_BOSS_RELICS,
  RUNNER_ENTITY_SPAWN_DEPTH,
  RUNNER_ENTITY_TYPES,
  RUNNER_KINETIC_TRIGGERS,
  RUNNER_KINETIC_TRIGGER_IDS,
  RUNNER_MAX_ENTITIES,
  RUNNER_MAX_KINETICS,
  RUNNER_MAX_MODULES,
  RUNNER_MUTATION_ARM_DEPTH,
  RUNNER_ROUTES,
  RUNNER_ROUTE_IDS,
  RUNNER_SECONDARY_ELEMENTS,
  RUNNER_SECONDARY_ELEMENT_IDS,
  RUNNER_TERRAIN_TYPES,
  RUNNER_WEAPON_CORES,
  RUNNER_WEAPON_CORE_IDS,
  RUNNER_WEAPON_MODULES,
  RUNNER_WEAPON_MODULE_IDS,
  createRunnerSeed,
  getRunnerRoute,
  getRunnerSection,
  getRunnerWeaponCore,
  getRunnerWeaponModule,
} from './RunnerRules.js'
import { getRunnerDraftSynergyHint } from './RunnerEffects.js'

function classifyPatternEntity(typeId) {
  const config = RUNNER_ENTITY_TYPES[typeId]
  if (!config) return { gate: false, danger: false }
  return {
    gate: config.kind === 'gate',
    danger: !!config.elite || config.kind === 'hazard' || config.kind === 'obstacle',
  }
}

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
    this._nextTerrainId = 1
    this._nextBossGroupId = 1
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

  _pickWeighted(pool, count) {
    const remaining = pool.slice()
    const picked = []
    while (picked.length < count && remaining.length > 0) {
      let totalWeight = 0
      for (const item of remaining) totalWeight += Math.max(0.05, item.weight || 1)
      let roll = this.random() * totalWeight
      let chosenIndex = remaining.length - 1
      for (let i = 0; i < remaining.length; i++) {
        roll -= Math.max(0.05, remaining[i].weight || 1)
        if (roll <= 0) {
          chosenIndex = i
          break
        }
      }
      picked.push(remaining.splice(chosenIndex, 1)[0])
    }
    return picked
  }

  /**
   * 生成一次遭遇行（保持确定性 RNG）。
   */
  createEncounter(elapsed, activeCount = 0, submodeId = 'marathon', routeId = null, modifiers = null) {
    if (activeCount >= RUNNER_MAX_ENTITIES) return []
    const section = getRunnerSection(elapsed, submodeId)
    const route = getRunnerRoute(routeId)
    const pool = selectRoutePatternPool(section.patterns, route)
    const source = pool[Math.floor(this.random() * pool.length)]
    // 保持特定协同编队（如 link_priest + brute + link_priest）居中或随机分布
    const pattern = source[0] === 'link_priest' && source[2] === 'link_priest'
      ? source.slice()
      : this._shuffle(source)

    // 爆破专家芯片：在空位补充高能炸药桶
    if (modifiers?.extraBarrels) {
      const emptyLane = pattern.findIndex((id) => !id)
      if (emptyLane >= 0 && this._nextRowId % 2 === 1) pattern[emptyLane] = 'barrel'
    }

    // 三道皆有威胁时引入火力质检（DPS Check）：偶数排插炸药桶或留空
    if (pattern.every((id) => id && RUNNER_ENTITY_TYPES[id]?.damage > 0)) {
      pattern[1] = this._nextRowId % 2 === 0 ? 'barrel' : null
    }

    const rowId = this._nextRowId++
    const hpScale = section.hpMultiplier * (route?.hpMultiplier || 1) * (modifiers?.hpMul || 1)
    const collapsedLane = modifiers?.collapsedLane ?? null
    const liveLanes = [0, 1, 2].filter((l) => l !== collapsedLane)
    const entities = []

    for (let origLane = 0; origLane < pattern.length; origLane++) {
      const typeId = pattern[origLane]
      if (!typeId || activeCount + entities.length >= RUNNER_MAX_ENTITIES) continue
      const config = RUNNER_ENTITY_TYPES[typeId]
      if (!config) continue
      // 窄桥塌陷期间，把原本刷在塌陷道上的敌人/补给导流至存活车道
      const lane = origLane === collapsedLane
        ? liveLanes[(rowId + origLane) % liveLanes.length]
        : origLane

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
          chargeable: !!config.chargeable,
          chargeLevel: config.chargeable ? 1 : 0,
          chargeProgress: 0,
          chargeMax: config.chargeable ? 9 : 0,
          creditCost: config.creditCost || 0,
          name: config.name,
          sprite: config.sprite || null,
          color: config.color,
          elite: !!config.elite,
          behavior: config.behavior || null,
          armor: config.armor || 0,
          supportReduction: config.supportReduction || 0,
          aerialEvasion: config.aerialEvasion || 0,
          isGround: !!config.isGround,
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
          shiftAt: config.shiftAt || 0,
          shiftDelay: config.shiftDelay || 0,
          shiftTelegraph: 0,
          shiftTargetLane: null,
          hasShifted: false,
          attackAt: config.attackAt || 0,
          attackDelay: config.attackDelay || 0,
          attackTimer: 0,
          attackLane: null,
          attackLanes: null,
          attacking: false,
          hasAttacked: false,
          projectileDamage: config.projectileDamage || 0,
          projectileHp: config.projectileHp || 0,
          switchFlipped: false,
          corrosionStacks: 0,
          focusStacks: 0,
          freezeTimer: 0,
          slowTimer: 0,
          slowRatio: 0,
          hp: maxHp,
          maxHp,
          damage: config.damage || 0,
          score: config.score || 0,
          xp: config.xp || 0,
          hitFlash: 0,
          active: true,
        })
      }
    }
    return entities
  }

  /**
   * 生成地面战术带（加速轨 / 减速沼 / 跳板弹射垫）。
   */
  createTerrainStrip(elapsed, submodeId = 'marathon', collapsedLane = null) {
    const section = getRunnerSection(elapsed, submodeId)
    const types = Object.keys(RUNNER_TERRAIN_TYPES)
    const typeId = types[Math.floor(this.random() * types.length)]
    const cfg = RUNNER_TERRAIN_TYPES[typeId]
    const liveLanes = [0, 1, 2].filter((l) => l !== collapsedLane)
    const lane = liveLanes[Math.floor(this.random() * liveLanes.length)]
    return {
      id: this._nextTerrainId++,
      type: cfg.id,
      name: cfg.name,
      shortLabel: cfg.shortLabel,
      color: cfg.color,
      lane,
      depth: -0.08,
      length: 0.24,
      speed: section.advanceSpeed,
      triggered: false,
      active: true,
    }
  }

  /**
   * 生成三道部位破坏型阶段守关 Boss。
   */
  createBossEncounter(bossId, elapsed, submodeId = 'marathon', hpMul = 1) {
    const template = RUNNER_BOSSES[bossId] || RUNNER_BOSSES.fortress_warden
    const section = getRunnerSection(elapsed, submodeId)
    const scale = Math.max(1, section.hpMultiplier || 1) * (hpMul || 1)
    const bossGroupId = this._nextBossGroupId++
    const rowId = this._nextRowId++
    return template.parts.map((part) => {
      const hp = Math.max(20, Math.ceil(template.baseHp * part.hpRatio * scale))
      return {
        id: this._nextEntityId++,
        rowId,
        bossGroupId,
        bossId: template.id,
        bossName: template.name,
        bossKicker: template.kicker,
        partRole: part.role,
        lane: part.lane,
        type: 'stage_boss_part',
        kind: 'enemy',
        boss: true,
        elite: true,
        name: part.name,
        color: template.color,
        armor: part.armoredReduction || 0,
        baseArmor: part.armoredReduction || 0,
        supportReduction: 0,
        renderScale: part.lane === 1 ? 1.45 : 1.18,
        depth: 0.06,
        previousDepth: 0.06,
        targetDepth: 0.24,
        speed: 0.16,
        baseSpeed: 0.16,
        attackCooldown: part.attackCooldown || 2.5,
        attackTimer: 1.5,
        attackTelegraph: 0,
        attackLanes: null,
        corrosionStacks: 0,
        focusStacks: 0,
        freezeTimer: 0,
        slowTimer: 0,
        slowRatio: 0,
        hp,
        maxHp: hp,
        damage: 2,
        score: part.lane === 1 ? 3500 : 1200,
        xp: part.lane === 1 ? 60 : 30,
        hitFlash: 0,
        active: true,
      }
    })
  }

  /**
   * 随机抽卡三选一：结合当前四维构筑智能加权。
   */
  createDraftOptions(state, isBossRelic = false) {
    const candidates = []
    const modules = state.modules || []
    const kinetics = state.kinetics || []
    const relics = state.relics || []

    if (isBossRelic) {
      const relicCards = []
      for (const id of RUNNER_BOSS_RELIC_IDS) {
        if (relics.includes(id)) continue
        const relic = RUNNER_BOSS_RELICS[id]
        relicCards.push({
          id: `relic:${id}`,
          category: 'relic',
          itemId: id,
          name: relic.name,
          badge: '👑 首领遗物',
          icon: relic.icon,
          color: relic.color,
          level: 1,
          nextLevel: 1,
          description: relic.description,
          weight: 99,
        })
      }
      if (relicCards.length >= 3) {
        return this._shuffle(relicCards).slice(0, 3).map((card) => ({
          ...card,
          synergyHint: card.synergyHint || getRunnerDraftSynergyHint(state, { category: card.category, id: card.itemId }),
        }))
      }
      candidates.push(...relicCards)
    }

    // 1. 尚未拥有主武器核心：首次升级必定提供 3 个核心挑选
    if (!state.weaponCore && !isBossRelic) {
      const picked = this._shuffle(RUNNER_WEAPON_CORE_IDS).slice(0, 3)
      return picked.map((id) => {
        const core = getRunnerWeaponCore(id)
        const card = {
          id: `core:${id}`,
          category: 'core',
          itemId: id,
          name: core.name,
          badge: '💎 主武器核心',
          icon: '⚔️',
          color: core.color,
          level: 0,
          nextLevel: 1,
          description: core.description,
          synergyHint: getRunnerDraftSynergyHint(state, { category: 'core', id }),
        }
        return card
      })
    }

    // 2. 主武器核心升级（最高 Lv.5）或切换核心（低权重）
    if (state.weaponCore && (state.weaponLevel || 1) < 5) {
      const core = getRunnerWeaponCore(state.weaponCore)
      candidates.push({
        id: `core:${core.id}`,
        category: 'core',
        itemId: core.id,
        name: core.name,
        badge: `💎 核心升阶 Lv.${state.weaponLevel + 1}`,
        icon: '⚔️',
        color: core.color,
        level: state.weaponLevel,
        nextLevel: state.weaponLevel + 1,
        description: core.description,
        weight: 2.2,
      })
    }

    // 3. 元素附魔（未拥有时高权重触发融合，已拥有则升级至 Lv.3）
    if (!state.secondaryElement) {
      for (const elemId of RUNNER_SECONDARY_ELEMENT_IDS) {
        const elem = RUNNER_SECONDARY_ELEMENTS[elemId]
        candidates.push({
          id: `element:${elemId}`,
          category: 'element',
          itemId: elemId,
          name: elem.name,
          badge: '🧪 元素附魔 · 触发融合',
          icon: elem.icon,
          color: elem.color,
          level: 0,
          nextLevel: 1,
          description: elem.description,
          weight: state.level === 2 ? 4.5 : 2.8,
        })
      }
    } else if ((state.elementLevel || 1) < 3) {
      const elem = RUNNER_SECONDARY_ELEMENTS[state.secondaryElement]
      candidates.push({
        id: `element:${elem.id}`,
        category: 'element',
        itemId: elem.id,
        name: elem.name,
        badge: `🧪 元素深化 Lv.${(state.elementLevel || 1) + 1}`,
        icon: elem.icon,
        color: elem.color,
        level: state.elementLevel || 1,
        nextLevel: (state.elementLevel || 1) + 1,
        description: `${elem.description}（元素特效伤害 +25%）`,
        weight: 1.7,
      })
    }

    // 4. 战术模组（最多 2 槽，已装备可升至 Lv.3）
    for (const modId of RUNNER_WEAPON_MODULE_IDS) {
      const existing = modules.find((m) => m.id === modId)
      if (existing) {
        if (existing.level < 3) {
          const mod = getRunnerWeaponModule(modId, existing.level + 1)
          candidates.push({
            id: `module:${modId}`,
            category: 'module',
            itemId: modId,
            name: mod.name,
            badge: `⑂ 模组强化 Lv.${existing.level + 1}`,
            icon: mod.icon,
            color: mod.color,
            level: existing.level,
            nextLevel: existing.level + 1,
            description: mod.description,
            weight: 1.9,
          })
        }
      } else if (modules.length < RUNNER_MAX_MODULES) {
        const mod = getRunnerWeaponModule(modId, 1)
        candidates.push({
          id: `module:${modId}`,
          category: 'module',
          itemId: modId,
          name: mod.name,
          badge: '⑂ 战术模组 · 新搭载',
          icon: mod.icon,
          color: mod.color,
          level: 0,
          nextLevel: 1,
          description: mod.description,
          weight: 1.55,
        })
      }
    }

    // 5. 机动触发器（最多 2 槽，已装备可升至 Lv.3）
    for (const kinId of RUNNER_KINETIC_TRIGGER_IDS) {
      const existing = kinetics.find((k) => k.id === kinId)
      if (existing) {
        if (existing.level < 3) {
          const kin = RUNNER_KINETIC_TRIGGERS[kinId]
          candidates.push({
            id: `kinetic:${kinId}`,
            category: 'kinetic',
            itemId: kinId,
            name: kin.name,
            badge: `💨 机动进阶 Lv.${existing.level + 1}`,
            icon: kin.icon,
            color: kin.color,
            level: existing.level,
            nextLevel: existing.level + 1,
            description: kin.description,
            weight: 1.75,
          })
        }
      } else if (kinetics.length < RUNNER_MAX_KINETICS) {
        const kin = RUNNER_KINETIC_TRIGGERS[kinId]
        candidates.push({
          id: `kinetic:${kinId}`,
          category: 'kinetic',
          itemId: kinId,
          name: kin.name,
          badge: '💨 机动触发 · 新搭载',
          icon: kin.icon,
          color: kin.color,
          level: 0,
          nextLevel: 1,
          description: kin.description,
          weight: 1.45,
        })
      }
    }

    // 6. 通用兜底卡（确保任何等级都能稳定抽满 3 张卡）
    const fallbacks = [
      {
        id: 'stat:attack',
        category: 'stat',
        itemId: 'attack',
        name: '胶质倍增弹头',
        badge: '⚔️ 基础火力',
        icon: '💥',
        color: '#66c9e8',
        level: state.attackDamage || 1,
        nextLevel: (state.attackDamage || 1) + 1,
        description: '基础攻击力 +1，并立刻触发 4 秒急速射击',
        weight: 1.0,
      },
      {
        id: 'stat:fortify',
        category: 'stat',
        itemId: 'fortify',
        name: '高密度凝胶护盾',
        badge: '🛡️ 生存续航',
        icon: '🛡️',
        color: '#70d8d3',
        level: state.shield || 0,
        nextLevel: (state.shield || 0) + 1,
        description: '恢复 1 点生命与 2 层护盾，并充能 +1 枚暴走印记',
        weight: 0.9,
      },
      {
        id: 'stat:fever',
        category: 'stat',
        itemId: 'fever',
        name: '暴走过载电池',
        badge: '⚡ 爆发充能',
        icon: '⚡',
        color: '#ffd166',
        level: state.feverCharges || 0,
        nextLevel: (state.feverCharges || 0) + 1,
        description: '立刻获得 +1 次暴走储备，并获得 800 悬赏信用额',
        weight: 0.95,
      },
    ]

    let picked = this._pickWeighted(candidates, 3)
    for (const fb of fallbacks) {
      if (picked.length >= 3) break
      if (!picked.some((c) => c.id === fb.id)) picked.push(fb)
    }

    // Lv.2 且尚无元素时，确保至少出现一张元素附魔卡以保障早期融合爽感
    if (!isBossRelic && !state.secondaryElement && state.level >= 2 && !picked.some((c) => c.category === 'element')) {
      const elemCard = candidates.find((c) => c.category === 'element')
      if (elemCard) picked[picked.length - 1] = elemCard
    }

    return picked.map((card) => ({
      ...card,
      synergyHint: card.synergyHint || getRunnerDraftSynergyHint(state, { category: card.category, id: card.itemId }),
    }))
  }

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

  // 保留兼容方法：可供旧测试或手动触发赛道三选一龙门
  createWeaponChoice() {
    const rowId = this._nextRowId++
    const coreIds = this._shuffle(['pierce', 'burst', 'corrosion'])
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
    const elemIds = this._shuffle(['lightning', 'flame', 'frost'])
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

  createModuleChoice() {
    const rowId = this._nextRowId++
    const moduleIds = this._shuffle(['split', 'ricochet', 'amplify'])
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
        aerialEvasion: 0,
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
        focusStacks: 0,
        hp: maxHp,
        maxHp,
        damage: config.damage,
        score: config.score,
        xp: config.xp || 4,
        hitFlash: 0,
        active: true,
      })
    }
    return fragments
  }
}
