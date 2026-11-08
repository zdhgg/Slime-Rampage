import assert from 'node:assert/strict'
import { createArena, dispose, spawn, rollSkills } from './test-support/arena-fixture.mjs'
import { ORIGIN_RULES, getOriginShockProfile, getOriginGrowth } from './src/game/OriginBuild.js'
import { ORIGIN_INNATE_SKILL, ORIGIN_ORBIT_STATS, ORIGIN_OVERLOAD_BUDGET, ORIGIN_SOURCE_RULES, ORIGIN_SOURCE_BY_ID, originSourceCastMods, originSourceLevel, learnOriginMemory } from './src/game/OriginSourceSkills.js'
import { BOSS_TOME_BY_ID } from './src/game/BossTomes.js'
import { Enemy } from './src/game/entities/Enemy.js'

/**
 * 源质记忆第二轮专项审计工具（不进入 npm test）。
 *   node audit-origin-memory.mjs numbers   → 超载总伤害预算表
 *   node audit-origin-memory.mjs sim       → 三条路线 + 对照组的 10 分钟战斗采样
 */

const LEVEL_GROWTH = 1.08

function makeLevel(skillLevels = {}, extra = {}) {
  return { skillLevels, ...extra }
}

/**
 * 被动超载口径的预算表：
 *   超载单体命中 = base × 技能倍率 × passiveDamageScale × mods.damage（mods 合计 ≤1.8）
 *   震荡不再参与超载乘区，只作为主动辅助列出。
 */
