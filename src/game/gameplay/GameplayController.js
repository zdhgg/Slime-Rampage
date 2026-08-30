/**
 * Gameplay Controller 契约（轻量基类）
 *
 * Gameplay 描述一局的「游戏空间与核心操作规则」：
 *  - arena  = 开放地图割草（现有玩法：视口外刷怪、自动索敌、8 向移动）
 *  - runner = 三线推进射击（最小空壳：自有背景与通道渲染，玩法逻辑后续接入）
 *
 * 与 RunRules 的正交关系：runSelection.mode（expedition/timed/endless）
 * 表达一局的规则目标与结算口径，gameplay 表达空间与操作范式；
 * 两轴各自独立演进，勿把 gameplay 塞进 RunRules.MODE_IDS。
 *
 * 它不是 Entity：不进入 engine.entities 更新/渲染列表，由 GameEngine 在
 * 生命周期的固定位置显式调用 hooks，实体更新/渲染顺序完全不受影响。
 *
 * 约束（架构红线）：
 *  - 不使用 Vue / reactive / ref；
 *  - beforeUpdate/afterUpdate/beforeRender/afterRender 处于每帧热路径，
 *    实现必须避免每帧创建临时对象；
 *  - hooks 默认空实现，子类只覆写真正需要的 hook。
 */
export class GameplayController {
  constructor(id) {
    this.id = id
    this.game = null // attach(game) 注入的引擎上下文
  }

  /** 引擎注册：注入上下文（构造与 configureGameplay 时各调用一次） */
  attach(game) {
    this.game = game
  }

  /** 整局重置（engine.reset() 末尾调用，位于全部管理器 reset 与开局主题设定之后） */
  reset() {}

  /** 每帧：实体更新前调用（dt 为秒） */
  beforeUpdate(_dt) {}

  /** 每帧：实体更新、相机与主题推进之后调用 */
  afterUpdate(_dt) {}

  /** 每帧：世界渲染流程开始前调用（DPR 变换已就位）。当前 Arena 世界仍会随后
   *  绘制并覆盖画面；Gameplay 自主管理完整世界渲染需要后续 Execution Boundary 支持。 */
  beforeRender(_ctx) {}

  /** 每帧：全部渲染（含暗角）之后调用，适合玩法自有屏幕空间覆盖层 */
  afterRender(_ctx) {}

  /** 引擎销毁时调用：释放玩法自有资源 */
  destroy() {
    this.game = null
  }

  /**
   * Execution Boundary（每帧执行边界）：返回 true 时由 Engine 执行 Arena 默认
   * 帧管线（_updateArenaFrame / _renderArenaFrame）；返回 false 时每帧改调
   * updateWorld / renderWorld，由 Gameplay 完全接管世界更新与渲染。
   * 每帧读取一次，实现必须稳定、无副作用。
   */
  usesArenaFramePipeline() {
    return true
  }

  /** 自定义世界更新（usesArenaFramePipeline() 为 false 时每帧调用，dt 为秒） */
  updateWorld(_dt) {}

  /** 自定义世界渲染（usesArenaFramePipeline() 为 false 时每帧调用；DPR 变换已就位） */
  renderWorld(_ctx) {}
}
