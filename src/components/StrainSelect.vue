<script setup>
import { computed, ref } from 'vue'
import { Check, ChevronDown, Sparkles } from 'lucide-vue-next'
import { STRAINS, STRAIN_IDS, STRAIN_SKILLS } from '../game/Strains.js'
import { GLUTTON_VORTEX_DAMAGE, GLUTTON_BOSS_VORTEX_DAMAGE, GLUTTON_VORTEX_PULL_RADIUS } from '../game/GluttonCombat.js'
import { STRAIN_PRESENTATION, strainTraits } from './strainPresentation.js'
import SlimeFamilyPortrait from './SlimeFamilyPortrait.vue'
const props = defineProps({ modelValue: { type: String, default: 'origin' } })
const emit = defineEmits(['update:modelValue'])
const selected = computed(() => STRAINS[props.modelValue] || STRAINS.origin)
const look = computed(() => STRAIN_PRESENTATION[selected.value.id])
const skill = computed(() => STRAIN_SKILLS[selected.value.id])
const traits = computed(() => strainTraits(selected.value.id))
const roster = ref(null)

const skillSummary = computed(() => selected.value.id === 'glutton'
  ? `开启约 ${GLUTTON_VORTEX_PULL_RADIUS}px 引力漩涡将外围敌群拽入怀中并立刻获得 1 层胃铠，闭颚重咬造成 ${GLUTTON_VORTEX_DAMAGE} 倍攻击伤害（首领 ${GLUTTON_BOSS_VORTEX_DAMAGE} 倍）并吞噬可吞目标。`
  : selected.value.id === 'shadow'
    ? '沿移动方向穿行，首个目标必暴；分身优先突袭后排射手，遇首领集中夹击。有效暴击后有 60% 概率生影，基础最多 2 个、持续 4 秒。'
    : selected.value.id === 'elemental'
      ? '开局近身冲击解围；第一次融合后，空格进化为当前双元素的融合爆发。'
    : skill.value?.desc)

// Arrow keys move focus and selection together, while Tab remains native.
function navigate(event, currentIndex) {
  let next
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (currentIndex + 1) % STRAIN_IDS.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (currentIndex + STRAIN_IDS.length - 1) % STRAIN_IDS.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = STRAIN_IDS.length - 1
  else return
  event.preventDefault()
  emit('update:modelValue', STRAIN_IDS[next])
  roster.value?.querySelectorAll('button')[next]?.focus({ preventScroll: true })
}

</script>