function budget(route, level, opts = {}) {
  const g = createArena('origin')
  try {
    g.player.level = level
    g.weaponSystem.refreshLevelMultiplier()
    g.originRoute = route
    g.skillLevels = { ...opts.levels }
    g.bossSkillLevels = { ...(opts.tomes || {}) }
    g.originMark = opts.mark || null
    g.player.markState.rank = opts.markRank || 0
    g.player.mutationState.stacks = opts.stacks || 0
    if (g.player.routeState?.resonance) g.player.routeState.resonance.circuits = opts.circuits || 0

    const base = g.weaponSystem.damage * g.weaponSystem.levelMul
    const shock = getOriginShockProfile(g)
    const shockDamage = base * shock.damageMul
    const scale = ORIGIN_SOURCE_RULES.passiveDamageScale
    const snapshot = { stacks: opts.stacks || 0, circuits: opts.circuits || 0 }
    const mods = originSourceCastMods(g, snapshot)
    const growth = getOriginGrowth(g)

    const orbit = {
      perHit: base * ORIGIN_ORBIT_STATS.damageMul * mods.damage * scale,
      total: base * ORIGIN_ORBIT_STATS.damageMul * ORIGIN_ORBIT_STATS.orbs * mods.damage * scale,
    }
    const memory = {}
    for (const def of Object.values(ORIGIN_SOURCE_BY_ID)) {
      memory[def.id] = [1, 2, 3].map((lv) => {
        const stat = originSourceLevel(def, lv)
        return {
          perHit: base * stat.damageMul * mods.damage * scale,
          radius: stat.radius, width: stat.width, distance: stat.distance, count: stat.count,
        }
      })
    }
    // 印记回响预算 = 本次超载主伤害倍率 × 35%（按破阵波 Lv.1 口径展示）。
    const echo = (memory.knight_breach?.[0]?.perHit ?? orbit.total) * ORIGIN_RULES.echoShareCap
    // 共振余波 = 主技能单次伤害 × 25%（满 3 回路才追加）。
    const echoWave = mods.echo ? (memory.knight_breach?.[0]?.perHit ?? orbit.total) * ORIGIN_SOURCE_RULES.echoShare : 0
    const residueTick = route === 'expansion' ? Math.round(base * growth.residueDamage) : 0
    const fieldTick = route === 'expansion' ? Math.round(base * (growth.residueDamage + 0.15)) : 0
    const residueTicks = route === 'expansion' ? Math.floor(growth.residueDuration / 0.5) : 0
    const fieldTicks = route === 'expansion' ? Math.floor((growth.residueDuration + 1.5) / 0.5) : 0

    return {
      level, levelMul: g.weaponSystem.levelMul, base,
      shockDamage, shockRadius: shock.radius,
      mods, orbit, memory, echo, echoWave,
      residueTick, fieldTick, residueTicks, fieldTicks,
      residueDuration: route === 'expansion' ? growth.residueDuration : 0,
      caps: ORIGIN_OVERLOAD_BUDGET,
    }
  } finally {
    dispose(g)
  }
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function printBudget() {
  const scenarios = [
    { label: 'Lv.1 无路线/无印记/无秘典', route: null, level: 1, opts: {} },
    { label: 'Lv.10 基因同化 + 暗影印记 + 超载棱镜2 + 余震1', route: 'assimilation', level: 10, opts: { mark: 'assassin', markRank: 1, levels: { origin_overload: 2, com_shock: 2 }, tomes: { boss_origin_aftershock: 1 } } },
    { label: 'Lv.20 原质扩张 + 暴食印记 + 超载棱镜3 + 余震3', route: 'expansion', level: 20, opts: { mark: 'glutton', markRank: 2, levels: { origin_overload: 3, com_shock: 3, ori_exp_ring: 2, ori_exp_residue: 2 }, tomes: { boss_origin_aftershock: 3 } } },
    { label: 'Lv.20 异源共振 3 回路 + 元素印记 + 超载棱镜3 + 余震2', route: 'resonance', level: 20, opts: { mark: 'elemental', markRank: 2, circuits: 3, levels: { origin_overload: 3, com_shock: 3, ori_res_core: 2, ori_res_burst: 1 }, tomes: { boss_origin_aftershock: 2 } } },
  ]
  for (const scene of scenarios) {
    const b = budget(scene.route, scene.level, scene.opts)
    console.log(`\n=== ${scene.label} ===`)
    console.log(`武器基准伤害 base = ${fmt(b.base)}（levelMul ${fmt(b.levelMul)}）`)
    console.log(`被动乘区 ×${fmt(b.mods.damage)}（硬上限 ×${b.caps.damageCap}） · 范围乘区 ×${fmt(b.mods.area)}（上限 ×${b.caps.areaCap}）`)
    console.log(`普通震荡 ${fmt(b.shockDamage)} · 半径 ${b.shockRadius}（主动技，不参与超载乘区）`)
    console.log(`原质环流 每球 ${fmt(b.orbit.perHit)} · 3 球全中 ${fmt(b.orbit.total)}`)
    for (const [id, levels] of Object.entries(b.memory)) {
      const name = ORIGIN_SOURCE_BY_ID[id].name
      const rows = levels.map((lv, i) => `Lv.${i + 1} ${fmt(lv.perHit)}${lv.radius ? ` (r${lv.radius})` : ''}${lv.width ? ` (w${Math.round(lv.width)}/${lv.distance})` : ''}${lv.count ? ` ×${lv.count}` : ''}`)
      console.log(`  ${name}: ${rows.join(' | ')}`)
    }
    console.log(`  棘刺总伤（3/4/5 枚全中同一目标，仅理论值）= ${levelsOf(b, 'archer_hunt').map(fmt).join(' / ')}`)
    console.log(`印记回响预算 ≈ ${fmt(b.echo)}（35%）${b.mods.echo ? ` · 共振余波 ≈ ${fmt(b.echoWave)}（25%）` : ''}`)
    if (scene.route === 'expansion') {
      console.log(`震荡液痕每跳 ${b.residueTick} · 超载液域每跳 ${b.fieldTick} · 液域满跳 ≈ ${fmt(b.fieldTick * b.fieldTicks)}`)
    }
    const waveApprox = scene.level
    const knightHp = (1 + 1 + Math.floor((waveApprox - 1) / 2)) * 1.6
    const bossHp = 100 + waveApprox * 10
    const castHit = b.memory.knight_breach?.[0]?.perHit ?? b.orbit.total
    console.log(`   参照：第 ${waveApprox} 波骑士 ≈ ${fmt(knightHp)} 生命 · 同波首领 ≈ ${bossHp} 生命（单次超载主命中占首领 ${(castHit / bossHp * 100).toFixed(1)}%）`)
  }
}

function levelsOf(b, id) {
  return b.memory[id].map(lv => lv.perHit * (ORIGIN_SOURCE_BY_ID[id].exec === 'hunt' ? lv.count : 1))
}

// ============================================================
// 实战采样
// ============================================================

function patchCombat(g, stats) {
  const cs = g.weaponSystem.originSourceCombat
  const origHit = cs._hit.bind(cs)
  cs._hit = (enemy, damage) => {
    const prev = stats._ctx
    stats._ctx = 'source'
    stats.sourceDamage += damage
    stats.sourceHits += 1
    stats.hitsThisCast += 1
    if (stats.pendingCast) stats.pendingCast.hits += 1
    if (enemy.isBoss) stats.bossDamage += Math.min(damage, Math.max(0, enemy.hp))
    else if (enemy.isElite) stats.eliteDamage += Math.min(damage, Math.max(0, enemy.hp))
    const killed = origHit(enemy, damage)
    if (killed) stats.sourceKills += 1
    stats._ctx = prev
    return killed
  }
  // 伤害分桶：震荡施放与其残留（液痕/副环）在 update 中结算，统一归 'shock' 桶；
  // 秘典派生带 bossTomeDerived 标记；其余（普攻、印记副弹等）归 'other'。
  const oc = g.weaponSystem.originCombat
  for (const key of ['update', 'castShock']) {
    const orig = oc[key].bind(oc)
    oc[key] = (...args) => {
      const prev = stats._ctx
      stats._ctx = 'shock'
      try { return orig(...args) } finally { stats._ctx = prev }
    }
  }
  // 被动超载的「无目标等待」计数：目标校验失败一次记一次（控制器每 0.5s 重试）。
  const origHasTargets = cs.hasTargetsFor.bind(cs)
  cs.hasTargetsFor = (entry) => {
    const ok = origHasTargets(entry)
    if (!ok) stats.skips += 1
    return ok
  }
  const origCastNow = cs.castNow.bind(cs)
  cs.castNow = (entry, snapshot) => {
    const info = origCastNow(entry, snapshot)
    if (!info) return info
    if (stats.pendingCast) stats.castLog.push(stats.pendingCast)
    stats.casts += 1
    stats.castIds.push(info.id)
    stats.castLevels.push(entry?.level ?? 1)
    stats.lastCastAt = g.elapsed
    const p = g.player
    const nearest = g.weaponSystem._findNearest?.()
    const boss = (g.enemyManager.enemies || []).find(e => e.active && e.isBoss)
    const distTo = (e) => e ? Math.hypot(e.x - p.x, e.y - p.y) : -1
    stats.pendingCast = {
      id: info.id,
      nearest: distTo(nearest),
      bossNearest: distTo(boss),
      nearestIsBoss: !!nearest?.isBoss,
      hits: 0,
    }
    stats.hitsThisCast = 0
    return info
  }
}

const ORIGINAL_HIT = Enemy.prototype.hit
let ACTIVE_STATS = null
Enemy.prototype.hit = function (damage, effects) {
  const s = ACTIVE_STATS
  if (s && damage > 0) {
    const dealt = Math.min(damage, Math.max(1, this.hp))
    s.totalDamage += dealt
    const bucket = effects?.bossTomeDerived ? 'tome'
      : s._ctx === 'source' ? 'source'
      : s._ctx === 'shock' ? 'shock' : 'other'
    s.damageBySource[bucket] += dealt
    if (this.isBoss) s.bossBySource[bucket] += dealt
  }
  return ORIGINAL_HIT.call(this, damage, effects)
}

function kiteInput(g, stats) {
  const p = g.player
  const input = g.input.state
  let nearest = null
  let nd = Infinity
  for (const e of g.enemyManager.enemies) {
    if (!e.active || e.devouring) continue
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < nd) { nd = d; nearest = e }
  }
  const readySoon = (p.strainSkillCd || 0) <= 0.8
  let nx = 0
  let ny = 0
  if (nearest) {
    // 空格现在是「控制/防御」：震荡就绪时贴近敌人，否则拉开距离。
    if (readySoon) { nx = nearest.x - p.x; ny = nearest.y - p.y }
    else { nx = p.x - nearest.x; ny = p.y - nearest.y }
  }
  nx += (g.worldWidth / 2 - p.x) * 0.0015
  ny += (g.worldHeight / 2 - p.y) * 0.0015
  const len = Math.hypot(nx, ny) || 1
  nx /= len; ny /= len
  input.right = nx > 0.38
  input.left = nx < -0.38
  input.down = ny > 0.38
  input.up = ny < -0.38
  stats.kiting = true
}

