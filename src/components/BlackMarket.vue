<script setup>
import { computed } from 'vue'
import {
  GENES,
  GENE_BRANCHES,
  getChosenOrigin,
  getGenePurchaseState,
} from '../game/GenePool.js'

const props = defineProps({
  drops: { type: Number, required: true },
  genes: { type: Object, required: true },
})
const emit = defineEmits(['buy', 'close'])

const chosenOrigin = computed(() => getChosenOrigin(props.genes))
const branches = computed(() =>
  GENE_BRANCHES.map((branch) => ({
    ...branch,
    nodes: GENES.filter((gene) => gene.branch === branch.id).map((gene) => ({
      ...gene,
      ...getGenePurchaseState(gene, props.genes, props.drops),
    })),
  }))
)

function buttonLabel(gene) {
  if (gene.maxed) return '已满级'
  if (gene.locked) return '未解锁'
  if (!gene.affordable) return `需要 ${gene.cost}`
  return `${gene.level > 0 ? '升级' : '解锁'} · ${gene.cost}`
}
</script>

<template>
  <div class="market-overlay">
    <main class="market-panel" aria-labelledby="market-title">
      <header class="market-header">
        <div>
          <span class="market-kicker">永久基因改造</span>
          <h2 id="market-title">地下城黑市</h2>
        </div>
        <div class="market-actions">
          <div class="market-wallet"><span>战利品</span><b>{{ drops }}</b></div>
          <button class="market-close" title="返回" aria-label="返回" @click="emit('close')">×</button>
        </div>
      </header>

      <div class="origin-status" :class="{ chosen: chosenOrigin }">
        <span>终点原核</span>
        <b>{{ chosenOrigin ? chosenOrigin.name : '尚未选择' }}</b>
        <i>{{ chosenOrigin ? '其他终点已锁定' : '三条路线可交叉投入，终点只能选择一个' }}</i>
      </div>

      <div class="branch-grid">
        <section
          v-for="branch in branches"
          :key="branch.id"
          class="gene-branch"
          :style="{ '--branch-color': branch.color }"
        >
          <header class="branch-header">
            <span class="branch-icon">{{ branch.icon }}</span>
            <div>
              <h3>{{ branch.name }}</h3>
              <p>{{ branch.desc }}</p>
            </div>
          </header>

          <div class="branch-nodes">
            <article
              v-for="gene in branch.nodes"
              :key="gene.id"
              class="gene-node"
              :class="{
                capstone: gene.isCapstone,
                selected: gene.isCapstone && gene.level > 0,
                locked: gene.locked,
                maxed: gene.maxed,
              }"
            >
              <div class="node-rail"><i></i></div>
              <div class="node-head">
                <span class="node-icon">{{ gene.icon }}</span>
                <div class="node-title">
                  <small>{{ gene.isCapstone ? '原核' : `阶段 ${gene.tier}` }}</small>
                  <b>{{ gene.name }}</b>
                </div>
                <span class="node-level">{{ gene.level }}/{{ gene.maxLevel }}</span>
              </div>
              <p>{{ gene.desc }}</p>
              <div v-if="gene.reason" class="node-reason">{{ gene.reason }}</div>
              <button
                class="gene-buy"
                :disabled="!gene.canBuy"
                @click="emit('buy', gene.id)"
              >
                {{ buttonLabel(gene) }}
              </button>
            </article>
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
  padding: 20px;
  background: rgba(6, 8, 7, 0.96);
}

.market-panel {
  width: min(1080px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  padding: 28px 30px 30px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  color: #f2f4ef;
  background: #111512;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.market-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.market-kicker {
  display: block;
  margin-bottom: 3px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.43);
}

.market-header h2 {
  margin: 0;
  font-size: 25px;
  letter-spacing: 0;
  color: #f2e3b8;
}

.market-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.market-wallet {
  display: flex;
  align-items: baseline;
  gap: 8px;
  height: 38px;
  padding: 8px 12px;
  border: 1px solid rgba(214, 166, 66, 0.28);
  border-radius: 6px;
  background: rgba(214, 166, 66, 0.06);
}

