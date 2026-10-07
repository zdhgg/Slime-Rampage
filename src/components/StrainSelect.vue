<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown, Play, Sparkles } from 'lucide-vue-next'
import { STRAINS, STRAIN_IDS, STRAIN_SKILLS } from '../game/Strains.js'
import { GLUTTON_HEAVY_DAMAGE, GLUTTON_BOSS_HEAVY_DAMAGE } from '../game/GluttonCombat.js'
import { STRAIN_PRESENTATION, strainTraits } from './strainPresentation.js'
import SlimePortrait from './SlimePortrait.vue'

const props = defineProps({ modelValue: { type: String, default: 'origin' } })
const emit = defineEmits(['update:modelValue', 'preview'])
const selected = computed(() => STRAINS[props.modelValue] || STRAINS.origin)
const look = computed(() => STRAIN_PRESENTATION[selected.value.id])
const skill = computed(() => STRAIN_SKILLS[selected.value.id])
const traits = computed(() => strainTraits(selected.value.id))
const index = computed(() => String(STRAIN_IDS.indexOf(selected.value.id) + 1).padStart(2, '0'))
const performing = ref(false)
const previewCount = ref(0)
const roster = ref(null)
let previewTimer

const skillSummary = computed(() => selected.value.id === 'glutton'
  ? `消耗 1 猎食点，近身重咬造成 ${GLUTTON_HEAVY_DAMAGE} 倍伤害（首领 ${GLUTTON_BOSS_HEAVY_DAMAGE} 倍），将可吞噬的残血或被咬杀目标直接吞噬。`
  : selected.value.id === 'shadow'
    ? '沿移动方向穿行，首个目标必暴；分身优先突袭后排射手，遇首领集中夹击。有效暴击后有 60% 概率生影，基础最多 2 个、持续 4 秒。'
    : skill.value?.desc)

function preview() {
  if (performing.value) return
  performing.value = true
  previewCount.value++
  emit('preview')
  previewTimer = setTimeout(() => { performing.value = false }, 1250)
}

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

watch(() => props.modelValue, () => {
  clearTimeout(previewTimer)
  performing.value = false
  previewCount.value = 0
})
onBeforeUnmount(() => clearTimeout(previewTimer))
</script>