function runSim({ route, mark, withMemory = true, minutes = 10, seed = 1, invincible = false }) {
  const g = createArena('origin')
  const stats = {
    route, mark, withMemory, casts: 0, castIds: [], castLevels: [], hitsPerCast: [], hitsThisCast: 0,
    sourceDamage: 0, sourceHits: 0, sourceKills: 0, bossDamage: 0, eliteDamage: 0,
    totalDamage: 0, skips: 0, overloads: 0, overloadAt: [], forcedResume: 0, forcedLog: [], failedPanels: [], deaths: 0, lastCastAt: -1,
    damageBySource: { source: 0, shock: 0, tome: 0, other: 0 },
    bossBySource: { source: 0, shock: 0, tome: 0, other: 0 },
    _ctx: null,
    memoryCards: 0, firstMemoryAt: null, zeroHitCasts: 0, bossMemoryTypes: [], castLog: [], pendingCast: null,
  }
  ACTIVE_STATS = stats
  try {
    g.onLevelUp = (options) => {
      if (!options?.length) return
      const ordered = [
        options.find(o => o.isOriginRoute && o.originRoute === route),
        options.find(o => o.isOriginMark && o.originMark === mark),
        ...options,
      ].filter(Boolean)
      for (const card of ordered) {
        if (g.applySkill(card)) return
      }
      stats.failedPanels.push({ t: Math.round(g.elapsed), level: g.player.level, ids: options.map(o => o.id) })
    }
    g.onExpeditionReward = (info) => {
      if (!info || !info.options?.length) return
      const memoryCard = info.options.find(o => o.isOriginMemory)
      if (memoryCard) {
        stats.memoryCards++
        stats.bossMemoryTypes.push(memoryCard.memoryId)
        if (g.originSourceMemories.length === 0 && stats.firstMemoryAt === null) stats.firstMemoryAt = Math.round(g.elapsed)
      }
      const pick = withMemory
        ? (memoryCard || info.options.find(o => !o.isOriginMemory) || info.options[0])
        : (info.options.find(o => !o.isOriginMemory) || info.options[0])
      g.resolveExpeditionReward(pick.id)
    }
    g.onReactionFull = (info) => {
      if (!info) return
      g.resolveReactionSwap(info.candidate?.id || null, info.secondaries?.[0]?.id || null)
    }
    g.onFusionConfirm = (info) => { if (info) g.resolveFusionConfirm(info.type, true) }
    g.onGameOver = () => {}

    const origPause = g.pause.bind(g)
    stats.pauseSites = []
    g.pause = () => { const line = (new Error().stack || '').split('\n')[2] || ''; stats.pauseSites.push(line.trim().slice(0, 90)); return origPause() }
    g.enemyManager._spawnTimer = 0
    g.enemyManager._enemies.length = 0
    g.player.pickupRadius = 260
    g.player.invincible = invincible ? 1e9 : 0
    g.start()

    patchCombat(g, stats)
    const totalFrames = Math.round(minutes * 60 * 60)
    const DT = 1 / 60
    let lastPaid = -Infinity
    const t0 = process.hrtime.bigint()
    for (let frame = 0; frame < totalFrames; frame++) {
      if (g.runFinished) break
      if (invincible) { g.player.hp = g.player.maxHp; g.player.invincible = 1e9 }
      kiteInput(g, stats)
      if (g.player.strainSkillCd <= 0 && !g.player.dead) {
        g.input.queueFever() // 黏液震荡回归主动控制：冷却好就放
      }
      g.elapsed += DT
      g.update(DT)
      const paidAt = g.player.overloadState?.lastPaidAt
      if (!Number.isFinite(paidAt)) {
        lastPaid = paidAt // 重开/重置后回到 -Infinity，避免把重置误记为一次支付
      } else if (paidAt !== lastPaid) {
        lastPaid = paidAt
        stats.overloads++
        stats.overloadAt.push(Math.round(paidAt * 10) / 10)
      }
      if (g._pauseLock > 0 && !g._chapterSettlement) {
        // 兜底：任何遗漏的暂停回调都不应该卡死采样
        stats.forcedResume++
        stats.forcedLog.push({ t: Math.round(g.elapsed), lock: g._pauseLock, site: stats.pauseSites[stats.pauseSites.length - 1] })
        g._pauseLock = 0
        g.running = true
      }
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    stats.wallMs = ms
    stats.frames = totalFrames
    stats.msPerFrame = ms / totalFrames
    stats.simSeconds = g.elapsed
    stats.level = g.player.level
    stats.kills = g.weaponSystem.kills
    stats.bossKills = g.weaponSystem.bossKills
    stats.ended = g.runFinished ? g.runState : 'running'
    stats.defeatReason = g.defeatReason
    stats.hp = g.player.hp
    stats.invincible = g.player.invincible
    stats.memories = (g.originSourceMemories || []).map(m => `${m.id}:${m.level}`)
    stats.cursor = g.originSourceCursor
    // 超载节奏：相邻两次支付的间隔（秒）。
    const gaps = []
    for (let i = 1; i < stats.overloadAt.length; i++) gaps.push(stats.overloadAt[i] - stats.overloadAt[i - 1])
    stats.overloadGapAvg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
    stats.overloadGapMax = gaps.length ? Math.max(...gaps) : 0
    stats.firstOverloadAt = stats.overloadAt[0] ?? null
    const bySkill = {}
    for (const id of stats.castIds) bySkill[id] = (bySkill[id] || 0) + 1
    stats.bySkill = bySkill
    stats.avgHits = stats.hitsPerCast.length
      ? stats.hitsPerCast.reduce((a, b) => a + b, 0) / stats.hitsPerCast.length
      : 0
    stats.maxHits = stats.hitsPerCast.length ? Math.max(...stats.hitsPerCast) : 0
    return stats
  } finally {
    ACTIVE_STATS = null
    dispose(g)
  }
}

function printSim(s) {
  const share = s.totalDamage > 0 ? (s.sourceDamage / s.totalDamage) * 100 : 0
  console.log(`\n=== ${s.route ?? 'no-route'} / mark=${s.mark ?? '-'} / memory=${s.withMemory} ===`)
  console.log(`模拟 ${s.simSeconds.toFixed(0)}s · Lv.${s.level} · 击杀 ${s.kills}（首领 ${s.bossKills}）· 结束=${s.ended}`)
  if (s.ended !== 'running') console.log(`结束原因 ${s.defeatReason} · 生命 ${s.hp} · 无敌 ${s.invincible}`)
  if (s.forcedLog?.length) console.log(`强制恢复日志 ${JSON.stringify(s.forcedLog)}`)
  if (s.failedPanels?.length) console.log(`无法应用的选卡面板 ${JSON.stringify(s.failedPanels)}`)
  console.log(`超载 ${s.overloads} 次 · 源质释放 ${s.casts} 次 · 无目标等待 ${s.skips} 次 · 强退暂停 ${s.forcedResume} 次`)
  console.log(`源质伤害 ${fmt(s.sourceDamage)} / 全来源 ${fmt(s.totalDamage)} = ${share.toFixed(1)}% · 命中 ${s.sourceHits} 次 · 击杀 ${s.sourceKills}`)
  console.log(`源质对首领 ${fmt(s.bossDamage)} · 对精英 ${fmt(s.eliteDamage)}`)
  // 伤害分桶：source=源质技能 shock=震荡+液痕+副环 tome=秘典派生 other=普攻/印记副弹
  const b = s.damageBySource
  const pct = (v, base) => base > 0 ? ` ${(v / base * 100).toFixed(1)}%` : ' -'
  console.log(`分桶：源质 ${fmt(b.source)}${pct(b.source, s.totalDamage)} · 震荡系 ${fmt(b.shock)}${pct(b.shock, s.totalDamage)} · 秘典 ${fmt(b.tome)}${pct(b.tome, s.totalDamage)} · 其他 ${fmt(b.other)}${pct(b.other, s.totalDamage)}`)
  const bt = s.bossBySource
  const bossTotal = bt.source + bt.shock + bt.tome + bt.other
  if (bossTotal > 0) {
    console.log(`对首领：源质 ${fmt(bt.source)}${pct(bt.source, bossTotal)} · 震荡系 ${fmt(bt.shock)}${pct(bt.shock, bossTotal)} · 秘典 ${fmt(bt.tome)}${pct(bt.tome, bossTotal)} · 其他 ${fmt(bt.other)}${pct(bt.other, bossTotal)}`)
  }
  console.log(`超载节奏：首次 ${s.firstOverloadAt ?? '-'}s · 平均间隔 ${s.overloadGapAvg.toFixed(1)}s · 最长 ${s.overloadGapMax.toFixed(1)}s`)
  const log = s.castLog || []
  const zero = log.filter(c => c.hits === 0)
  const hit = log.filter(c => c.hits > 0)
  const avg = (arr, key) => arr.length ? arr.reduce((a, b) => a + b[key], 0) / arr.length : 0
  const per = {}
  for (const c of log) {
    per[c.id] = per[c.id] || { n: 0, zero: 0, hits: 0 }
    per[c.id].n++; per[c.id].hits += c.hits
    if (c.hits === 0) per[c.id].zero++
  }
  console.log(`每次释放命中目标：平均 ${(log.reduce((a, c) => a + c.hits, 0) / Math.max(1, log.length)).toFixed(1)} · 最高 ${log.length ? Math.max(...log.map(c => c.hits)) : 0} · 空放 ${zero.length}/${log.length}`)
  for (const [id, v] of Object.entries(per)) {
    console.log(`  ${ORIGIN_SOURCE_BY_ID[id]?.name || (id === ORIGIN_INNATE_SKILL.id ? ORIGIN_INNATE_SKILL.name : id)}: ${v.n} 次 · 平均命中 ${(v.hits / v.n).toFixed(2)} · 空放 ${v.zero}（${(v.zero / v.n * 100).toFixed(0)}%）`)
  }
  if (log.length) {
    console.log(`  空放时最近目标距离 ${avg(zero, 'nearest').toFixed(0)}px · 命中时 ${avg(hit, 'nearest').toFixed(0)}px`)
    console.log(`  最近目标是首领的比例 ${(log.filter(c => c.nearestIsBoss).length / log.length * 100).toFixed(1)}% · 空放中最近目标距离>540 的比例 ${(zero.length ? zero.filter(c => c.nearest > 540).length / zero.length * 100 : 0).toFixed(0)}%`)
  }
  console.log(`源质卡出现 ${s.memoryCards} 次（${s.bossMemoryTypes.join(',')}）· 首枚记忆在 ${s.firstMemoryAt ?? '-'} 秒`)
  console.log(`技能分布：${JSON.stringify(s.bySkill)} · 记忆 ${JSON.stringify(s.memories)} · 游标 ${s.cursor}`)
  console.log(`性能：${s.msPerFrame.toFixed(2)} ms/帧（总 ${(s.wallMs / 1000).toFixed(1)}s）`)
}


// ============================================================
// 工程安全探针
// ============================================================

function safetyProbes() {
  const results = []
  const ok = (name, fn) => {
    const g = createArena('origin')
    try { fn(g); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`) } finally { dispose(g) }
  }
  const chooseRoute = (g, route) => {
    g.player.level = 5
    const card = rollSkills(g, 3).find(s2 => s2.isOriginRoute && s2.originRoute === route)
    g.applySkill(card)
    g.player.strainSkillCd = 0
    g.player.overloadState.lastPaidAt = -Infinity
  }
  /** 驱动被动控制器完成一次超载：启动 → 扣费 → 立即释放。 */
  const overloadNow = (g) => {
    const ctrl = g.weaponSystem.originOverload
    ctrl.reset()
    g.player.overloadState.lastPaidAt = -Infinity
    g.player.overloadState.active = false
    g.player.overloadState.timer = 0
    g.player.originEnergy = 40
    for (let i = 0; i < 40 && !g.player.overloadState.active; i++) {
      g.elapsed += 0.02
      ctrl.update(0.02)
    }
  }
  const tick = (g, seconds, step = 0.05) => {
    for (let i = 0; i < Math.ceil(seconds / step); i++) {
      g.elapsed += step
      g.weaponSystem.originSourceCombat.update(step)
      g.weaponSystem.originOverload.update(step)
    }
  }

  ok('暂停期间超载启动不推进，恢复后只释放一次', g => {
    learnOriginMemory(g, 'knight_breach')
    spawn(g, { x: 150, hp: 100000 })
    g.player.originEnergy = 40
    g.weaponSystem.originOverload.update(0.02)
    assert.equal(g.weaponSystem.originOverload.state, 'windup')
    // 暂停：主循环不再调用 weaponSystem.update，启动保持
    g.pause()
    assert.equal(g.weaponSystem.originOverload.state, 'windup', '暂停不丢弃启动')
    g.resume()
    tick(g, 0.5)
    assert.equal(g.originSourceLastCast?.id, 'knight_breach')
    const paid = g.player.overloadState.lastPaidAt
    tick(g, 0.3)
    assert.equal(g.player.overloadState.lastPaidAt, paid, '只支付一次')
  })

  ok('死亡结算后延迟任务被清理，重开清空记忆', g => {
    learnOriginMemory(g, 'knight_breach')
    spawn(g, { x: 150, hp: 100000 })
    overloadNow(g)
    g.finishRun('defeat')
    g.weaponSystem.update(0.016)
    const cs = g.weaponSystem.originSourceCombat
    assert.equal(cs.jobs.length, 0, '死亡后无残留任务')
    assert.equal(cs.waves.length + cs.cores.length + cs.spikes.length + cs.orbs.length, 0)
    assert.equal(g.weaponSystem.originOverload.state, 'charging')
    g.reset()
    assert.deepEqual(g.originSourceMemories, [])
    assert.equal(g.originSourceCursor, 0)
    assert.equal(g.weaponSystem.originSourceCombat.jobs.length, 0)
  })

  ok('换章清空在途技能；无目标时不支付且不推进游标', g => {
    learnOriginMemory(g, 'knight_breach')
    learnOriginMemory(g, 'mage_collapse')
    spawn(g, { x: 150, hp: 100000 })
    overloadNow(g)
    assert.equal(g.originSourceLastCast?.id, 'knight_breach')
    assert.equal(g.originSourceCursor, 1)
    g.enemyManager._enemies.length = 0
    g._enterExpeditionStage(2)
    assert.equal(g.weaponSystem.originSourceCombat.waves.length, 0, '换章清掉在途波体')
    const paidAt = g.player.overloadState.lastPaidAt
    g.weaponSystem.originOverload.reset()
    g.player.originEnergy = 40
    tick(g, 0.5)
    assert.equal(g.player.overloadState.lastPaidAt, paidAt, '无目标不支付')
    assert.equal(g.originSourceCursor, 1, '记忆保留则轮换游标也跨章保留')
    assert.equal(g.weaponSystem.originSourceCombat.jobs.length, 0)
  })

  ok('一次超载只兑现一次印记回响 + 一次源质释放', g => {
    chooseRoute(g, 'expansion')
    g.player.level = 9
    const markCard = rollSkills(g, 5).find(s2 => s2.isOriginMark && s2.originMark === 'gatling')
    g.applySkill(markCard)
    learnOriginMemory(g, 'knight_breach')
    spawn(g, { x: 140, hp: 100000 })
    overloadNow(g)
    const bolts = g.weaponSystem._projectiles.filter(p => p.isOriginEcho).length
    assert.ok(bolts >= 1, '回响副弹已生成')
    assert.equal(g.player.markState.echoUsed, true)
    assert.equal(g.originSourceLastCast?.id, 'knight_breach')
    tick(g, 0.6)
    const after = g.weaponSystem._projectiles.filter(p => p.isOriginEcho).length
    assert.ok(after <= bolts, '源质技能不追加新的回响副弹')
  })

  ok('源质击杀与普通击杀同一敌人只结算一次', g => {
    learnOriginMemory(g, 'knight_breach')
    const victim = spawn(g, { x: 120, hp: 1 })
    const gemsBefore = g.gemManager.count
    victim.hit(100) // 先由普通伤害击杀
    g.weaponSystem._onKill(victim)
    g.weaponSystem.originSourceCombat._hit(victim, 50) // 源质技能再打到尸体：不重复结算
    tick(g, 0.6)
    assert.equal(victim.active, false)
    assert.equal(g.weaponSystem.kills, 1, '击杀统计只加一次')
    assert.equal(g.weaponSystem.eliteKills + g.weaponSystem.bossKills, 0)
    assert.ok(g.gemManager.count > gemsBefore, '仍然正常掉落')
    assert.ok(victim._settled, '统一结算标记已置位')
  })

  ok('结算后不再施加延迟伤害', g => {
    learnOriginMemory(g, 'mage_collapse')
    spawn(g, { x: 120, hp: 100000 })
    overloadNow(g)
    tick(g, 0.25) // 释放，进入 0.5s 坍缩预警
    const target = g.enemyManager.enemies[0]
    const hpBefore = target.hp
    g.finishRun('defeat')
    tick(g, 1.2)
    assert.equal(target.hp, hpBefore, '结算后原核不再爆炸')
  })

  for (const line of results) console.log(line)
  const failed = results.filter(r => r.startsWith('FAIL')).length
  console.log(failed ? `
工程安全探针：${failed} 项失败` : `
工程安全探针：${results.length} 项全部通过`)
}

const mode = process.argv[2] || 'numbers'
if (mode === 'safety') {
  safetyProbes()
} else if (mode === 'numbers') {
  printBudget()
} else if (mode === 'sim') {
  const minutes = Number(process.argv[3]) || 10
  for (const [route, mark] of [['expansion', 'gatling'], ['assimilation', 'assassin'], ['resonance', 'elemental']]) {
    printSim(runSim({ route, mark, minutes, invincible: true }))
  }
  printSim(runSim({ route: 'expansion', mark: 'gatling', withMemory: false, minutes, invincible: true }))
  printSim(runSim({ route: 'resonance', mark: 'elemental', minutes, invincible: false }))
} else if (mode === 'sim-one') {
  const route = process.argv[3] || 'expansion'
  const mark = process.argv[4] || 'gatling'
  const minutes = Number(process.argv[5]) || 10
  const invincible = process.argv[6] === 'invincible'
  printSim(runSim({ route, mark, minutes, invincible }))
}
