const SHOT_PROFILES = Object.freeze({
  base: [700, 380, 0.07, 'square'],
  fluid: [520, 260, 0.09, 'triangle'],
  spark: [980, 440, 0.055, 'square'],
  ember: [760, 300, 0.085, 'sawtooth'],
  mist: [430, 250, 0.11, 'sine'],
  chaos: [620, 170, 0.12, 'sawtooth'],
})

const HIT_PROFILES = Object.freeze({
  base: [320, 200, 'sawtooth'],
  fluid: [250, 145, 'triangle'],
  spark: [640, 280, 'square'],
  ember: [390, 170, 'sawtooth'],
  mist: [210, 130, 'sine'],
  chaos: [470, 120, 'sawtooth'],
})

/**
 * 音效管理器：Web Audio API 程序化合成，零外部音频文件
 *
 * 设计：
 *  - 所有音效由振荡器（OscillatorNode）+ 增益包络（GainNode）实时合成，
 *    每次播放只创建 2~3 个节点、播放完自动释放，成本极低；
 *  - 浏览器策略：AudioContext 必须由用户手势触发后才能出声，
 *    引擎会在首次 keydown/click 时调用 ensure() 解锁（见 GameEngine）；
 *  - 全部输出汇入 master 增益总线（_master）：静音开关 / 音量控制作用于总线，
 *    单个音效不改动既有合成参数；
 *  - BGM 为低音 drone + 16 步小调琶音循环，用 ctx.currentTime 提前排程
 *    （setInterval 仅做"检查并补排"调度，不参与渲染热路径）；
 *  - 每个效果命名清晰（shoot/hit/kill/pickup/levelUp/hurt/wave/gameOver），
 *    各子系统在事件点直接调用，不经过 Vue。
 */
export class SoundManager {
  constructor() {
    this.ctx = null
    this._master = null
    this._muted = false
    this._vol = 1
    // —— BGM 状态 ——
    this._musicOn = false
    this._musicGain = null
    this._musicTimer = 0
    this._musicNextTime = 0
    this._musicStep = 0
  }