<template>
  <section class="strain-select" :style="{ '--strain-color': look.color }" aria-labelledby="strain-heading">
    <header class="selection-heading">
      <h3 id="strain-heading">选择出战血统</h3>
      <span>六种天性，各自进化</span>
    </header>

    <div class="character-showcase">
      <div class="character-stage" :style="{ '--stage-color': look.color }">
        <svg class="chamber-art" viewBox="0 0 560 350" preserveAspectRatio="xMidYMax slice" fill="none" aria-hidden="true">
          <path d="M0 0H560V350H0Z" fill="none" />
          <path d="M120 278V143A160 160 0 0 1 440 143V278" stroke="#bbc8b8" stroke-width="25" />
          <path d="M132 279V144a148 148 0 0 1 296 0v135" stroke="#8b9d8b" stroke-opacity=".3" />
          <path d="M150 268V145a130 130 0 0 1 260 0v123" stroke="currentColor" stroke-opacity=".13" />
          <path d="M168 269V144a112 112 0 0 1 224 0v125" stroke="#93a992" stroke-opacity=".3" />
          <path d="m117 150 25 0m-16-56 23 9m0-64 20 17m49-59 11 24m49-32v27m62-17-11 24m60 13-19 20m44 27-24 11m36 48h-26" stroke="#819688" stroke-width="3" />
          <path d="M71 278V129h24v149m370 0V129h24v149M62 129h43v-9H62Zm393 0h43v-9h-43Z" fill="#c6cec0" stroke="#a2b19d" />
          <path d="M82 143v120m396-120v120" stroke="#8c9c8d" stroke-opacity=".5" />
          <path d="M0 289h560M0 330h560M73 350l105-80m314 80-106-80m-81 80-15-80m-137 56 25-36m180 36-23-36" stroke="#8ba48d" stroke-opacity=".4" />
          <path d="m93 293 53-24h268l53 24v17l-51 25H145l-52-25Z" fill="#a7b4a0" stroke="#8c9d89" />
          <path d="m93 293 53-24h268l53 24-53 24H146Z" fill="#d3dbca" stroke="#a9b8a1" />
          <path d="m119 293 37-16h248l38 16-38 17H156Z" fill="#e3e8d9" stroke="currentColor" stroke-opacity=".3" />
          <ellipse cx="280" cy="291" rx="117" ry="15" stroke="currentColor" stroke-opacity=".25" />
          <ellipse cx="280" cy="291" rx="105" ry="11" stroke="currentColor" stroke-opacity=".14" stroke-dasharray="9 6" />
          <path d="m148 318 0 14m66-14v14m68-14v15m65-15v14m67-15v13" stroke="#80937e" stroke-width="2" />
          <path d="m272 321 8-3 8 3-8 4Z" fill="currentColor" opacity=".5" />
          <path d="m50 283 11-7 20 5-8 8H55Zm423-9 14-7 19 11-4 9-28-2Z" fill="#bfccb8" stroke="#9cab94" />
        </svg>
        <div class="stage-light" aria-hidden="true"></div>
        <div :key="selected.id" class="portrait-entry">
          <SlimeFamilyPortrait :strain="selected.id" element="neutral" />
        </div>
        <div class="stage-baseline" aria-hidden="true"><span></span>{{ look.label }}</div>
      </div>

      <div class="character-dossier">
        <div :key="selected.id" class="dossier-entry">
          <p class="character-epithet"><span></span>{{ look.epithet }}</p>
          <h2 class="character-name">{{ selected.name }}</h2>
          <p class="character-intro">{{ look.intro }}</p>

          <dl class="character-traits">
            <div v-for="trait in traits" :key="trait.label" :class="{ cost: trait.cost }">
              <dd>{{ trait.value }}</dd><dt>{{ trait.label }}</dt>
            </div>
          </dl>

          <div class="character-skill">
            <span class="skill-key" aria-hidden="true"><template v-if="skill">SPACE</template><Sparkles v-else :size="19" /></span>
            <div class="skill-copy">
              <div class="skill-title"><b>{{ skill?.name || '自由变异' }}</b><span>{{ skill ? (skill.chargeMax ? '猎食点驱动' : `冷却 ${skill.cooldown} 秒`) : 'Lv.5 选择原生路线' }}</span></div>
              <p>{{ skillSummary || 'Lv.1–4 原生核心、异源碎片与通用卡自由探索；Lv.5 三选一原生路线，Lv.9 五选一异源印记。空格始终是黏液震荡。' }}</p>
            </div>
          </div>

          <p v-if="selected.id === 'elemental'" class="spell-growth-note">Lv.2 发现首系 → 前期随机探索 → 第 6 波／第 3 章确认单系、双系或多系路线 → 终极随机出现</p>

          <details :key="`${selected.id}-rules`" class="strain-rules">
            <summary>完整血统机制 <ChevronDown :size="13" aria-hidden="true" /></summary>
            <p>{{ selected.desc }}</p>
            <p v-if="skill"><b>空格 · {{ skill.name }}</b> — {{ skill.desc }}。</p>
          </details>
        </div>
      </div>

      <div ref="roster" class="strain-roster" role="group" aria-label="史莱姆血统">
        <button
          v-for="(id, i) in STRAIN_IDS"
          :key="id"
          type="button"
          class="strain-option"
          :class="{ selected: selected.id === id }"
          :style="{ '--option-color': STRAIN_PRESENTATION[id].color }"
          :aria-pressed="selected.id === id"
          :aria-label="`${STRAINS[id].name}，${STRAIN_PRESENTATION[id].label}`"
          :data-strain="id"
          @click="emit('update:modelValue', id)"
          @keydown="navigate($event, i)"
        >
          <span class="roster-portrait"><SlimeFamilyPortrait :strain="id" compact /></span>
          <span class="roster-copy"><b>{{ STRAINS[id].name }}</b><span>{{ STRAIN_PRESENTATION[id].label }}</span></span>
          <span class="roster-check" aria-hidden="true"><Check :size="11" :stroke-width="3" /></span>
        </button>
      </div>
    </div>
    <span class="sr-only" role="status">已选择{{ selected.name }}。</span>
  </section>
