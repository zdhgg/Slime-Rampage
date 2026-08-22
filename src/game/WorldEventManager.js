import { Entity } from './core/Entity.js'

const TAU = Math.PI * 2
const FIRST_EVENT_DELAY = 16
const NEXT_EVENT_DELAY = 42
const EVENT_MARGIN = 150
const EVENT_RADIUS = 108
const ACTIVATION_TIME = 0.7

const EVENTS = {
  hunt: {
    title: '讨伐队猎营',
    brief: '猎杀驻地精英',
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

function drawEventObject(ctx, type, state, time, color) {
  const disabled = state === 'failed'
  ctx.save()
  ctx.globalAlpha = disabled ? 0.55 : 1
  if (type === 'hunt') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.beginPath()
    ctx.ellipse(0, 18, 47, 15, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = disabled ? '#55413d' : '#674b43'
    ctx.beginPath()
    ctx.moveTo(-35, 16)
    ctx.lineTo(-8, -22)
    ctx.lineTo(19, 16)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = disabled ? '#75554d' : '#a66c56'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = disabled ? '#65534d' : '#8b5c45'
    ctx.fillRect(25, -27, 3, 45)
    ctx.fillStyle = disabled ? '#67504b' : '#9e5148'
    ctx.fillRect(28, -24, 23, 11)
  } else if (type === 'beacon') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 19, 43, 14, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = disabled ? '#646970' : color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-25, 18)
    ctx.lineTo(-17, -12)
    ctx.moveTo(25, 18)
    ctx.lineTo(17, -12)
    ctx.stroke()
    ctx.save()
    ctx.rotate(time * 0.55)
    ctx.strokeStyle = disabled ? 'rgba(120, 125, 130, 0.42)' : 'rgba(115, 207, 235, 0.58)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, -7, 31, 0, TAU)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = disabled ? '#4d5359' : '#73cfea'
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.lineTo(15, -7)
    ctx.lineTo(0, 17)
    ctx.lineTo(-15, -7)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = disabled ? '#777d82' : '#e2fbff'
    ctx.beginPath()
    ctx.arc(-4, -12, 4, 0, TAU)
    ctx.fill()
  } else {
    const pulse = Math.sin(time * 2.1) * 2
    ctx.fillStyle = disabled ? 'rgba(73, 58, 57, 0.64)' : 'rgba(70, 128, 59, 0.62)'
    ctx.beginPath()
    ctx.ellipse(0, 5, 47 + pulse, 29, -0.12, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = disabled ? 'rgba(139, 92, 84, 0.46)' : 'rgba(145, 211, 102, 0.58)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = disabled ? 'rgba(117, 83, 76, 0.5)' : 'rgba(197, 235, 133, 0.66)'
    for (let i = 0; i < 3; i++) {
      const angle = time * (0.6 + i * 0.12) + i * 2
      ctx.beginPath()
      ctx.arc(Math.cos(angle) * (13 + i * 5), -2 + Math.sin(angle) * 10, 3 + i, 0, TAU)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawEventScar(ctx, scar) {
  ctx.save()
  ctx.translate(scar.x, scar.y)
  ctx.globalAlpha = 0.48
  if (scar.type === 'hunt') {
    ctx.strokeStyle = '#76584b'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-29, 13)
    ctx.lineTo(22, -10)
    ctx.moveTo(-20, -8)
    ctx.lineTo(31, 12)
    ctx.stroke()
  } else if (scar.type === 'beacon') {
    ctx.fillStyle = '#4c555a'
    ctx.beginPath()
    ctx.moveTo(-13, 8)
    ctx.lineTo(4, -15)
    ctx.lineTo(16, 10)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(92, 153, 170, 0.5)'
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0.2, Math.PI * 1.35)
    ctx.stroke()
  } else {
    ctx.strokeStyle = 'rgba(116, 148, 83, 0.58)'
    ctx.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(i * 1.55) * 43, Math.sin(i * 1.55) * 25)
      ctx.stroke()
    }
  }
  ctx.restore()
}

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
    this.scars = []
  }

  reset() {
    this.current = null
    this.nextIn = FIRST_EVENT_DELAY
    this.completed = 0
    this.failed = 0
    this._serial = 0
    this._lastType = null
    this._pulse = 0
    this.scars.length = 0
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
    this.scars.length = 0
  }

  cancelForTransition() {
    this.cancelForEncounter()
    this.scars.length = 0
  }

  /** 进入本章守将战时停止事件逻辑，但保留已完成的战场残迹。 */
  cancelForEncounter() {
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
    this.scars.push({ type: e.type, x: e.x, y: e.y })
    if (this.scars.length > 8) this.scars.shift()

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
    const cam = this.game.camera
    for (const scar of this.scars) {
      if (scar.x < cam.x - 90 || scar.x > cam.x + this.game.width + 90) continue
      if (scar.y < cam.y - 90 || scar.y > cam.y + this.game.height + 90) continue
      drawEventScar(ctx, scar)
    }

    const e = this.current
    if (!e) return
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
    drawEventObject(ctx, e.type, e.state, this._pulse, color)

    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f3f4ed'
    ctx.fillText(e.def.title, 0, -EVENT_RADIUS - 16)
    ctx.restore()
  }
}
