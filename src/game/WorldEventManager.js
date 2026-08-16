import { Entity } from './core/Entity.js'

const TAU = Math.PI * 2
const FIRST_EVENT_DELAY = 16
const NEXT_EVENT_DELAY = 42
const EVENT_MARGIN = 150
const EVENT_RADIUS = 108
const ACTIVATION_TIME = 0.7

const EVENTS = {
  hunt: {
    title: '精英巢穴',
    brief: '猎杀巢穴守卫',
    color: '#d6a642',
    reward: '元素核心 + 大型经验',
    duration: 28,
    goal: 3,
  },
  beacon: {
    title: '勇者传送信标',
    brief: '留在区域内封锁信标',
    color: '#59b7d8',
    reward: '王级秘籍 + 经验',
    duration: 22,
    goal: 9,
  },
  surge: {
    title: '污染黏液池',
    brief: '承受追猎浪潮',
    color: '#76c85a',
    reward: '完全恢复 + 大型经验',
    duration: 13,
    goal: 12,
  },
}

const EVENT_TYPES = Object.keys(EVENTS)
const AFFIXES = ['swift', 'shielded', 'explosive', 'summoner']
const rand = (min, max) => min + Math.random() * (max - min)
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

/**
 * 世界事件管理器：把大地图从纯装饰变成可主动前往的风险/奖励目标。
 * 同时只保留一个事件，避免与 Boss、升级和元素核心争夺注意力。
 */
export class WorldEventManager extends Entity {
  constructor() {
    super()
    this.current = null
    this.nextIn = FIRST_EVENT_DELAY
    this.completed = 0
    this.failed = 0
    this._serial = 0
    this._lastType = null
    this._pulse = 0
  }

  reset() {
    this.current = null
    this.nextIn = FIRST_EVENT_DELAY
    this.completed = 0
    this.failed = 0
    this._serial = 0
    this._lastType = null
    this._pulse = 0
  }

  get objectiveInfo() {
    const e = this.current
    if (!e) return null
    const p = this.game.player
    const distance = Math.hypot(e.x - p.x, e.y - p.y)
    let label = e.def.brief
    let progress = e.progress
    let total = e.goal
    if (e.state === 'available') {
      label = '抵达事件区域'
      progress = e.activation
      total = ACTIVATION_TIME
    } else if (e.state === 'complete') {
      label = '事件完成'
      progress = total
    } else if (e.state === 'failed') {
      label = '事件失败'
      progress = 0
    }
    return {
      type: e.type,
      title: e.def.title,
      label,
      reward: e.def.reward,
      state: e.state,
      progress,
      total,
      timeLeft: Math.max(0, e.timeLeft),
      distance,
      x: e.x,
      y: e.y,
      color: e.def.color,
      completed: this.completed,
    }
  }

  update(dt) {
    if (this.game.player.dead) return
    this._pulse += dt

    if (!this.current) {
      this.nextIn -= dt
      if (
        this.nextIn <= 0 &&
        !this.game.enemyManager.hasBoss &&
        this.game.canStartWorldEvent !== false
      ) this._spawnEvent()
      return
    }

    const e = this.current
    if (e.state === 'complete' || e.state === 'failed') {
      e.linger -= dt
      if (e.linger <= 0) {
        this.current = null
        this.nextIn = NEXT_EVENT_DELAY
      }
      return
    }

    e.timeLeft -= dt
    if (e.timeLeft <= 0) {
      this._fail(e.state === 'available' ? '事件目标已转移' : '未能在期限内完成')
      return
    }

    const p = this.game.player
    const dx = p.x - e.x
    const dy = p.y - e.y
    const inside = dx * dx + dy * dy <= EVENT_RADIUS * EVENT_RADIUS

    if (e.state === 'available') {
      e.activation = inside
        ? Math.min(ACTIVATION_TIME, e.activation + dt)
        : Math.max(0, e.activation - dt * 0.75)
      if (e.activation >= ACTIVATION_TIME) this._activate()
      return
    }

    if (e.type === 'beacon') {
      e.progress = inside
        ? Math.min(e.goal, e.progress + dt)
        : Math.max(0, e.progress - dt * 0.35)
      this._updateAmbush(dt, ['knight', 'mage', 'archer'], 3.2)
      if (e.progress >= e.goal) this._complete()
    } else if (e.type === 'surge') {
      e.progress = Math.min(e.goal, e.progress + dt)
      this._updateAmbush(dt, ['assassin', 'berserker', 'knight'], 2.4)
      if (e.progress >= e.goal) this._complete()
    }
  }

