import { shadowTargetAlive as alive, shadowLineClear, traceShadowPath, shadowCircleEntry } from './ShadowGeometry.js'
import { renderPet, renderPetShot } from './PetVisuals.js'
import { PET_PARTNER_TYPES, getPetRally } from './PetSkills.js'
import { SYMBIOSIS_ROUTES, SYMBIOSIS_RULES, symbiosisRouteInvestment, symbiosisProgressReady, symbiosisRouteReady } from './SymbiosisBuild.js'
import { petSupportStats, petSupportDescription } from './PetSupport.js'

const TYPES = {
  guardian: { name: '岩甲团团', role: '近战', color: '#edc479', hp: 9, speed: 290, interval: 0.85, power: 1.4, range: 85, follow: 65, windup: 0.19 },
  hunter: { name: '疾风芽芽', role: '远程', color: '#8edacb', hp: 6, speed: 420, interval: 0.65, power: 1.15, range: 260, follow: 200, windup: 0.18, projectileSpeed: 510 },
  dew: { name: '甘露啵啵', role: '治疗', color: '#8fd7e8', hp: 7, speed: 350, interval: 1.05, power: 0.8, range: 225, follow: 170, windup: 0.23, projectileSpeed: 430 },
  spore: { name: '孢云菇菇', role: '控场', color: '#c3a4dc', hp: 8, speed: 320, interval: 1.2, power: 0.85, range: 210, follow: 160, windup: 0.26, projectileSpeed: 360 },
  // 残响团团：岩甲团团的弱化投影（共生共鸣挂件产物），近战、更脆、无完整支援体量
  echo: { name: '残响团团', role: '近战', color: '#a8c8a0', hp: 5, speed: 290, interval: 0.95, power: 0.8, range: 85, follow: 70, windup: 0.19 },
}
const ranged = e => e.type === 'mage' || e.type === 'archer'
const FORMATION = {
  guardian: { angle: -0.25, distance: 58 },
  hunter: { angle: 2.25, distance: 72 },
  dew: { angle: -2.25, distance: 72 },
  spore: { angle: Math.PI, distance: 112 },
  echo: { angle: -0.62, distance: 66 },
}

/** 共生伙伴有独立生命与倒地状态。伤害只走实体结算，不复制本体触发链。 */
export class PetCombat {
  constructor(weapon) { this.weapon = weapon; this.reset() }
  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  /**
   * 完整名册（共生血统级）：只有共生血统天生开启。
   * origin 不再通过拟态获得伙伴系统。
   */
  get fullRoster() {
    return this.game?.startingStrain === 'summoner'
  }
  /**
   * 共生伙伴系统开关：完整名册；旧残响挂件入口保留但 origin 已不再产出该卡。
   */
  get enabled() { return this.fullRoster || this.level('sym_sub_echo') > 0 }
  get available() { return this.enabled && !this.player.dead && !this.game.runFinished }
  level(id) { return this.game?.skillLevels?.[id] || 0 }
  get recovery() { return Math.max(3, 8 - this.level('pet_recovery') - (this.player.genePetRecoveryBonus || 0)) }
  get rosterTypes() {
    const types = this.fullRoster ? ['guardian'] : []
    for (const [id, type] of Object.entries(PET_PARTNER_TYPES)) if (this.level(id)) types.push(type)
    if (this.level('sym_sub_echo')) types.push('echo')
    return types
  }
  get cap() { return this.rosterTypes.length }
  /** 残响投影按挂件等级缩放（lv1 基底，lv2 +50%） */
  typeScale(type) { return type === 'echo' ? 1 + 0.5 * (this.level('sym_sub_echo') - 1) : 1 }
  get damageScale() {
    return (1 + this.level('pet_power') * 0.2 + this.level('sym_sub_surge') * 0.4) * (this.player.genePetDamageMul || 1) *
      (this.game.primarySpec === 'symbiosis' ? 1.2 : 1)
  }
  get rallyStats() {
    const stats = getPetRally(this.level('pet_command'))
    if (this.route === 'guard') {
      stats.duration += Math.min(3, this.routeGuardAegisLevel * .5) + (this.routeUltimate === 'guard' ? 2 : 0)
    }
    return stats
  }
  get attackRate() { return (1 + this.level('pet_haste') * 0.12) * (this.rallyTime > 0 ? 1 + this.rallyStats.haste : 1) }
  get moveScale() { return (this.rallyTime > 0 ? 1 + this.rallyStats.move : 1) * (1 + this.level('sym_sub_surge') * 0.15) }
  get playerDamageReduction() {
    if (this.route !== 'guard' || this.rallyTime <= 0) return 0
    return Math.min(.42, .08 + this.routeGuardLevel * .05 + this.routeGuardAegisLevel * .03 + (this.routeUltimate === 'guard' ? .1 : 0))
  }
  reset() {
    this.items = []; this.shots = []; this.rallyTime = 0; this.rallyDuration = 0; this.rallyOverloaded = false; this.rallyFlash = 0; this.serial = 0
    this.route = null; this.normalChoices = 0; this.routeUltimate = null; this.routeHitCount = 0; this.routeFieldCooldown = 0
    this.routeHuntLevel = 0; this.routeHuntChainLevel = 0; this.routeHuntEchoLevel = 0
    this.routeSporeLevel = 0; this.routeSporeFieldLevel = 0; this.routeSporeBloomLevel = 0
    this.routeGuardLevel = 0; this.routeGuardAegisLevel = 0; this.routeGuardPulseLevel = 0
  }