  /** 创建/恢复 AudioContext（需在用户手势后调用一次） */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      // 主总线动态压缩（阶段十三）：连杀齐响 + 命中音叠加时防削波刺耳
      this._comp = this.ctx.createDynamicsCompressor()
      this._comp.threshold.value = -18
      this._comp.knee.value = 24
      this._comp.ratio.value = 6
      this._comp.attack.value = 0.003
      this._comp.release.value = 0.25
      this._master = this.ctx.createGain()
      this._master.gain.value = this._muted ? 0 : this._vol
      this._master.connect(this._comp)
      this._comp.connect(this.ctx.destination)
    } catch {
      this.ctx = null // 不支持音频的环境静默降级
      this._master = null
    }
  }

  /** 静音开关：作用于 master 总线（含 BGM），平滑过渡防爆音 */
  setMuted(muted) {
    this._muted = !!muted
    if (this.ctx && this._master) {
      const t = this.ctx.currentTime
      this._master.gain.cancelScheduledValues(t)
      this._master.gain.linearRampToValueAtTime(muted ? 0 : this._vol, t + 0.03)
    }
  }

  /** 主音量（0~1）：与静音状态叠加生效 */
  setVolume(v) {
    this._vol = Math.max(0, Math.min(1, v))
    if (this.ctx && this._master && !this._muted) {
      this._master.gain.value = this._vol
    }
  }

  /** 当前是否静音（HUD 按钮状态回显用） */
  get muted() {
    return this._muted
  }

  /**
   * 基础合成：一个振荡器 + 指数增益包络（起音 10ms，指数衰减到结束）
   * @param {object} o freq 起始频率 / endFreq 滑音目标 / dur 时长 / type 波形 / vol 音量 / delay 延迟秒
   */
  _tone({ freq = 440, endFreq, dur = 0.1, type = 'sine', vol = 0.05, delay = 0 }) {
    if (!this.ctx) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(this._master || this.ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  // ==================== 事件音效 ====================

  /** 射击：按武器材质切换起音与波形，强度只改变响度。 */
  shoot(kind = 'base', intensity = 1) {
    const [freq, endFreq, dur, type] = SHOT_PROFILES[kind] || SHOT_PROFILES.base
    const vol = Math.min(0.038, 0.025 * Math.max(0.6, intensity))
    this._tone({ freq, endFreq, dur, type, vol })
    if (kind === 'chaos') this._tone({ freq: 1040, endFreq: 360, dur: 0.08, type: 'square', vol: 0.012 })
  }

  /** 命中：延续当前飞弹材质的听感，但压低音量避免高射速时堆叠刺耳。 */
  hit(kind = 'base') {
    const [freq, endFreq, type] = HIT_PROFILES[kind] || HIT_PROFILES.base
    this._tone({ freq, endFreq, dur: kind === 'fluid' || kind === 'mist' ? 0.065 : 0.05, type, vol: 0.025 })
  }

  /**
   * 击杀：三角波低滑，略带下沉感
   * @param {number} combo 连杀计数（1.8s 窗口内连续击杀数）：音高随连杀爬升，
   * 给「一波清屏」的叠加手感，上限 8 段防刺耳
   */
  kill(combo = 0) {
    const m = 1 + 0.08 * Math.min(combo, 8)
    const vol = Math.min(0.06 + combo * 0.004, 0.1)
    this._tone({ freq: 240 * m, endFreq: 70 * m, dur: 0.18, type: 'triangle', vol })
  }

  /** 拾取：正弦上滑，清脆 */
  pickup() {
    this._tone({ freq: 640, endFreq: 980, dur: 0.08, type: 'sine', vol: 0.04 })
  }

  /** 元素吸收：双音上行（元素入体） */
  absorb() {
    this._tone({ freq: 520, endFreq: 700, dur: 0.1, type: 'sine', vol: 0.05 })
    this._tone({ freq: 780, endFreq: 1040, dur: 0.12, type: 'sine', vol: 0.04, delay: 0.08 })
  }

  /** 元素升级钟鸣：双正弦泛音，叮——（元素等级提升专属） */
  elementUp() {
    this._tone({ freq: 880, dur: 0.18, type: 'sine', vol: 0.06 })
    this._tone({ freq: 1320, dur: 0.28, type: 'sine', vol: 0.04, delay: 0.05 })
  }

  /** 全屏雷击：低频爆响 + 高频击穿 */
  thunder() {
    this._tone({ freq: 140, endFreq: 45, dur: 0.35, type: 'square', vol: 0.08 })
    this._tone({ freq: 1800, endFreq: 300, dur: 0.18, type: 'sawtooth', vol: 0.03, delay: 0.02 })
  }

  /** 敌人远程射击：短促低音 */
  enemyShoot() {
    this._tone({ freq: 300, endFreq: 220, dur: 0.06, type: 'square', vol: 0.02 })
  }

  /** Boss 登场咆哮：双低频震荡 */
  bossRoar() {
    this._tone({ freq: 90, endFreq: 55, dur: 0.5, type: 'sawtooth', vol: 0.09 })
    this._tone({ freq: 120, endFreq: 60, dur: 0.4, type: 'square', vol: 0.06, delay: 0.05 })
  }

  /** Boss 阵亡哀鸣：长下滑 + 闷响 */
  bossDeath() {
    this._tone({ freq: 220, endFreq: 40, dur: 0.8, type: 'sawtooth', vol: 0.08 })
    this._tone({ freq: 80, endFreq: 30, dur: 0.6, type: 'square', vol: 0.07, delay: 0.1 })
  }

  /** 吞噬：低频咕噜（吞咽感） */
  devour() {
    this._tone({ freq: 130, endFreq: 70, dur: 0.22, type: 'sawtooth', vol: 0.06 })
    this._tone({ freq: 90, endFreq: 45, dur: 0.18, type: 'square', vol: 0.05, delay: 0.1 })
  }

  /** 进化事件：厚重上行琶音（融合宣告） */
  evolution() {
    this._tone({ freq: 196, dur: 0.12, type: 'sawtooth', vol: 0.05 })
    this._tone({ freq: 294, dur: 0.12, type: 'sawtooth', vol: 0.05, delay: 0.1 })
    this._tone({ freq: 392, dur: 0.22, type: 'sawtooth', vol: 0.06, delay: 0.2 })
    this._tone({ freq: 523, dur: 0.3, type: 'triangle', vol: 0.07, delay: 0.32 })
  }

  /** 升级：三音上行琶音（C-E-G） */
  levelUp() {
    this._tone({ freq: 523, dur: 0.09, type: 'triangle', vol: 0.06 })
    this._tone({ freq: 659, dur: 0.09, type: 'triangle', vol: 0.06, delay: 0.09 })
    this._tone({ freq: 784, dur: 0.16, type: 'triangle', vol: 0.06, delay: 0.18 })
  }

  /** 玩家受击：低沉方波 */
  hurt() {
    this._tone({ freq: 180, endFreq: 90, dur: 0.2, type: 'square', vol: 0.06 })
  }

  /** 冲刺：短促上滑呼啸（阶段十三主动技能） */
  dash() {
    this._tone({ freq: 300, endFreq: 900, dur: 0.15, type: 'sine', vol: 0.04 })
  }

  /** 毒雷风暴：低频轰隆 + 中频嗡鸣（阶段十三 毒+雷 反应） */
  venomStorm() {
    this._tone({ freq: 120, endFreq: 50, dur: 0.4, type: 'square', vol: 0.06 })
    this._tone({ freq: 600, endFreq: 1400, dur: 0.25, type: 'sawtooth', vol: 0.025, delay: 0.02 })
  }

  /** 波次切换：双音号角 */
  wave() {
    this._tone({ freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.04 })
    this._tone({ freq: 330, dur: 0.12, type: 'sawtooth', vol: 0.04, delay: 0.12 })
  }

  /** 战区切换：低频地鸣配一次短促定位音。 */
  mapShift(theme = 'frontier') {
    const roots = { frontier: 116, blight: 98, royal: 82 }
    const root = roots[theme] || roots.frontier
    this._tone({ freq: root, endFreq: root * 0.72, dur: 0.42, type: 'sine', vol: 0.035 })
    this._tone({ freq: root * 2.5, endFreq: root * 2.1, dur: 0.16, type: 'triangle', vol: 0.022, delay: 0.08 })
  }

  /** 巢心受击：限频后的湿润低响，不与玩家受击音混淆。 */
  nestHit() {
    this._tone({ freq: 145, endFreq: 84, dur: 0.13, type: 'triangle', vol: 0.04 })
  }

  nestSecured() {
    this._tone({ freq: 294, dur: 0.11, type: 'sine', vol: 0.045 })
    this._tone({ freq: 392, dur: 0.18, type: 'sine', vol: 0.045, delay: 0.09 })
  }

  barrierBreak() {
    this._tone({ freq: 170, endFreq: 58, dur: 0.2, type: 'square', vol: 0.045 })
    this._tone({ freq: 310, endFreq: 90, dur: 0.1, type: 'triangle', vol: 0.025, delay: 0.03 })
  }

  /** 游戏结束：长下滑哀鸣 */
  gameOver() {
    this._tone({ freq: 300, endFreq: 55, dur: 0.9, type: 'sawtooth', vol: 0.07 })
  }

  // ==================== UI 音效（阶段十二新增） ====================

  /** 按钮点击：短促三角波软嗒（所有 UI 按钮通用） */
  uiClick() {
    this.ensure()
    this._tone({ freq: 440, endFreq: 330, dur: 0.05, type: 'triangle', vol: 0.04 })
  }

  /** 配置选中：低音软触叠加轻微上行泛音，与技能确认音区分。 */
  uiSelect() {
    this.ensure()
    this._tone({ freq: 420, endFreq: 560, dur: 0.075, type: 'triangle', vol: 0.034 })
    this._tone({ freq: 840, endFreq: 720, dur: 0.1, type: 'sine', vol: 0.018, delay: 0.025 })
  }

  /** 技能卡确认：双音快上行（选择升级卡） */
  select() {
    this._tone({ freq: 660, dur: 0.07, type: 'triangle', vol: 0.05 })
    this._tone({ freq: 880, dur: 0.14, type: 'triangle', vol: 0.05, delay: 0.06 })
  }

  /** 黑市购买成功：金币双响（B5 → E6） */
  buy() {
    this._tone({ freq: 988, dur: 0.07, type: 'sine', vol: 0.05 })
    this._tone({ freq: 1319, dur: 0.14, type: 'sine', vol: 0.05, delay: 0.07 })
  }

  /** 黑市购买失败：低沉拒绝嗡鸣 */
  buyFail() {
    this._tone({ freq: 160, endFreq: 110, dur: 0.18, type: 'square', vol: 0.05 })
  }

  /** 新纪录号角：C 大调四音上行（结算刷新纪录） */
  newRecord() {
    this._tone({ freq: 523, dur: 0.1, type: 'sawtooth', vol: 0.05 })
    this._tone({ freq: 659, dur: 0.1, type: 'sawtooth', vol: 0.05, delay: 0.1 })
    this._tone({ freq: 784, dur: 0.1, type: 'sawtooth', vol: 0.05, delay: 0.2 })
    this._tone({ freq: 1047, dur: 0.3, type: 'triangle', vol: 0.07, delay: 0.3 })
  }

  /** 开局号角：双音上行（进入地下城 / 再来一局） */
  gameStart() {
    this._tone({ freq: 392, dur: 0.15, type: 'sawtooth', vol: 0.05 })
    this._tone({ freq: 523, dur: 0.28, type: 'sawtooth', vol: 0.06, delay: 0.12 })
  }

  // ==================== 背景音乐（程序化循环） ====================

  // A 小调 16 步琶音（0 = 休止），低音 drone 每 8 步垫底
  static MUSIC_STEP = 0.3 // 每步时长（秒）
  static MUSIC_NOTES = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 0, 220, 329.63, 440, 523.25, 440, 329.63, 261.63, 0]
  static MUSIC_DRONE = 110 // A2 低音持续垫底
  static MUSIC_LOOKAHEAD = 0.5 // 提前排程窗口（秒）

  /**
   * 开始 BGM（游戏主循环启动时调用；已开启则忽略）。
   * 首次创建增益总线并从头排程；暂停恢复（_musicOn=false）时接续上次进度——
   * 升级面板/暂停开关不再让 16 步旋律从头重播（「卡带」修复）；
   * stopMusic 已把排程进度归零，新局 startMusic 自然从头排程。
   */
  startMusic() {
    this.ensure()
    if (!this.ctx || this._musicOn) return
    this._musicOn = true
    if (!this._musicGain) {
      this._musicGain = this.ctx.createGain()
      this._musicGain.connect(this._master || this.ctx.destination)
      this._musicStep = 0
      this._musicNextTime = 0
    }
    // 接续上次进度：进度落后于当前时间（暂停期间/新局归零）则对齐到当下
    if (this._musicNextTime < this.ctx.currentTime) this._musicNextTime = this.ctx.currentTime + 0.05
    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime)
    this._musicGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.2)
    this._musicTimer = setInterval(() => this._musicSchedule(), 100)
  }

  /** 暂停 BGM（手动暂停 / 升级面板 / 结算）：停止排程 + 快速淡出已排音符（排程进度保留，供接续恢复） */
  pauseMusic() {
    if (!this.ctx || !this._musicOn) return
    this._musicOn = false
    clearInterval(this._musicTimer)
    this._musicTimer = 0
    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime)
    this._musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08)
  }

  /** 停止 BGM（游戏结束 / 引擎销毁 / 整局重置）：清调度与定时器，增益归零 */
  stopMusic() {
    if (!this.ctx) return
    this._musicOn = false
    if (this._musicTimer) {
      clearInterval(this._musicTimer)
      this._musicTimer = 0
    }
    if (this._musicGain) {
      this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this._musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06)
    }
    // 排程进度归零：下次 startMusic（新局）从头排程
    this._musicStep = 0
    this._musicNextTime = 0
  }

  /** 排程器：把窗口内所有未排的音符一次性补排（Web Audio 经典 lookahead 模式） */
  _musicSchedule() {
    if (!this.ctx || !this._musicOn) return
    const step = SoundManager.MUSIC_STEP
    while (this._musicNextTime < this.ctx.currentTime + SoundManager.MUSIC_LOOKAHEAD) {
      const i = this._musicStep % SoundManager.MUSIC_NOTES.length
      const t = this._musicNextTime
      const note = SoundManager.MUSIC_NOTES[i]
      if (note > 0) {
        this._tone({ freq: note, dur: step * 0.92, type: 'triangle', vol: 0.03, delay: Math.max(0, t - this.ctx.currentTime) })
      }
      if (i % 8 === 0) {
        // 低音 drone：跨 8 步持续
        this._tone({ freq: SoundManager.MUSIC_DRONE, dur: step * 8 * 0.95, type: 'sine', vol: 0.035, delay: Math.max(0, t - this.ctx.currentTime) })
      }
      this._musicNextTime += step
      this._musicStep++
    }
  }
}
