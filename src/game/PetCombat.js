import { shadowTargetAlive as alive, shadowLineClear, traceShadowPath, shadowCircleEntry } from './ShadowGeometry.js'

const TYPES = {
  guardian: { name: '岩甲团团', color: '#edc479', hp: 9, speed: 290, interval: 0.85, power: 1.4 },
  hunter: { name: '疾风芽芽', color: '#8edacb', hp: 6, speed: 420, interval: 0.65, power: 1.15 },
}
const ranged = e => e.type === 'mage' || e.type === 'archer'

/** 共生伙伴有独立生命与倒地状态。伤害只走实体结算，不复制本体触发链。 */
export class PetCombat {
  constructor(weapon) { this.weapon = weapon; this.reset() }
  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  get enabled() { return this.game?.startingStrain === 'summoner' }
  get available() { return this.enabled && !this.player.dead && !this.game.runFinished }
  level(id) { return this.game?.skillLevels?.[id] || 0 }
  get recovery() { return Math.max(4, 8 - this.level('pet_recovery')) }
  get cap() { return this.level('pet_partner') ? 2 : 1 }
  get damageScale() { return (1 + this.level('pet_power') * 0.2) * (this.game.primarySpec === 'symbiosis' ? 1.2 : 1) }
  reset() { this.items = []; this.marker = null; this.serial = 0 }

  sync() {
    if (!this.available) { this.reset(); return }
    for (const type of ['guardian', ...(this.cap === 2 ? ['hunter'] : [])]) {
      let pet = this.items.find(p => p.type === type)
      const maxHp = TYPES[type].hp + this.level('pet_vitality') * 3
      if (!pet) {
        const end = traceShadowPath(this.game, this.player, type === 'guardian' ? 0 : Math.PI, 40, 17)
        pet = { ...end, id: ++this.serial, type, name: TYPES[type].name, radius: 17, isPet: true,
          hp: maxHp, maxHp, down: 0, hurt: 0, idle: 0, cooldown: 0, attack: null,
          target: null, retarget: 0, special: 0, protect: 0, flash: 0, angle: 0, claims: new Set() }
        this.items.push(pet)
      } else if (maxHp > pet.maxHp) {
        if (pet.hp > 0) pet.hp += maxHp - pet.maxHp
        pet.maxHp = maxHp
      }
    }
  }

  hud() {
    this.sync()
    return this.items.map(p => ({ id: p.type, name: p.name, hp: Math.ceil(p.hp), maxHp: p.maxHp,
      down: p.down, state: p.down > 0 ? '恢复中' : p.special > 0 ? '协同狩猎' : p.protect > 0 ? '回防' : '作战中' }))
  }

  hit(pet, damage) {
    if (!this.available || pet.hp <= 0 || damage <= 0 || pet.hurt > 0) return false
    pet.hp = Math.max(0, pet.hp - damage * (pet.protect > 0 ? 0.5 : 1))
    pet.hurt = 0.35; pet.idle = 0; pet.flash = 0.18
    if (pet.hp <= 0) {
      pet.down = this.recovery; pet.attack = null; pet.target = null; pet.special = 0; pet.protect = 0
      this.game.enemyManager.addText(pet.x, pet.y - 26, `${pet.name} · 暂歇`, null, TYPES[pet.type].color, 12)
    }
    return true
  }

  lureTarget(enemy) {
    if (!this.available || !enemy || enemy.isBoss) return null
    const pet = this.items.find(p => p.type === 'guardian' && p.hp > 0)
    if (!pet || Math.hypot(pet.x - enemy.x, pet.y - enemy.y) > 180 || !shadowLineClear(this.game, pet, enemy)) return null
    if (!pet.claims.has(enemy) && pet.claims.size >= 3) return null
    pet.claims.add(enemy)
    return pet
  }

  intercept(bullet, ax, ay) {
    if (!this.available || bullet.isBoss) return false
    let contact = shadowCircleEntry(ax, ay, bullet.x, bullet.y, this.player, bullet.radius), blocker = null
    for (const p of this.items) {
      if (p.hp <= 0) continue
      const t = shadowCircleEntry(ax, ay, bullet.x, bullet.y, p, bullet.radius)
      if (t < contact) { blocker = p; contact = t }
    }
    if (!blocker) return false
    this.hit(blocker, bullet.damage); bullet.active = false
    return true
  }

  nearest(pet, point = pet, radius = 420, preferRanged = pet.type === 'hunter') {
    let best = null, score = Infinity
    for (const e of this.weapon.enemyManager.enemies) {
      if (!alive(e) || Math.hypot(e.x - point.x, e.y - point.y) > radius ||
          Math.hypot(e.x - this.player.x, e.y - this.player.y) > 600) continue
      const d = Math.hypot(e.x - pet.x, e.y - pet.y) - (preferRanged && ranged(e) && !e.isBoss ? 450 : 0)
      if (d < score && shadowLineClear(this.game, pet, e)) { best = e; score = d }
    }
    return best
  }