  get routeInfo() { return SYMBIOSIS_ROUTES[this.route] || null }
  chooseRoute(route) {
    if (!this.fullRoster || !SYMBIOSIS_ROUTES[route] || !symbiosisRouteReady(this.game) ||
        !(this.game.skillLevels?.[SYMBIOSIS_ROUTES[route].seed] > 0)) return false
    this.route = route
    this.weapon._weaponPulse = .7
    return true
  }
  hudBuild() {
    const route = this.routeInfo
    return {
      route: this.route, name: route?.name || '共生探索', icon: route?.icon || '🐾', color: route?.color || '#edc479',
      investment: route ? symbiosisRouteInvestment(this.game, this.route) : 0,
      normalChoices: this.normalChoices, routeReady: symbiosisRouteReady(this.game), progressReady: symbiosisProgressReady(this.game),
      ultimate: !!(route && this.game.skillLevels?.[route.ultimate]), ultimateName: route?.ultimateName || '',
      ultimateReady: !!(route && this.game.player?.level >= SYMBIOSIS_RULES.ultimateLevel && symbiosisProgressReady(this.game, true)),
      note: route ? `${route.name}已锁定 · ${route.ultimateName}为互斥终极` : `前期随机组队 · 选卡满${SYMBIOSIS_RULES.choicesBeforeRoute}次且第${SYMBIOSIS_RULES.routeWave}波／远征第${SYMBIOSIS_RULES.routeStage}章后确认路线`,
    }
  }

  formationPoint(type) {
    const slot = FORMATION[type]
    return traceShadowPath(this.game, this.player, this.player.facing + slot.angle, slot.distance, 17)
  }

  sync() {
    if (!this.available) { this.reset(); return }
    const types = this.rosterTypes
    if (this.items.some(pet => !types.includes(pet.type))) {
      this.items = this.items.filter(pet => types.includes(pet.type))
      this.shots = this.shots.filter(shot => types.includes(shot.type))
    }
    for (const type of types) {
      let pet = this.items.find(p => p.type === type)
      const maxHp = Math.round((TYPES[type].hp + this.level('pet_vitality') * 3 + (this.player.genePetHpBonus || 0)) * this.typeScale(type) * (1 + .1 * (this.game?.bossTomes?.rank('pet_roster') || 0)))
      if (!pet) {
        const end = this.formationPoint(type)
        pet = { ...end, id: ++this.serial, type, name: TYPES[type].name, radius: 17, isPet: true,
          hp: maxHp, maxHp, down: 0, hurt: 0, idle: 0, cooldown: 0, attack: null,
          target: null, retarget: 0, flash: 0, angle: 0,
          attackFx: 0, attackBoosted: false, shotCount: 0, healCharge: 0, claims: new Set(),
          support: null, supportCd: 0, supportFx: 0, supportActive: 0, taunted: new Set(), supportTargets: [] }
        this.items.push(pet)
      } else if (maxHp > pet.maxHp) {
        if (pet.hp > 0) pet.hp += maxHp - pet.maxHp
        pet.maxHp = maxHp
      }
    }
  }