<template>
  <section class="strain-select" :style="{ '--strain-color': look.color }" aria-labelledby="strain-heading">
    <header class="selection-heading">
      <h3 id="strain-heading">选择出战血统</h3>
      <span>六种天性，各自进化</span>
    </header>

    <div class="character-showcase">
      <div class="character-stage" :style="{ '--stage-color': look.color }">
        <div class="stage-caption" aria-hidden="true"><span>SLIME ORIGINS</span><b>{{ index }} <i>/ {{ String(STRAIN_IDS.length).padStart(2, '0') }}</i></b></div>
        <svg class="chamber-art" viewBox="0 0 560 350" preserveAspectRatio="xMidYMax slice" fill="none" aria-hidden="true">
          <path d="M0 0H560V350H0Z" fill="#111310" />
          <path d="M120 278V143A160 160 0 0 1 440 143V278" stroke="#252b23" stroke-width="25" />
          <path d="M132 279V144a148 148 0 0 1 296 0v135" stroke="#4c5542" stroke-opacity=".3" />
          <path d="M150 268V145a130 130 0 0 1 260 0v123" stroke="currentColor" stroke-opacity=".13" />
          <path d="M168 269V144a112 112 0 0 1 224 0v125" stroke="#3c4335" stroke-opacity=".3" />
          <path d="m117 150 25 0m-16-56 23 9m0-64 20 17m49-59 11 24m49-32v27m62-17-11 24m60 13-19 20m44 27-24 11m36 48h-26" stroke="#0b0e0b" stroke-width="3" />
          <path d="M71 278V129h24v149m370 0V129h24v149M62 129h43v-9H62Zm393 0h43v-9h-43Z" fill="#1c201a" stroke="#2c3226" />
          <path d="M82 143v120m396-120v120" stroke="#3a4131" stroke-opacity=".5" />
          <path d="M0 289h560M0 330h560M73 350l105-80m314 80-106-80m-81 80-15-80m-137 56 25-36m180 36-23-36" stroke="#343728" stroke-opacity=".4" />
          <path d="m93 293 53-24h268l53 24v17l-51 25H145l-52-25Z" fill="#12160f" stroke="#303728" />
          <path d="m93 293 53-24h268l53 24-53 24H146Z" fill="#242a1e" stroke="#454e35" />
          <path d="m119 293 37-16h248l38 16-38 17H156Z" fill="#191e15" stroke="currentColor" stroke-opacity=".3" />
          <ellipse cx="280" cy="291" rx="117" ry="15" stroke="currentColor" stroke-opacity=".25" />
          <ellipse cx="280" cy="291" rx="105" ry="11" stroke="currentColor" stroke-opacity=".14" stroke-dasharray="9 6" />
          <path d="m148 318 0 14m66-14v14m68-14v15m65-15v14m67-15v13" stroke="#080d08" stroke-width="2" />
          <path d="m272 321 8-3 8 3-8 4Z" fill="currentColor" opacity=".5" />
          <path d="m50 283 11-7 20 5-8 8H55Zm423-9 14-7 19 11-4 9-28-2Z" fill="#22261b" stroke="#363c2a" />
        </svg>
        <div class="stage-light" aria-hidden="true"></div>
        <div :key="selected.id" class="portrait-entry">
          <SlimePortrait :strain="selected.id" :performing="performing" />
        </div>
        <div class="stage-baseline" aria-hidden="true"><span></span>{{ look.label }}<span></span></div>
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
              <div class="skill-title"><b>{{ skill?.name || '自由觉醒' }}</b><span>{{ skill ? (skill.chargeMax ? '猎食点驱动' : `冷却 ${skill.cooldown} 秒`) : 'Lv.5 选择主专精' }}</span></div>
              <p>{{ skillSummary || 'Lv.1–4 三系技能均可选择，Lv.5 自由觉醒主专精。' }}</p>
            </div>
          </div>

          <div class="dossier-actions">
            <button class="preview-action" type="button" :aria-disabled="performing" @click="preview">
              <Play :size="13" :fill="performing ? 'none' : 'currentColor'" aria-hidden="true" />
              {{ performing ? '预览中' : skill ? '预览技能' : '预览动作' }}
            </button>
            <span class="awakening-note">{{ look.awakening }}</span>
          </div>
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
          <span class="roster-number" aria-hidden="true">0{{ i + 1 }}</span>
          <span class="roster-portrait"><SlimePortrait :strain="id" compact /></span>
          <span class="roster-copy"><b>{{ STRAINS[id].name }}</b><span>{{ STRAIN_PRESENTATION[id].label }}</span></span>
          <span class="roster-check" aria-hidden="true"><Check :size="11" :stroke-width="3" /></span>
        </button>
      </div>
    </div>
    <span class="sr-only" role="status">已选择{{ selected.name }}。{{ previewCount ? `已预览${skill?.name || '角色动作'} ${previewCount} 次。${skillSummary || ''}` : '' }}</span>
  </section>
</template>

