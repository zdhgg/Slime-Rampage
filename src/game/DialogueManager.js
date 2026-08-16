import { Entity } from './core/Entity.js'
import { getExpeditionStage } from './RunRules.js'
import {
  CLASS_NAMES,
  MINION_DIALOGUE_CHANCE,
  MINION_DIALOGUE_COOLDOWN,
  SPEAKER_COLORS,
  getBossDialogue,
  pickMinionDialogue,
} from './DialogueData.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function splitLine(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const pivot = Math.min(maxChars, Math.max(6, Math.ceil(text.length / 2)))
  return [text.slice(0, pivot), text.slice(pivot)]
}

/** 低频战斗对白：单气泡、强优先级、纯 Canvas，不占用 HUD Toast。 */
export class DialogueManager extends Entity {
  constructor() {
    super()
    this.current = null
    this.epilogue = null
    this.minionCooldown = 6
    this.random = Math.random
  }

  reset() {
    this.current = null
    this.epilogue = null
    this.minionCooldown = 6
  }

  tryMinion(enemy) {
    if (!enemy?.active || enemy.isBoss || enemy._dialogueChecked) return false
    const game = this.game
    const cam = game.camera
    const inset = 28
    if (
      enemy.x < cam.x + inset ||
      enemy.x > cam.x + game.width - inset ||
      enemy.y < cam.y + inset ||
      enemy.y > cam.y + game.height - inset
    ) return false

    enemy._dialogueChecked = true
    if (this.minionCooldown > 0 || game.enemyManager.hasBoss || game.runState !== 'active') return false
    if (this.random() >= MINION_DIALOGUE_CHANCE) return false

    const stage = game.runSelection.mode === 'expedition'
      ? getExpeditionStage(game.runSelection.difficulty, game.expeditionStage)
      : null
    const text = pickMinionDialogue(
      {
        type: enemy.type,
        narrativeKey: stage?.narrativeKey,
        wave: game.enemyManager.wave,
        mode: game.runSelection.mode,
      },
      this.random
    )
    this._show({
      kind: 'minion',
      speaker: CLASS_NAMES[enemy.type] || '勇者',
      text,
      color: SPEAKER_COLORS[enemy.type] || SPEAKER_COLORS.knight,
      entity: enemy,
      duration: 2.4,
      priority: 10,
    })
    this.minionCooldown = MINION_DIALOGUE_COOLDOWN
    return true
  }

  sayBoss(boss, event) {
    if (!boss || !event) return null
    if (!boss._dialogueEvents) boss._dialogueEvents = new Set()
    if (boss._dialogueEvents.has(event)) return null
    boss._dialogueEvents.add(event)
    const text = getBossDialogue(boss.type, event)
    if (!text) return null

    const line = this._show({
      kind: 'boss',
      speaker: boss.name,
      text,
      color: SPEAKER_COLORS.boss,
      entity: boss,
      duration: event === 'defeat' ? 3.8 : 3.3,
      priority: event === 'defeat' ? 120 : 100,
      event,
    })
    if (event === 'defeat' && (boss.isFinalBoss || boss.isExpeditionBoss)) {
      this.epilogue = { speaker: boss.name, text }
    }
    return line
  }

  _show(payload) {
    if (this.current && this.current.priority > payload.priority) return null
    this.current = {
      ...payload,
      life: payload.duration,
      x: payload.entity?.x || 0,
      y: payload.entity?.y || 0,
      radius: payload.entity?.radius || 14,
    }
    return this.current
  }

  update(dt) {
    this.minionCooldown = Math.max(0, this.minionCooldown - dt)
    const line = this.current
    if (!line) return
    if (line.entity?.active) {
      line.x = line.entity.x
      line.y = line.entity.y
      line.radius = line.entity.radius || line.radius
    }
    line.life -= dt
    if (line.life <= 0) this.current = null
  }

  render(ctx) {
    const line = this.current
    if (!line) return
    const game = this.game
    const cam = game.camera
    const boss = line.kind === 'boss'
    const maxChars = boss ? 18 : 13
    const lines = splitLine(line.text, maxChars)
    const longest = Math.max(line.speaker.length, ...lines.map((text) => text.length))
    const width = Math.min(boss ? 270 : 200, Math.max(boss ? 176 : 118, longest * (boss ? 14 : 13) + 28))
    const height = 29 + lines.length * (boss ? 20 : 18)
    const margin = 14
    const centerX = clamp(line.x, cam.x + width / 2 + margin, cam.x + game.width - width / 2 - margin)
    let top = line.y - line.radius - height - 22
    let below = false
    if (top < cam.y + margin) {
      top = line.y + line.radius + 20
      below = true
    }
    top = clamp(top, cam.y + margin, cam.y + game.height - height - margin)
    const left = centerX - width / 2
    const alpha = Math.min(1, line.life / 0.28)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(7, 10, 9, 0.92)'
    ctx.strokeStyle = line.color
    ctx.lineWidth = boss ? 1.6 : 1
    roundedRect(ctx, left, top, width, height, boss ? 5 : 4)
    ctx.fill()
    ctx.stroke()

    const tailX = clamp(line.x, left + 14, left + width - 14)
    const tailY = below ? top : top + height
    ctx.fillStyle = 'rgba(7, 10, 9, 0.92)'
    ctx.beginPath()
    ctx.moveTo(tailX - 6, tailY)
    ctx.lineTo(tailX + 6, tailY)
    ctx.lineTo(tailX, tailY + (below ? -8 : 8))
    ctx.closePath()
    ctx.fill()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = line.color
    ctx.font = `700 ${boss ? 11 : 10}px sans-serif`
    ctx.fillText(line.speaker, centerX, top + 7)
    ctx.fillStyle = '#f1f3ed'
    ctx.font = `600 ${boss ? 14 : 13}px sans-serif`
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], centerX, top + 23 + i * (boss ? 20 : 18))
    }
    ctx.restore()
  }
}
