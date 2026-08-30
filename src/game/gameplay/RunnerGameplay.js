import { GameplayController } from './GameplayController.js'

const LANE_COUNT = 3 // 三线推进：三条纵向通道
const TAU = Math.PI * 2

// —— 三条通道的固定职责（原型约定，勿散落 0/1/2）——
export const MONSTER_LANE = 0 // 怪物通道：怪物群持续逼近玩家
export const BUFF_LANE = 1 // 普通增益通道：ATK Gate（打爆攻击永久 +1）
export const SPECIAL_LANE = 2 // 特殊增益通道：Rapid Gate（打爆临时急速射击）
const GATE_LANES = [BUFF_LANE, SPECIAL_LANE]
const LANE_LABELS = ['怪潮', '攻击强化', '急速强化'] // 通道顶部职责标识
const LANE_LABEL_COLORS = [
  'rgba(255, 138, 92, 0.66)',
  'rgba(124, 215, 255, 0.66)',
  'rgba(201, 162, 255, 0.66)',
]

// 通道几何比例（唯一计算入口在 _ensureLayout / laneCenterX，禁止散落 width * xxx）
const LANE_WIDTH_RATIO = 0.24 // 通道更宽，三条合计约占屏宽 80%
const LANE_MIN_WIDTH = 56
const LANE_GAP_RATIO = 0.18
const LANE_TOP_RATIO = 0.06
const LANE_HEIGHT_RATIO = 0.9
const LANE_TOP_INSET_RATIO = 0.09 // 通道顶部收窄（轻微透视）
const LANE_BOTTOM_OUTSET_RATIO = 0.06 // 通道底部外扩（轻微透视）
// 玩家纵向位置：固定在画面下方区域
const PLAYER_Y_RATIO = 0.78
const PLAYER_RADIUS_RATIO = 0.2 // 史莱姆占位身体半径（相对通道宽）
const BREACH_LINE_RATIO = 0.2 // 突破线/子弹出生点距玩家的偏移（相对通道宽，与视觉半径解耦）
// 玩家 X 平滑过渡：60fps 基准下每帧 22% 收敛（帧率无关指数插值）
const LANE_LERP_PER_FRAME = 0.22

// 最小射击闭环：固定射速自动射击（无需射击键）
const FIRE_INTERVAL = 1 / 5 // 每秒 5 发
const RAPID_FIRE_RATE_MUL = 2 // Rapid Gate 效果：射速 ×2
const RAPID_FIRE_DURATION = 6 // Rapid Gate 效果持续（秒）
const BULLET_SPEED = 900 // 子弹上飞速度（px/s）
const BULLET_RADIUS = 6
const BULLET_MARGIN = 40 // 子弹飞出通道顶部后的清除余量
const IMPACT_LIFE = 0.18 // 命中闪光持续（秒）

// 原型怪物：从 MONSTER_LANE 顶部直线逼近玩家（无 AI）；被击杀或突破后由持续生成补充
const MONSTER_HP = 5
const MONSTER_SPEED_BASE = 70 // 逼近速度下限（px/s）
const MONSTER_SPEED_VARIANCE = 50 // 速度随机幅度（70~120 px/s）
const MONSTER_RADIUS_RATIO = 0.24 // 怪物身体半径（相对通道宽）
const MONSTER_SPAWN_MARGIN = 20 // 出生点在通道顶部上方的余量
const MONSTER_SPAWN_INTERVAL_BASE = 2.4 // 基线生成间隔（秒）
const MONSTER_SPAWN_INTERVAL_MIN = 0.6 // 生成间隔下限（秒）
const MONSTER_SPAWN_RAMP = 0.012 // 起坡后每秒间隔缩短 0.012s
const PRESSURE_RAMP_DELAY = 30 // 压力增长起始时间（秒）：前 30 秒保持基线
const PRESSURE_HP_STEP = 30 // 此后每 30 秒 maxHp +1
const MONSTER_SPEED_RAMP = 0.8 // 起坡后每秒 +0.8 px/s
const MONSTER_SPEED_BONUS_CAP = 130 // 速度加成封顶（最终 ≤250 px/s）
export const MAX_MONSTERS = 8 // 场上同时存在上限

