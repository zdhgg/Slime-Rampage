<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { ArrowLeft, ArrowUpRight, BookOpen, History, Route, Swords, TowerControl } from 'lucide-vue-next'
import { version } from '../../package.json'
import changelog from '../../CHANGELOG.md?raw'
import { parseReleaseNotes } from '../content/releaseNotes.js'

defineProps({ tab: { type: String, default: 'guide' } })
const title = ref(null)
const releases = parseReleaseNotes(changelog)
const guides = [
  {
    id: 'arena', name: '主战场', subtitle: '开放地图 · 成长与进化', icon: Swords, accent: '#ecc477',
    goal: '移动避开围攻，通过自动攻击击败敌人、收集经验，升级时选择技能，逐步形成自己的战斗流派。',
    controls: [['W A S D / 方向键', '移动'], ['Space', '释放角色专属主动技能'], ['E', '靠近后吸收元素核心（原生黏液、元素史莱姆）']],
    steps: ['开局选择战斗类型、难度和血统。角色决定攻击方式与技能路线，暴食、暗影需要靠近目标战斗。', '升级时选择强化；专属血统在 Lv.5 自动觉醒，原生黏液在 Lv.5 选择主专精。元素史莱姆与原生黏液可通过核心与融合获得元素能力。', '王庭逆袭按章节目标推进并击败统帅；限时讨伐坚守 12 分钟后挑战最终防线；无尽灾变持续迎战更强敌潮。'],
    tip: '关注当前目标与首领预警。结算获得的材料可在地下城黑市购买永久基因，为后续行动积累成长。',
  },
  {
    id: 'runner', name: '突围', subtitle: '三线推进 · 换道与武器融合', icon: Route, accent: '#79d5e6',
    goal: '在持续前进的三条车道上躲避障碍与弹幕，自动射击突破封锁，收集武器核心并强化构筑。',
    controls: [['A D / ← →', '左右换道'], ['Space', '消耗可用次数，释放暴走狂热'], ['左右滑动', '触屏换道；暴走可点击界面按钮']],
    steps: ['选择极速闪击、马拉松或无尽突围，进入对应的推进挑战。', '留意车道危险预告，提前换道。驶入核心或模块所在车道获取强化，武器核心可融合为元素武器。', '岔口处所在的车道决定路线。根据补给需求与敌军压力选择前进方向，在目标挑战结束时结算，无尽模式则争取更远距离与更高分数。'],
    tip: '普通换道也能获得完美闪避奖励。保留暴走次数应对密集封锁，避免只盯着眼前的补给。',
  },
  {
    id: 'tower-defense', name: '塔防', subtitle: '巢穴防线 · 部署与资源调度', icon: TowerControl, accent: '#91dc8c',
    goal: '在建造位部署史莱姆守卫，分配养分、升级防御塔，阻止敌军抵达巢心，守住本关所有波次。',
    controls: [['点击建造位 / 防御塔', '建造、升级、选择专精或出售'], ['1–6 / Q', '选择前六种塔型 / 取消选择'], ['E / T / G', '提前召唤下一波 / 触发两处陷阱'], ['界面倍速按钮', '切换 1×、2×、3× 速度']],
    steps: ['从世界地图选择已解锁关卡。战役覆盖五大巢域、99 关，十种建筑随关卡进度逐步开放。', '查看下一波敌军情报，搭配火力与控制。防御塔可升至 Lv.4，Lv.3 时二选一专精，也可调整索敌策略。', '通关推进战役并争取更高星级；世界地图中的无尽试炼提供持续增强的波次挑战。巢心耐久耗尽则行动失败。'],
    tip: '提前召唤能获得额外养分，也会增加防守压力。先确认当前阵线稳定，再加速或召唤下一波。',
  },
]

onMounted(async () => {
  await nextTick()
  title.value?.focus({ preventScroll: true })
})
</script>

