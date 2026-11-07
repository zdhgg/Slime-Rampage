<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  BookOpen, Coins, Crosshair, Diamond, Dices, Droplets, Egg, Expand, Eye,
  FlaskConical, Flame, Gauge, Gem, HeartPulse, Layers, Magnet, Maximize2,
  Package, RefreshCw, Shield, Sword, Syringe, Target, TestTube, Waves, Wind, X, Zap,
} from 'lucide-vue-next'
import { GENES, GENE_BRANCHES, getChosenOrigin, getGenePurchaseState } from '../game/GenePool.js'
import { getGenePresentation } from './blackMarketPresentation.js'
import BlackMarketGeneNode from './BlackMarketGeneNode.vue'

const props = defineProps({
  drops: { type: Number, required: true },
  genes: { type: Object, required: true },
})
const emit = defineEmits(['buy', 'close'])

const BRANCH_ICONS = { flesh: HeartPulse, arms: Crosshair, supply: Package, contraband: FlaskConical }
const GENE_ICONS = {
  giant: Maximize2, thorns: Shield, regen: HeartPulse, siphon: Waves, leech: Droplets,
  cocoon: Egg, gorged_origin: Diamond,
  razor: Sword, rapid: Zap, hunt: Gauge, hunter: Target, fury: Flame, arsenal_origin: Diamond,
  lore: BookOpen, swift: Wind, expand: Expand, blueprint: RefreshCw, magnet: Magnet,
  horizon: Layers, flux_origin: Diamond,
  stim: Syringe, serum: TestTube, greed: Eye, glass: Gem, dicer: Dices,
}
const chosenOrigin = computed(() => getChosenOrigin(props.genes))
const activeBranch = ref(chosenOrigin.value?.branch || GENE_BRANCHES[0].id)
const marketBody = ref(null)
const marketPanel = ref(null)
const closeButton = ref(null)
let previousFocus = null

const branches = computed(() =>
  GENE_BRANCHES.map((branch) => ({
    ...branch,
    nodes: GENES.filter(gene => gene.branch === branch.id).map(gene => {
      const state = getGenePurchaseState(gene, props.genes, props.drops)
      const activated = gene.isCapstone && chosenOrigin.value?.id === gene.id
      return {
        ...gene, ...state, ...getGenePresentation(gene, state.level), activated,
        completed: state.maxed && (!gene.isCapstone || activated),
      }
    }),
  }))
)

// 通用货架是黑市主区；违禁品收进底部「暗格」，与货架分开展示。
const shelves = computed(() => branches.value.filter(branch => branch.layout !== 'strip'))
const contrabandBranch = computed(() => branches.value.find(branch => branch.layout === 'strip'))

function selectBranch(id) {
  activeBranch.value = id
  if (marketBody.value) marketBody.value.scrollTop = 0
}

function onTabKeydown(event, index) {
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % shelves.value.length
  else if (event.key === 'ArrowLeft') next = (index + shelves.value.length - 1) % shelves.value.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = shelves.value.length - 1
  else return
  event.preventDefault()
  selectBranch(shelves.value[next].id)
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus()
}

function keepFocusInside(event) {
  const controls = [...marketPanel.value.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), [tabindex="0"]')]
    .filter(element => element.getClientRects().length > 0)
  const index = controls.indexOf(document.activeElement)
  const next = event.shiftKey
    ? (index <= 0 ? controls.length - 1 : index - 1)
    : (index + 1) % controls.length
  controls[next]?.focus()
}

onMounted(() => {
  previousFocus = document.activeElement
  closeButton.value?.focus({ preventScroll: true })
})

onUnmounted(() => {
  nextTick(() => {
    const target = previousFocus?.isConnected ? previousFocus : document.querySelector('.market-link')
    target?.focus({ preventScroll: true })
  })
})
</script>

