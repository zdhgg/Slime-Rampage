/**
 * 浮动文本：吞噬提示 / 暴击伤害数字（上浮 + 淡出）
 *
 * 轻量对象，由 EnemyManager 批量管理（事件驱动，数量少）：
 *  - 两行结构：主文本（吞噬职业名 / 暴击数字）+ 副文本（提取素材）；
 *  - 纯 Canvas fillText，0.9s 内上浮 34px 并淡出；
 *  - fontSize 可调：暴击数字用大号金色（24px），吞噬提示默认 15px。
 */
export class FloatingText {
  constructor(x, y, main, sub, subColor = '#ffd166', fontSize = 15) {
    this.x = x
    this.y = y
    this.main = main // 主文本（如「吞噬：见习火法师」或「42」）
    this.sub = sub // 副文本（如「提取：火焰基因 +1」，可为空）
    this.subColor = subColor
    this.fontSize = fontSize
    this.life = 0.9
    this.maxLife = 0.9
    this.active = true
  }

  update(dt) {
    this.life -= dt
    this.y -= 34 * dt // 持续上浮
    if (this.life <= 0) this.active = false
  }

  render(ctx) {
    const alpha = Math.min(1, this.life / (this.maxLife * 0.5))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'
    ctx.lineWidth = Math.max(3, this.fontSize * 0.14)
    // 零 shadowBlur（与飞弹同策略）：深色描边已保证任意背景可读
    ctx.strokeStyle = 'rgba(10, 20, 12, 0.9)'
    if (this.sub) {
      ctx.font = `bold ${this.fontSize}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.strokeText(this.main, this.x, this.y)
      ctx.fillText(this.main, this.x, this.y)
      ctx.font = 'bold 12px "Segoe UI", "PingFang SC", sans-serif'
      ctx.fillStyle = this.subColor
      ctx.fillText(this.sub, this.x, this.y + this.fontSize * 1.1)
    } else {
      // 单行（暴击数字）：金色大字号 + 深色描边，亮背景下清晰可读
      ctx.font = `bold ${this.fontSize}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.fillStyle = this.subColor
      ctx.strokeText(this.main, this.x, this.y)
      ctx.fillText(this.main, this.x, this.y)
    }
    ctx.restore()
  }
}
