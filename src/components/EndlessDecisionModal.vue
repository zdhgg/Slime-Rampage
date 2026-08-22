<script setup>
import { computed } from 'vue'

const props = defineProps({
  info: { type: Object, required: true },
})
const emit = defineEmits(['select-calamity', 'select-bounty', 'resolve-checkpoint'])

const isCheckpoint = computed(() => props.info?.kind === 'checkpoint')
const isBounty = computed(() => props.info?.kind === 'bounty')
const fmtMultiplier = (value) => Number(value || 1).toFixed(2)
const bountyTarget = (choice) => {
  if (choice.metric === 'devours') return `吞噬 ${choice.target} 名勇者`
  if (choice.metric === 'eliteKills') return `猎杀 ${choice.target} 名精英`
  return `击杀 ${choice.target} 名敌人`
}
</script>

<template>
  <div class="decision-overlay" role="dialog" aria-modal="true" :aria-label="isCheckpoint ? '无尽撤离抉择' : isBounty ? '深层悬赏选择' : '无尽灾变抉择'">
    <section class="decision-panel" :class="{ checkpoint: isCheckpoint, bounty: isBounty }">
      <header class="decision-header">
        <div class="decision-kicker">第 {{ info.wave }} 波 · 战况冻结</div>
        <h2>{{ isCheckpoint ? '收兵，还是继续深入' : isBounty ? '签下一份深层悬赏' : '选择下一项灾变' }}</h2>
        <p v-if="isCheckpoint">带走全部结算，或用更高倍率押注下一段战场。</p>
        <p v-else-if="isBounty">限时完成战斗契约，换取一次王级秘籍选择。</p>
        <p v-else>灾变立即叠加；更危险的战场会提高本局战利品倍率。</p>
      </header>

      <template v-if="isCheckpoint">
        <div class="checkpoint-ledger">
          <div>
            <span>战斗所得</span>
            <b>{{ info.rawDrops }}</b>
          </div>
          <div class="safe-value">
            <span>现在撤离入账</span>
            <b>{{ info.safeLoot }}</b>
          </div>
          <div class="risk-value">
            <span>此刻战败预计</span>
            <b>{{ info.defeatLoot }}</b>
          </div>
        </div>
        <div class="depth-line">
          <span>当前收益 ×{{ fmtMultiplier(info.currentLootMultiplier) }}</span>
          <strong>继续后 ×{{ fmtMultiplier(info.nextLootMultiplier) }}</strong>
          <span>战败仅保留 70%</span>
        </div>
        <div class="checkpoint-actions">
          <button class="extract-btn" type="button" @click="emit('resolve-checkpoint', 'extract')">
            <span>安全撤离</span>
            <small>完整结算 {{ info.safeLoot }} 战利品</small>
          </button>
          <button class="continue-btn" type="button" @click="emit('resolve-checkpoint', 'continue')">
            <span>继续深入</span>
            <small>下一段收益提升至 ×{{ fmtMultiplier(info.nextLootMultiplier) }}</small>
          </button>
        </div>
      </template>

      <template v-else-if="isBounty">
        <div class="contract-line">本段悬赏只奖励局内成长，不增加素材结算倍率。</div>
        <div class="calamity-grid bounty-grid">
          <button
            v-for="choice in info.choices"
            :key="choice.id"
            class="calamity-option bounty-option"
            type="button"
            @click="emit('select-bounty', choice.id)"
          >
            <span class="calamity-topline">
              <i>{{ choice.mark }}</i>
              <em>{{ choice.duration }} 秒</em>
            </span>
            <strong>{{ choice.name }}</strong>
            <span class="calamity-effect">{{ bountyTarget(choice) }}</span>
            <span class="calamity-brief">{{ choice.brief }}</span>
            <span class="calamity-reward">奖励 <b>{{ choice.reward }}</b></span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="multiplier-line">
          当前战利品倍率 <b>×{{ fmtMultiplier(info.currentLootMultiplier) }}</b>
        </div>
        <div class="calamity-grid">
          <button
            v-for="choice in info.choices"
            :key="choice.id"
            class="calamity-option"
            type="button"
            @click="emit('select-calamity', choice.id)"
          >
            <span class="calamity-topline">
              <i>{{ choice.mark }}</i>
              <em>等级 {{ choice.nextLevel }}</em>
            </span>
            <strong>{{ choice.name }}</strong>
            <span class="calamity-effect">{{ choice.effect }}</span>
            <span class="calamity-brief">{{ choice.brief }}</span>
            <span class="calamity-reward">
              选择后收益 <b>×{{ fmtMultiplier(choice.lootMultiplier) }}</b>
            </span>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.decision-overlay {
  position: absolute;
  inset: 0;
  z-index: 24;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(4, 6, 7, 0.8);
}

.decision-panel {
  width: min(820px, calc(100vw - 36px));
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  padding: 26px;
  border: 1px solid rgba(199, 84, 72, 0.55);
  border-radius: 8px;
  color: #f1eee5;
  background: #121416;
  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.62);
}

.decision-panel.checkpoint {
  max-width: 700px;
  border-color: rgba(101, 170, 126, 0.54);
}

