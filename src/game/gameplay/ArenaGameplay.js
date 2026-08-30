import { GameplayController } from './GameplayController.js'

/**
 * Arena 玩法：现有的开放地图割草范式，Gameplay 架构的默认实现。
 *
 * 当前所有 Arena 行为（玩家移动、自动索敌、敌人生成、地图、HUD、升级、
 * 元素、黑市基因、Boss、存档）仍由 GameEngine 与既有管理器直接实现，
 * 本类刻意保持空壳——只把这套规则显式命名并挂进生命周期，不搬迁
 * GameEngine 逻辑；后续确有玩法差异需求时再逐步迁移，保持小步可回滚。
 */
export class ArenaGameplay extends GameplayController {
  constructor() {
    super('arena')
  }
}
