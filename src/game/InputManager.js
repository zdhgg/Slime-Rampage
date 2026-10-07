/**
 * 键盘输入管理（WASD + 方向键 → 8 方向）
 *
 * 设计要点：
 *  - 使用 e.code（物理按键位置）而非 e.key，不受键盘布局影响；
 *  - 状态用四个布尔位保存，getMoveVector() 零分配、零迭代，可安全处于每帧热路径；
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

export class InputManager {
  constructor() {
    this.state = { up: false, down: false, left: false, right: false }
    this._interactQueued = false // 元素核心吸收请求（E 边沿触发，仅元素交互）
    /**
     * 主动技能 / 暴走狂热释放请求（空格边沿触发）。
     * 两个玩法共用同一通道：Runner 用它释放暴走狂热，Arena 用它触发角色空格技能
     * （GameEngine._updateStrainSkill）。E 不再入队此位——按键与语义一一对应。
     */
    this._feverQueued = false
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
    if (e.code === 'KeyE') {
      // E 只负责元素交互（吸收核心）。历史版本这里会同时入队 fever，
      // 导致 空格 通道被 E 抢占、同帧 E+空格 互相吞掉请求（阶段十九拆分）。
      if (!e.repeat) this._interactQueued = true
      e.preventDefault()
      return
    }
    const axis = KEY_TO_AXIS[e.code]
    if (!axis) return
    e.preventDefault() // 阻止方向键/空格滚动页面
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
    this._interactQueued = false
    this._feverQueued = false
  }


  consumeInteract() {
    const q = this._interactQueued
    this._interactQueued = false
    return q
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
   * 8 方向归一化移动向量（复用缓存对象，避免每帧分配）
   * 对角移动时长度 ≈ 1，保证斜向不超速
   */
  getMoveVector() {
    const s = this.state
    const v = (this._vec ??= { x: 0, y: 0 })
    v.x = (s.right ? 1 : 0) - (s.left ? 1 : 0)
    v.y = (s.down ? 1 : 0) - (s.up ? 1 : 0)
    if (v.x !== 0 && v.y !== 0) {
      v.x *= INV_SQRT2
      v.y *= INV_SQRT2
    }
    return v
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
  }
}