<style scoped>
.strain-select { min-width: 0; }
.selection-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 16px; }
.selection-heading h3 { margin: 0; color: #e9e7de; font-size: 13px; font-weight: 650; }
.selection-heading > span { color: #85867c; font-size: 11px; }
.character-showcase { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #34372c; border-radius: 10px; overflow: hidden; background: #151610; }
.character-stage { position: relative; min-width: 0; min-height: 350px; overflow: hidden; color: var(--stage-color); background: #111310; }
.stage-caption { position: absolute; top: 23px; right: 24px; left: 24px; z-index: 2; display: flex; align-items: center; justify-content: space-between; color: #969c86; font-size: 9px; letter-spacing: 2px; }
.stage-caption b { color: var(--stage-color); font-size: 13px; font-weight: 500; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.stage-caption i { color: #636b58; font-size: 10px; font-style: normal; }
.chamber-art { position: absolute; inset: 0; width: 100%; height: 100%; }
.stage-light { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 54%, color-mix(in srgb, var(--stage-color) 13%, transparent), transparent 61%); transition: background .25s; pointer-events: none; }
.portrait-entry { position: absolute; width: min(88%, 410px); height: 315px; bottom: 16px; left: 50%; margin-left: max(-44%, -205px); animation: portrait-enter .28s ease-out both; }
.stage-baseline { position: absolute; bottom: 15px; width: 100%; display: flex; gap: 12px; justify-content: center; align-items: center; color: #9ca58c; font-size: 10px; letter-spacing: 3px; }
.stage-baseline span { width: 20px; height: 1px; background: #515b40; }
.character-dossier { min-width: 0; padding: 24px 32px 14px; border-left: 1px solid #303328; background: linear-gradient(120deg, #1c1e16, #151610 80%); }
.dossier-entry { animation: dossier-enter .22s ease-out both; }
.character-epithet { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--strain-color); font-size: 11px; letter-spacing: .8px; }
.character-epithet > span { width: 5px; height: 5px; background: var(--strain-color); transform: rotate(45deg); }
.character-name { margin: 0; color: #f4f1e9; font-size: clamp(28px, 2.7vw, 34px); line-height: 1.2; letter-spacing: -1px; font-weight: 750; }
.character-intro { max-width: 410px; min-height: 36px; margin: 10px 0 0; color: #a8ab9d; font-size: 12px; line-height: 1.8; }
.character-traits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0 14px; padding-bottom: 14px; border-bottom: 1px solid #34372b; }
.character-traits div + div { padding-left: 15px; border-left: 1px solid #34372b; }
.character-traits dd { margin: 0 0 5px; color: var(--strain-color); font-size: 18px; line-height: 1.35; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.character-traits dt { color: #999e8e; font-size: 10px; }
.character-traits .cost dd { color: #c3ac8e; }
.character-skill { display: flex; align-items: flex-start; gap: 12px; }
.skill-key { display: grid; place-items: center; box-sizing: border-box; min-width: 60px; padding: 0 9px; height: 33px; flex: none; white-space: nowrap; margin-top: 2px; color: var(--strain-color); border: 1px solid #555c43; border-bottom-width: 3px; border-radius: 5px; background: #252b1e; font: 600 12px "Segoe UI", sans-serif; letter-spacing: 0.04em; }
.skill-copy { min-width: 0; flex: 1; }
.skill-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.skill-title b { color: #e0e1d5; font-size: 12px; }
.skill-title span { color: #909582; font-size: 10px; }
.skill-copy p { min-height: 38px; margin: 6px 0 0; color: #a7aa9b; font-size: 11px; line-height: 1.75; }
.dossier-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 10px; }
.preview-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 99px; min-height: 32px; padding: 6px 12px; border: 1px solid #4b5340; border-radius: 5px; color: var(--strain-color); background: #23291c; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.preview-action:hover { background: #303a25; border-color: var(--strain-color); }
.preview-action[aria-disabled="true"] { cursor: default; color: #9fa78e; }
.awakening-note { color: #8f9682; font-size: 10px; }
.strain-rules { margin-top: 8px; font-size: 11px; }
.strain-rules summary { display: flex; align-items: center; gap: 4px; width: fit-content; min-height: 24px; color: #a5ab98; list-style: none; cursor: pointer; }
.strain-rules summary::-webkit-details-marker { display: none; }
.strain-rules[open] summary svg { transform: rotate(180deg); }
.strain-rules p { margin: 8px 0 0; color: #b8bcad; line-height: 1.9; }
.strain-rules p b { color: #dedfd5; font-weight: 500; }
.strain-roster { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; background: #34372b; border-top: 1px solid #34372b; }
.strain-option { position: relative; display: flex; align-items: center; gap: 4px; min-width: 0; min-height: 86px; padding: 10px 13px 10px 4px; border: 0; color: #e1e1d5; background: #161812; text-align: left; font-family: inherit; cursor: pointer; transition: background .15s; }
.strain-option::after { position: absolute; content: ''; height: 3px; bottom: 0; left: 0; right: 0; background: var(--option-color); opacity: 0; transition: opacity .15s; }
.strain-option:hover { background: #24271e; }
.strain-option.selected { background: color-mix(in srgb, var(--option-color) 10%, #191c14); }
.strain-option.selected::after { opacity: 1; }
.roster-portrait { flex: none; width: clamp(54px, 5.8vw, 77px); height: 64px; }
.roster-number { position: absolute; top: 9px; left: 11px; color: #686f5f; font-size: 8px; font-variant-numeric: tabular-nums; }
.roster-copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.roster-copy b { font-size: 12px; font-weight: 600; white-space: nowrap; }
.roster-copy > span { color: #939b86; font-size: 10px; white-space: nowrap; }
.selected .roster-copy b { color: var(--option-color); }
.roster-check { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 15px; height: 15px; border-radius: 50%; color: #1b2619; background: var(--option-color); visibility: hidden; }
.selected .roster-check { visibility: visible; }
.strain-option:active { background: #303527; }
.preview-action:active { transform: translateY(1px); }
.strain-option:focus-visible { outline: 2px solid #eed197; outline-offset: -3px; }
.preview-action:focus-visible, .strain-rules summary:focus-visible { outline: 2px solid #eed197; outline-offset: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@keyframes portrait-enter { from { opacity: 0; transform: translateY(7px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes dossier-enter { from { opacity: .3; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (max-width: 1000px) and (min-width: 761px) {
  .character-dossier { padding: 25px 22px 16px; }
  .strain-option { flex-direction: column; justify-content: center; gap: 0; padding: 8px; }
  .roster-portrait { width: 64px; height: 50px; }
  .roster-copy { align-items: center; gap: 4px; }
}
@media (max-height: 800px) and (min-width: 761px) {
  .character-stage { min-height: 320px; }
  .portrait-entry { height: 280px; }
  .character-dossier { padding: 18px 24px 12px; }
  .character-name { font-size: 30px; }
  .character-epithet { margin-bottom: 8px; }
  .character-intro { min-height: 34px; margin-top: 8px; line-height: 1.65; }
  .character-traits { margin: 12px 0; padding-bottom: 12px; }
  .skill-copy p { min-height: 32px; }
  .dossier-actions { margin-top: 8px; }
  .strain-rules { margin-top: 4px; }
  .strain-option { min-height: 78px; padding-top: 6px; padding-bottom: 6px; }
  .roster-portrait { height: 56px; }
}
@media (max-width: 760px) {
  .selection-heading { margin-bottom: 10px; }
  .selection-heading > span { font-size: 10px; }
  .character-showcase { grid-template-columns: minmax(0, 1fr); }
  .character-stage { min-height: 235px; }
  .stage-caption { top: 16px; left: 18px; right: 18px; font-size: 8px; }
  .portrait-entry { width: 295px; height: 236px; bottom: 6px; margin-left: -147.5px; }
  .chamber-art { height: 285px; top: auto; bottom: 0; }
  .stage-baseline { bottom: 10px; font-size: 9px; }
  .strain-roster { grid-row: 2; gap: 1px; }
  .strain-option { min-height: 94px; flex-direction: column; padding: 11px 1px 10px; gap: 2px; }
  .roster-number { display: none; }
  .roster-portrait { width: 56px; height: 45px; }
  .roster-copy { align-items: center; gap: 5px; }
  .roster-copy b { font-size: 10px; }
  .roster-copy > span { font-size: 9px; }
  .roster-check { width: 12px; height: 12px; right: 4px; top: 5px; }
  .roster-check svg { width: 9px; }
  .character-dossier { padding: 22px 22px 16px; border-left: 0; border-top: 1px solid #34372b; }
  .character-name { font-size: 28px; }
  .character-intro { min-height: 0; }
  .character-traits { margin-top: 18px; }
  .preview-action { min-height: 40px; }
  .strain-rules summary { min-height: 36px; }
}
@media (max-width: 370px) {
  .character-dossier { padding: 20px 16px 14px; }
  .roster-copy b { font-size: 9px; }
  .roster-copy > span { font-size: 8px; }
  .roster-portrait { width: 48px; }
  .character-traits dd { font-size: 16px; }
  .character-traits div + div { padding-left: 10px; }
  .awakening-note { font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::after { animation: none !important; transition: none !important; }
}
</style>
