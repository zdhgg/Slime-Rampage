import { ArenaGameplay } from './ArenaGameplay.js'

/** 当前已支持的 Gameplay id；runner 实装时在此追加。勿与 RunRules.MODE_IDS 混淆。 */
export const GAMEPLAY_IDS = ['arena']

/**
 * gameplay id 归一化：未知 id 安全回落 arena。
 * 与 normalizeRunSelection 的宽容风格一致——配置笔误不应让游戏无法启动。
 */
export function normalizeGameplayId(id) {
  return GAMEPLAY_IDS.includes(id) ? id : 'arena'
}

/** 按 gameplay id 创建 Gameplay Controller */
export function createGameplay(id) {
  // 目前仅 arena；runner 实装时在此追加分支（normalizeGameplayId 同步扩充白名单）
  return new ArenaGameplay()
}