<template>
  <div class="market-overlay" @keydown.tab.prevent="keepFocusInside">
    <main ref="marketPanel" class="market-panel" role="dialog" aria-modal="true" aria-labelledby="market-title">
      <header class="market-header">
        <div class="market-heading">
          <span class="market-kicker">主战场 · 永久基因改造</span>
          <h2 id="market-title">地下城黑市</h2>
        </div>
        <div class="market-actions">
          <div class="market-wallet" aria-live="polite" aria-atomic="true">
            <Coins :size="18" :stroke-width="1.7" aria-hidden="true" />
            <span>战力点</span><b>{{ drops }}</b>
          </div>
          <button ref="closeButton" class="market-close" title="返回" aria-label="返回" @click="emit('close')">
            <X :size="20" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="origin-status" :class="{ chosen: chosenOrigin }">
        <Diamond :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ chosenOrigin ? '已激活原核' : '终点原核' }}</span>
        <b>{{ chosenOrigin ? chosenOrigin.name : '尚未选择' }}</b>
        <p>{{ chosenOrigin ? '其他基础基因仍可升级，原核不可兼得。' : '基础基因可跨货架升级，终点原核只能选择一个。' }}</p>
      </div>

      <div class="branch-tabs" role="tablist" aria-label="基因货架">
        <button
          v-for="(branch, index) in shelves"
          :id="`branch-tab-${branch.id}`"
          :key="branch.id"
          type="button"
          role="tab"
          :aria-selected="activeBranch === branch.id"
          :aria-controls="`branch-${branch.id}`"
          :tabindex="activeBranch === branch.id ? 0 : -1"
          :style="{ '--branch-color': branch.color }"
          @click="selectBranch(branch.id)"
          @keydown="onTabKeydown($event, index)"
        >
          <component :is="BRANCH_ICONS[branch.id]" :size="17" :stroke-width="1.7" aria-hidden="true" />
          {{ branch.name }}
        </button>
      </div>

      <div ref="marketBody" class="market-body" tabindex="0" aria-label="基因货架与升级">
        <div class="branch-grid">
          <section
            v-for="branch in shelves"
            :id="`branch-${branch.id}`"
            :key="branch.id"
            class="gene-branch"
            :class="{ active: activeBranch === branch.id }"
            :style="{ '--branch-color': branch.color }"
            :aria-labelledby="`branch-title-${branch.id}`"
          >
            <header class="branch-header">
              <span class="branch-icon">
                <component :is="BRANCH_ICONS[branch.id]" :size="24" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h3 :id="`branch-title-${branch.id}`">{{ branch.name }}</h3>
                <p>{{ branch.desc }}</p>
              </div>
            </header>

            <BlackMarketGeneNode
              v-for="gene in branch.nodes"
              :key="gene.id"
              :gene="gene"
              :icon="GENE_ICONS[gene.id]"
              @buy="emit('buy', $event)"
            />
          </section>
        </div>

        <section
          v-if="contrabandBranch"
          class="contraband-section"
          :style="{ '--branch-color': contrabandBranch.color }"
          :aria-labelledby="`branch-title-${contrabandBranch.id}`"
        >
          <header class="branch-header contraband-header">
            <span class="branch-icon">
              <component :is="BRANCH_ICONS[contrabandBranch.id]" :size="24" :stroke-width="1.6" aria-hidden="true" />
            </span>
            <div>
              <h3 :id="`branch-title-${contrabandBranch.id}`">{{ contrabandBranch.name }}</h3>
              <p>{{ contrabandBranch.desc }}</p>
            </div>
          </header>
          <div class="contraband-grid">
            <BlackMarketGeneNode
              v-for="gene in contrabandBranch.nodes"
              :key="gene.id"
              :gene="gene"
              :icon="GENE_ICONS[gene.id]"
              @buy="emit('buy', $event)"
            />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.market-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(5, 9, 7, 0.96);
}

.market-panel {
  --text: #f0f4f0;
  --secondary: #c4cec6;
  --muted: #a2afa6;
  --border: #303c33;
  --gold: #e6c584;
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  overflow: hidden;
  border: 1px solid #364137;
  border-radius: 12px;
  color: var(--text);
  background: #111813;
  color-scheme: dark;
  box-shadow: 0 24px 72px #0006;
}

