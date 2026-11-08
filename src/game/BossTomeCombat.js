import { BOSS_TOME_BY_ID, PARTNER_TOME_CHOICES, tomeLevel } from './BossTomes.js'
import { traceShadowPath, shadowLineClear } from './ShadowGeometry.js'

const alive = e => e?.active && e.hp > 0 && !e.devouring
const bonus = (level, one, two) => level ? level === 1 ? one : two : 0

/** Owns bounded tome state. Combat hooks never open UI or grant normal skill ranks. */
export class BossTomeCombat {
  constructor(game) { this.game = game; this.reset() }
  get p() { return this.game.player }
  get w() { return this.game.weaponSystem }
  hud() {
    return Object.entries(this.game.bossSkillLevels || {}).map(([id, level]) => ({
      id, level, name: BOSS_TOME_BY_ID[id].name, desc: BOSS_TOME_BY_ID[id].desc,
      color: BOSS_TOME_BY_ID[id].color, stats: BOSS_TOME_BY_ID[id].ranks.slice(0, level).join('；'),
    }))
  }
  rank(key) { return tomeLevel(this.game, `boss_${key}`) }
  reset() {
    this.time = 0; this.jobs = []; this.sigil = new WeakMap(); this.jaw = new WeakMap()
    this.foreign = 0; this.casts = 0; this.echoMisses = 0; this.castCredits = 0
    this.until = {}; this.ready = {}; this.shield = 0; this.fastBite = false
  }
  clearStage() {
    this.jobs.length = 0; this.sigil = new WeakMap(); this.jaw = new WeakMap()
    this.until = {}; this.shield = 0; this.castCredits = 0; this.fastBite = false
  }
  base() { return this.w.damage * this.w.levelMul * (this.w.devourDamageMul || 1) }
  learn(card) {
    const s = BOSS_TOME_BY_ID[card?.id], old = tomeLevel(this.game, card?.id)
    if (!s || s.strain !== this.game.startingStrain || old >= 3 || card.level !== old) return false
    if (s.id === 'boss_pet_roster' && card.partnerSkillId &&
        (!PARTNER_TOME_CHOICES.some(([id]) => id === card.partnerSkillId) || this.game.skillLevels[card.partnerSkillId])) return false
    const level = old + 1, p = this.p, w = this.w
    this.game.bossSkillLevels[s.id] = level
    this.game.bossSkillIds.add(s.id)
    const ratio = (a, b) => a / b
    if (s.id === 'boss_rico_chamber') {
      w.projectileCount += [0, 1, 1, 2][level] - [0, 1, 1, 2][old]
      w.fireInterval *= ratio(level >= 2 ? .92 : 1, old >= 2 ? .92 : 1)
    }
    if (s.id === 'boss_rico_stabilizer') {
      w.damage *= ratio(1 + bonus(level, .12, .2), 1 + bonus(old, .12, .2))
      w.projectileSpeed *= ratio(1 + bonus(level, .1, .15), 1 + bonus(old, .1, .15))
    }
    if (['boss_rico_recharge', 'boss_assassin_voidstep', 'boss_pet_command'].includes(s.id)) {
      p.activeSkillCdMultiplier *= ratio(1 - bonus(level, .08, .15), 1 - bonus(old, .08, .15))
    }
    if (s.id === 'boss_pet_vitality') {
      const delta = [0, 1, 2, 2][level] - [0, 1, 2, 2][old]
      p.maxHp += delta; p.hp = Math.min(p.maxHp, p.hp + delta)
    }
    if (s.id === 'boss_glutton_radiance' && old === 0) this.ready.radiance = this.time + 4
    if (s.id === 'boss_pet_roster') {
      if (card.partnerSkillId) this.game.skillLevels[card.partnerSkillId] = 1
      w.petCombat.sync()
      if (!card.partnerSkillId) for (const pet of w.petCombat.items) {
        if (pet.hp > 0) pet.hp = Math.min(pet.maxHp, pet.hp + pet.maxHp * .25)
      }
    }
    if (s.id === 'boss_elemental_veil') w.spellCombat.shield.upgrade()
    return true
  }
  update(dt) {
    if (this.p.dead || this.game.runFinished) { this.jobs.length = 0; return }
    this.time += dt
    if ((this.until.shield || 0) <= this.time) this.shield = 0
    const due = this.jobs.filter(job => job.due <= this.time)
    this.jobs = this.jobs.filter(job => job.due > this.time)
    for (const job of due) {
      if (this.p.dead || this.game.runFinished) break
      job.run()
    }
    const rank = this.rank('glutton_radiance')
    if (rank && this.time >= (this.ready.radiance ?? 0)) {
      const radius = rank === 1 ? 140 : 160
      if (this.targets(this.p, radius).length) {
        this.ready.radiance = this.time + (rank === 1 ? 4 : 3.5)
        this.pulse(this.p, radius, this.base() * (rank === 1 ? 1 : 1.2), '#ffd166')
      }
    }
  }
  schedule(delay, run) { if (this.jobs.length < 64) this.jobs.push({ due: this.time + delay, run }) }
  targets(center, radius, exclude = null) {
    return (this.game.enemyManager?.enemies || []).filter(e => alive(e) && e !== exclude &&
      Math.hypot(e.x - center.x, e.y - center.y) <= radius + (e.radius || 0) && shadowLineClear(this.game, center, e))
      .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y)).slice(0, 5)
  }
  deal(e, damage) {
    if (!alive(e) || this.p.dead || this.game.runFinished) return
    e.hit(damage, { bossTomeDerived: true, preventDevour: true })
    if (!e.active) { e._originDerivedKill = true; this.w._onKill(e) }
  }
  pulse(center, radius, damage, color, after = null) {
    for (const e of this.targets(center, radius)) {
      if (this.game.runFinished || this.p.dead) break
      this.deal(e, damage); after?.(e)
    }
    this.w._ring?.(center.x, center.y, color, radius)
  }
  onOriginGain(foreign, amount) {
    const rank = this.rank('origin_conduit')
    if (!rank || !foreign || amount <= 0 || ++this.foreign < 3) return
    this.foreign = 0; this.p.primalEnergy = Math.min(100, this.p.primalEnergy + (rank === 1 ? 4 : 6))
    if (rank === 3) this.until.originFirst = this.time + 3
  }
  onOverload() {
    if (this.rank('origin_reservoir') === 3) this.until.reservoir = this.time + 3
    const membrane = this.rank('origin_membrane')
    if (membrane) this.grantShield(membrane === 1 ? 2 : 3)
    if (membrane === 3) this.until.move = this.time + 2
    // 源质调谐（原「超载余震」）：Lv.3 超载后 2 秒移速 +20%；伤害/范围加成
    // 在 originSourceCastMods 里统一进源质技能的乘区，不再放独立余震。
    if (this.rank('origin_aftershock') === 3) this.until.move = this.time + 2
  }
  grantShield(duration) {
    this.shield = 1; this.until.shield = this.time + duration
    this.w._ring?.(this.p.x, this.p.y, '#bce9bd', this.p.radius + 14)
    this.game.enemyManager?.addText?.(this.p.x, this.p.y - 38, '秘典护盾 +1', null, '#bce9bd', 14)
  }
  absorb(damage, attack) {
    if (!attack?.enemyAttack || !this.shield || this.until.shield <= this.time) return damage
    const absorbed = Math.min(damage, this.shield); this.shield -= absorbed
    return damage - absorbed
  }
  get moveMultiplier() { return this.until.move > this.time ? 1.2 : 1 }
  get biteHaste() { return this.until.rhythm > this.time ? 1 + bonus(this.rank('glutton_rhythm'), .15, .25) : 1 }
  onCharge() {
    const rank = this.rank('glutton_rhythm')
    if (!rank) return
    this.until.rhythm = this.time + (rank === 1 ? 2 : 3)
    if (rank === 3) this.fastBite = true
  }
  heavyWindup() { return this.fastBite ? .8 : 1 }
  onHurt() {
    const rank = this.rank('glutton_thorns')
    if (!rank || this.time < (this.ready.thorns || 0)) return
    this.ready.thorns = this.time + 3
    if (rank === 3) this.until.biteFirst = this.time + 3
    this.pulse(this.p, rank === 1 ? 120 : 150, this.base() * (rank === 1 ? .8 : 1.2), '#ffb36b')
  }
  onEvade() {
    const rank = this.rank('shadow_cloak')
    if (rank === 3) this.until.move = this.time + 2
    return rank ? rank === 1 ? .3 : .4 : .2
  }
  hitMultiplier(e, effects) {
    let multiplier = 1
    const reservoir = this.rank('origin_reservoir')
    if (reservoir && (this.p.primalEnergy >= (reservoir === 1 ? 50 : 40) || this.until.reservoir > this.time)) multiplier *= 1 + bonus(reservoir, .1, .15)
    if (effects?.bossTomeDerived) return multiplier
    const ctx = effects?.bossTomeContext
    if (!ctx) return multiplier
    if (ctx.basic && this.until.originFirst > this.time) multiplier *= 1.3
    if (ctx.biteBasic) {
      if (this.until.biteFirst > this.time) multiplier *= 1.3
      if ((this.jaw.get(e) || 0) > this.time) multiplier *= 1.15
    }
    if (ctx.heavy) multiplier *= 1 + bonus(this.rank('glutton_jaw'), .15, .25)
    const execute = this.rank('assassin_mark')
    if (execute && ctx.shadowBody && e.hp <= e.maxHp * .4) { multiplier *= 1 + bonus(execute, .25, .4); ctx.execute = true }
    if (ctx.clone) multiplier *= 1 + bonus(this.rank('shadow_pact'), .12, .2)
    if (ctx.autoSpell && (this.sigil.get(e) || 0) > this.time) multiplier *= 1.15
    return multiplier
  }
  afterHit(e, before, effects) {
    if (effects?.bossTomeDerived || !(e.hp < before)) return
    const ctx = effects?.bossTomeContext
    if (!ctx) return
    if (ctx.basic) this.until.originFirst = 0
    if (ctx.biteBasic) this.until.biteFirst = 0
    if (ctx.heavy) {
      if (this.rank('glutton_jaw') === 3) this.jaw.set(e, this.time + 3)
      if (this.rank('glutton_radiance') === 3 && this.time >= (this.ready.heavyPulse || 0)) {
        this.ready.heavyPulse = this.time + 2
        this.ready.radiance = Math.max(this.time, (this.ready.radiance || this.time) - 1)
      }
    }
    if (ctx.execute && e.hp <= 0 && this.rank('assassin_mark') === 3 && this.time >= (this.ready.transfer || 0)) {
      this.ready.transfer = this.time + 1
      const target = this.targets(e, 150, e)[0]
      if (target) this.schedule(0, () => { this.deal(target, this.base()); this.w._ring?.(target.x, target.y, '#c39be6', 28) })
    }
    if (ctx.autoSpell) this.onSpellHit(e)
    if (ctx.activeRico && this.rank('rico_recharge') === 3 && this.p.hp < this.p.maxHp && this.time >= (this.ready.heal || 0)) {
      this.ready.heal = this.time + 20; this.p.heal(1)
    }
  }
  echoMultiplier(random = Math.random) {
    const rank = this.rank('rico_echo')
    if (!rank) return 0
    const success = (rank === 3 && this.echoMisses >= 4) || random() < (rank === 1 ? .15 : .2)
    this.echoMisses = success ? 0 : this.echoMisses + 1
    return success ? rank === 1 ? .4 : .5 : 0
  }
  autoCastMultiplier() {
    const rank = this.rank('elemental_grimoire')
    return (1 + bonus(rank, .12, .2)) * (rank === 3 && (this.casts + 1) % 5 === 0 ? 1.3 : 1) *
      (this.castCredits > 0 && this.until.circuit > this.time ? 1.15 : 1)
  }
  onAutoCast() { this.casts++; if (this.castCredits > 0 && this.until.circuit > this.time) this.castCredits-- }
  get activeSpellMultiplier() { return 1 + bonus(this.rank('elemental_circuit'), .1, .18) }
  get spellCooldownMultiplier() { return 1 - bonus(this.rank('elemental_circuit'), .08, .15) }
  onSpellActive() {
    if (this.rank('elemental_circuit') === 3) { this.castCredits = 3; this.until.circuit = this.time + 5 }
  }
  onSpellHit(e) {
    const rank = this.rank('elemental_sigil')
    if (!rank || this.time < (this.ready.sigil || 0)) return
    this.ready.sigil = this.time + (rank === 1 ? 6 : 5)
    const center = { x: e.x, y: e.y }, damage = this.base() * (rank === 1 ? .8 : 1.2)
    this.w._ring?.(center.x, center.y, '#b6a4ff', 22)
    this.schedule(.8, () => this.pulse(alive(e) ? e : center, rank === 1 ? 100 : 120, damage, '#b6a4ff',
      rank === 3 ? target => this.sigil.set(target, this.time + 2) : null))
  }
  onSpellShieldBroken() {
    if (this.rank('elemental_veil') !== 3) return
    for (const e of this.targets(this.p, 160)) {
      if (e.isBoss) continue
      const dx = e.x - this.p.x, dy = e.y - this.p.y, d = Math.hypot(dx, dy) || 1
      const end = traceShadowPath(this.game, e, Math.atan2(dy, dx), 22, e.radius)
      e.x = end.x; e.y = end.y
    }
    this.w._ring?.(this.p.x, this.p.y, '#b6a4ff', 160)
  }
  get veilReduction() { return bonus(this.rank('elemental_veil'), .75, 1.5) }
  onRally(pets) {
    for (const pet of pets) {
      pet.tomeRallyFirst = this.rank('pet_unity') === 3
      if (this.rank('pet_command') === 3) pet.supportCd = Math.max(0, pet.supportCd - 2)
    }
    if (this.rank('pet_vitality') === 3 && this.time >= (this.ready.petShield || 0)) {
      this.ready.petShield = this.time + 12; this.grantShield(3)
    }
  }
  petAttackMultiplier(pet, rallying) {
    let value = 1 + bonus(this.rank('pet_unity'), .12, .2)
    if (pet.tomeRallyFirst && rallying) { value *= 1.4; pet.tomeRallyFirst = false }
    return value
  }
}