<template>
  <section class="about-page" aria-labelledby="about-title">
    <a class="return-link" href="#/"><ArrowLeft :size="16" aria-hidden="true" />返回首页</a>
    <div class="about-heading">
      <div><p class="eyebrow">SLIME RAMPAGE</p><h2 id="about-title" ref="title" tabindex="-1">关于游戏</h2></div>
      <span class="current-version">当前版本 <b>v{{ version }}</b></span>
    </div>
    <nav class="about-tabs" aria-label="关于游戏栏目">
      <a href="#/about" :aria-current="tab === 'guide' ? 'page' : undefined"><BookOpen :size="17" aria-hidden="true" />玩法指南</a>
      <a href="#/about/updates" :aria-current="tab === 'updates' ? 'page' : undefined"><History :size="17" aria-hidden="true" />更新日志</a>
    </nav>

    <div v-if="tab === 'guide'" class="guide-content">
      <div class="guide-intro"><h3>从一只史莱姆开始反攻</h3><p>三种玩法，各有自己的战斗节奏。先了解目标和操作，再选择你的行动。</p></div>
      <div class="common-note"><span>开始之前</span><p>游玩需要登录账号，三种玩法的进度与成绩按账号保存。战斗中按 <kbd>Esc</kbd> 暂停或继续，也可使用界面暂停按钮。</p></div>
      <nav class="guide-index" aria-label="跳转到玩法说明">
        <a v-for="guide in guides" :key="guide.id" :href="`#/about/${guide.id}`" :style="{ '--guide-accent': guide.accent }"><component :is="guide.icon" :size="17" aria-hidden="true" />{{ guide.name }}<ArrowUpRight :size="14" aria-hidden="true" /></a>
      </nav>
      <article v-for="(guide, index) in guides" :id="`guide-${guide.id}`" :key="guide.id" class="guide-section" :style="{ '--guide-accent': guide.accent }" :aria-labelledby="`guide-title-${guide.id}`">
        <header class="guide-heading"><span class="guide-number">0{{ index + 1 }}</span><component :is="guide.icon" :size="25" :stroke-width="1.6" aria-hidden="true" /><div><h3 :id="`guide-title-${guide.id}`">{{ guide.name }}</h3><p>{{ guide.subtitle }}</p></div></header>
        <p class="guide-goal">{{ guide.goal }}</p>
        <div class="guide-columns">
          <div><h4>基础操作</h4><dl class="controls"><div v-for="[key, action] in guide.controls" :key="key"><dt>{{ key }}</dt><dd>{{ action }}</dd></div></dl></div>
          <div><h4>如何推进</h4><ol><li v-for="step in guide.steps" :key="step">{{ step }}</li></ol></div>
        </div>
        <p class="guide-tip"><strong>上手提示</strong>{{ guide.tip }}</p>
      </article>
      <p class="device-note">主战场建议使用键盘游玩；突围支持滑动换道，塔防支持点击或触控部署。</p>
    </div>

    <div v-else class="updates-content">
      <div class="guide-intro"><h3>每一次进化，都有记录</h3><p>按版本回顾新增内容、玩法调整与问题修复。历史说明对应当时的版本，当前操作请参考玩法指南。</p></div>
      <details v-for="(release, index) in releases" :key="release.version" class="release" :open="index === 0">
        <summary><span class="release-name">v{{ release.version }}<span v-if="release.version === version" class="version-label">当前版本</span></span><time :datetime="release.date">{{ release.date }}</time><span class="release-toggle" aria-hidden="true">+</span></summary>
        <div class="release-body">
          <p v-for="paragraph in release.summary" :key="paragraph" class="release-intro">{{ paragraph }}</p>
          <section v-for="section in release.sections" :key="section.title" class="release-section"><h4>{{ section.title }}</h4><ul><li v-for="item in section.items" :key="item">{{ item }}</li></ul></section>
        </div>
      </details>
    </div>

    <footer class="about-footer"><span>史莱姆大暴走 · Slime Rampage</span><a href="#/">返回首页 <ArrowLeft :size="14" aria-hidden="true" /></a></footer>
  </section>
</template>