</template>

<style scoped>
.spell-growth-note { margin: 10px 0 0; color: #57486f; font-size: 12px; line-height: 1.7; }
.strain-select { min-width: 0; }
.selection-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 16px; }
.selection-heading h3 { margin: 0; color: #064E3B; font-size: 14px; font-weight: 800; }
.selection-heading > span { color: #059669; font-size: 11px; font-weight: 600; }

/* 大卡：白框毛玻璃 + 24px 圆角，高度控制在单屏内 */
.character-showcase {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 3px solid #FFFFFF;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.1), 0 4px 10px rgba(0, 0, 0, 0.03);
}

/* 左侧舞台：随血统切换的彩色主题光晕 + 森林氛围底色 */
.character-stage {
  position: relative;
  min-width: 0;
  min-height: 350px;
  overflow: hidden;
  color: var(--stage-color);
  background:
    radial-gradient(ellipse at 50% 60%, color-mix(in srgb, var(--stage-color) 46%, transparent) 0%, transparent 64%),
    radial-gradient(ellipse at 16% 18%, color-mix(in srgb, var(--stage-color) 24%, transparent) 0%, transparent 58%),
    radial-gradient(ellipse at 85% 85%, color-mix(in srgb, var(--stage-color) 18%, transparent) 0%, transparent 55%),
    linear-gradient(180deg, #F4FCF3 0%, color-mix(in srgb, var(--stage-color) 16%, #FBFEF5) 100%);
  transition: background .3s;
}
/* 拱门线稿整体染上主题色，融入光晕森林氛围（不再是灰白建筑感） */
.chamber-art { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.85; filter: saturate(0.9); }
.chamber-art path[stroke="#bbc8b8"], .chamber-art path[stroke="#8b9d8b"], .chamber-art path[stroke="#93a992"], .chamber-art path[stroke="#819688"], .chamber-art path[stroke="#8c9c8d"], .chamber-art path[stroke="#8ba48d"], .chamber-art path[stroke="#80937e"] { stroke: currentColor; }
.chamber-art path[stroke="#bbc8b8"] { stroke-opacity: 0.5; }
.chamber-art path[fill="#c6cec0"], .chamber-art path[fill="#a7b4a0"], .chamber-art path[fill="#d3dbca"], .chamber-art path[fill="#e3e8d9"], .chamber-art path[fill="#bfccb8"] { fill: color-mix(in srgb, var(--stage-color) 30%, #ffffff); }
.stage-light { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 58%, color-mix(in srgb, var(--stage-color) 26%, transparent), transparent 60%); transition: background .25s; pointer-events: none; }
.portrait-entry { position: absolute; width: min(88%, 410px); height: 315px; bottom: 12px; left: 50%; margin-left: max(-44%, -205px); animation: portrait-enter .28s ease-out both; }

/* 定位标签：白底彩色文字贴纸胶囊（不再贴脚底被遮） */
.stage-baseline {
  position: absolute;
  top: 16px;
  left: 22px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border: 2px solid #FFFFFF;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.14);
  color: var(--stage-color);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.5px;
}
.stage-baseline span { width: 7px; height: 7px; border-radius: 50%; background: var(--stage-color); box-shadow: 0 0 6px color-mix(in srgb, var(--stage-color) 55%, transparent); }

/* 右侧信息区：奶油白底 + 舒适排版 */
.character-dossier { min-width: 0; padding: 20px 26px 16px; border-left: 2px solid #FFFFFF; background: linear-gradient(120deg, #FDFFFE, #F7FEFA 80%); }
.dossier-entry { animation: dossier-enter .22s ease-out both; }
.character-epithet {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #D1FAE5;
  color: #047857;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .5px;
}
.character-epithet > span { width: 6px; height: 6px; background: var(--strain-color); transform: rotate(45deg); border-radius: 1px; }
.character-name { margin: 0; color: #064E3B; font-size: clamp(26px, 2.4vw, 31px); line-height: 1.2; letter-spacing: -1px; font-weight: 800; }
.character-intro { max-width: 420px; min-height: 34px; margin: 8px 0 0; color: #374151; font-size: 14px; line-height: 1.6; }

/* 特性数据：浅绿圆角小卡 */
.character-traits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 14px 0 12px; }
.character-traits div {
  padding: 9px 12px;
  border-radius: 14px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
}
.character-traits dd { margin: 0 0 3px; color: color-mix(in srgb, var(--strain-color) 55%, #064E3B); font-size: 17px; line-height: 1.3; font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; }
.character-traits dt { color: #4B6B5E; font-size: 10.5px; font-weight: 600; }
/* 成本/负属性卡刻意用暖琥珀区分（如 −1 生命上限），与三张浅绿正属性卡形成对照 */
.character-traits .cost { background: #FFFBEB; border-color: #FDE68A; }
.character-traits .cost dd { color: #B45309; }

/* 技能展示胶囊框：SPACE 立体小键盘帽 */
.character-skill {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 2px;
  padding: 12px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--strain-color) 6%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--strain-color) 26%, transparent);
}
.skill-key {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 62px;
  padding: 0 9px;
  height: 36px;
  flex: none;
  white-space: nowrap;
  margin-top: 0;
  color: #064E3B;
  border: 2px solid #FFFFFF;
  border-bottom-width: 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #F0FDF4, #DCFCE7);
  box-shadow: 0 3px 0 #86EFAC, 0 5px 10px rgba(34, 197, 94, 0.2);
  font: 700 12px "Segoe UI", sans-serif;
  letter-spacing: 0.06em;
}
.skill-copy { min-width: 0; flex: 1; }
.skill-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.skill-title b { color: #064E3B; font-size: 13px; font-weight: 750; }
.skill-title span { color: #059669; font-size: 11px; font-weight: 600; }
.skill-copy p { min-height: 38px; margin: 5px 0 0; color: #374151; font-size: 12.5px; line-height: 1.65; }
.strain-rules { margin-top: 10px; font-size: 11px; }
.strain-rules summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  min-height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  color: #047857;
  background: rgba(209, 250, 229, 0.65);
  list-style: none;
  cursor: pointer;
  font-weight: 650;
}
.strain-rules summary::-webkit-details-marker { display: none; }
.strain-rules[open] summary svg { transform: rotate(180deg); }
.strain-rules summary:hover { background: #D1FAE5; }
.strain-rules p { margin: 8px 0 0; color: #374151; line-height: 1.85; }
.strain-rules p b { color: #064E3B; font-weight: 650; }

/* 底部 6 只史莱姆：独立糖果角色徽章卡 */
.strain-roster {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  border-top: 2px solid #FFFFFF;
  background: rgba(255, 255, 255, 0.5);
}
.strain-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 82px;
  padding: 10px 12px 10px 6px;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  color: #064E3B;
  background: rgba(255, 255, 255, 0.86);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(15, 118, 110, 0.07);
  transition: background .16s, border-color .16s, transform .16s, box-shadow .16s;
}
.strain-option:hover { background: #F0FDF4; transform: translateY(-2px); box-shadow: 0 6px 14px rgba(15, 118, 110, 0.1); }
.strain-option.selected {
  background: color-mix(in srgb, var(--option-color) 12%, #FFFFFF);
  border-color: var(--option-color);
  border-width: 2.5px;
  transform: translateY(-3px);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--option-color) 28%, transparent);
}
.roster-portrait { flex: none; width: clamp(52px, 5.4vw, 74px); height: 62px; }
.roster-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.roster-copy b { font-size: 12px; font-weight: 750; white-space: nowrap; }
.roster-copy > span { color: #4B6B5E; font-size: 10px; white-space: nowrap; }
.selected .roster-copy b { color: color-mix(in srgb, var(--option-color) 60%, #064E3B); }
.roster-check {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #22C55E, #10B981);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
  visibility: hidden;
}
.selected .roster-check { visibility: visible; }
.strain-option:active { transform: translateY(0) scale(0.98); }
.strain-option:focus-visible { outline: 2px solid #285d7e; outline-offset: -3px; }
.strain-rules summary:focus-visible { outline: 2px solid #285d7e; outline-offset: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@keyframes portrait-enter { from { opacity: 0; transform: translateY(7px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes dossier-enter { from { opacity: .3; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (max-width: 1000px) and (min-width: 761px) {
  .character-dossier { padding: 25px 22px 16px; }
  .strain-option { flex-direction: column; justify-content: center; gap: 0; padding: 8px; }
  .roster-portrait { width: 64px; height: 50px; }
  .roster-copy { align-items: center; gap: 4px; }
}
@media (max-height: 940px) and (min-width: 761px) {
  /* 单屏免滚动：压低舞台与整体内距，保证 1080p 笔记本（含浏览器工具栏后可视 ~850-930）一屏容纳全部 */
  .character-stage { min-height: 290px; }
  .portrait-entry { height: 250px; }
  .character-dossier { padding: 14px 22px 10px; }
  .character-name { font-size: 27px; }
  .character-epithet { margin-bottom: 5px; }
  .character-intro { min-height: 28px; margin-top: 5px; line-height: 1.5; }
  .character-traits { margin: 8px 0 7px; }
  .character-traits div { padding: 6px 10px; }
  .character-traits dd { font-size: 15px; }
  .character-skill { padding: 9px 12px; }
  .skill-copy p { min-height: 28px; }
  .spell-growth-note { margin-top: 6px; }
  .strain-rules { margin-top: 7px; }
  .strain-roster { padding: 8px; }
  .strain-option { min-height: 68px; padding-top: 5px; padding-bottom: 5px; }
  .roster-portrait { height: 52px; }
}
@media (max-width: 760px) {
  .selection-heading { margin-bottom: 10px; }
  .selection-heading > span { font-size: 10px; }
  .character-showcase { grid-template-columns: minmax(0, 1fr); }
  .character-stage { min-height: 235px; }
  .portrait-entry { width: 295px; height: 236px; bottom: 6px; margin-left: -147.5px; }
  .chamber-art { height: 285px; top: auto; bottom: 0; }
  .strain-roster { grid-row: 2; gap: 1px; }
  .strain-option { min-height: 94px; flex-direction: column; padding: 11px 1px 10px; gap: 2px; }
  .roster-portrait { width: 56px; height: 45px; }
  .roster-copy { align-items: center; gap: 5px; }
  .roster-copy b { font-size: 10px; }
  .roster-copy > span { font-size: 9px; }
  .roster-check { width: 12px; height: 12px; right: 4px; top: 5px; }
  .roster-check svg { width: 9px; }
  .character-dossier { padding: 22px 22px 16px; border-left: 0; border-top: 1px solid var(--adventure-line); }
  .character-name { font-size: 28px; }
  .character-intro { min-height: 0; }
  .character-traits { margin-top: 18px; }
  .strain-rules summary { min-height: 36px; }
}
@media (max-width: 370px) {
  .character-dossier { padding: 20px 16px 14px; }
  .roster-copy b { font-size: 9px; }
  .roster-copy > span { font-size: 8px; }
  .roster-portrait { width: 48px; }
  .character-traits dd { font-size: 16px; }
  .character-traits div + div { padding-left: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::after { animation: none !important; transition: none !important; }
}
</style>