  command() {
    this.sync()
    const pets = this.items.filter(p => p.hp > 0)
    if (!pets.length) return false
    const dir = this.player.input.getMoveVector()
    const angle = dir.x || dir.y ? Math.atan2(dir.y, dir.x) : this.player.facing
    const point = traceShadowPath(this.game, this.player, angle, 260, 0)
    this.marker = { ...point, life: 0.65 }
    for (const pet of pets) {
      pet.target = this.nearest(pet, point, 180)
      pet.attack = null; pet.cooldown = 0
      pet.special = pet.target ? 3 : 0
      pet.protect = pet.target ? 0 : 2.5
    }
    // 指令反馈对齐其它角色主动（元素原质释放 / 原生黏液震荡都是环+粒子+震屏）：
    // 7 秒冷却不该只换来一个半径 35 的细圈。
    // landed=false 是"发起指令"的挥空音，与下面特殊攻击命中的 bite(false) 区分开。
    this.weapon._ring(point.x, point.y, '#edc479', 90)
    this.weapon._burstColor(point.x, point.y, '#edc479', 12, false)
    this.game.sound?.bite?.(false, false)
    this.game.shakeScreen?.(2, 0.15)
    return true
  }

  strike(pet, attack) {
    const primary = attack.target
    if (!alive(primary) || Math.hypot(primary.x - pet.x, primary.y - pet.y) > 100 || !shadowLineClear(this.game, pet, primary)) return
    const targets = attack.special && pet.type === 'guardian'
      ? [primary, ...this.weapon.enemyManager.enemies.filter(e => e !== primary && alive(e) && Math.hypot(e.x - pet.x, e.y - pet.y) < 115)].slice(0, 3)
      : [primary]
    const teamwork = this.level('pet_capstone') && this.items.length === 2 && this.items.every(p => p.hp > 0) ? 1.3 : 1
    const damage = this.weapon.damage * this.weapon.levelMul * TYPES[pet.type].power * this.damageScale * teamwork *
      (attack.special ? (pet.type === 'hunter' ? 3 : 2) * (1 + this.level('pet_command') * 0.2) : 1)
    let landed = false
    for (const e of targets) {
      if (!this.available) break
      if (!alive(e)) continue
      if (!shadowLineClear(this.game, pet, e)) continue
      const before = e.hp
      e.hit(damage)
      if (e.hp < before) {
        landed = true
        this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + Math.min(before, before - e.hp)
        this.game.enemyManager.addText(e.x, e.y - 18, String(Math.round(damage * 10) / 10), null, TYPES[pet.type].color, 12)
        // 命中冲击：复用武器系统的粒子接口，让伙伴的每一次实际伤害在画面里有出处。
        // 敌人白闪（Enemy.hit）是所有伤害源共用的，单靠它玩家无法把掉血归因给伙伴。
        this.weapon._burstColor(e.x, e.y - 6, TYPES[pet.type].color, attack.special ? 8 : 4, false)
        if (attack.special && !e.isBoss && e.active) {
          const end = traceShadowPath(this.game, e, Math.atan2(e.y - pet.y, e.x - pet.x), 18)
          Object.assign(e, end)
        }
      }
      if (!e.active) this.weapon._onKill(e)
    }
    pet.flash = attack.special ? 0.3 : 0.12
    // 命中音色按伙伴类型分档：岩甲偏钝、疾风偏脆。
    // 一次挥击只响一次（放在多目标循环之外），且只在真的造成伤害时响——
    // 挥空不该听成命中（口径对齐 GluttonCombat 的 bite(heavy, landed)）。
    if (landed) this.game.sound?.hit?.(pet.type === 'hunter' ? 'spark' : 'base')
    if (attack.special) {
      this.weapon._ring(pet.x, pet.y, TYPES[pet.type].color, pet.type === 'guardian' ? 115 : 55)
      this.game.sound?.bite?.(false)
    }
  }