  /** 测试和事件导演共用的显式生成入口；type 省略时轮换随机类型。 */
  spawnEvent(type = null) {
    if (this.current || this.game.canStartWorldEvent === false) return null
    return this._spawnEvent(type)
  }

  /** 终局切换为中立取消，不计入事件失败。 */
  cancelForFinale() {
    this.current = null
    this.nextIn = Infinity
  }

  cancelForTransition() {
    this.current = null
    this.nextIn = Infinity
  }

  _spawnEvent(forcedType = null) {
    let type = forcedType
    if (!EVENTS[type]) {
      const pool = EVENT_TYPES.filter((candidate) => candidate !== this._lastType)
      type = pool[(Math.random() * pool.length) | 0]
    }
    this._lastType = type
    const def = EVENTS[type]
    const pos = this._pickPosition()
    this.current = {
      token: `world-event-${++this._serial}`,
      type,
      def,
      x: pos.x,
      y: pos.y,
      state: 'available',
      activation: 0,
      progress: 0,
      goal: def.goal,
      timeLeft: 44,
      spawnTimer: 0,
      linger: 0,
    }
    this.game.onWorldEvent?.({ kind: 'appeared', title: def.title, reward: def.reward })
    return this.current
  }

  _pickPosition() {
    const p = this.game.player
    const maxX = Math.max(EVENT_MARGIN, this.game.worldWidth - EVENT_MARGIN)
    const maxY = Math.max(EVENT_MARGIN, this.game.worldHeight - EVENT_MARGIN)
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * TAU
      const distance = rand(520, 760)
      const x = clamp(p.x + Math.cos(angle) * distance, EVENT_MARGIN, maxX)
      const y = clamp(p.y + Math.sin(angle) * distance, EVENT_MARGIN, maxY)
      if (Math.hypot(x - p.x, y - p.y) >= 360) return { x, y }
    }
    return {
      x: clamp(p.x + 520, EVENT_MARGIN, maxX),
      y: clamp(p.y, EVENT_MARGIN, maxY),
    }
  }

  _activate() {
    const e = this.current
    if (!e || e.state !== 'available') return
    e.state = 'active'
    e.timeLeft = e.def.duration
    e.progress = 0
    e.spawnTimer = 0
    this.game.sound.wave()
    this.game.onWorldEvent?.({ kind: 'activated', title: e.def.title, brief: e.def.brief })

    if (e.type === 'hunt') {
      const count = e.goal
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + Math.random() * 0.35
        const distance = rand(100, 155)
        const type = ['knight', 'mage', 'berserker'][i % 3]
        this.game.enemyManager.spawnAt(
          e.x + Math.cos(angle) * distance,
          e.y + Math.sin(angle) * distance,
          type,
          { elite: true, affix: AFFIXES[(Math.random() * AFFIXES.length) | 0], eventToken: e.token }
        )
      }
    } else if (e.type === 'beacon') {
      this._spawnAmbush(['knight', 'mage', 'archer'], 3)
    } else {
      this.game.player.heal(2)
      this._spawnAmbush(['assassin', 'berserker', 'knight'], 4)
    }
  }

  _updateAmbush(dt, types, interval) {
    const e = this.current
    e.spawnTimer -= dt
    if (e.spawnTimer > 0) return
    e.spawnTimer = interval
    const count = Math.min(3, 1 + Math.floor(this.game.enemyManager.wave / 6))
    this._spawnAmbush(types, count)
  }

  _spawnAmbush(types, count) {
    const e = this.current
    if (!e) return
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU
      const distance = rand(150, 220)
      const type = types[(Math.random() * types.length) | 0]
      this.game.enemyManager.spawnAt(
        clamp(e.x + Math.cos(angle) * distance, 20, this.game.worldWidth - 20),
        clamp(e.y + Math.sin(angle) * distance, 20, this.game.worldHeight - 20),
        type,
        { eventToken: e.token }
      )
    }
  }

  onEnemyDefeated(enemy) {
    const e = this.current
    if (!e || e.state !== 'active' || e.type !== 'hunt') return
    if (enemy.eventToken !== e.token) return
    e.progress = Math.min(e.goal, e.progress + 1)
    if (e.progress >= e.goal) this._complete()
  }

  _complete() {
    const e = this.current
    if (!e || e.state !== 'active') return
    e.state = 'complete'
    e.linger = 2.4
    e.timeLeft = 0
    this.completed++

    if (e.type === 'hunt') {
      const elements = ['fire', 'water', 'poison', 'lightning']
      this.game.gemManager.spawn(e.x, e.y, 0, elements[(Math.random() * elements.length) | 0])
      this.game.gemManager.spawn(e.x, e.y, 65)
    } else if (e.type === 'beacon') {
      this.game.gemManager.spawn(e.x, e.y, 0, 'tome')
      this.game.gemManager.spawn(e.x, e.y, 40)
    } else {
      this.game.player.heal(this.game.player.maxHp)
      this.game.gemManager.spawn(e.x, e.y, 70)
    }

    this.game.enemyManager.addText(e.x, e.y - 20, '事件完成', e.def.reward, e.def.color, 15)
    this.game.sound.wave()
    this.game.onWorldEvent?.({ kind: 'completed', title: e.def.title, reward: e.def.reward })
  }

  _fail(reason) {
    const e = this.current
    if (!e || e.state === 'complete' || e.state === 'failed') return
    e.state = 'failed'
    e.linger = 2
    e.timeLeft = 0
    this.failed++
    this.game.onWorldEvent?.({ kind: 'failed', title: e.def.title, reason })
  }

  render(ctx) {
    const e = this.current
    if (!e) return
    const cam = this.game.camera
    if (e.x < cam.x - 150 || e.x > cam.x + this.game.width + 150) return
    if (e.y < cam.y - 150 || e.y > cam.y + this.game.height + 150) return

    const pulse = 0.5 + Math.sin(this._pulse * 3) * 0.5
    const active = e.state === 'active'
    const done = e.state === 'complete'
    const failed = e.state === 'failed'
    const color = failed ? '#c95959' : e.def.color
    const progress = e.state === 'available'
      ? e.activation / ACTIVATION_TIME
      : e.goal > 0
      ? e.progress / e.goal
      : 0

    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.fillStyle = failed ? 'rgba(88, 28, 28, 0.18)' : 'rgba(8, 14, 10, 0.4)'
    ctx.beginPath()
    ctx.arc(0, 0, EVENT_RADIUS, 0, TAU)
    ctx.fill()

    ctx.strokeStyle = color
    ctx.globalAlpha = done ? 0.85 : 0.48 + pulse * 0.22
    ctx.lineWidth = active ? 2.5 : 1.5
    ctx.setLineDash(active || done || failed ? [] : [9, 7])
    ctx.beginPath()
    ctx.arc(0, 0, EVENT_RADIUS, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    if (progress > 0 && !failed) {
      ctx.globalAlpha = 0.95
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, EVENT_RADIUS - 7, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, progress))
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, 0, 18 + pulse * 2, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#111712'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(done ? 'OK' : failed ? 'X' : '!', 0, 1)

    ctx.font = 'bold 13px sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f3f4ed'
    ctx.fillText(e.def.title, 0, -EVENT_RADIUS - 16)
    ctx.restore()
  }
}
