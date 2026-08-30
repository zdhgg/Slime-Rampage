import { GameplayController } from './GameplayController.js'

const LANE_COUNT = 3 // 三线推进：三条纵向通道（左/中/右）
const TAU = Math.PI * 2

// 通道几何比例（唯一计算入口在 _ensureLayout / laneCenterX，禁止散落 width * xxx）
const LANE_WIDTH_RATIO = 0.16
const LANE_MIN_WIDTH = 48
const LANE_GAP_RATIO = 0.35
const LANE_TOP_RATIO = 0.06
const LANE_HEIGHT_RATIO = 0.9
// 玩家纵向位置：固定在画面下方区域
const PLAYER_Y_RATIO = 0.78
const PLAYER_RADIUS_RATIO = 0.3 // 史莱姆占位/子弹出生点/突破线共用的身体半径（相对通道宽）
// 玩家 X 平滑过渡：60fps 基准下每帧 22% 收敛（帧率无关指数插值）
const LANE_LERP_PER_FRAME = 0.22

// 最小射击闭环：固定射速自动射击（无需射击键）
const FIRE_INTERVAL = 1 / 5 // 每秒 5 发
const BULLET_SPEED = 900 // 子弹上飞速度（px/s）
const BULLET_RADIUS = 5
const BULLET_MARGIN = 40 // 子弹飞出通道顶部后的清除余量

// 原型怪物：从通道顶部直线逼近玩家（无 AI）；被击杀或突破后短暂间隔重生
const MONSTER_HP = 5
const MONSTER_SPEED_BASE = 70 // 逼近速度下限（px/s）
const MONSTER_SPEED_VARIANCE = 50 // 速度随机幅度（70~120 px/s）
const MONSTER_RADIUS_RATIO = 0.24 // 怪物身体半径（相对通道宽）
const MONSTER_SPAWN_MARGIN = 20 // 出生点在通道顶部上方的余量
const RESPAWN_DELAY = 1.2 // 击杀/突破后到重新生成的间隔（秒）

// 增益 Gate：固定在通道前方，打爆后攻击永久 +1，一段时间后重生；
// 与怪物分居不同 lane 时形成「打门强化 vs 打怪防守」的火力取舍
const GATE_HP = 12
const GATE_Y_RATIO = 0.42 // Gate 纵向位置（怪物生成区与玩家之间）
const GATE_RESPAWN_DELAY = 4 // 打爆后到重新生成的间隔（秒）
const GATE_BODY = '#7cd7ff'
const GATE_EDGE = '#2a86b8'
const GATE_FONT = 'bold 13px sans-serif'
// 自动射击补发：单帧 dt 跨多个射击间隔时补齐，但封顶防异常大 dt 爆发
const MAX_CATCH_UP_SHOTS = 3

// Runner 走廊配色：夜色底 + 冷色通道描边（与 Arena 的野外主题区分开）
const RUNNER_BG = '#0d1520'
const LANE_FILL = 'rgba(122, 178, 255, 0.06)'
const LANE_EDGE = 'rgba(122, 178, 255, 0.35)'
// 玩家/子弹/怪物配色（沿用 Arena 基础色系；怪物用敌意暖色、Gate 用青色菱形）
const SLIME_BODY = '#8ae84a'
const SLIME_EDGE = '#2f9e3a'
const BULLET_COLOR = '#ffd166'
const MONSTER_BODY = '#ff8a5c'
const MONSTER_EDGE = '#a83a2a'
const HP_BAR_FULL = '#8ae84a'
const HP_BAR_LOW = '#ff6b4a'

/**
 * Runner 玩法（原型怪物阶段）：三线推进射击的空间范式。
 *
 * 已实现：三通道玩家移动（边沿触发/边界钳制/平滑过渡）+ 射击闭环——
 * 固定射速自动射击（冷却保留时间余量，平均射速不受帧率影响；单帧跨多间隔
 * 时补发但封顶），子弹从玩家位置沿发射 lane 上飞、以 attackDamage 对同 lane
 * 目标结算，单发只命中路径上最近的一个目标；怪物从通道顶部直线逼近玩家，
 * 命中扣血（头顶血条），HP 归零消失；被消灭或突破到玩家区域都会在短暂
 * 间隔后于原 lane 顶部重生，突破额外记录 breachCount（暂无失败结算）；
 * 增益 Gate 固定在通道前方，打爆后 attackDamage 永久 +1 并在一段时间后
 * 重生——Gate 与怪物分居不同 lane 时形成火力取舍；切 lane 后新子弹跟随
 * 新 lane；resize 后子弹/怪物/Gate 的 lane X 保持对齐。
 * 仍未实现：正式失败结算/WeaponSystem 接入/特殊技能 Gate/Buff/开始界面入口。
 * 不接 RunRules.MODE_IDS，仅可通过 configureGameplay('runner') 进入。
 */
