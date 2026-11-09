/**
 * 输入管理：键盘（WASD + 方向键 → 8 方向）+ 触屏虚拟摇杆推力 + 主战场点地移动目标
 *
 * 设计要点：
 *  - 使用 e.code（物理按键位置）而非 e.key，不受键盘布局影响；
 *  - 状态用四个布尔位保存，getMoveVector() 零分配、零迭代，可安全处于每帧热路径；
 *  - 三种移动输入优先级固定：键盘 > 摇杆 > 点地目标；后两者一有输入就作废点地目标；
 *  - 点地移动只保存「世界坐标目标」，方向由 getMoveVector 按玩家位置现算；
 *  - 全部基于原生 DOM 事件，与 Vue 无任何关联；
 *  - 失焦（window blur）时清空按键，防止「切窗口后按键卡死」。
 */

const KEY_TO_AXIS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

const INV_SQRT2 = Math.SQRT1_2 // 0.7071…，对角方向归一化系数
const ARRIVE_EPS = 0.5 // 点地移动：剩余距离小于该值视为到达（像素）

export class InputManager {
  constructor() {
    this.state = { up: false, down: false, left: false, right: false }
    /**
     * 主动技能 / 暴走狂热释放请求（空格边沿触发）。
     * 两个玩法共用同一通道：Runner 用它释放暴走狂热，Arena 用它触发角色空格技能
      * （GameEngine._updateStrainSkill）。
     */
    this._feverQueued = false
    /** 点地移动目标（世界坐标）。null = 无目标；键盘方向输入会立即清除它 */
    this._moveTarget = null
    /** 虚拟摇杆推力向量（0~1，由 VirtualStick 写入）。与键盘同类：一有输入就作废点地目标 */
    this._stick = { x: 0, y: 0 }
    // 挂起态（引擎主循环未运行时为 true）：按键不劫持、不入队——
    // 否则升级/黑市/结算面板打开时按 Space 会入队「幽灵技能」，
    // 且全局 preventDefault 会吞掉按钮的 Space 激活与方向键焦点移动
    this.suspended = true

    // 预绑定，便于 removeEventListener 精确解绑
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onBlur = this._onBlur.bind(this)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onBlur)
  }

  _onKeyDown(e) {
    if (this.suspended) return // UI 面板期间放行按键给浏览器/按钮
    // Focused controls own their native keys. In particular, Space on a HUD
    // button must activate that button without also queueing a skill.
    if (e.defaultPrevented || e.target?.closest?.('button, input, textarea, select, a[href], [contenteditable="true"], [role="button"]')) return
    if (e.code === 'Space') {
      if (!e.repeat) this._feverQueued = true
      e.preventDefault()
      return
    }
    const axis = KEY_TO_AXIS[e.code]
    if (!axis) return
    e.preventDefault() // 阻止方向键/空格滚动页面
    // 键盘接管移动：放弃点地目标，松手后不再自己走回旧落点
    this._moveTarget = null
    this.state[axis] = true
  }

  _onKeyUp(e) {
    const axis = KEY_TO_AXIS[e.code]
    if (axis) this.state[axis] = false
  }

  _onBlur() {
    this.reset()
  }

  reset() {
    this.state.up = this.state.down = this.state.left = this.state.right = false
    this._feverQueued = false
    this._moveTarget = null
    this._stick.x = 0
    this._stick.y = 0
  }

  /** 点地移动：设置世界坐标目标（通常来自画布 pointerdown） */
  setMoveTarget(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    this._moveTarget = { x, y }
  }

  clearMoveTarget() {
    this._moveTarget = null
  }

  /**
   * 虚拟摇杆推力（VirtualStick 每帧写入，范围 0~1）。
   * 长度保留模拟量：推一半就走一半速度；超过 1 时按单位向量收敛。
   */
  setVirtualStick(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this._stick.x = 0
      this._stick.y = 0
      return
    }
    const length = Math.hypot(x, y)
    if (length > 1) {
      this._stick.x = x / length
      this._stick.y = y / length
    } else {
      this._stick.x = x
      this._stick.y = y
    }
  }

  clearVirtualStick() {
    this._stick.x = 0
    this._stick.y = 0
  }

  /** 当前点地目标（只读用途：渲染落点标记、玩家判定到达）；无目标为 null */
  get moveTarget() {
    return this._moveTarget
  }

  /** 当前摇杆推力（只读用途：HUD/测试）；无输入为零向量 */
  get stickVector() {
    return this._stick
  }

  consumeFever() {
    const q = this._feverQueued
    this._feverQueued = false
    return q
  }

  queueFever() {
    this._feverQueued = true
  }


  /**
   * 移动向量（复用缓存对象，避免每帧分配）：
   *  - 有方向键输入：8 方向归一化，长度 1（斜向不超速），键盘永远优先；
   *  - 无方向键但有摇杆推力：直接返回摇杆向量（长度 0~1，保留模拟推力）；
   *  - 无键盘/摇杆但有点地目标：返回朝目标点的单位向量，到达时自动清除目标；
   *  - 都没有：零向量。
   * `px/py` 为玩家当前世界坐标（点地移动必需）；不传则只返回键盘/摇杆向量。
   */
  getMoveVector(px, py) {
    const s = this.state
    const v = (this._vec ??= { x: 0, y: 0 })
    v.x = (s.right ? 1 : 0) - (s.left ? 1 : 0)
    v.y = (s.down ? 1 : 0) - (s.up ? 1 : 0)
    if (v.x !== 0 && v.y !== 0) {
      v.x *= INV_SQRT2
      v.y *= INV_SQRT2
    }
    if (v.x !== 0 || v.y !== 0) {
      // 键盘一旦参与移动，点地目标作废（防止松手后接手继续走）
      this._moveTarget = null
      return v
    }
    if (this._stick.x !== 0 || this._stick.y !== 0) {
      // 摇杆与键盘同级：拖动摇杆时放弃点地目标，松手即停而不是又走回旧落点
      this._moveTarget = null
      v.x = this._stick.x
      v.y = this._stick.y
      return v
    }
    const target = this._moveTarget
    if (!target || px === undefined || py === undefined) return v
    const dx = target.x - px
    const dy = target.y - py
    const dist = Math.hypot(dx, dy)
    if (dist <= ARRIVE_EPS) {
      this._moveTarget = null
      return v
    }
    v.x = dx / dist
    v.y = dy / dist
    return v
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
  }
}
