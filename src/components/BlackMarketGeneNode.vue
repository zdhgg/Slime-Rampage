<script setup>
import {
  ArrowRight, Check, Coins, LockKeyhole,
} from 'lucide-vue-next'

const props = defineProps({
  gene: { type: Object, required: true },
  icon: { type: [Object, Function], required: true },
})
const emit = defineEmits(['buy'])
</script>

<template>
  <article
    class="gene-node"
    :data-gene="gene.id"
    :class="{
      capstone: gene.isCapstone,
      contraband: gene.isContraband,
      selected: gene.activated,
      locked: gene.locked,
      maxed: gene.completed,
      available: gene.canBuy,
      exclusive: !!gene.exclusiveOwner && !gene.activated,
    }"
  >
    <div class="node-head">
      <component :is="icon" class="node-icon" :size="22" :stroke-width="1.6" aria-hidden="true" />
      <div class="node-title">
        <small>{{ gene.isCapstone ? '终点原核' : gene.isContraband ? '违禁品' : `阶段 0${gene.tier}` }}</small>
        <h4>{{ gene.name }}</h4>
      </div>
      <div class="node-progress" :aria-label="`${gene.name}，等级 ${gene.level} / ${gene.maxLevel}`">
        <span class="node-level">{{ gene.level }}/{{ gene.maxLevel }}</span>
        <div class="level-marks" aria-hidden="true">
          <i v-for="level in gene.maxLevel" :key="level" :class="{ filled: level <= gene.level }"></i>
        </div>
      </div>
    </div>

    <div class="node-content">
      <div v-if="gene.preview" class="node-preview" :aria-label="`${gene.preview.label}：${gene.preview.current}${gene.preview.next ? `，下一级 ${gene.preview.next}` : '，已满级'}`">
        <span>{{ gene.preview.label }}</span>
        <div>
          <b :class="{ current: !!gene.preview.next }">{{ gene.preview.current }}</b>
          <template v-if="gene.preview.next">
            <ArrowRight :size="15" :stroke-width="1.7" aria-hidden="true" />
            <strong>{{ gene.preview.next }}</strong>
          </template>
        </div>
      </div>
      <p v-if="gene.description" class="node-description">{{ gene.description }}</p>
      <p v-if="gene.downside" class="node-downside">副作用：{{ gene.downside }}</p>
      <p v-if="gene.note" class="node-note">{{ gene.note }}</p>
      <p v-if="gene.scope" class="node-scope">{{ gene.scope }}</p>
      <ul v-if="gene.adaptations?.length" class="node-adaptations">
        <li v-for="adaptation in gene.adaptations" :key="adaptation">{{ adaptation }}</li>
      </ul>
    </div>

    <div class="node-action">
      <p v-if="gene.reason && !gene.completed" :id="`gene-reason-${gene.id}`" class="node-reason">{{ gene.reason }}</p>
      <div class="node-footer">
        <span v-if="gene.completed" class="node-status complete" role="status">
          <Check :size="16" :stroke-width="2" aria-hidden="true" />
          {{ gene.isCapstone ? '已激活' : '已持有' }}
        </span>
        <template v-else-if="gene.locked || gene.exclusiveOwner">
          <span class="node-status">
            <LockKeyhole :size="15" :stroke-width="1.7" aria-hidden="true" />
            {{ gene.exclusiveOwner ? (gene.isContraband ? '暗格互斥' : '原核互斥') : '未解锁' }}
          </span>
          <span v-if="!gene.exclusiveOwner" class="node-cost" :aria-label="`${gene.cost} 战力点`">
            <Coins :size="14" :stroke-width="1.7" aria-hidden="true" />{{ gene.cost }}
          </span>
        </template>
        <button
          v-else
          class="gene-buy"
          :disabled="!gene.canBuy"
          :aria-label="`${gene.affordable ? (gene.level > 0 ? '升级' : '解锁') : '战力点不足'}：${gene.name}，${gene.cost} 战力点`"
          :aria-describedby="gene.reason ? `gene-reason-${gene.id}` : undefined"
          @click="emit('buy', gene.id)"
        >
          <span>{{ !gene.affordable ? '战力点不足' : gene.level > 0 ? '升级基因' : '解锁基因' }}</span>
          <span class="buy-cost"><Coins :size="15" :stroke-width="1.7" aria-hidden="true" />{{ gene.cost }}</span>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.gene-node { display: flex; flex-direction: column; gap: 9px; min-width: 0; padding: 12px 16px 11px; border: 1px solid var(--border, #303c33); border-radius: 8px; background: #1a231d; }
.gene-node.selected { border-color: color-mix(in srgb, var(--branch-color) 62%, #303c33); box-shadow: inset 3px 0 0 var(--branch-color); }
.gene-node.capstone { background: #1e271f; }
.gene-node.contraband { background: #241d1d; border-color: #4a3232; }
.gene-node.contraband.selected { border-color: color-mix(in srgb, var(--branch-color) 62%, #4a3232); }
.gene-node.exclusive { background: #18201b; }
.node-head { display: flex; align-items: center; gap: 10px; }
.node-icon { flex: none; color: var(--secondary, #c4cec6); }
.maxed .node-icon, .selected .node-icon { color: var(--branch-color); }
.contraband .node-icon { color: var(--branch-color); }
.node-title { min-width: 0; }
.node-title small { display: block; margin-bottom: 3px; color: var(--muted, #a2afa6); font-size: 12px; line-height: 1.2; }
.contraband .node-title small { color: var(--branch-color); }
.node-title h4 { margin: 0; font-size: 15px; line-height: 1.4; }
.node-progress { display: grid; justify-items: end; gap: 6px; margin-left: auto; flex: none; }
.node-level { color: var(--secondary, #c4cec6); font-size: 12px; font-variant-numeric: tabular-nums; line-height: 1; }
.level-marks { display: flex; gap: 3px; }
.level-marks i { width: 7px; height: 3px; border-radius: 1px; background: #526156; }
.level-marks i.filled { background: var(--branch-color); }
.node-content { color: var(--secondary, #c4cec6); }
.node-preview { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; line-height: 1.5; }
.node-preview > div { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; font-variant-numeric: tabular-nums; }
.node-preview b, .node-preview strong { color: var(--text, #f0f4f0); font-size: 17px; font-weight: 600; }
.node-preview b.current { color: var(--muted, #a2afa6); font-size: 14px; font-weight: 400; }
.node-preview svg { color: var(--muted, #a2afa6); }
.node-description { margin: 0; color: var(--secondary, #c4cec6); font-size: 13px; line-height: 1.7; }
.node-downside { margin: 5px 0 0; color: #e08d8d; font-size: 12px; line-height: 1.6; }
.node-note, .node-scope { margin: 5px 0 0; color: var(--muted, #a2afa6); font-size: 12px; line-height: 1.6; }
.node-adaptations { display: grid; gap: 3px; margin: 7px 0 0; padding: 0; color: #aab9ad; font-size: 11px; line-height: 1.5; list-style: none; }
.node-adaptations li::before { content: '·'; margin-right: 6px; color: var(--branch-color); }
.node-action { display: grid; gap: 6px; margin-top: auto; }
.node-reason { margin: 0; color: #d9c49a; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.exclusive .node-reason { color: var(--muted, #a2afa6); }
.node-footer { display: flex; align-items: center; justify-content: space-between; min-height: 36px; gap: 8px; }
.node-status, .node-cost { display: inline-flex; align-items: center; gap: 7px; color: var(--muted, #a2afa6); font-size: 12px; }
.node-status.complete { color: #b5d4b3; font-weight: 600; }
.selected .node-status.complete { color: var(--branch-color); }
.node-cost { font-variant-numeric: tabular-nums; }
.gene-buy { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 36px; padding: 7px 11px; border: 1px solid #65745e; border-radius: 5px; color: #eef0d6; background: #35432f; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
.buy-cost { display: inline-flex; align-items: center; gap: 6px; color: #f0d29b; font-variant-numeric: tabular-nums; }
.gene-buy:hover:not(:disabled) { background: #43533b; border-color: #91a07c; }
.gene-buy:disabled { color: var(--muted, #a2afa6); background: #222c25; border-color: #3b493e; cursor: not-allowed; }
.gene-buy:disabled .buy-cost { color: var(--muted, #a2afa6); }
.gene-buy:active:not(:disabled) { transform: scale(0.98); }
.gene-buy:focus-visible { outline: 2px solid var(--gold, #e6c584); outline-offset: 3px; }
.contraband .gene-buy { border-color: #7a5a52; background: #432f2f; }
.contraband .gene-buy:hover:not(:disabled) { background: #533a3a; border-color: #a07d72; }

@media (max-width: 900px) {
  .node-footer, .gene-buy { min-height: 40px; }
  .gene-node { padding: 15px 16px; }
}

@media (max-width: 480px) {
  .gene-node { padding: 13px; }
}

@media (prefers-reduced-motion: reduce) {
  .gene-buy { transition: none; }
  .gene-buy:active:not(:disabled) { transform: none; }
}
</style>
