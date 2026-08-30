import { ArenaGameplay } from './ArenaGameplay.js'
import { RunnerGameplay } from './RunnerGameplay.js'

/** 当前已支持的 Gameplay id。勿与 RunRules.MODE_IDS 混淆。 */
export const GAMEPLAY_IDS = ['arena', 'runner']

/**
 * gameplay id 归一化：未知 id 安全回落 arena。
 * 与 normalizeRunSelection 的宽容风格一致——配置笔误不应让游戏无法启动。
 */
export function normalizeGameplayId(id) {
  return GAMEPLAY_IDS.includes(id) ? id : 'arena'
}

/** 按 gameplay id 创建 Gameplay Controller */
export function createGameplay(id) {
  switch (normalizeGameplayId(id)) {
    case 'runner':
      return new RunnerGameplay()
    case 'arena':
    default:
      return new ArenaGameplay()
  }
}