export class RunnerGameplay extends GameplayController {
  constructor() {
    super('runner')
    this.currentLane = 1 // 默认中间通道
    this.playerX = 0 // 玩家显示 X（平滑过渡中的当前值，CSS 像素）
    this.playerY = 0 // 玩家显示 Y（随视口高度固定在下方区域）
    this.attackDamage = 1 // 基础战斗属性：单发子弹伤害（打爆 Gate 永久 +1）
    this.breachCount = 0 // 怪物到达玩家区域的累计次数（原型计数，暂不结算）
    this._prevLeft = false // 上一帧左键状态（边沿触发用）
    this._prevRight = false // 上一帧右键状态
    this._fireCooldown = 0 // 距下次自动射击的计时（秒）
    this._bullets = [] // 玩家子弹：{ lane, x, y }（lane 为发射时所属，不可变）
    this._monsterByLane = [null, null, null] // 每 lane 至多一只逼近怪物
    this._respawnTimers = [0, 0, 0] // 空 lane 的重生倒计时（秒；0 = 立即生成）
    this._monstersReady = false // 怪物是否已随首次布局生成
    this._gateByLane = [null, null, null] // 每 lane 至多一个增益 Gate
    this._gateRespawnTimers = [0, 0, 0] // 空 lane 的 Gate 重生倒计时（秒）
    this._gatesReady = false // Gate 是否已随首次布局生成
    // 视口几何缓存（_ensureLayout 更新；热路径只读数值，零分配）
    this._viewportW = 0
    this._viewportH = 0
    this._laneW = 0
    this._laneGap = 0
    this._laneStartX = 0
    this._laneTop = 0
    this._laneH = 0
    this._gateY = 0
  }

  attach(game) {
    super.attach(game)
    this._ensureLayout() // attach 时视口尺寸已就绪（Engine 构造末尾）
  }

  /** Runner 接管每帧世界更新/渲染，不走 Arena 帧管线 */
  usesArenaFramePipeline() {
    return false
  }

  /**
   * 世界更新：通道切换输入 → 玩家 X 平滑过渡 → 怪物逼近 → 射击与命中。
   * 边沿触发：只在「上一帧未按、本帧按下」的瞬间切换，按住不连跳。
   */
  updateWorld(dt) {
    const game = this.game
    if (!game) return
    this._ensureLayout()
    if (dt <= 0) return // 首帧 dt=0：无需推进任何时间相关状态

    const state = game.input.state
    const left = !!state.left
    const right = !!state.right
    if (left && !this._prevLeft && this.currentLane > 0) this.currentLane--
    if (right && !this._prevRight && this.currentLane < LANE_COUNT - 1) this.currentLane++
    this._prevLeft = left
    this._prevRight = right

    // 平滑过渡：帧率无关的指数收敛
    const targetX = this.laneCenterX(this.currentLane)
    const k = 1 - Math.pow(1 - LANE_LERP_PER_FRAME, dt * 60)
    this.playerX += (targetX - this.playerX) * k

    this._updateMonsters(dt)
    this._updateGates(dt)
    this._updateShooting(dt)
  }

  /** 第 lane 条通道（0..2）的中心 X：lane 坐标计算的唯一入口 */
  laneCenterX(lane) {
    return this._laneStartX + lane * (this._laneW + this._laneGap) + this._laneW / 2
  }