.market-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 26px 14px; }
.market-kicker { display: block; margin-bottom: 5px; color: var(--muted); font-size: 12px; }
.market-header h2 { margin: 0; color: #f1dfb9; font-size: 26px; line-height: 1.25; }
.market-actions { display: flex; align-items: center; gap: 10px; }
.market-wallet { display: flex; align-items: center; gap: 9px; min-height: 42px; padding: 0 14px; border: 1px solid #554a30; border-radius: 7px; color: var(--gold); background: #24251a; }
.market-wallet span { color: #d3c7ab; font-size: 12px; }
.market-wallet b { font-size: 20px; font-variant-numeric: tabular-nums; }
.market-close { display: grid; place-items: center; flex: none; width: 42px; height: 42px; padding: 0; border: 1px solid #475449; border-radius: 7px; color: var(--secondary); background: #1c261f; cursor: pointer; }
.market-close:hover { color: #fff; background: #29362c; }
.market-close, .branch-tabs button { transition: background-color 120ms ease, border-color 120ms ease; }
.market-close:active { transform: scale(0.98); }
.market-close:focus-visible, .branch-tabs button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }

.origin-status { display: flex; flex: none; align-items: center; gap: 9px; margin: 0 26px; padding: 10px 0; border-block: 1px solid var(--border); color: var(--muted); font-size: 12px; line-height: 1.5; }
.origin-status > svg { flex: none; }
.origin-status b { color: var(--secondary); font-weight: 600; }
.origin-status.chosen > svg, .origin-status.chosen b { color: var(--gold); }
.origin-status p { margin: 0 0 0 auto; }
.branch-tabs { display: none; }

.market-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 14px 22px 18px 26px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: #55645a #111813; }
.market-body:focus-visible { outline: 2px solid var(--gold); outline-offset: -3px; }
.market-body::-webkit-scrollbar { width: 7px; }
.market-body::-webkit-scrollbar-track { background: #111813; }
.market-body::-webkit-scrollbar-thumb { background: #55645a; border: 2px solid #111813; border-radius: 5px; }
.branch-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 18px; }
.gene-branch { display: grid; grid-template-rows: auto repeat(6, 1fr) auto; gap: 10px; min-width: 0; }
@supports (grid-template-rows: subgrid) {
  .gene-branch { grid-template-rows: subgrid; grid-row: span 8; }
}
.branch-header { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 1px 2px 8px; border-bottom: 2px solid color-mix(in srgb, var(--branch-color) 65%, #303c33); }
.branch-icon { display: grid; place-items: center; width: 34px; flex: none; color: var(--branch-color); }
.branch-header h3 { margin: 0 0 4px; font-size: 17px; line-height: 1.3; }
.branch-header p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }

.contraband-section { margin-top: 18px; padding-top: 14px; border-top: 1px dashed #4a3232; }
.contraband-header { border-bottom-color: color-mix(in srgb, var(--branch-color) 55%, #303c33); border-bottom-style: dashed; }
.contraband-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 18px; margin-top: 10px; }

@media (max-width: 900px) {
  .market-overlay { padding: 14px; }
  .market-panel { max-height: calc(100vh - 28px); max-height: calc(100dvh - 28px); }
  .market-header { padding: 18px 20px 15px; }
  .origin-status { margin-inline: 20px; flex-wrap: wrap; }
  .origin-status p { flex-basis: 100%; margin: 0; }
  .branch-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: none; gap: 8px; padding: 14px 20px 0; }
  .branch-tabs button { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px; padding: 8px 5px; border: 1px solid transparent; border-bottom: 2px solid #364339; border-radius: 5px 5px 0 0; color: var(--secondary); background: transparent; font: inherit; font-size: 13px; cursor: pointer; }
  .branch-tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--branch-color); background: #222e25; }
  .branch-tabs button[aria-selected="true"] svg { color: var(--branch-color); }
  .branch-tabs button:hover { background: #253128; }
  .market-body { padding: 16px 16px 20px 20px; }
  .branch-grid { grid-template-columns: minmax(0, 1fr); }
  .gene-branch { grid-row: auto; grid-template-rows: none; gap: 12px; }
  .gene-branch:not(.active) { display: none; }
  .branch-header { border-bottom: 0; padding-bottom: 3px; }
  .contraband-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 480px) {
  .market-overlay { padding: 8px; }
  .market-panel { border-radius: 9px; max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
  .market-header { flex-wrap: wrap; padding: 16px 15px 13px; gap: 10px; }
  .market-kicker { font-size: 12px; }
  .market-header h2 { font-size: 23px; }
  .market-actions { gap: 7px; margin-left: auto; }
  .market-wallet { gap: 6px; padding-inline: 9px; min-height: 40px; }
  .market-wallet span { display: none; }
  .market-wallet b { font-size: 18px; }
  .market-close { width: 40px; height: 40px; }
  .origin-status { margin-inline: 15px; gap: 6px 8px; padding-block: 10px; }
  .branch-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 15px 0; gap: 5px; }
  .branch-tabs button { gap: 3px; padding-inline: 2px; font-size: 11px; }
  .branch-tabs button svg { width: 14px; height: 14px; }
  .market-body { padding: 13px 11px 16px 15px; }
  .branch-header { gap: 9px; }
  .branch-header h3 { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .market-close, .branch-tabs button { transition: none; }
  .market-close:active { transform: none; }
}
</style>