<style scoped>
.about-page { padding-top: 28px; user-select: text; -webkit-user-select: text; }
.about-page a { color: inherit; text-decoration: none; }
.about-page a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 5px; border-radius: 3px; }
.return-link { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; font-size: 12px; color: var(--text-muted) !important; }
.return-link:hover, .about-footer a:hover { color: var(--accent-bright) !important; }
.about-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 20px 0 28px; }
.eyebrow { color: var(--accent); font-size: 10px; letter-spacing: .12em; margin-bottom: 8px; }
h2 { font-size: 30px; line-height: 1.3; outline: none; }
.current-version { flex-shrink: 0; color: var(--text-muted); font-size: 12px; padding-bottom: 4px; }
.current-version b { color: var(--accent-bright); margin-left: 8px; font-weight: 600; }
.about-tabs { display: flex; gap: 28px; border-bottom: 1px solid var(--border); }
.about-tabs a { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; border-bottom: 2px solid transparent; color: var(--text-muted); font-size: 14px; }
.about-tabs a:hover { color: var(--text); }
.about-tabs a[aria-current] { color: var(--accent-bright); border-color: var(--accent-bright); }
.guide-intro { margin: 30px 0 24px; }
.guide-intro h3 { font-size: 18px; font-weight: 600; margin-bottom: 9px; }
.guide-intro p, .common-note p, .guide-goal, .guide-columns, .guide-tip, .release-body { font-size: 13px; line-height: 1.9; color: #bdb7ad; }
.common-note { display: flex; align-items: baseline; gap: 20px; padding: 16px 20px; background: rgba(215, 166, 87, .045); border-left: 2px solid var(--accent); }
.common-note > span { flex-shrink: 0; font-size: 12px; font-weight: 600; color: var(--accent-bright); }
kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 3px; font: inherit; color: var(--text); }
.guide-index { display: flex; gap: 24px; margin: 24px 0 10px; flex-wrap: wrap; }
.guide-index a { display: flex; align-items: center; gap: 8px; min-height: 40px; font-size: 13px; color: var(--guide-accent); }
.guide-index a:hover { text-decoration: underline; text-underline-offset: 5px; }
.guide-section { padding: 30px 0; border-bottom: 1px solid var(--border); scroll-margin-top: 24px; }
.guide-heading { display: flex; align-items: center; gap: 15px; color: var(--guide-accent); }
.guide-number { font-size: 11px; font-weight: 700; align-self: flex-start; padding-top: 5px; }
.guide-heading h3 { font-size: 22px; color: var(--text); }
.guide-heading p { margin-top: 5px; font-size: 11px; color: var(--text-muted); }
.guide-goal { margin: 20px 0 24px; max-width: 760px; }
.guide-columns { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.3fr); gap: 48px; }
h4 { color: var(--text); font-size: 12px; font-weight: 600; margin-bottom: 12px; }
.controls > div { padding: 9px 0; border-bottom: 1px solid rgba(238, 214, 180, .07); }
.controls > div:first-child { padding-top: 0; }
.controls dt { color: #e1d9cd; font-size: 12px; }
.controls dd { margin-top: 3px; font-size: 12px; color: #a9a297; }
ol, ul { padding-left: 20px; }
li + li { margin-top: 12px; }
ol li::marker { color: var(--guide-accent); font-size: 11px; }
.guide-tip { margin-top: 24px; font-size: 12px; }
.guide-tip strong { color: var(--guide-accent); margin-right: 12px; font-weight: 500; }
.device-note { margin-top: 20px; color: var(--text-muted); font-size: 12px; line-height: 1.8; }
.release { border-bottom: 1px solid var(--border); }
.release summary { display: flex; align-items: center; gap: 18px; padding: 24px 0; list-style: none; cursor: pointer; }
.release summary::-webkit-details-marker { display: none; }
.release-name { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; }
.version-label { padding: 3px 7px; border: 1px solid rgba(215, 166, 87, .25); border-radius: 3px; color: var(--accent-bright); font-size: 10px; font-weight: 500; }
.release time { margin-left: auto; color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.release-toggle { width: 18px; color: var(--accent-bright); font-size: 22px; font-weight: 300; text-align: center; }
.release[open] .release-toggle { transform: rotate(45deg); }
.release-body { padding-bottom: 30px; overflow-wrap: anywhere; }
.release-intro { margin-bottom: 24px; color: #d3c9bb; }
.release-section + .release-section { margin-top: 28px; }
.release-section h4 { color: var(--accent-bright); }
.about-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 40px; padding: 20px 0 0; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted); }
.about-footer a { display: inline-flex; gap: 8px; align-items: center; min-height: 40px; flex-shrink: 0; }
@media (max-width: 600px) {
  .about-page { padding-top: 16px; }
  .about-heading { align-items: flex-start; flex-direction: column; margin-top: 16px; gap: 10px; }
  h2 { font-size: 26px; }
  .guide-intro h3 { font-size: 17px; }
  .common-note { flex-direction: column; gap: 7px; padding: 14px; }
  .guide-index { justify-content: space-between; gap: 10px; }
  .guide-heading { gap: 12px; }
  .guide-columns { grid-template-columns: 1fr; gap: 24px; }
  .guide-section { padding: 26px 0; }
  .release summary { gap: 10px; }
  .release-name { font-size: 18px; gap: 8px; }
  .release time { font-size: 11px; }
  .about-footer { align-items: flex-start; }
}
</style>