.market-wallet span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.market-wallet b {
  min-width: 32px;
  text-align: right;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
  color: #e4c46f;
}

.market-close {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  font-size: 24px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.68);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}

.market-close:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.08);
}

.market-close:active,
.gene-buy:active:not(:disabled) {
  transform: scale(0.97);
}

.market-close:focus-visible,
.gene-buy:focus-visible {
  outline: 2px solid rgba(228, 196, 111, 0.9);
  outline-offset: 3px;
}

.origin-status {
  display: grid;
  grid-template-columns: 96px 150px 1fr;
  align-items: baseline;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}

.origin-status span,
.origin-status i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.44);
}

.origin-status b {
  color: rgba(255, 255, 255, 0.78);
}

.origin-status i {
  text-align: right;
}

.origin-status.chosen b {
  color: #e4c46f;
}

.branch-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}

.gene-branch {
  min-width: 0;
  border-top: 2px solid var(--branch-color);
}

.branch-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 74px;
  padding: 13px 4px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.branch-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--branch-color) 45%, transparent);
  border-radius: 6px;
  font-size: 17px;
  color: var(--branch-color);
  background: color-mix(in srgb, var(--branch-color) 8%, transparent);
}

.branch-header h3 {
  margin: 0 0 3px;
  font-size: 15px;
  letter-spacing: 0;
  color: #f2f4ef;
}

.branch-header p {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.44);
}

.branch-nodes {
  position: relative;
}

.gene-node {
  position: relative;
  min-height: 188px;
  padding: 15px 4px 14px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.node-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.node-rail i {
  position: absolute;
  top: 25px;
  left: -3px;
  width: 7px;
  height: 7px;
  border: 1px solid var(--branch-color);
  border-radius: 50%;
  background: #111512;
}

.gene-node.maxed .node-rail i,
.gene-node.selected .node-rail i {
  background: var(--branch-color);
}

.node-head {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
}

.node-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  font-size: 18px;
}

.node-title {
  min-width: 0;
}

.node-title small {
  display: block;
  margin-bottom: 1px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.38);
}

.node-title b {
  display: block;
  overflow: hidden;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-level {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--branch-color);
}

.gene-node > p {
  min-height: 36px;
  margin: 9px 0 7px;
  font-size: 11px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.52);
}

.node-reason {
  min-height: 17px;
  overflow: hidden;
  font-size: 10px;
  color: rgba(255, 194, 151, 0.66);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gene-buy {
  width: 100%;
  height: 34px;
  margin-top: 8px;
  border: 1px solid color-mix(in srgb, var(--branch-color) 55%, transparent);
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
  color: #111512;
  background: var(--branch-color);
  cursor: pointer;
  transition: filter 0.12s ease, transform 0.12s ease;
}

.gene-buy:hover:not(:disabled) {
  filter: brightness(1.1);
}

.gene-buy:disabled {
  color: rgba(255, 255, 255, 0.35);
  border-color: rgba(255, 255, 255, 0.11);
  background: rgba(255, 255, 255, 0.05);
  cursor: not-allowed;
}

.gene-node.locked {
  opacity: 0.68;
}

.gene-node.capstone {
  background: color-mix(in srgb, var(--branch-color) 4%, transparent);
}

.gene-node.selected {
  box-shadow: inset 3px 0 0 var(--branch-color);
}

@media (max-width: 900px) {
  .market-overlay {
    padding: 10px;
  }

  .market-panel {
    max-height: 96vh;
    padding: 20px 18px;
  }

  .branch-grid {
    grid-template-columns: 1fr;
  }

  .branch-header {
    min-height: 62px;
  }

  .gene-node {
    min-height: 0;
  }
}

@media (max-width: 560px) {
  .market-header {
    align-items: flex-start;
  }

  .market-header h2 {
    font-size: 21px;
  }

  .market-wallet span {
    display: none;
  }

  .origin-status {
    grid-template-columns: 1fr auto;
  }

  .origin-status i {
    grid-column: 1 / 3;
    text-align: left;
  }
}
</style>