// 增益 Gate：固定在所属通道前方，打爆后获得增益并按冷却重生
const GATE_HP = 12
const GATE_Y_RATIO = 0.42 // Gate 纵向位置（怪物生成区与玩家之间）
const GATE_RESPAWN_DELAY = 4 // 打爆后到重新生成的间隔（秒）
const GATE_WIDTH_RATIO = 0.22 // 门体宽度（相对通道宽）
const GATE_HEIGHT_RATIO = 1.15 // 门体高宽比
const GATE_BODY = '#7cd7ff'
const GATE_EDGE = '#2a86b8'
const RAPID_GATE_BODY = '#c9a2ff'
const RAPID_GATE_EDGE = '#7a4bb8'
const GATE_FONT = 'bold 13px sans-serif'
const LANE_LABEL_FONT = 'bold 12px sans-serif'
const HUD_FONT = 'bold 14px sans-serif'
const GAME_OVER_FONT = 'bold 44px sans-serif'
const GAME_OVER_LINE_FONT = 'bold 16px sans-serif'
// 自动射击补发：单帧 dt 跨多个射击间隔时补齐，但封顶防异常大 dt 爆发
const MAX_CATCH_UP_SHOTS = 3

// Runner 走廊配色：夜色底 + 冷色通道（与 Arena 的野外主题区分开）
const RUNNER_BG = '#0d1520'
const LANE_FILL_TOP = 'rgba(122, 178, 255, 0.03)' // 通道纵深渐变（顶部深）
const LANE_FILL_BOTTOM = 'rgba(122, 178, 255, 0.1)' // 通道纵深渐变（底部亮）
const LANE_EDGE = 'rgba(122, 178, 255, 0.5)'
const LANE_EDGE_GLOW = 'rgba(122, 178, 255, 0.1)'
const LANE_GUIDE = 'rgba(122, 178, 255, 0.22)'
const LANE_GUIDE_DASH = [16, 22] // 导向线虚线段（模块常量复用，热路径零分配）
const LANE_GUIDE_DASH_OFF = [] // 虚线复位（空数组常量，避免每帧分配）
const LANE_GUIDE_SPEED = 90 // 导向线下滚速度（px/s，制造前进感）
// 玩家/子弹/怪物/Gate 配色（沿用 Arena 基础色系；怪物敌意暖色、Gate 冷色系）
const SLIME_BODY = '#8ae84a'
const SLIME_EDGE = '#2f9e3a'
const BULLET_COLOR = '#ffe28a'
const BULLET_TRAIL = 'rgba(255, 209, 102, 0.25)'
const IMPACT_COLOR = 'rgba(255, 236, 170,' // 命中闪光（运行时拼接 alpha）
const MONSTER_BODY = '#ff8a5c'
const MONSTER_EDGE = '#a83a2a'
const HP_BAR_FULL = '#8ae84a'
const HP_BAR_LOW = '#ff6b4a'

/** 秒 → m:ss（HUD/结算共用） */
const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Runner 玩法：三线推进射击的空间范式。
 *
 * 三条通道各司其职（常量 MONSTER_LANE / BUFF_LANE / SPECIAL_LANE，通道顶部
 * 绘制中文职责标识「怪潮 / 攻击强化 / 急速强化」）：
 *  - MONSTER_LANE：怪物数组持续从顶部生成并向玩家逼近，同时存在数量受
 *    MAX_MONSTERS 封顶；maxHp/速度/生成间隔随 elapsedTime 线性爬坡
 *    （前 30 秒保持基线，保证可玩）；击杀从数组移除；突破移除并记录
 *    breachCount、玩家 hp -1，hp 归零即 gameOver（世界冻结、仅渲染继续，
 *    restart() 恢复初始状态），突破后由持续生成自然补充；
 *  - BUFF_LANE：ATK Gate（「攻击 +1」），打爆后 attackDamage 永久 +1；
 *  - SPECIAL_LANE：Rapid Gate（「急速射击」），打爆后射速 ×2 持续 6 秒，
 *    到期自动恢复。
 * 通道带轻微透视与边缘发光、中央导向线下滚；子弹带尾迹与命中闪光；
 * HUD 显示生命/时间/急速剩余，失败画「突围失败」遮罩（中文文案）。
 * 自动射击固定射速（冷却保留时间余量不受帧率影响，单帧跨多间隔补发但封顶），
 * 子弹以 attackDamage 结算、沿发射 lane 上飞、只命中同 lane 目标，单发只命中
 * 路径上最近的一个；切 lane = 切换火力方向；resize 后所有实体 lane X 保持对齐。
 * 生命/失败为 Runner 自管状态，暂不接 Vue 结算页/RunRules/排行榜/后端。
 * 仍未实现：波次/正式失败结算页/WeaponSystem 接入/元素基因/Boss。
 * 不接 RunRules.MODE_IDS，仅可通过 configureGameplay('runner') 进入。
 */
