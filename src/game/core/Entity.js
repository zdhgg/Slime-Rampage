/**
 * 实体基类：所有游戏对象（玩家、敌人、子弹…）的统一契约
 *
 * 生命周期：
 *   attach(game)  → 由引擎在注册时注入游戏上下文（输入、画布尺寸等）
 *   update(dt)    → 每帧逻辑更新，dt 为秒（帧率无关）
 *   render(ctx)   → 每帧绘制
 *   destroy()     → 标记失活，下一帧由引擎从活跃列表剔除
 */
export class Entity {
  constructor() {
    this.game = null
    this.active = true
  }

  attach(game) {
    this.game = game
  }

  update(_dt) {}

  render(_ctx) {}

  destroy() {
    this.active = false
  }
}
