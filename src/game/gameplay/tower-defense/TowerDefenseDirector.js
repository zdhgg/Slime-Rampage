import {
  TOWER_DEFENSE_ENEMY_TYPES,
  TOWER_DEFENSE_INTERMISSION,
  TOWER_DEFENSE_PREPARATION,
  TOWER_DEFENSE_WAVES,
  getEnemyType,
} from './TowerDefenseRules.js'

/** Deterministic composition-wave director. It has no random or rendering dependencies. */
export class TowerDefenseDirector {
  constructor(waves = null) {
    this.waves = waves || TOWER_DEFENSE_WAVES
    this.reset(this.waves)
  }

  loadWaves(waves) {
    this.waves = Array.isArray(waves) && waves.length ? waves : TOWER_DEFENSE_WAVES
    this.reset(this.waves)
  }

  reset(waves = null) {
    if (waves) {
      this.waves = Array.isArray(waves) && waves.length ? waves : TOWER_DEFENSE_WAVES
    }
    this.waveIndex = -1
    this.completedWaves = 0
    this.phase = 'intermission'
    this.timer = TOWER_DEFENSE_PREPARATION
    this.spawned = 0
    this.groupIndex = 0
    this.groupSpawned = 0
    this._nextEnemyId = 1
    return this
  }

  update(dt, activeEnemyCount) {
    const events = {
      spawns: [],
      waveStarted: null,
      waveCompleted: null,
      allCompleted: false,
    }
    if (this.phase === 'complete') {
      events.allCompleted = true
      return events
    }
    if (dt < 0) return events

    this.timer -= dt
    if (this.phase === 'intermission' && this.timer <= 0) {
      this.waveIndex++
      this.spawned = 0
      this.groupIndex = 0
      this.groupSpawned = 0
      this.phase = 'spawning'
      events.waveStarted = this.waveIndex + 1
    }

    if (this.phase === 'spawning') this._spawnDueEnemies(events)

    if (this.phase === 'waiting' && activeEnemyCount === 0) {
      this.completedWaves = this.waveIndex + 1
      events.waveCompleted = this.completedWaves
      if (this.completedWaves >= this.waves.length) {
        this.phase = 'complete'
        this.timer = 0
        events.allCompleted = true
      } else {
        this.phase = 'intermission'
        this.timer = TOWER_DEFENSE_INTERMISSION
      }
    }

    return events
  }

  _spawnDueEnemies(events) {
    const wave = this.waves[this.waveIndex]
    if (!wave) return

    while (this.timer <= 0 && this.groupIndex < wave.groups.length) {
      const group = wave.groups[this.groupIndex]
      events.spawns.push(this._createEnemy(group))
      this.spawned++
      this.groupSpawned++
      this.timer += group.interval

      if (this.groupSpawned >= group.count) {
        this.groupIndex++
        this.groupSpawned = 0
        if (this.groupIndex < wave.groups.length) this.timer += group.gap || 0
      }
    }

    if (this.groupIndex >= wave.groups.length) this.phase = 'waiting'
  }

  _createEnemy(group) {
    const type = getEnemyType(group.type)
    const scale = Number.isFinite(group.scale) ? group.scale : 1
    const hp = Math.max(1, Math.round(type.hp * scale))
    const shield = Math.max(0, Math.round(type.traits.shield * scale))
    return {
      id: this._nextEnemyId++,
      typeId: type.id,
      name: type.name,
      shape: type.shape,
      wave: this.waveIndex + 1,
      progress: 0,
      hp,
      maxHp: hp,
      speed: type.speed,
      baseSpeed: type.speed,
      reward: Math.max(1, Math.round(type.reward * Math.sqrt(scale))),
      damage: type.damage,
      color: type.color,
      size: type.size,
      boss: !!type.boss,
      armor: type.traits.armor,
      shield,
      maxShield: shield,
      slowResistance: type.traits.slowResistance,
      supportRadius: type.traits.supportRadius,
      supportHeal: type.traits.supportHeal,
      supportTimer: 1.2,
      splitCount: type.traits.splitCount,
      splitResolved: false,
      bossPhase: 1,
      slowTimer: 0,
      slowRatio: 0,
      freezeTimer: 0,
      frostStacks: 0,
      frostStackTimer: 0,
      speedBoostTimer: 0,
      burnTimer: 0,
      burnTick: 0,
      burnDamage: 0,
      hitFlash: 0,
      shieldFlash: 0,
      supportFlash: 0,
      active: true,
    }
  }
}

export { TOWER_DEFENSE_ENEMY_TYPES }