export class RunnerGameplay extends GameplayController {
  constructor() {
    super('runner')
    this.currentLane = 1 // 默认中间通道
    this.playerX = 0 // 玩家显示 X（平滑过渡中的当前值，CSS 像素）
    this.playerY = 0 // 玩家显示 Y（随视口高度固定在下方区域）
    this.maxHp = 5 // 玩家最大生命
    this.hp = this.maxHp // 当前生命（怪物每次突破 -1）
    this.gameOver = false // 失败标志：true 后世界冻结（时间/生成/移动/射击全停）
    this.attackDamage = 1 // 基础战斗属性：单发子弹伤害（打爆 ATK Gate 永久 +1）
    this.rapidFireTimer = 0 // Rapid Fire 剩余时间（秒；0 = 正常射速）
    this.breachCount = 0 // 怪物到达玩家区域的累计次数（失败遮罩展示）
    this.elapsedTime = 0 // 本局已进行时间（秒），驱动怪物压力曲线与存活时间
    this._prevLeft = false // 上一帧左键状态（边沿触发用）
    this._prevRight = false // 上一帧右键状态
    this._fireCooldown = 0 // 距下次自动射击的计时（秒）
    this._bullets = [] // 玩家子弹：{ lane, x, y }（lane 为发射时所属，不可变）
    this._impacts = [] // 命中闪光：{ x, y, t }
    this.monsters = [] // MONSTER_LANE 的怪物数组：{ lane, y, hp, maxHp, speed }
    this._monsterSpawnTimer = 0 // 距下次生成的计时（秒；0 = 立即生成）
    this._monstersReady = false // 怪物系统是否已随首次布局初始化
    this._gateByLane = [null, null, null] // 仅 BUFF_LANE / SPECIAL_LANE 持有 Gate
    this._gateRespawnTimers = [0, 0, 0] // 空 lane 的 Gate 重生倒计时（秒）
    this._gatesReady = false // Gate 是否已随首次布局生成
    // 视口几何缓存（_ensureLayout 更新；热路径只读数值/缓存对象，零分配）
    this._viewportW = 0
    this._viewportH = 0
    this._laneW = 0
    this._laneGap = 0
    this._laneStartX = 0
    this._laneTop = 0
    this._laneH = 0
    this._gateY = 0
    this._laneFills = null // 每条通道的纵深渐变（resize 时重建）
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
   * 世界更新：通道切换输入 → 玩家 X 平滑过渡 → 怪物群 → Gate 重生 → 射击。
   * 边沿触发：只在「上一帧未按、本帧按下」的瞬间切换，按住不连跳。
   */
  updateWorld(dt) {
    const game = this.game
    if (!game) return
    this._ensureLayout()
    if (dt <= 0) return // 首帧 dt=0：无需推进任何时间相关状态
    if (this.gameOver) return // 失败后世界冻结：时间/输入/生成/移动/射击全停，仅渲染继续
    this.elapsedTime += dt

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

  /**
   * 重开一局：恢复完整初始状态（不重建实例，GameEngine reset 架构不感知 Runner）。
   * 生命/攻击/急速/计数清零回基线，怪物/子弹清空并立即生成第一只，
   * Gate 全部满血重生，玩家回到中间通道。
   */
  restart() {
    this.hp = this.maxHp
    this.gameOver = false
    this.attackDamage = 1
    this.rapidFireTimer = 0
    this.breachCount = 0
    this.elapsedTime = 0
    this.currentLane = BUFF_LANE // 回到中间通道
    this.playerX = this.laneCenterX(this.currentLane)
    this._prevLeft = false
    this._prevRight = false
    this._fireCooldown = 0
    this._bullets.length = 0
    this._impacts.length = 0
    this.monsters.length = 0
    this._monsterSpawnTimer = 0 // 立即生成第一只怪物
    this._spawnMonster()
    this._monsterSpawnTimer = this.monsterSpawnInterval()
    this._gateByLane = [null, null, null]
    this._gateRespawnTimers = [0, 0, 0]
    for (const lane of GATE_LANES) this._spawnGate(lane)
    // 与 engine.reset 对齐：清空暂停锁。Runner 自管生命周期、不触发 Arena reset，
    // 若上一局从暂停菜单放弃，残留的锁会让本局 Esc 恢复失效
    if (this.game) this.game._pauseLock = 0
  }

  // ------------------------------------------------------------
  // 怪物压力曲线（elapsedTime 驱动；前 30 秒保持基线，温和起步）
  // ------------------------------------------------------------

  /** 当前生成的怪物 maxHp：起坡后每 PRESSURE_HP_STEP 秒 +1 */
  monsterMaxHp() {
    return MONSTER_HP + Math.floor(Math.max(0, this.elapsedTime - PRESSURE_RAMP_DELAY) / PRESSURE_HP_STEP)
  }

  /** 当前生成的怪物速度：基线随机幅度 + 起坡后线性加成（封顶） */
  monsterSpeed() {
    const bonus = Math.min(
      MONSTER_SPEED_BONUS_CAP,
      Math.max(0, this.elapsedTime - PRESSURE_RAMP_DELAY) * MONSTER_SPEED_RAMP
    )
    return MONSTER_SPEED_BASE + Math.random() * MONSTER_SPEED_VARIANCE + bonus
  }

  /** 当前生成间隔：基线起随 elapsedTime 线性缩短（下限封底） */
  monsterSpawnInterval() {
    return Math.max(
      MONSTER_SPAWN_INTERVAL_MIN,
      MONSTER_SPAWN_INTERVAL_BASE - Math.max(0, this.elapsedTime - PRESSURE_RAMP_DELAY) * MONSTER_SPAWN_RAMP
    )
  }

  /** 怪物群：持续生成（受上限约束）→ 直线逼近 → 突破移除并计数 */
  _updateMonsters(dt) {
    this._monsterSpawnTimer -= dt
    if (this._monsterSpawnTimer <= 0 && this.monsters.length < MAX_MONSTERS) {
      this._monsterSpawnTimer = this.monsterSpawnInterval()
      this._spawnMonster()
    }

    const breachY = this.playerY - this._laneW * BREACH_LINE_RATIO
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const monster = this.monsters[i]
      monster.y += monster.speed * dt
      if (monster.y >= breachY) {
        // 突破：移除并计数 + 玩家扣 1 点生命，由持续生成自然补充（无需重生等待）
        this.monsters.splice(i, 1)
        this.breachCount++
        this.hp = Math.max(0, this.hp - 1)
        if (this.hp <= 0) this.gameOver = true
      }
    }
  }

  /** 在 MONSTER_LANE 顶部生成一只怪物（按当前压力曲线取属性） */
  _spawnMonster() {
    const maxHp = this.monsterMaxHp()
    this.monsters.push({
      lane: MONSTER_LANE,
      y: this._laneTop - MONSTER_SPAWN_MARGIN,
      hp: maxHp,
      maxHp,
      speed: this.monsterSpeed(),
    })
  }

  /** Gate 重生：打爆后按倒计时在原 lane 重新生成 */
  _updateGates(dt) {
    for (const lane of GATE_LANES) {
      if (this._gateByLane[lane]) continue
      this._gateRespawnTimers[lane] -= dt
      if (this._gateRespawnTimers[lane] <= 0) this._spawnGate(lane)
    }
  }

  /** 自动射击（带补发上限）+ 子弹推进 + 同 lane「最近目标」命中判定 */
  _updateShooting(dt) {
    // Rapid Fire 效果期间射速 ×2；到期自动恢复正常射速
    this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt)
    const interval =
      this.rapidFireTimer > 0 ? FIRE_INTERVAL / RAPID_FIRE_RATE_MUL : FIRE_INTERVAL

    // 固定射速：触发后保留时间余量（+= 而非重置），平均节拍不随帧率漂移；
    // dt 跨多个间隔时补齐应发数量，但单帧封顶——超出部分直接丢弃，
    // 防止异常大 dt（切后台恢复等）瞬间喷出大量子弹
    this._fireCooldown -= dt
    let shots = 0
    while (this._fireCooldown <= 0) {
      if (shots >= MAX_CATCH_UP_SHOTS) {
        this._fireCooldown = interval
        break
      }
      this._fireCooldown += interval
      this._bullets.push({
        lane: this.currentLane, // 发射时所属 lane，此后不可变
        x: this.playerX, // 出生于玩家当前位置
        y: this.playerY - this._laneW * BREACH_LINE_RATIO,
      })
      shots++
    }

    // 子弹推进；同 lane 内可能同时越过多个目标（怪群/Gate）——
    // 只命中子弹最先到达的一个（y 更大者 = 更靠近玩家），单发绝不双命中
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const bullet = this._bullets[i]
      const prevY = bullet.y
      bullet.y -= BULLET_SPEED * dt
      let hitY = -Infinity // 已越过候选目标中最靠近玩家者的 y
      let hitKind = null // 'monster' | 'gate'
      let hitIndex = -1
      if (bullet.lane === MONSTER_LANE) {
        for (let j = 0; j < this.monsters.length; j++) {
          const monster = this.monsters[j]
          if (monster.hp <= 0) continue
          if (prevY >= monster.y && bullet.y <= monster.y && monster.y > hitY) {
            hitY = monster.y
            hitKind = 'monster'
            hitIndex = j
          }
        }
      }
      const gate = this._gateByLane[bullet.lane]
      if (
        gate &&
        gate.hp > 0 &&
        prevY >= this._gateY &&
        bullet.y <= this._gateY &&
        this._gateY > hitY
      ) {
        hitKind = 'gate'
      }

      if (hitKind === 'gate') {
        this._impacts.push({ x: bullet.x, y: this._gateY, t: 0 })
        this._bullets.splice(i, 1)
        gate.hp -= this.attackDamage
        if (gate.hp <= 0) {
          // 打爆 Gate：按类型发放增益，Gate 消失并按倒计时重生
          this._gateByLane[gate.lane] = null
          this._gateRespawnTimers[gate.lane] = GATE_RESPAWN_DELAY
          if (gate.kind === 'rapid') this.rapidFireTimer = RAPID_FIRE_DURATION
          else this.attackDamage += 1
        }
        continue
      }
      if (hitKind === 'monster') {
        this._impacts.push({ x: bullet.x, y: hitY, t: 0 })
        this._bullets.splice(i, 1)
        const monster = this.monsters[hitIndex]
        monster.hp -= this.attackDamage
        if (monster.hp <= 0) this.monsters.splice(hitIndex, 1) // 击杀：从数组移除
        continue
      }
      if (bullet.y < this._laneTop - BULLET_MARGIN) this._bullets.splice(i, 1)
    }

