import { SPELL_ELEMENTS, normalizeSpellElement, getSpellFusion, spellCoreOptions } from './SpellRules.js'
import { shadowTargetAlive as alive, shadowCircleEntry, shadowLineClear, traceShadowPath } from './ShadowGeometry.js'
import { renderSpells } from './SpellVisuals.js'
import { LightningCasting } from './LightningCasting.js'
import { SpellShield } from './SpellShield.js'
import { SpellContagion } from './SpellContagion.js'
import { iceSlowAmount, iceSlowDuration, iceArrowVisualScale, iceArrowCount, iceMultiDamageMul, iceFanAngle, iceShardCount, iceShardDamageMul, iceShardRange, iceShatterRadius, iceShatterDamageMul, iceBrittleMul } from './IceSpellRules.js'
import { fireMultiDamageMul, fireBrittleMul } from './FireSpellRules.js'
import { spellPalette } from './SpellPalette.js'

const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Two automatic spell clocks and one active fusion. No legacy projectile/proc recursion. */
export class SpellCombat {
  constructor(weapon) { this.weapon = weapon; this.lightning = new LightningCasting(this); this.shield = new SpellShield(this); this.contagion = new SpellContagion(this); this.embers = new SpellContagion(this, 'fire'); this.reset() }
  get game() { return this.weapon.game }
  get player() { return this.weapon.player }
  get enabled() { return this.game?.startingStrain === 'elemental' && (!this.game.gameplayId || this.game.gameplayId === 'arena') }
  get available() { return this.enabled && !this.player.dead && !this.game.runFinished }
  get fusion() { return getSpellFusion(this.elements) }
  palette(element = [...this.elements][0]) { return spellPalette(this.fusion?.id, element) }
  level(id) { return this.game?.skillLevels?.[id] || 0 }
  rank(id) { return this.upgrades[id] || 0 }
  get rangeScale() { return Math.min(1.65, 1 + this.level('ele_spread') * .08 + (this.rank('active') === 3 ? .12 : 0)) }
  get baseDamage() { return this.weapon.damage * this.weapon.levelMul * this.weapon.devourDamageMul }
  get power() { return this.baseDamage * (1 + .18 * this.level('ele_affinity') + .08 * this.rank('power')) * (this.weapon.spellGenePowerMul || 1) * (this.game.primarySpec === 'elemental' ? 1.2 : 1) }
  get reactionPower() { return this.power * (1 + this.level('ele_resonance') * .2 + this.rank('reaction') * .25 + this.rank('reactionPower') * .1) * (this.weapon.geneReactionDmgMul || 1) * (this.weapon.spellGeneReactionMul || 1) * (this.game.primarySpec === 'elemental' ? 1.35 : 1) }
  get activePower() { return this.power * (1 + this.level('ele_overload') * .2 + this.rank('active') * .25 + this.rank('activePower') * .1) }
  get activeCooldown() { return Math.max(6, 10 * (1 - .05 * this.level('ele_overload') - .04 * this.rank('active'))) }
  get activeName() { return this.fusion ? this.rank('active') >= 3 ? this.fusion.evolved : this.fusion.active : '原质释放' }
  get pose() {
    if (!this.available || !this.poisonThrow || this.poisonThrow.life <= 0) return null
    const age = .34 - this.poisonThrow.life, windup = age < .12
    const pulse = Math.sin(Math.PI * (windup ? age / .12 : (age - .12) / .22))
    return { angle: this.poisonThrow.angle, sx: 1 + (windup ? .14 : -.1) * pulse,
      sy: 1 + (windup ? -.12 : .12) * pulse, offset: (windup ? -.06 : .16) * pulse }
  }
  reset() {
    this.elements = new Set(); this.upgrades = {}; this.clocks = {}; this.shots = []; this.fields = []
    this.effects = []; this.delayed = []; this.marks = new Map(); this.time = 0; this.cores = 0
    this.castPulse = 0; this.castColor = '#b6a4ff'; this.castPulses = {}; this.reactionBudget = 8; this.volley = 0
    this.poisonThrow = null
    this.lightning.reset()
    this.shield.reset(); this.contagion.reset(); this.embers.reset()
    this.stats = { casts: 0, reactions: 0, activeCasts: 0, damage: 0, castsByElement: {}, damageByElement: {}, fireExplosions: 0, bodyLightningCasts: 0, skyStrikes: 0, shieldAbsorbed: 0, contagionTransfers: 0, burnSpreads: 0 }
  }
  start(id) {
    this.reset()
    if (!this.enabled) return
    this.elements.add(normalizeSpellElement(id)); this.clocks[normalizeSpellElement(id)] = .4
    this.shield.reset(true)
    this.syncElements()
  }
  syncElements() {
    const p = this.player
    p.elements = new Map([...this.elements].map(id => [id, 1 + this.rank(`shape_${id}`)]))
    p._primaryReaction = this.fusion?.id || null; p._secondaryIds.clear(); p._refreshElements()
  }
  coreOptions() { return spellCoreOptions(this) }
  applyCore(option) {
    const current = this.coreOptions().find(card => card.id === option?.id)
    if (!current || !this.available) return false
    if (current.kind === 'fusion') {
      this.elements.add(current.element); this.clocks[current.element] = .65
      this.player.strainSkillCd = 0
    } else {
      this.upgrades[current.id] = this.rank(current.id) + 1
      if (current.kind === 'form') {
        this.lightning.jobs = this.lightning.jobs.filter(job => job.kind === 'strike' && !job.basic)
        this.lightning.charge = 0
      }
    }
    this.cores++; this.syncElements()
    this.game.sound?.elementUp?.()
    this.fx(this.player.x, this.player.y, 100, this.fusion.color, 'core', .8)
    return true
  }
  hud() {
    return { palette: this.palette(), elements: [...this.elements].map(id => ({ ...SPELL_ELEMENTS[id], color: this.palette(id).main, spell: id === 'lightning' && this.lightning.storm ? '雷暴落击' : SPELL_ELEMENTS[id].spell,
      desc: id === 'lightning' && this.lightning.storm ? '范围内优先选择敌群或精英落雷，命中后继续传导；已学雷系强化保留。' : SPELL_ELEMENTS[id].desc,
      rank: this.rank(`shape_${id}`), interval: this.interval(id), enhancements: this.enhancements(id) })),
      fusion: this.fusion, cores: this.cores, activeRank: this.rank('active'), activeName: this.activeName }
  }
  interval(id) { return Math.max(.5, SPELL_ELEMENTS[id].interval * this.weapon.attackInterval * (1 - this.level('spell_haste') * .08)) }
  schoolPower(id) { return 1 + Math.min(3, this.level(`spell_${id}_power`)) * .2 }
  enhancements(id) {
    return [this.schoolPower(id) > 1 ? `威力+${Math.round((this.schoolPower(id) - 1) * 100)}%` : '', this.behaviorEnhancements(id)].filter(Boolean).join(' · ')
  }
  behaviorEnhancements(id) {
    if (id === 'fire') {
      const tags = [this.level('spell_fire_count') ? `火球×${1 + this.level('spell_fire_count')} 分摊` : '', this.level('spell_fire_size') ? '大火球' : '', this.level('spell_fire_burn') ? '燃烧' : '', this.level('spell_fire_brittle') ? '炽燃' : '', this.level('spell_fire_spread') ? '蔓延' : ''].filter(Boolean)
      return tags.length > 5 ? `${tags.slice(0, 5).join(' · ')} …` : tags.join(' · ')
    }
    if (id === 'water') {
      const tags = [this.level('spell_ice_multi') ? `冰箭×${iceArrowCount(this.level('spell_ice_multi'))}` : '', this.level('spell_ice_split') ? '分裂' : '', this.level('spell_ice_pierce') ? `穿透${2 + this.level('spell_ice_pierce')}` : '', this.level('spell_ice_brittle') ? '脆化' : '', this.level('spell_ice_slow') ? '减速' : '', this.level('spell_ice_freeze') ? '冻结' : '', this.level('spell_ice_shatter') ? '迸裂' : ''].filter(Boolean)
      // HUD 一行最多五个标记，满配冰系不再把状态栏撑成多行。
      return tags.length > 5 ? `${tags.slice(0, 5).join(' · ')} …` : tags.join(' · ')
    }
    if (id === 'lightning') return [this.level('spell_lightning_chain') ? `连锁${2 + this.level('spell_lightning_chain')}` : '', this.level('spell_lightning_reach') ? '远距传导' : '', this.level('spell_lightning_stun') ? '麻痹' : ''].filter(Boolean).join(' · ')
    return [this.level('spell_poison_area') ? '扩散' : '', this.level('spell_poison_duration') ? '长效' : '', this.level('spell_poison_linger') ? '中毒' : '', this.level('spell_poison_contagion') ? '传染' : ''].filter(Boolean).join(' · ')
  }
  fireReserved(e) {
    return e.hp <= this.power * this.schoolPower('fire') * 1.3 && this.shots.some(s => s.element === 'fire' && s.life > 0 && s.target === e)
  }
  mark(e) {
    let mark = this.marks.get(e)
    if (!mark) { mark = { frost: 0, frostUntil: 0, frostVolley: 0, freezeReady: 0, shockReady: 0, reactionReady: 0, fireUntil: 0, lightningUntil: 0, burnUntil: 0, poisonUntil: 0 }; this.marks.set(e, mark) }
    return mark
  }
  target(id) {
    const candidates = this.game.enemyManager.enemies.filter(e => alive(e) && distance2(this.player, e) <= Math.min(780, 560 * this.rangeScale) ** 2)
      .sort((a, b) => distance2(this.player, a) - distance2(this.player, b))
    if (id === 'poison') return candidates.find(e => shadowLineClear(this.game, this.player, e)) || null
    const visible = candidates.slice(0, 18)
      .filter(e => shadowLineClear(this.game, this.player, e))
      .filter(e => id !== 'lightning' || !this.fireReserved(e))
    if (id === 'water') return this.lineTarget(visible)
    let best = null, score = -Infinity
    for (const e of visible) {
      let value = -Math.sqrt(distance2(this.player, e)) / 1000
      if (id === 'fire' && (this.mark(e).frostUntil > this.time || this.mark(e).lightningUntil > this.time || this.fieldAt(e))) value += 4
      if (id === 'lightning' && (this.mark(e).frostUntil > this.time || this.mark(e).fireUntil > this.time || this.fieldAt(e))) value += 4
      for (const n of visible) if (distance2(e, n) < (id === 'lightning' ? 170 : 100) ** 2) value++
      if (value > score) { score = value; best = e }
    }
    return best
  }
  /** 冰箭沿直线穿透：投入穿透后按「这条线上还能多穿到几个敌人」选线，距离权重仍占主导。 */
  lineTarget(visible) {
    if (!visible.length) return null
    if (2 + this.level('spell_ice_pierce') + this.weapon.genePierces <= 2) return visible[0]
    let best = visible[0], bestScore = -Infinity
    for (const e of visible) {
      const dx = e.x - this.player.x, dy = e.y - this.player.y, length = Math.max(1, Math.hypot(dx, dy))
      const ux = dx / length, uy = dy / length
      let line = 0
      for (const n of visible) {
        if (n === e) continue
        const nx = n.x - this.player.x, ny = n.y - this.player.y
        if (nx * ux + ny * uy < 40) continue
        if (Math.abs(nx * uy - ny * ux) > 26 + n.radius) continue
        if (!shadowLineClear(this.game, e, n)) continue
        line++
      }
      const score = line * .6 - length / 420
      if (score > bestScore) { bestScore = score; best = e }
    }
    return best
  }
  fx(x, y, radius, color, kind = 'burst', life = .35, extra = {}) {
    const element = extra.element || ({ bolt: 'lightning', 'sky-bolt': 'lightning', 'lightning-warning': 'lightning', crystal: 'water', 'poison-bloom': 'poison', contagion: 'poison', 'ember-spread': 'fire' }[kind])
    const palette = this.palette(element)
    this.effects.push({ x, y, radius, color: this.fusion || element ? palette.main : color, kind, life, maxLife: life, ...extra,
      ...(this.fusion ? { colors: [palette.main, palette.accent] } : {}) })
    if (this.effects.length > 100) this.effects.splice(0, this.effects.length - 100)
  }
  damage(e, amount, element, { reaction = false, active = false, statuses = true, contagion = false, volley = 0 } = {}) {
    if (!alive(e) || !this.available) return
    if (element && !reaction) amount *= this.schoolPower(element)
    const mark = this.mark(e), effects = { replaceInactiveDots: true }
    const brittle = element === 'water' && !reaction ? this.level('spell_ice_brittle') : 0
    if (brittle > 0 && (mark.frostUntil > this.time || e.freeze > 0)) amount *= iceBrittleMul(brittle)
    const blazing = element === 'fire' && !reaction ? this.level('spell_fire_brittle') : 0
    if (blazing > 0 && e.burnHits > 0) amount *= fireBrittleMul(blazing)
    const power = amount
    let shatter = null
    if (statuses && element === 'fire') {
      mark.fireUntil = this.time + 3
      const burn = this.level('spell_fire_burn')
      if (burn > 0 || active) {
        const duration = 2 + Math.max(0, burn - 1) * .5
        mark.burnUntil = this.time + duration
        effects.burn = duration; effects.burnDmg = Math.max(.05, power * (.12 + Math.max(0, burn - 1) * .04))
      }
    }
    if (statuses && element === 'water') {
      if (mark.frostUntil < this.time) mark.frost = 0
      const slow = this.level('spell_ice_slow'), freeze = this.level('spell_ice_freeze')
      // 同一轮齐射只叠一层霜纹，否则多重与分裂箭会在一次施法里直接堆满三层。
      if (!volley || mark.frostVolley !== volley) { mark.frost = freeze > 0 ? mark.frost + 1 : 1; mark.frostVolley = volley }
      mark.frostUntil = this.time + 3
      if (slow > 0 && !e.isBoss && !e.isEnraged) {
        const newlySlowed = !(e.spellSlowTime > 0)
        e.spellSlowTime = Math.max(e.spellSlowTime || 0, iceSlowDuration(slow))
        e.spellSlowAmount = Math.max(e.spellSlowAmount || 0, iceSlowAmount(slow))
        if (newlySlowed) this.game.enemyManager.addText?.(e.x, e.y - e.radius - 20, '寒霜减速', null, '#b9efff', 12)
      }
      const shatterLevel = this.level('spell_ice_shatter'), controllable = !e.isBoss && !e.isEnraged
      if (freeze > 0 && mark.frost >= 3 && this.time >= mark.freezeReady && (controllable || shatterLevel > 0)) {
        if (controllable) effects.freeze = .8 + (freeze - 1) * .4
        mark.frost = 0; mark.freezeReady = this.time + 3
        if (shatterLevel > 0) shatter = { x: e.x, y: e.y, radius: iceShatterRadius(shatterLevel), power: power * iceShatterDamageMul(shatterLevel) }
      }
    }
    if (statuses && element === 'poison') {
      mark.poisonUntil = this.time + 2
      const poison = this.level('spell_poison_linger')
      if (poison > 0 || active || (contagion && this.contagion.level > 0)) {
        effects.poison = 2 + Math.max(0, poison - 1); effects.poisonDmg = Math.max(.05, power * (.15 + Math.max(0, poison - 1) * .05))
        if (contagion && this.contagion.level > 0) effects.poisonDmg = Math.max(effects.poisonDmg, power * .35)
      }
    }
    if (statuses && element === 'lightning') {
      mark.lightningUntil = this.time + 3
      const stun = this.level('spell_lightning_stun')
      if ((stun > 0 || active) && this.time >= mark.shockReady && !e.isBoss && !e.isEnraged) {
        e.elementStun = .15 + Math.max(0, stun - 1) * .15; mark.shockReady = this.time + 2
      }
    }
    const critical = !reaction && Math.random() < this.weapon.critChance
    const hp = e.hp
    e.hit(amount * (critical ? this.weapon.critMul : 1), effects)
    if (contagion && effects.poison > 0 && alive(e)) this.contagion.seed(e, Math.max(effects.poisonDmg, e._poisonDmg || 0), effects.poison)
    if (effects.burn > 0 && alive(e) && this.embers.level > 0) this.embers.seed(e, Math.max(effects.burnDmg, e._burnDmg || 0), effects.burn)
    const dealt = Math.max(0, hp - Math.max(0, e.hp))
    this.stats.damage += dealt
    if (element) this.stats.damageByElement[element] = (this.stats.damageByElement[element] || 0) + dealt
    this.game.enemyManager.addText?.(e.x, e.y - 8, String(Math.round(amount * (critical ? this.weapon.critMul : 1) * 10) / 10), null,
      critical ? '#ffd166' : this.palette(element).main, critical ? 19 : 12)
    if (!e.active) this.weapon._onKill(e)
    if (shatter) {
      this.fx(shatter.x, shatter.y, shatter.radius, SPELL_ELEMENTS.water.color, 'crystal', .45)
      this.area(shatter, shatter.radius, shatter.power, 'water', { reaction: true, statuses: false })
    }
    if (!reaction && !active && this.available) this.react(e, element, mark)
  }
  area(center, radius, damage, element, flags = {}) {
    this.game.mapFeatures?.attackBarricades?.(center.x, center.y, radius)
    for (const e of [...this.game.enemyManager.enemies]) {
      if (alive(e) && distance2(center, e) <= (radius + e.radius) ** 2 && shadowLineClear(this.game, center, e)) this.damage(e, damage, element, flags)
      if (!this.available) break
    }
  }
  fieldAt(point) { return this.fields.find(f => f.life > 0 && distance2(point, f) <= f.radius ** 2) }
  field(center, { active = false, icy = false, storm = false, rain = false } = {}) {
    if (!this.available) return null
    const rank = this.rank('shape_poison'), life = (3.6 + rank * .25) * (1 + this.level('ele_spread') * .1 + this.level('spell_poison_duration') * .25) * (active ? 1.25 : 1)
    const f = { x: center.x, y: center.y, radius: Math.min(220, (active ? 105 : 62 + this.weapon.genePierces * 8) * this.rangeScale * (1 + this.level('spell_poison_area') * .2)), life, maxLife: life,
      damage: (active ? this.activePower * .55 : this.power * (.4 + rank * .05)), tick: 0, igniteReady: 0,
      active, icy, storm, rain, corePulse: 0, createdAt: this.time, target: alive(center) ? center : null }
    this.fields.push(f)
    if (this.fields.length > 5) this.fields.shift()
    this.fx(f.x, f.y, f.radius, '#cff58d', 'poison-bloom', .7)
    return f
  }
  chain(first, power, { reaction = false, active = false, bonus = 0, origin = this.player, sky = false } = {}) {
    let target = first, from = origin
    const hit = new Set(), rank = this.rank('shape_lightning'), jumps = Math.min(8, 2 + this.level('spell_lightning_chain') + bonus + this.weapon.genePierces)
    for (let i = 0; alive(target) && i < jumps && this.available; i++) {
      hit.add(target)
      if (!sky || i > 0 || distance2(from, target) > 4) this.fx(target.x, target.y, 0, '#f0d588', 'bolt', i === 0 && !sky ? .3 : .23, { from: { x: from.x, y: from.y }, body: i === 0 && !sky && origin === this.player })
      this.damage(target, power * Math.max(.5, 1 - i * (.16 - rank * .025)), 'lightning', { reaction, active })
      if (i === 0 && !reaction && !active && rank > 0 && this.fusion) {
        const other = this.fusion.combo.find(id => id !== 'lightning')
        this.fusionBurst(target, (32 + rank * 8) * this.rangeScale, power * .25, other)
      }
      from = target
      const reach = 170 * (1 + this.level('spell_lightning_reach') * .2) * this.rangeScale * (reaction && this.rank('reaction') >= 3 ? 1.2 : 1)
      target = this.game.enemyManager.enemies.filter(e => alive(e) && !hit.has(e) && (reaction || active || !this.fireReserved(e)) && distance2(from, e) < reach ** 2 && shadowLineClear(this.game, from, e))
        .sort((a, b) => distance2(from, a) - distance2(from, b))[0]
    }
    this.weapon.stats.maxChain = Math.max(this.weapon.stats.maxChain, hit.size)
  }
  /** 多重火球：追加火球分摊到附近普通敌人，主目标是首领或精英时聚火，不足时回落主目标。 */
  fireLanes(primary, count) {
    const lanes = [primary]
    if (count > 1 && !primary.isBoss && !primary.isElite) {
      const reach = Math.min(780, 560 * this.rangeScale) ** 2
      const nearby = this.game.enemyManager.enemies
        .filter(e => alive(e) && e !== primary && !e.isBoss && !e.isElite && distance2(this.player, e) <= reach && shadowLineClear(this.game, this.player, e))
        .sort((a, b) => distance2(primary, a) - distance2(primary, b))
      for (const e of nearby) { if (lanes.length >= count) break; lanes.push(e) }
    }
    while (lanes.length < count) lanes.push(primary)
    return lanes
  }
  cast(id, target = this.target(id)) {
    if (!this.available || !target || !alive(target)) return false
    const el = SPELL_ELEMENTS[id], rank = this.rank(`shape_${id}`), power = this.power * (1 + rank * .12)
    if (id === 'lightning' && !this.lightning.begin(target, power * 1.3)) return false
    this.castPulse = .25; this.castColor = this.palette(id).main; this.stats.casts++
    this.castPulses[id] = .3; this.stats.castsByElement[id] = (this.stats.castsByElement[id] || 0) + 1
    if (id === 'lightning') return true
    this.game.sound?.spellCast?.(id)
    const volley = ++this.volley
    if (id === 'poison') {
      const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x)
      const distance = Math.sqrt(distance2(this.player, target)), duration = Math.max(.28, Math.min(.68, distance / 600))
      this.poisonThrow = { angle, life: .34 }
      this.shots.push({ element: 'poison', x: this.player.x, y: this.player.y, angle, target,
        start: { x: this.player.x, y: this.player.y }, aim: { x: target.x, y: target.y },
        duration, elapsed: 0, life: duration, delay: .12, launched: false,
        arcHeight: Math.max(32, Math.min(70, distance * .18)), lift: this.player.radius * .65 })
      if (this.shots.length > 48) this.shots.splice(0, this.shots.length - 48)
    }
    else {
      const count = id === 'fire' ? 1 + this.level('spell_fire_count') : id === 'water' ? iceArrowCount(this.level('spell_ice_multi')) : 1
      const lanes = id === 'fire' ? this.fireLanes(target, count) : new Array(count).fill(target)
      const powerMul = id === 'water' ? iceMultiDamageMul(count) : fireMultiDamageMul(count)
      for (let i = 0; i < count; i++) {
        const aim = lanes[i], base = Math.atan2(aim.y - this.player.y, aim.x - this.player.x)
        const lane = i - (count - 1) / 2, spread = id === 'fire' ? lane * 18 : 0
        const a = base + (id === 'water' ? lane * iceFanAngle : 0), size = id === 'fire' ? 10 * (1 + .2 * this.level('spell_fire_size')) : 5
        this.shots.push({ x: this.player.x - Math.sin(a) * spread, y: this.player.y + Math.cos(a) * spread, angle: a, speed: id === 'fire' ? 330 : 660,
          element: id, target: aim, aim: { x: aim.x, y: aim.y }, size, volley, visualScale: id === 'water' ? iceArrowVisualScale(this.level('spell_water_power')) : 1,
          power: power * powerMul, life: 2.6, delay: i * .09, hit: new Set(), pierces: id === 'water' ? 2 + this.level('spell_ice_pierce') + this.weapon.genePierces : 1 })
      }
      if (this.shots.length > 48) this.shots.splice(0, this.shots.length - 48)
    }
    return true
  }
  /** 分裂冰箭：每支箭首次命中时分出碎晶；碎晶不分裂、不附加霜纹，也不结算融合反应。 */
  splitIce(enemy, shot) {
    const level = shot.shard || shot.split ? 0 : this.level('spell_ice_split')
    if (level <= 0) return
    shot.split = true
    const nearby = this.game.enemyManager.enemies
      .filter(e => alive(e) && e !== enemy && !shot.hit.has(e) && distance2(enemy, e) <= iceShardRange ** 2 && shadowLineClear(this.game, enemy, e))
      .sort((a, b) => distance2(enemy, a) - distance2(enemy, b)).slice(0, iceShardCount(level))
    for (const e of nearby) this.shots.push({
      x: enemy.x, y: enemy.y, angle: Math.atan2(e.y - enemy.y, e.x - enemy.x), speed: 520, element: 'water', target: e, aim: { x: e.x, y: e.y },
      size: 3.5, visualScale: .62, volley: shot.volley, power: shot.power * iceShardDamageMul, life: .5, delay: 0, hit: new Set([enemy]), pierces: 1, shard: true,
    })
    if (this.shots.length > 48) this.shots.splice(0, this.shots.length - 48)
  }
  explode(point, radius, power, color, element, flags = {}) {
    if (!this.available) return
    this.fx(point.x, point.y, radius, color, 'burst', .4)
    this.area(point, radius, power, element, flags)
  }
  fusionBurst(point, radius, power, element) {
    if (!this.available || !this.fusion) return
    this.fx(point.x, point.y, radius, this.fusion.color, 'fusion', .45, { colors: this.fusion.combo.map(id => SPELL_ELEMENTS[id].color) })
    this.area(point, radius, power, element, { reaction: true, statuses: false })
  }
  fireImpact(point, shot) {
    const rank = this.rank('shape_fire'), radius = (48 + this.weapon.genePierces * 8) * this.rangeScale * (1 + this.level('spell_fire_size') * .2)
    this.stats.fireExplosions++
    this.explode(point, radius, shot.power * 1.5, SPELL_ELEMENTS.fire.color, 'fire')
    if (rank > 0 && this.fusion) {
      const other = this.fusion.combo.find(id => id !== 'fire')
      const nearby = this.game.enemyManager.enemies.filter(e => alive(e) && distance2(point, e) < 150 ** 2 && shadowLineClear(this.game, point, e)).slice(0, Math.min(3, rank + 1))
      for (const e of nearby) {
        this.fx(e.x, e.y, 0, SPELL_ELEMENTS[other].color, other === 'lightning' ? 'bolt' : 'ember', .3, { from: { x: point.x, y: point.y } })
        this.damage(e, shot.power * .45, other, { reaction: true, statuses: false })
      }
    }
  }
  react(e, element, mark) {
    const fusion = this.fusion
    if (!fusion || this.reactionBudget <= 0 || mark.reactionReady > this.time) return
    const field = this.fieldAt(e), frost = mark.frostUntil > this.time || e.freeze > 0, fire = mark.fireUntil > this.time, lightning = mark.lightningUntil > this.time
    const ready = fusion.id === 'steam' ? element === 'fire' && frost || element === 'water' && fire
      : fusion.id === 'gel' ? element === 'lightning' && frost || element === 'water' && lightning
      : fusion.id === 'acid' ? element === 'fire' && field && field.igniteReady <= this.time
      : fusion.id === 'venom' ? element === 'lightning' && !!field || element === 'poison' && lightning
      : fusion.id === 'corrode' ? element === 'poison' && frost || element === 'water' && !!field
      : element === 'lightning' && fire || element === 'fire' && lightning
    if (!ready) return
    this.reactionBudget--; this.stats.reactions++
    const rank = this.rank('reaction'), power = this.reactionPower
    mark.reactionReady = this.time + Math.max(.8, 1.8 - rank * .2)
    const radius = (fusion.id === 'acid' ? field.radius : 58) * this.rangeScale * (rank >= 3 ? 1.2 : 1)
    if (fusion.id === 'acid') {
      field.igniteReady = this.time + 2
      this.fusionBurst(field, radius, power * 1.4, 'fire')
      if (rank >= 2) {
        const next = this.fields.find(f => f !== field && !f.active && f.igniteReady <= this.time && distance2(field, f) < 230 ** 2)
        if (next) { next.igniteReady = this.time + 2; this.fusionBurst(next, next.radius, power, 'fire') }
      }
    } else if (fusion.id === 'venom') {
      if (alive(e)) this.chain(e, power * .8, { reaction: true, bonus: rank >= 2 ? 2 : 0 })
    } else {
      this.fusionBurst(e, radius, power * (fusion.id === 'corrode' ? .55 : .9), fusion.id === 'corrode' ? 'water' : element)
      if (fusion.id === 'gel' && rank >= 2 && alive(e)) this.chain(e, power * .5, { reaction: true, bonus: 1 })
      if (fusion.id === 'steam' && rank >= 2) this.area(e, radius, power * .25, 'water', { reaction: true })
      if (fusion.id === 'corrode' && rank >= 2) this.area(e, radius + 35, power * .25, 'water', { reaction: true })
      if (fusion.id === 'burst' && rank >= 2) this.area(e, radius + 25, power * .35, 'fire', { reaction: true })
    }
  }
  useActive() {
    if (!this.available || this.game.running === false || this.game._pauseLock > 0) return false
    const target = this.target(this.fusion?.combo.includes('lightning') ? 'lightning' : 'fire')
    const near = this.game.enemyManager.enemies.some(e => alive(e) && distance2(e, this.player) < 150 ** 2)
    if ((!this.fusion && !near) || (!target && !near)) return false
    const center = target ? { x: target.x, y: target.y } : { x: this.player.x, y: this.player.y }
    // Defense is modest and does not displace bosses or push through obstacles.
    for (const e of this.game.enemyManager.enemies) {
      if (!alive(e) || e.isBoss || distance2(e, this.player) > 150 ** 2) continue
      const end = traceShadowPath(this.game, e, Math.atan2(e.y - this.player.y, e.x - this.player.x), 22, e.radius)
      e.x = end.x; e.y = end.y
      if (!e.isEnraged) e.primeSlow = Math.max(e.primeSlow || 0, 1.5)
    }
    this.stats.activeCasts++; this.game.sound?.spellBurst?.(); this.game.shakeScreen?.(4, .18)
    this.fx(this.player.x, this.player.y, 150, this.fusion?.color || '#b6a4ff', 'core', .4)
    if (!this.fusion) { this.explode(this.player, 150, Math.round(this.power * 2.4), '#b6a4ff', null, { active: true }); return true }
    this.activeImpact(center)
    if (!this.available) return true
    const rank = this.rank('active')
    if (rank >= 3) {
      if (this.fusion.id === 'acid' || this.fusion.id === 'venom' || this.fusion.id === 'corrode') {
        this.field(center, { active: true, rain: this.fusion.id === 'acid', storm: this.fusion.id === 'venom', icy: this.fusion.id === 'corrode' })
      } else {
        for (let i = 1; i <= (this.fusion.id === 'burst' ? 2 : 1); i++) this.delayed.push({ due: this.time + i * .4, center, power: .65 })
      }
    }
    return true
  }
  activeImpact(center, multiplier = 1) {
    if (!this.available || !this.fusion) return
    const f = this.fusion, power = this.activePower * multiplier, radius = (110 + this.rank('active') * 9 + (this.game.genes?.element_origin ? 15 : 0)) * this.rangeScale
    const firstElement = f.combo.find(id => id !== 'lightning') || f.combo[0]
    this.explode(center, radius, power * 2.4, SPELL_ELEMENTS[firstElement].color, firstElement, { active: true })
    this.fx(center.x, center.y, radius, f.color, 'fusion', .6, { colors: f.combo.map(id => SPELL_ELEMENTS[id].color) })
    if (f.combo.includes('lightning')) this.lightning.warn(center, power, { radius, splash: power * 1.1, chainPower: power * .8, bonus: 1 })
    else this.area(center, radius, power * 1.1, f.combo[1], { active: true })
    if (!this.available) return
    if (f.combo.includes('water')) for (const e of this.game.enemyManager.enemies) {
      if (alive(e) && !e.isBoss && !e.isEnraged && distance2(center, e) < radius ** 2 && shadowLineClear(this.game, center, e)) {
        const mark = this.mark(e)
        if (this.time >= mark.freezeReady) { e.freeze = Math.max(e.freeze || 0, 1); mark.freezeReady = this.time + 3 }
      }
    }
    if (f.combo.includes('poison')) this.field(center, { active: true, icy: f.id === 'corrode' })
  }
  update(dt) {
    if (!this.available) { this.shots.length = this.fields.length = this.effects.length = this.delayed.length = 0; this.poisonThrow = null; this.lightning.reset(); this.shield.reset(); this.contagion.reset(); this.embers.reset(); this.marks.clear(); return }
    if (this.game.running === false || this.game._pauseLock > 0) return
    this.time += dt; this.reactionBudget = 8; this.castPulse = Math.max(0, this.castPulse - dt)
    for (const id of Object.keys(this.castPulses)) this.castPulses[id] = Math.max(0, this.castPulses[id] - dt)
    if (this.poisonThrow) this.poisonThrow.life = Math.max(0, this.poisonThrow.life - dt)
    this.lightning.update(dt)
    this.shield.update(dt)
    if (!this.available) return
    for (const [e, mark] of this.marks) {
      if (!alive(e)) this.marks.delete(e)
      else if (mark.frostUntil < this.time) mark.frost = 0
    }
    for (const id of this.elements) {
      this.clocks[id] = Math.max(0, (this.clocks[id] || 0) - dt)
      if (this.clocks[id] === 0 && this.cast(id)) this.clocks[id] = this.interval(id)
      if (!this.available) return
    }
    for (const s of this.shots) {
      if (s.life <= 0) continue
      const delay = s.delay || 0
      s.delay = Math.max(0, delay - dt)
      const travelTime = dt - Math.min(dt, delay)
      if (travelTime <= 0) continue
      if (s.element === 'poison') {
        if (!s.launched) {
          s.launched = true; s.start = { x: this.player.x, y: this.player.y }; s.x = s.start.x; s.y = s.start.y
          s.angle = Math.atan2(s.aim.y - s.y, s.aim.x - s.x)
          this.game.sound?.poisonThrow?.()
        }
        const used = Math.min(travelTime, s.duration - s.elapsed)
        s.elapsed = Math.min(s.duration, s.elapsed + used); s.life = s.duration - s.elapsed
        const progress = s.elapsed / s.duration
        const point = { x: s.start.x + (s.aim.x - s.start.x) * progress, y: s.start.y + (s.aim.y - s.start.y) * progress }
        const step = Math.hypot(point.x - s.x, point.y - s.y)
        const end = traceShadowPath(this.game, s, Math.atan2(point.y - s.y, point.x - s.x), step, 4)
        s.x = end.x; s.y = end.y
        const blocked = Math.hypot(end.x - point.x, end.y - point.y) > .5
        if (s.life <= 0 || blocked) {
          s.life = 0
          const field = this.field(s)
          if (field) { field.target = alive(s.target) ? s.target : null; field.createdAt = this.time - (travelTime - used) }
          if (blocked) this.game.mapFeatures?.attackBarricades?.(s.x, s.y, 24)
          this.game.sound?.poisonBloom?.()
        }
        continue
      }
      const old = { x: s.x, y: s.y }
      if (s.element === 'fire') {
        if (alive(s.target)) s.aim = { x: s.target.x, y: s.target.y }
        s.angle = Math.atan2(s.aim.y - s.y, s.aim.x - s.x)
      }
      const requested = Math.min(s.life, travelTime) * s.speed, aimDistance = s.element === 'fire' ? Math.hypot(s.aim.x - old.x, s.aim.y - old.y) : Infinity
      const step = Math.min(requested, aimDistance), arrived = s.element === 'fire' && aimDistance <= requested + s.size
      const end = traceShadowPath(this.game, s, s.angle, step, 5)
      s.x = end.x; s.y = end.y; s.life -= travelTime
      const hits = this.game.enemyManager.enemies.filter(e => alive(e) && !s.hit.has(e))
        .map(e => ({ e, t: shadowCircleEntry(old.x, old.y, s.x, s.y, e, s.size) }))
        .filter(h => h.t !== Infinity).sort((a, b) => a.t - b.t)
      for (const { e } of hits) {
        s.hit.add(e); s.pierces--
        if (s.element === 'fire') {
          this.fireImpact(e, s)
        } else {
          this.damage(e, s.power * 1.25, 'water', { volley: s.volley, statuses: !s.shard })
          if (!s.shard) {
            this.fx(e.x, e.y, 20, SPELL_ELEMENTS.water.color, 'crystal')
            if (this.rank('shape_water') > 0 && this.fusion) this.fusionBurst(e, (28 + this.rank('shape_water') * 8) * this.rangeScale, s.power * .25, this.fusion.combo.find(id => id !== 'water'))
            this.splitIce(e, s)
          }
        }
        if (s.pierces <= 0 || !this.available) { s.life = 0; break }
      }
      if (Math.hypot(s.x - old.x, s.y - old.y) < step - .5) { this.game.mapFeatures?.attackBarricades?.(s.x, s.y, 24); s.life = 0 }
      else if (s.element === 'fire' && s.life > 0 && arrived) { this.fireImpact(s.aim, s); s.life = 0 }
      else if (s.element === 'fire' && s.life <= 0 && !s.hit.size) this.fireImpact(s, s)
    }
    this.shots = this.shots.filter(s => s.life > 0)
    for (const f of this.fields) {
      const fieldDt = Math.min(dt, Math.max(0, this.time - f.createdAt))
      f.life -= fieldDt; f.tick -= fieldDt; f.corePulse -= fieldDt
      if (!f.active && this.rank('shape_poison') > 0 && alive(f.target)) {
        const d = Math.sqrt(distance2(f, f.target)), step = Math.min(d, 18 * fieldDt)
        if (d > 0) { const a = Math.atan2(f.target.y - f.y, f.target.x - f.x), end = traceShadowPath(this.game, f, a, step, 0); f.x = end.x; f.y = end.y }
      }
      if (f.life > 0 && f.tick <= 0) {
        f.tick = .5
        this.area(f, f.radius, f.damage, 'poison', { active: f.active, contagion: true })
        if (!f.active && this.rank('shape_poison') >= 2 && f.corePulse <= 0 && this.fusion) {
          f.corePulse = 1
          this.fusionBurst(f, f.radius * .75, f.damage * .4, this.fusion.combo.find(id => id !== 'poison'))
        }
        if (f.icy) this.area(f, f.radius, f.damage * .4, 'water', { active: true })
        if (f.rain) { this.explode(f, f.radius * .65, this.activePower * .35, '#ffae70', 'fire', { active: true }) }
        if (f.storm) {
          const target = this.game.enemyManager.enemies.find(e => alive(e) && distance2(f, e) < f.radius ** 2 && shadowLineClear(this.game, f, e))
          if (target) this.lightning.warn(target, this.activePower * .35, { radius: f.radius, chainPower: this.activePower * .35 })
        }
      }
      if (!this.available) break
    }
    this.fields = this.fields.filter(f => f.life > 0)
    this.contagion.update()
    this.embers.update()
    for (const d of this.delayed) if (d.due <= this.time) {
      this.activeImpact(d.center, d.power)
      d.done = true
    }
    this.delayed = this.delayed.filter(d => !d.done)
    for (const fx of this.effects) fx.life -= dt
    this.effects = this.effects.filter(fx => fx.life > 0)
  }
  render(ctx) { if (this.enabled) renderSpells(ctx, this) }
}
