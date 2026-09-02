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
    this._dashQueued = false // 冲刺请求（Space/Shift 边沿触发，下一帧消费）
    this._interactQueued = false // 元素核心吸收请求（E 边沿触发）
    this._feverQueued = false // 暴走狂热释放请求（F/E 边沿触发）
    // 挂起态（引擎主循环未运行时为 true）：按键不劫持、不入队——
    // 否则升级/黑市/结算面板打开时按 Space 会入队「幽灵冲刺」，
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
    // 冲刺键（阶段十三）：Space / Shift，仅首次按下入队（长按不自动连发）
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (!e.repeat) this._dashQueued = true
      e.preventDefault()
      return
    }
    if (e.code === 'KeyF') {
      if (!e.repeat) this._feverQueued = true
      e.preventDefault()
      return
    }
    if (e.code === 'KeyE') {
      if (!e.repeat) {
        this._interactQueued = true
        this._feverQueued = true
      }
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
    this._dashQueued = false
    this._interactQueued = false
    this._feverQueued = false
  }

  /** 消费一次冲刺请求（边沿触发：取走后立即清零） */
  consumeDash() {
    const q = this._dashQueued
    this._dashQueued = false
    return q
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