  /** 怪物逼近：直线向下移动；到达玩家区域记一次突破并排队重生；空 lane 倒计时重生 */
  _updateMonsters(dt) {
    const breachY = this.playerY - this._laneW * PLAYER_RADIUS_RATIO
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const monster = this._monsterByLane[lane]
      if (!monster) {
        this._respawnTimers[lane] -= dt
        if (this._respawnTimers[lane] <= 0) this._spawnMonster(lane)
        continue
      }
      monster.y += monster.speed * dt
      if (monster.y >= breachY) {
        this._monsterByLane[lane] = null
        this._respawnTimers[lane] = RESPAWN_DELAY
        this.breachCount++
      }
    }
  }

  /** Gate 重生：打爆后按倒计时在原 lane 重新生成 */
  _updateGates(dt) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (this._gateByLane[lane]) continue
      this._gateRespawnTimers[lane] -= dt
      if (this._gateRespawnTimers[lane] <= 0) this._spawnGate(lane)
    }
  }

  /** 自动射击（带补发上限）+ 子弹推进 + 同 lane「最近目标」命中判定 */
  _updateShooting(dt) {
    // 固定射速：触发后保留时间余量（+= 而非重置），平均节拍不随帧率漂移；
    // dt 跨多个间隔时补齐应发数量，但单帧封顶——超出部分直接丢弃，
    // 防止异常大 dt（切后台恢复等）瞬间喷出大量子弹
    this._fireCooldown -= dt
    let shots = 0
    while (this._fireCooldown <= 0) {
      if (shots >= MAX_CATCH_UP_SHOTS) {
        this._fireCooldown = FIRE_INTERVAL
        break
      }
      this._fireCooldown += FIRE_INTERVAL
      this._bullets.push({
        lane: this.currentLane, // 发射时所属 lane，此后不可变
        x: this.playerX, // 出生于玩家当前位置
        y: this.playerY - this._laneW * PLAYER_RADIUS_RATIO,
      })
      shots++
    }

    // 子弹推进；同 lane 内可能同时越过 Gate 与怪物——
    // 只命中子弹最先到达的一个（y 更大者 = 更靠近玩家），单发绝不双命中
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const bullet = this._bullets[i]
      const prevY = bullet.y
      bullet.y -= BULLET_SPEED * dt
      let hitY = -Infinity // 已越过候选目标中最靠近玩家者的 y
      let hitGate = false
      const monster = this._monsterByLane[bullet.lane]
      if (monster && monster.hp > 0 && prevY >= monster.y && bullet.y <= monster.y) {
        hitY = monster.y
      }
      const gate = this._gateByLane[bullet.lane]
      if (
        gate &&
        gate.hp > 0 &&
        prevY >= this._gateY &&
        bullet.y <= this._gateY &&
        this._gateY > hitY
      ) {
        hitY = this._gateY
        hitGate = true
      }

      if (hitGate) {
        this._bullets.splice(i, 1)
        gate.hp -= this.attackDamage
        if (gate.hp <= 0) {
          // 打爆 Gate：本局攻击永久 +1，Gate 消失并按倒计时重生
          this._gateByLane[gate.lane] = null
          this._gateRespawnTimers[gate.lane] = GATE_RESPAWN_DELAY
          this.attackDamage += 1
        }
        continue
      }
      if (hitY > -Infinity) {
        this._bullets.splice(i, 1)
        monster.hp -= this.attackDamage
        if (monster.hp <= 0) {
          // 击杀：怪物消失，短暂间隔后在原 lane 顶部重生
          this._monsterByLane[monster.lane] = null
          this._respawnTimers[monster.lane] = RESPAWN_DELAY
        }
        continue
      }
      if (bullet.y < this._laneTop - BULLET_MARGIN) this._bullets.splice(i, 1)
    }
  }

  /** 在 lane 顶部生成一只怪物（速度带随机幅度，制造推进节奏差） */
  _spawnMonster(lane) {
    this._monsterByLane[lane] = {
      lane,
      y: this._laneTop - MONSTER_SPAWN_MARGIN,
      hp: MONSTER_HP,
      maxHp: MONSTER_HP,
      speed: MONSTER_SPEED_BASE + Math.random() * MONSTER_SPEED_VARIANCE,
    }
  }

  /** 在 lane 固定位置生成一个增益 Gate */
  _spawnGate(lane) {
    this._gateByLane[lane] = {
      lane,
      hp: GATE_HP,
      maxHp: GATE_HP,
    }
  }

  /** 世界渲染：夜色走廊 + 三条纵向通道 + 怪物 + 玩家史莱姆 + 子弹 */
  renderWorld(ctx) {
    const game = this.game
    if (!game) return
    this._ensureLayout()
    const width = game.width
    const height = game.height

    // 夜色走廊底色（铺满视口）
    ctx.fillStyle = RUNNER_BG
    ctx.fillRect(0, 0, width, height)

    // 三条纵向通道：居中排列，宽度与高度随视口缩放
    ctx.lineWidth = 2
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = this._laneStartX + i * (this._laneW + this._laneGap)
      ctx.fillStyle = LANE_FILL
      ctx.fillRect(x, this._laneTop, this._laneW, this._laneH)
      ctx.strokeStyle = LANE_EDGE
      ctx.strokeRect(x, this._laneTop, this._laneW, this._laneH)
    }

    this._renderMonsters(ctx)
    this._renderGates(ctx)
    this._renderPlayerPlaceholder(ctx)
    this._renderBullets(ctx)
  }

  /** 增益 Gate：青色菱形门体 + 「ATK +1」标签 + 血条（x 每帧由 lane 现算） */
  _renderGates(ctx) {
    for (const gate of this._gateByLane) {
      if (!gate || gate.hp <= 0) continue
      const x = this.laneCenterX(gate.lane)
      const y = this._gateY
      const w = this._laneW * 0.3
      const h = w * 1.1

      ctx.fillStyle = GATE_BODY
      ctx.beginPath()
      ctx.moveTo(x, y - h)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x, y + h)
      ctx.lineTo(x - w, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = GATE_EDGE
      ctx.stroke()

      ctx.fillStyle = 'rgba(244, 238, 230, 0.92)'
      ctx.font = GATE_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('ATK +1', x, y + h + 12)

      const barW = this._laneW * 0.5
      const barY = y - h - 10
      const ratio = gate.hp / gate.maxHp
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.fillRect(x - barW / 2, barY, barW, 4)
      ctx.fillStyle = ratio > 0.4 ? HP_BAR_FULL : HP_BAR_LOW
      ctx.fillRect(x - barW / 2, barY, barW * ratio, 4)
    }
  }

  /** 怪物占位图形：敌意暖色圆体 + 双眼 + 头顶血条（x 每帧由 lane 现算） */
  _renderMonsters(ctx) {
    const r = this._laneW * MONSTER_RADIUS_RATIO
    for (const monster of this._monsterByLane) {
      if (!monster || monster.hp <= 0) continue
      const x = this.laneCenterX(monster.lane)
      const y = monster.y

      ctx.fillStyle = MONSTER_BODY
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.82, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = MONSTER_EDGE
      ctx.stroke()

      ctx.fillStyle = MONSTER_EDGE
      ctx.beginPath()
      ctx.arc(x - r * 0.26, y - r * 0.12, r * 0.09, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + r * 0.26, y - r * 0.12, r * 0.09, 0, TAU)
      ctx.fill()

      const barW = this._laneW * 0.5
      const barY = y - r - 12
      const ratio = monster.hp / monster.maxHp
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.fillRect(x - barW / 2, barY, barW, 4)
      ctx.fillStyle = ratio > 0.4 ? HP_BAR_FULL : HP_BAR_LOW
      ctx.fillRect(x - barW / 2, barY, barW * ratio, 4)
    }
  }

  /** 史莱姆占位图形（Canvas 基础图形）：椭圆身体 + 高光 + 双眼 */
  _renderPlayerPlaceholder(ctx) {
    const r = this._laneW * PLAYER_RADIUS_RATIO
    const px = this.playerX
    const py = this.playerY

    ctx.fillStyle = SLIME_BODY
    ctx.beginPath()
    ctx.ellipse(px, py, r, r * 0.78, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = SLIME_EDGE
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.ellipse(px - r * 0.35, py - r * 0.35, r * 0.22, r * 0.14, -0.6, 0, TAU)
    ctx.fill()

    ctx.fillStyle = SLIME_EDGE
    ctx.beginPath()
    ctx.arc(px - r * 0.28, py - r * 0.1, r * 0.09, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px + r * 0.28, py - r * 0.1, r * 0.09, 0, TAU)
    ctx.fill()
  }

  /** 子弹：圆形弹体，绘制在怪物与玩家之上 */
  _renderBullets(ctx) {
    ctx.fillStyle = BULLET_COLOR
    for (const bullet of this._bullets) {
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, TAU)
      ctx.fill()
    }
  }

  /**
   * 视口几何自适应：尺寸变化时重建通道布局缓存并同步实体锚点。
   * 所有 lane 坐标只在这里按 width/height 计算一次，帧内只读缓存。
   */
  _ensureLayout() {
    const game = this.game
    if (!game) return
    const width = game.width
    const height = game.height
    if (this._viewportW === width && this._viewportH === height) return
    this._viewportW = width
    this._viewportH = height

    const laneW = Math.max(LANE_MIN_WIDTH, width * LANE_WIDTH_RATIO)
    const gap = laneW * LANE_GAP_RATIO
    const totalW = laneW * LANE_COUNT + gap * (LANE_COUNT - 1)
    this._laneW = laneW
    this._laneGap = gap
    this._laneStartX = (width - totalW) / 2
    this._laneTop = height * LANE_TOP_RATIO
    this._laneH = height * LANE_HEIGHT_RATIO
    this._gateY = height * GATE_Y_RATIO
    this.playerY = height * PLAYER_Y_RATIO
    // resize 后直接吸附（罕见操作，不做过渡动画）；已发射子弹保持 lane 对齐
    this.playerX = this.laneCenterX(this.currentLane)
    for (const bullet of this._bullets) bullet.x = this.laneCenterX(bullet.lane)
    if (!this._monstersReady) {
      // 首次布局即在三 lane 各生成一只怪物（此后死亡/突破走重生倒计时）
      this._monstersReady = true
      for (let lane = 0; lane < LANE_COUNT; lane++) this._spawnMonster(lane)
    }
    if (!this._gatesReady) {
      // 首次布局即在三 lane 各生成一个增益 Gate（此后打爆走重生倒计时）
      this._gatesReady = true
      for (let lane = 0; lane < LANE_COUNT; lane++) this._spawnGate(lane)
    }
  }
}