  update(dt) {
    this.sync()
    if (!this.available) return
    if (this.marker && (this.marker.life -= dt) <= 0) this.marker = null
    for (const pet of this.items) {
      if (!this.available) break
      pet.claims.clear()
      if (pet.down > 0) {
        pet.down = Math.max(0, pet.down - dt)
        if (pet.down === 0) {
          Object.assign(pet, traceShadowPath(this.game, this.player, this.player.facing + Math.PI, 40, pet.radius))
          pet.hp = pet.maxHp; pet.hurt = 0.8
        }
        continue
      }
      pet.hurt = Math.max(0, pet.hurt - dt); pet.flash = Math.max(0, pet.flash - dt)
      pet.cooldown = Math.max(0, pet.cooldown - dt); pet.idle += dt
      if (pet.idle > 3) pet.hp = Math.min(pet.maxHp, pet.hp + dt * 0.35)
      pet.special = Math.max(0, pet.special - dt); pet.protect = Math.max(0, pet.protect - dt)
      if (pet.attack) {
        pet.attack.time -= dt
        if (pet.attack.time <= 0) { const attack = pet.attack; pet.attack = null; this.strike(pet, attack) }
        continue
      }
      const recall = pet.protect > 0 || Math.hypot(pet.x - this.player.x, pet.y - this.player.y) > 520
      pet.retarget -= dt
      if (!alive(pet.target) || Math.hypot(pet.target.x - this.player.x, pet.target.y - this.player.y) > 600) pet.target = null
      if (pet.retarget <= 0 && pet.special <= 0) { pet.target = this.nearest(pet); pet.retarget = 0.25 }
      const target = recall ? this.player : pet.target || this.player
      const distance = Math.hypot(target.x - pet.x, target.y - pet.y)
      pet.angle = Math.atan2(target.y - pet.y, target.x - pet.x)
      if (!recall && target !== this.player && distance < 85 && shadowLineClear(this.game, pet, target)) {
        if (pet.cooldown <= 0) {
          pet.attack = { target, time: 0.14, maxTime: 0.14, special: pet.special > 0 }
          pet.special = 0
          pet.cooldown = TYPES[pet.type].interval / (1 + 0.12 * this.level('pet_haste'))
        }
      } else if (distance > (target === this.player ? 45 : 65)) {
        const speed = pet.special > 0 ? 750 : TYPES[pet.type].speed
        Object.assign(pet, traceShadowPath(this.game, pet, pet.angle, Math.min(distance - 40, speed * dt)))
      }
    }
  }

  render(ctx) {
    if (!this.available) return
    if (this.marker) {
      const fade = Math.max(0, this.marker.life / 0.65)
      ctx.save()
      // 契约指向线：从每只伙伴拉到指令点，让"我把它派过去了"看得见
      ctx.globalAlpha = fade * 0.45
      ctx.strokeStyle = '#edc479'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6])
      for (const pet of this.items) {
        if (pet.down > 0) continue
        ctx.beginPath(); ctx.moveTo(pet.x, pet.y); ctx.lineTo(this.marker.x, this.marker.y); ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = fade * 0.5
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.marker.x, this.marker.y, 35, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    for (const pet of this.items) {
      ctx.save(); ctx.translate(pet.x, pet.y)
      const color = TYPES[pet.type].color
      ctx.globalAlpha = pet.down > 0 ? 0.45 : 1
      ctx.fillStyle = '#091a1580'; ctx.beginPath(); ctx.ellipse(0, 13, 21, 7, 0, 0, Math.PI * 2); ctx.fill()
      // 0.14 秒前摇的扑咬：沿朝向探身并拉伸压扁。
      // 影子留在原地（上面已画），所以缩放只作用于身体。
      if (pet.attack) {
        const k = 1 - Math.max(0, pet.attack.time) / (pet.attack.maxTime || 0.14)
        ctx.translate(Math.cos(pet.angle) * k * 9, Math.sin(pet.angle) * k * 9)
        ctx.rotate(pet.angle)
        ctx.scale(1 + k * 0.2, 1 - k * 0.14)
        ctx.rotate(-pet.angle)
      }
      ctx.fillStyle = pet.flash > 0 ? '#fff1cf' : color
      ctx.strokeStyle = '#32473e'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(0, 0, pet.type === 'guardian' ? 20 : 16, pet.down > 0 ? 8 : 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (pet.type === 'guardian') {
        ctx.strokeStyle = '#9d7847'; ctx.beginPath(); ctx.moveTo(-12,-8); ctx.lineTo(0,-14); ctx.lineTo(12,-8); ctx.lineTo(0,1); ctx.closePath(); ctx.stroke()
      } else {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-12,-8); ctx.lineTo(-11,-26); ctx.lineTo(-3,-12); ctx.moveTo(3,-12); ctx.lineTo(13,-26); ctx.lineTo(13,-8); ctx.fill()
      }
      ctx.fillStyle = '#17362d'
      for (const x of [-6,6]) { ctx.beginPath(); ctx.ellipse(x,4,2.3,pet.down>0?1:3,0,0,Math.PI*2); ctx.fill() }
      ctx.fillStyle = '#12221d'; ctx.fillRect(-20,-34,40,4)
      ctx.fillStyle = color; ctx.fillRect(-20,-34,40 * (pet.down > 0 ? 1 - pet.down / this.recovery : pet.hp / pet.maxHp),4)
      if (pet.down > 0) { ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText(`${Math.ceil(pet.down)}s`,0,-40) }
      ctx.restore()
    }
  }
}