  hud() {
    this.sync()
    return this.items.map(p => ({ id: p.type, name: p.name, role: TYPES[p.type].role, hp: Math.ceil(p.hp), maxHp: p.maxHp,
      supportName: this.supportStats(p).name, supportCd: p.supportCd, supportActive: p.supportActive, supporting: !!p.support,
      supportDesc: petSupportDescription(this.supportStats(p)),
      down: p.down, boosted: p.down <= 0 && this.rallyTime > 0, state: p.down > 0 ? '恢复中' : this.rallyTime > 0 ? '共生鼓舞' :
        p.type === 'dew' ? `甘露蓄能 ${p.healCharge}/${this.level('pet_dew_spring') ? 3 : 5}` : '作战中' }))
  }

  rallyHud() {
    return this.available && this.rallyTime > 0
      ? { ...this.rallyStats, remaining: this.rallyTime, duration: this.rallyDuration }
      : null
  }

  hit(pet, damage) {
    if (!this.available || pet.hp <= 0 || damage <= 0 || pet.hurt > 0) return false
    const routeGuard = this.route === 'guard' && this.rallyTime > 0
      ? Math.min(.25, this.routeGuardLevel * .04 + this.routeGuardAegisLevel * .03 + (this.routeUltimate === 'guard' ? .08 : 0)) : 0
    const armor = (pet.type === 'guardian' && this.level('pet_bulwark') ? 0.75 : 1) * (1 - routeGuard)
    pet.hp = Math.max(0, pet.hp - damage * armor * ((pet.tomeReviveUntil || 0) > this.game.elapsed ? .75 : 1))
    pet.hurt = 0.35; pet.idle = 0; pet.flash = 0.18
    if (pet.hp <= 0) {
      pet.down = this.recovery; pet.attack = null; pet.attackFx = 0; pet.target = null
      pet.support = null; pet.supportActive = 0; pet.supportFx = 0; pet.taunted.clear(); pet.supportTargets = []
      this.game.enemyManager.addText(pet.x, pet.y - 26, `${pet.name} · 暂歇`, null, TYPES[pet.type].color, 12)
    }
    return true
  }

  lureTarget(enemy) {
    if (!this.available || !enemy || enemy.isBoss) return null
    const pet = this.items.find(p => this.supportStats(p).kind === 'taunt' && p.hp > 0)
    if (pet?.supportActive > 0) return this.isTaunted(enemy) && shadowLineClear(this.game, pet, enemy) ? pet : null
    if (!pet || Math.hypot(pet.x - enemy.x, pet.y - enemy.y) > 180 || !shadowLineClear(this.game, pet, enemy)) return null
    if (!pet.claims.has(enemy) && pet.claims.size >= 3) return null
    pet.claims.add(enemy)
    return pet
  }

  isTaunted(enemy) {
    const taunter = this.items.find(p => this.supportStats(p).kind === 'taunt' && p.hp > 0)
    return this.available && alive(enemy) && !enemy.isBoss && !!taunter && taunter.supportActive > 0 && taunter.taunted.has(enemy)
  }

  supportStats(pet) { return petSupportStats(pet.type, this.game.skillLevels) }