    // 命中闪光计时推进
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const impact = this._impacts[i]
      impact.t += dt
      if (impact.t >= IMPACT_LIFE) this._impacts.splice(i, 1)
    }
  }

  /** 在 lane 固定位置生成一个增益 Gate（类型由通道职责决定） */
  _spawnGate(lane) {
    this._gateByLane[lane] = {
      lane,
      kind: lane === SPECIAL_LANE ? 'rapid' : 'attack',
      hp: GATE_HP,
      maxHp: GATE_HP,
    }
  }

  /** 世界渲染：夜色走廊 + 三条透视通道 + 职责标识 + 怪物群 + Gate + 玩家 + 子弹 + HUD */
  renderWorld(ctx) {
    const game = this.game
    if (!game) return
    this._ensureLayout()
    const width = game.width
    const height = game.height

    // 夜色走廊底色（铺满视口）
    ctx.fillStyle = RUNNER_BG
    ctx.fillRect(0, 0, width, height)

    this._renderLanes(ctx)
    this._renderMonsters(ctx)
    this._renderGates(ctx)
    this._renderPlayerPlaceholder(ctx)
    this._renderBullets(ctx)
    this._renderImpacts(ctx)
    this._renderHud(ctx, width, height)
  }

  /** 三条通道：轻微透视梯形 + 纵深渐变 + 边缘发光 + 中央导向线（下滚虚线） */
  _renderLanes(ctx) {
    const top = this._laneTop
    const bottom = top + this._laneH
    const inset = this._laneW * LANE_TOP_INSET_RATIO
    const outset = this._laneW * LANE_BOTTOM_OUTSET_RATIO
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const cx = this.laneCenterX(lane)
      const topW = this._laneW - inset * 2
      const bottomW = this._laneW + outset * 2

      // 通道体：梯形（顶部略窄、底部略宽）+ 纵深渐变
      ctx.fillStyle = this._laneFills[lane]
      ctx.beginPath()
      ctx.moveTo(cx - topW / 2, top)
      ctx.lineTo(cx + topW / 2, top)
      ctx.lineTo(cx + bottomW / 2, bottom)
      ctx.lineTo(cx - bottomW / 2, bottom)
      ctx.closePath()
      ctx.fill()

      // 边缘发光：宽低透明描边打底 + 细亮描边收边
      ctx.strokeStyle = LANE_EDGE_GLOW
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.strokeStyle = LANE_EDGE
      ctx.lineWidth = 1.5
      ctx.stroke()

      // 中央导向线：向下滚动的虚线，制造「向前推进」的速度感
      ctx.strokeStyle = LANE_GUIDE
      ctx.lineWidth = 1.5
      ctx.setLineDash(LANE_GUIDE_DASH)
      ctx.lineDashOffset = -((this.elapsedTime * LANE_GUIDE_SPEED) % (LANE_GUIDE_DASH[0] + LANE_GUIDE_DASH[1]))
      ctx.beginPath()
      ctx.moveTo(cx, top + 24)
      ctx.lineTo(cx, bottom)
      ctx.stroke()
      ctx.setLineDash(LANE_GUIDE_DASH_OFF)
    }

    // 通道职责标识（怪潮 / 攻击强化 / 急速强化）
    ctx.font = LANE_LABEL_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      ctx.fillStyle = LANE_LABEL_COLORS[lane]
      ctx.fillText(LANE_LABELS[lane], this.laneCenterX(lane), top + 14)
    }
  }

  /** 怪物占位图形：敌意暖色圆体 + 双眼 + 各自血条（x 每帧由 lane 现算） */
  _renderMonsters(ctx) {
    const r = this._laneW * MONSTER_RADIUS_RATIO
    ctx.lineWidth = 2
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue
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

  /** 增益 Gate：菱形门体（ATK 青 / RAPID 紫 + 内圈 + 脉冲）+ 中文标签 + 血条 */
  _renderGates(ctx) {
    const w = this._laneW * GATE_WIDTH_RATIO
    const h = w * GATE_HEIGHT_RATIO
    for (const gate of this._gateByLane) {
      if (!gate || gate.hp <= 0) continue
      const x = this.laneCenterX(gate.lane)
      const y = this._gateY
      const isRapid = gate.kind === 'rapid'
      // Rapid Gate 轻微脉冲呼吸，与 ATK 门进一步区分
      const pulse = isRapid ? 1 + 0.05 * Math.sin(this.elapsedTime * 6) : 1
      const gw = (w * pulse) / 2
      const gh = (h * pulse) / 2

      ctx.fillStyle = isRapid ? RAPID_GATE_BODY : GATE_BODY
      ctx.beginPath()
      ctx.moveTo(x, y - gh)
      ctx.lineTo(x + gw, y)
      ctx.lineTo(x, y + gh)
      ctx.lineTo(x - gw, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = isRapid ? RAPID_GATE_EDGE : GATE_EDGE
      ctx.lineWidth = 2
      ctx.stroke()

      if (isRapid) {
        // 内圈菱形：急速门的形状标识
        ctx.beginPath()
        ctx.moveTo(x, y - gh * 0.55)
        ctx.lineTo(x + gw * 0.55, y)
        ctx.lineTo(x, y + gh * 0.55)
        ctx.lineTo(x - gw * 0.55, y)
        ctx.closePath()
        ctx.stroke()
      }

      ctx.fillStyle = 'rgba(244, 238, 230, 0.92)'
      ctx.font = GATE_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(isRapid ? '急速射击' : '攻击 +1', x, y + gh + 16)

      const barW = this._laneW * 0.5
      const barY = y - gh - 12
      const ratio = gate.hp / gate.maxHp
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
    ctx.lineWidth = 2
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

  /** 子弹：发光弹体 + 向下的尾迹（拖影） */
  _renderBullets(ctx) {
    ctx.lineCap = 'round'
    for (const bullet of this._bullets) {
      ctx.strokeStyle = BULLET_TRAIL
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(bullet.x, bullet.y + 20)
      ctx.lineTo(bullet.x, bullet.y)
      ctx.stroke()
      ctx.fillStyle = BULLET_COLOR
      ctx.beginPath()
      ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, TAU)
      ctx.fill()
    }
    ctx.lineCap = 'butt'
    ctx.lineWidth = 1
  }

  /** 命中闪光：短暂扩散的圆环 */
  _renderImpacts(ctx) {
    for (const impact of this._impacts) {
      const k = impact.t / IMPACT_LIFE
      ctx.strokeStyle = `${IMPACT_COLOR}${((1 - k) * 0.7).toFixed(3)})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(impact.x, impact.y, 4 + 22 * k, 0, TAU)
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }

  /**
   * Runner HUD（屏幕空间）：左上角生命（分段血块）+ 时间 + 急速剩余；
   * gameOver 时叠加半透明遮罩 + 突围失败 + 生存时间 + 突破次数
   */
  _renderHud(ctx, width, height) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = HUD_FONT

    ctx.fillStyle = 'rgba(244, 238, 230, 0.85)'
    ctx.fillText('生命', 18, 24)
    for (let i = 0; i < this.maxHp; i++) {
      ctx.fillStyle = i < this.hp ? HP_BAR_FULL : 'rgba(255, 255, 255, 0.16)'
      ctx.fillRect(62 + i * 20, 18, 13, 13)
    }
    ctx.fillStyle = 'rgba(244, 238, 230, 0.85)'
    ctx.fillText(`时间 ${formatTime(this.elapsedTime)}`, 18, 50)
    if (this.rapidFireTimer > 0) {
      ctx.fillStyle = 'rgba(201, 162, 255, 0.95)'
      ctx.fillText(`急速射击 ${this.rapidFireTimer.toFixed(1)}s`, 18, 76)
    }

    if (!this.gameOver) return
    ctx.fillStyle = 'rgba(6, 10, 16, 0.62)'
    ctx.fillRect(0, 0, width, height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ff6b4a'
    ctx.font = GAME_OVER_FONT
    ctx.fillText('突围失败', width / 2, height * 0.4)
    ctx.fillStyle = 'rgba(244, 238, 230, 0.9)'
    ctx.font = GAME_OVER_LINE_FONT
    ctx.fillText(`生存时间  ${formatTime(this.elapsedTime)}`, width / 2, height * 0.4 + 52)
    ctx.fillText(`突破次数  ${this.breachCount}`, width / 2, height * 0.4 + 82)
    ctx.fillStyle = 'rgba(244, 238, 230, 0.45)'
    ctx.font = GAME_OVER_LINE_FONT
    ctx.fillText('按 Esc 打开菜单 · 可放弃本局', width / 2, height * 0.4 + 114)
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
    // 通道纵深渐变按新尺寸重建（离屏创建，帧内只复用）
    this._laneFills = []
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const gradient = game.ctx.createLinearGradient(0, this._laneTop, 0, this._laneTop + this._laneH)
      gradient.addColorStop(0, LANE_FILL_TOP)
      gradient.addColorStop(1, LANE_FILL_BOTTOM)
      this._laneFills.push(gradient)
    }
    // resize 后直接吸附（罕见操作，不做过渡动画）；已发射子弹保持 lane 对齐
    this.playerX = this.laneCenterX(this.currentLane)
    for (const bullet of this._bullets) bullet.x = this.laneCenterX(bullet.lane)
    if (!this._monstersReady) {
      // 首次布局即生成第一只怪物，之后由持续生成系统按间隔补怪
      this._monstersReady = true
      this._spawnMonster()
      this._monsterSpawnTimer = this.monsterSpawnInterval()
    }
    if (!this._gatesReady) {
      // 首次布局只在 BUFF_LANE / SPECIAL_LANE 生成 Gate（打爆走重生倒计时）
      this._gatesReady = true
      for (const lane of GATE_LANES) this._spawnGate(lane)
    }
  }
}