.decision-panel.bounty {
  border-color: rgba(190, 154, 104, 0.58);
}

.decision-header {
  text-align: center;
}

.decision-kicker {
  margin-bottom: 7px;
  color: #be9a68;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.decision-header h2 {
  margin: 0;
  color: #fff8e9;
  font-size: 25px;
  line-height: 1.2;
  letter-spacing: 0;
}

.decision-header p {
  margin: 9px 0 0;
  color: rgba(241, 238, 229, 0.62);
  font-size: 13px;
  line-height: 1.5;
}

.multiplier-line {
  margin: 20px 0 12px;
  color: rgba(241, 238, 229, 0.58);
  font-size: 12px;
  text-align: center;
}

.contract-line {
  margin: 20px 0 12px;
  color: rgba(241, 238, 229, 0.54);
  font-size: 12px;
  text-align: center;
}

.multiplier-line b,
.calamity-reward b {
  color: #e8c477;
  font-variant-numeric: tabular-nums;
}

.calamity-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.calamity-option {
  min-height: 224px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 7px;
  color: inherit;
  text-align: left;
  background: #191c1f;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.12s ease;
}

.calamity-option:hover {
  border-color: rgba(220, 109, 93, 0.76);
  background: #211b1b;
}

.bounty-option:hover {
  border-color: rgba(190, 154, 104, 0.78);
  background: #211e19;
}

.bounty-option .calamity-topline i {
  border-color: rgba(190, 154, 104, 0.56);
  color: #e8c477;
}

.bounty-option .calamity-effect {
  color: #e8c477;
}

.calamity-option:active,
.checkpoint-actions button:active {
  transform: scale(0.98);
}

.calamity-option:focus-visible,
.checkpoint-actions button:focus-visible {
  outline: 2px solid #e8c477;
  outline-offset: 3px;
}

.calamity-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.calamity-topline i {
  display: grid;
  width: 34px;
  height: 28px;
  place-items: center;
  border: 1px solid rgba(220, 109, 93, 0.52);
  border-radius: 5px;
  color: #ef998c;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.calamity-topline em {
  color: rgba(241, 238, 229, 0.46);
  font-size: 11px;
  font-style: normal;
}

.calamity-option > strong {
  display: block;
  margin-bottom: 8px;
  color: #fff8e9;
  font-size: 17px;
  letter-spacing: 0;
}

.calamity-effect,
.calamity-brief,
.calamity-reward {
  display: block;
}

.calamity-effect {
  min-height: 38px;
  color: #ef998c;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
}

.calamity-brief {
  min-height: 46px;
  margin-top: 7px;
  color: rgba(241, 238, 229, 0.52);
  font-size: 12px;
  line-height: 1.5;
}

.calamity-reward {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(241, 238, 229, 0.68);
  font-size: 12px;
}

.checkpoint-ledger {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.11);
  border-bottom: 1px solid rgba(255, 255, 255, 0.11);
}

.checkpoint-ledger > div {
  padding: 16px 10px;
  text-align: center;
}

.checkpoint-ledger > div + div {
  border-left: 1px solid rgba(255, 255, 255, 0.09);
}

.checkpoint-ledger span {
  display: block;
  margin-bottom: 6px;
  color: rgba(241, 238, 229, 0.48);
  font-size: 11px;
}

.checkpoint-ledger b {
  color: #e8c477;
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.checkpoint-ledger .safe-value b {
  color: #9dddaf;
}

.checkpoint-ledger .risk-value b {
  color: #ef998c;
}

.depth-line {
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 14px 0 16px;
  color: rgba(241, 238, 229, 0.5);
  font-size: 12px;
}

.depth-line strong {
  color: #e8c477;
}

.checkpoint-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.checkpoint-actions button {
  min-height: 76px;
  padding: 12px 16px;
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.12s ease;
}

.checkpoint-actions span,
.checkpoint-actions small {
  display: block;
}

.checkpoint-actions span {
  font-size: 16px;
  font-weight: 900;
}

.checkpoint-actions small {
  margin-top: 5px;
  font-size: 11px;
}

.extract-btn {
  border: 1px solid rgba(101, 170, 126, 0.65);
  color: #b9ebc7;
  background: #18211b;
}

.extract-btn small {
  color: rgba(185, 235, 199, 0.58);
}

.extract-btn:hover {
  background: #1c2b21;
}

.continue-btn {
  border: 1px solid rgba(199, 84, 72, 0.65);
  color: #f2a094;
  background: #251918;
}

.continue-btn small {
  color: rgba(242, 160, 148, 0.6);
}

.continue-btn:hover {
  background: #311c1a;
}

@media (max-width: 700px) {
  .decision-panel {
    width: min(100%, 520px);
    padding: 20px 16px;
  }

  .calamity-grid,
  .checkpoint-actions {
    grid-template-columns: 1fr;
  }

  .calamity-option {
    min-height: 0;
  }

  .calamity-effect,
  .calamity-brief {
    min-height: 0;
  }

  .depth-line {
    flex-wrap: wrap;
    gap: 6px 14px;
  }
}
</style>