  supportEnemies(pet) {
    const stats = this.supportStats(pet)
    return this.weapon.enemyManager.enemies.filter(enemy => alive(enemy) && !enemy.isBoss &&
      !(stats.kind === 'slow' && enemy.isEnraged) &&
      !this.game.mapFeatures?.getEnemyTarget?.(enemy)?.isMapObjective &&
      Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= 240 &&
      Math.hypot(enemy.x - pet.x, enemy.y - pet.y) <= stats.radius && shadowLineClear(this.game, pet, enemy))
      .sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))
      .slice(0, stats.limit)
  }

  injuredAlly() {
    if (this.player.hp < this.player.maxHp) return this.player
    return this.items.filter(ally => ally.hp > 0 && ally.hp < ally.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
  }

  beginSupport(pet) {
    if (!this.available || pet.hp <= 0 || pet.support || pet.supportCd > 0 || pet.down > 0) return false
    const stats = this.supportStats(pet)
    if (stats.kind === 'heal' ? !this.injuredAlly() : !this.supportEnemies(pet).length) return false
    pet.support = { kind: stats.kind, time: stats.windup, maxTime: stats.windup }
    return true
  }

  finishSupport(pet) {
    if (!this.available || pet.hp <= 0 || pet.down > 0) return false
    const stats = this.supportStats(pet)
    const targets = stats.kind === 'heal' ? [] : this.supportEnemies(pet)
    if (stats.kind === 'heal' ? !this.healAlly() : !targets.length) return false
    if (stats.kind === 'taunt') pet.taunted = new Set(targets)
    if (stats.kind === 'weaken') for (const enemy of targets) {
      enemy.petWeakenTime = stats.duration; enemy.petWeakenAmount = stats.reduction
    }
    if (stats.kind === 'slow') for (const enemy of targets) enemy.slow = Math.max(enemy.slow || 0, stats.duration)
    if (stats.kind !== 'heal') pet.supportTargets = targets
    pet.supportCd = stats.cooldown; pet.supportActive = stats.duration; pet.supportFx = .55
    this.weapon._ring(pet.x, pet.y, TYPES[pet.type].color, stats.kind === 'heal' ? 38 : 65)
    this.weapon._burstColor(pet.x, pet.y, TYPES[pet.type].color, 7, false)
    this.game.enemyManager.addText(pet.x, pet.y - 40, stats.name, null, TYPES[pet.type].color, 12)
    this.game.sound?.hit?.('spark')
    return true
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

  rally() {
    this.sync()
    const pets = this.items.filter(p => p.hp > 0)
    if (!pets.length || this.rallyTime > 0) return false
    this.rallyOverloaded = false
    this.rallyTime = this.rallyDuration = this.rallyStats.duration
    this.rallyFlash = 0.55
    this.game?.bossTomes?.onRally(pets)
    for (const pet of pets) {
      // 加速正在进行的攻击，保持动作进度连续，不取消或追加一次攻击。
      pet.cooldown /= 1 + this.rallyStats.haste
      if (pet.attack) {
        pet.attack.time /= 1 + this.rallyStats.haste
        pet.attack.maxTime /= 1 + this.rallyStats.haste
      }
      this.weapon._ring(pet.x, pet.y, TYPES[pet.type].color, 32)
      this.weapon._burstColor(pet.x, pet.y, '#ffe4a1', 5, false)
    }
    this.weapon._ring(this.player.x, this.player.y, '#edc479', 100)
    if (this.routeUltimate === 'hunt') this.routeHuntBurst()
    if (this.routeUltimate === 'spore') this.routeSporeBurst()
    if ((this.route === 'guard' && this.routeGuardPulseLevel > 0) || this.routeUltimate === 'guard') this.routePulse()
    this.weapon._burstColor(this.player.x, this.player.y, '#edc479', 12, false)
    this.game.enemyManager.addText(this.player.x, this.player.y - 45, this.rallyOverloaded ? '⚡ 超载鼓舞!' : '共生鼓舞', null, '#ffe4a1', 15)
    this.game.sound?.bite?.(false, false)
    this.game.shakeScreen?.(2, 0.15)
    return true
  }

  attackDamage(pet) {
    const teamwork = this.level('pet_capstone') && this.items.filter(p => p.hp > 0).length >= 2 ? 1.3 : 1
    return this.weapon.damage * this.weapon.levelMul * TYPES[pet.type].power * this.typeScale(pet.type) * this.damageScale * teamwork *
      (this.rallyTime > 0 ? 1 + this.rallyStats.damage : 1) * (this.game?.bossTomes?.petAttackMultiplier(pet, this.rallyTime > 0) || 1)
  }

  routePulse() {
    const level = Math.max(1, this.routeGuardPulseLevel)
    const radius = 110 + level * 14 + (this.routeUltimate === 'guard' ? 70 : 0)
    const damage = this.weapon.damage * this.weapon.levelMul * (0.7 + Math.min(1.1, level * .22))
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || enemy.isBoss || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > radius) continue
      const before = enemy.hp
      enemy.hit(damage)
      if (enemy.hp < before) this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + Math.min(before, before - enemy.hp)
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    this.weapon._ring(this.player.x, this.player.y, '#edc479', radius)
    this.weapon._burstColor(this.player.x, this.player.y, '#ffe4a1', 12, false)
  }

  routeHuntBurst() {
    const pets = this.items.filter(pet => pet.hp > 0)
    if (!pets.length) return
    const range = 300 + this.routeHuntEchoLevel * 35
    const targets = this.weapon.enemyManager.enemies.filter(enemy => alive(enemy) &&
      Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= range)
      .sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))
      .slice(0, 12)
    const damage = this.weapon.damage * this.weapon.levelMul * (1.1 + Math.min(.8, this.routeHuntChainLevel * .12))
    for (const enemy of targets) {
      const before = enemy.hp
      enemy.hit(damage)
      if (enemy.hp < before) this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + Math.min(before, before - enemy.hp)
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    this.weapon._ring(this.player.x, this.player.y, '#8edacb', range)
    this.weapon._burstColor(this.player.x, this.player.y, '#d7fff3', Math.min(18, 6 + targets.length), false)
  }

  routeSporeBurst() {
    const radius = 170 + this.routeSporeFieldLevel * 18
    const targets = this.weapon.enemyManager.enemies.filter(enemy => alive(enemy) &&
      Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= radius).slice(0, 18)
    const damage = this.weapon.damage * this.weapon.levelMul * (1.15 + Math.min(.9, this.routeSporeBloomLevel * .18))
    for (const enemy of targets) {
      const before = enemy.hp
      enemy.hit(damage)
      if (enemy.hp < before) this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + Math.min(before, before - enemy.hp)
      if (!enemy.isBoss && !enemy.isEnraged) enemy.slow = Math.max(enemy.slow || 0, 3.5)
      if (!enemy.active) this.weapon._onKill(enemy)
    }
    this.weapon._ring(this.player.x, this.player.y, '#c3a4dc', radius)
    this.weapon._burstColor(this.player.x, this.player.y, '#f1ddff', Math.min(20, 7 + targets.length), false)
  }

  dealHit(pet, enemy, damage, boosted = false) {
    if (!this.available || !alive(enemy)) return false
    if (this.route === 'hunt' && enemy.petHuntMarkTime > 0 && enemy.petHuntMarkDamage > 0) {
      damage *= 1 + enemy.petHuntMarkDamage
      enemy.petHuntMarkTime = 0
      enemy.petHuntMarkDamage = 0
    }
    const before = enemy.hp
    enemy.hit(damage)
    if (enemy.hp < before) {
      if (this.route === 'hunt' && this.routeHuntLevel > 0) {
        enemy.petHuntMarkTime = Math.min(5, 2.5 + this.routeHuntLevel * .5)
        enemy.petHuntMarkDamage = Math.min(.36, .12 + this.routeHuntLevel * .06)
      }
      if (this.route === 'spore' && this.routeSporeLevel > 0 && this.routeFieldCooldown <= 0) {
        const radius = 55 + this.routeSporeLevel * 10 + this.routeSporeFieldLevel * 14
        const splash = damage * Math.min(.45, .15 + this.routeSporeLevel * .05)
        const targets = this.weapon.enemyManager.enemies.filter(other => alive(other) && other !== enemy &&
          Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius)
          .slice(0, Math.min(5, 2 + this.routeSporeBloomLevel))
        for (const other of targets) {
          other.hit(splash)
          if (!other.isBoss && !other.isEnraged) other.slow = Math.max(other.slow || 0, Math.min(3, 1 + this.routeSporeFieldLevel * .4))
        }
        this.routeFieldCooldown = Math.max(.2, .8 - this.routeSporeFieldLevel * .08)
        this.weapon._ring(enemy.x, enemy.y, '#c3a4dc', radius)
      }
      this.weapon.stats.petDamage = (this.weapon.stats.petDamage || 0) + Math.min(before, before - enemy.hp)
      this.game.enemyManager.addText(enemy.x, enemy.y - 18, String(Math.round(damage * 10) / 10), null, TYPES[pet.type].color, 12)
      this.weapon._burstColor(enemy.x, enemy.y - 6, TYPES[pet.type].color, boosted ? 6 : 4, false)
    }
    if (!enemy.active) this.weapon._onKill(enemy)
    return enemy.hp < before
  }

  launchShot(pet, target, damage, offset = 0) {
    const speed = TYPES[pet.type].projectileSpeed
    const angle = Math.atan2(target.y - pet.y, target.x - pet.x)
    const x = pet.x + Math.cos(angle) * 17 - Math.sin(angle) * offset
    const y = pet.y + Math.sin(angle) * 17 + Math.cos(angle) * offset - 3
    this.shots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      angle, target, owner: pet, type: pet.type, speed, damage, boosted: this.rallyTime > 0,
      radius: 4.5, life: 0.95, active: true })
  }

  healAlly() {
    const ally = this.injuredAlly()
    if (!ally) return false
    const amount = Math.min(1, ally.maxHp - ally.hp)
    ally.hp += amount
    this.game.enemyManager.addText(ally.x, ally.y - 30, `+${Math.round(amount * 10) / 10}`, null, TYPES.dew.color, 13)
    this.weapon._ring(ally.x, ally.y, TYPES.dew.color, 32)
    const dew = this.items.find(p => p.type === 'dew' && p.hp > 0)
    if (dew) { dew.supportFx = .55; dew.supportTargets = [ally] }
    return true
  }

  hitSpore(shot, primary) {
    const radius = 55 + (this.level('pet_spore_bloom') ? 30 : 0)
    const duration = this.level('pet_spore_bloom') ? 1.3 : 0.8
    const x = primary.x, y = primary.y
    const targets = [primary, ...this.weapon.enemyManager.enemies.filter(enemy =>
      enemy !== primary && alive(enemy) && Math.hypot(enemy.x - x, enemy.y - y) <= radius)]
      .slice(0, this.level('pet_spore_bloom') ? 4 : 3)
    let landed = false
    for (const [index, enemy] of targets.entries()) {
      const hit = this.dealHit(shot.owner, enemy, shot.damage * (index ? 0.55 : 1), shot.boosted)
      if (hit && !enemy.isBoss && !enemy.isEnraged) enemy.slow = Math.max(enemy.slow || 0, duration)
      landed = hit || landed
    }
    this.weapon._ring(x, y, TYPES.spore.color, radius)
    return landed
  }

  updateShots(dt) {
    for (const shot of this.shots) {
      shot.life -= dt
      if (shot.life <= 0) { shot.active = false; continue }
      if (alive(shot.target)) {
        const angle = Math.atan2(shot.target.y - shot.y, shot.target.x - shot.x)
        shot.vx = Math.cos(angle) * shot.speed; shot.vy = Math.sin(angle) * shot.speed
      }
      shot.angle = Math.atan2(shot.vy, shot.vx)
      const ax = shot.x, ay = shot.y, step = shot.speed * dt
      const end = traceShadowPath(this.game, shot, shot.angle, step, 0)
      shot.x = end.x; shot.y = end.y
      let hit = null, first = Infinity
      for (const enemy of this.weapon.enemyManager.enemies) {
        if (!alive(enemy)) continue
        const entry = shadowCircleEntry(ax, ay, shot.x, shot.y, enemy, shot.radius)
        if (entry < first) { hit = enemy; first = entry }
      }
      if (hit) {
        const landed = shot.type === 'spore'
          ? this.hitSpore(shot, hit)
          : this.dealHit(shot.owner, hit, shot.damage, shot.boosted)
        if (landed && shot.type === 'dew' && shot.owner.hp > 0 && shot.owner.down <= 0) {
          shot.owner.healCharge = (shot.owner.healCharge || 0) + 1
          const threshold = this.level('pet_dew_spring') ? 3 : 5
          if (shot.owner.healCharge >= threshold) {
            if (this.healAlly()) shot.owner.healCharge = 0
            else shot.owner.healCharge = threshold - 1
          }
        }
        if (landed) this.game.sound?.hit?.('spark')
        shot.active = false
      } else if (Math.hypot(shot.x - ax, shot.y - ay) < step - 0.5) {
        shot.active = false
      }
    }
    if (this.shots.some(shot => !shot.active)) this.shots = this.shots.filter(shot => shot.active)
  }

  strike(pet, attack) {
    const primary = attack.target
    pet.attackFx = 0.18
    pet.attackBoosted = this.rallyTime > 0
    pet.attackAngle = pet.angle
    const range = TYPES[pet.type].range + 15
    if (!alive(primary) || Math.hypot(primary.x - pet.x, primary.y - pet.y) > range || !shadowLineClear(this.game, pet, primary)) return
    const damage = this.attackDamage(pet)
    if (TYPES[pet.type].projectileSpeed) {
      this.launchShot(pet, primary, damage)
      pet.shotCount++
      if (pet.type === 'hunter' && this.level('pet_volley') && pet.shotCount % 3 === 0) {
        this.launchShot(pet, primary, this.attackDamage(pet) * 0.55, 8)
      }
      this.weapon._burstColor(pet.x + Math.cos(pet.angle) * 16, pet.y + Math.sin(pet.angle) * 16, TYPES[pet.type].color, 3, false)
      return
    }
    const landed = this.dealHit(pet, primary, damage, pet.attackBoosted)
    if (landed) this.game.sound?.hit?.('base')
  }

  update(dt) {
    this.sync()
    if (!this.available) return
    if (this.route === 'hunt') for (const enemy of this.weapon.enemyManager.enemies) {
      if (enemy.petHuntMarkTime > 0) enemy.petHuntMarkTime = Math.max(0, enemy.petHuntMarkTime - dt)
      if (enemy.petHuntMarkTime === 0) enemy.petHuntMarkDamage = 0
    }
    this.rallyTime = Math.max(0, this.rallyTime - dt)
    if (this.rallyTime === 0) this.rallyOverloaded = false
    this.rallyFlash = Math.max(0, this.rallyFlash - dt)
    for (const pet of this.items) {
      if (!this.available) break
      pet.claims.clear()
      pet.supportCd = Math.max(0, pet.supportCd - dt)
      pet.supportActive = Math.max(0, pet.supportActive - dt)
      this.routeFieldCooldown = Math.max(0, this.routeFieldCooldown - dt)
      pet.supportFx = Math.max(0, pet.supportFx - dt)
      if (pet.supportFx === 0) pet.supportTargets = []
      if (pet.supportActive === 0) pet.taunted.clear()
      if (pet.down > 0) {
        pet.down = Math.max(0, pet.down - dt)
        if (pet.down === 0) {
          Object.assign(pet, this.formationPoint(pet.type))
          pet.hp = pet.maxHp; pet.hurt = 0.8
          if (this.game?.bossTomes?.rank('pet_roster') === 3) pet.tomeReviveUntil = this.game.elapsed + 2
        }
        continue
      }
      pet.hurt = Math.max(0, pet.hurt - dt); pet.flash = Math.max(0, pet.flash - dt)
      pet.attackFx = Math.max(0, pet.attackFx - dt)
      pet.cooldown = Math.max(0, pet.cooldown - dt); pet.idle += dt
      if (pet.idle > 3) pet.hp = Math.min(pet.maxHp, pet.hp + dt * 0.35)
      if (pet.support) {
        pet.support.time -= dt
        if (pet.support.time <= 0) { pet.support = null; this.finishSupport(pet) }
        continue
      }
      if (pet.attack) {
        pet.attack.time -= dt
        if (pet.attack.time <= 0) { const attack = pet.attack; pet.attack = null; this.strike(pet, attack) }
        continue
      }
      if (this.beginSupport(pet)) continue
      const recall = Math.hypot(pet.x - this.player.x, pet.y - this.player.y) > 520
      pet.retarget -= dt
      if (!alive(pet.target) || Math.hypot(pet.target.x - this.player.x, pet.target.y - this.player.y) > 600) pet.target = null
      if (pet.retarget <= 0) { pet.target = this.nearest(pet); pet.retarget = 0.25 }
      const following = recall || !pet.target
      const target = following ? this.formationPoint(pet.type) : pet.target
      const distance = Math.hypot(target.x - pet.x, target.y - pet.y)
      pet.angle = Math.atan2(target.y - pet.y, target.x - pet.x)
      if (!following && distance < TYPES[pet.type].range && shadowLineClear(this.game, pet, target)) {
        if (pet.cooldown <= 0) {
          const windup = TYPES[pet.type].windup / this.attackRate
          pet.attack = { target, time: windup, maxTime: windup }
          pet.cooldown = TYPES[pet.type].interval / this.attackRate
        }
      } else {
        const speed = TYPES[pet.type].speed * this.moveScale
        const followDistance = following ? 5 : TYPES[pet.type].follow
        if (distance > followDistance) {
          Object.assign(pet, traceShadowPath(this.game, pet, pet.angle, Math.min(distance - followDistance, speed * dt)))
        }
      }
    }
    this.spreadOut(dt)
    this.updateShots(dt)
  }

  spreadOut(dt) {
    const pets = this.items.filter(p => p.hp > 0)
    for (let i = 0; i < pets.length; i++) {
      for (let j = i + 1; j < pets.length; j++) {
        const a = pets[i], b = pets[j]
        const distance = Math.hypot(b.x - a.x, b.y - a.y)
        if (distance >= 40) continue
        const angle = distance > 0.01 ? Math.atan2(b.y - a.y, b.x - a.x) : (a.id + b.id) * 1.7
        const step = Math.min((40 - distance) / 2, 90 * dt)
        Object.assign(a, traceShadowPath(this.game, a, angle + Math.PI, step))
        Object.assign(b, traceShadowPath(this.game, b, angle, step))
      }
    }
  }

  render(ctx) {
    if (!this.available) return
    if (this.rallyFlash > 0) {
      const fade = this.rallyFlash / 0.55
      ctx.save()
      ctx.globalAlpha = fade * 0.4
      ctx.strokeStyle = '#edc479'; ctx.lineWidth = 1.5
      for (const pet of this.items) {
        if (pet.down > 0) continue
        ctx.beginPath(); ctx.moveTo(this.player.x, this.player.y); ctx.lineTo(pet.x, pet.y); ctx.stroke()
      }
      ctx.restore()
    }
    for (const pet of this.items.slice().sort((a, b) => a.y - b.y)) {
      renderPet(ctx, pet, this.recovery, this.game.elapsed, this.rallyTime)
    }
    for (const shot of this.shots) renderPetShot(ctx, shot)
    this.renderSupportMarks(ctx)
  }

  renderSupportMarks(ctx) {
    ctx.save()
    ctx.lineWidth = 1.5
    for (const enemy of this.weapon.enemyManager.enemies) {
      if (!alive(enemy) || enemy.isBoss) continue
      const taunted = this.isTaunted(enemy), weakened = enemy.petWeakenTime > 0
      if (!taunted && !weakened) continue
      const y = enemy.y - enemy.radius - 8
      const marks = [...(taunted ? ['taunt'] : []), ...(weakened ? ['weaken'] : [])]
      for (const [index, kind] of marks.entries()) {
        const x = enemy.x + (index - (marks.length - 1) / 2) * 14
        ctx.strokeStyle = kind === 'taunt' ? '#edc479' : '#8edacb'
        ctx.fillStyle = 'rgba(9,20,16,.85)'
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.beginPath()
        if (kind === 'taunt') { ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 1) }
        else { ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.moveTo(x - 2, y + 1); ctx.lineTo(x, y + 3); ctx.lineTo(x + 2, y + 1) }
        ctx.stroke()
        if (kind === 'taunt') { ctx.fillStyle = '#edc479'; ctx.beginPath(); ctx.arc(x, y + 3, .8, 0, Math.PI * 2); ctx.fill() }
      }
    }
    ctx.restore()
  }
}
