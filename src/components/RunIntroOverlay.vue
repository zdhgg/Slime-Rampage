<script setup>
defineProps({
  intro: { type: Object, required: true },
})

const emit = defineEmits(['deploy', 'back'])
</script>

<template>
  <div class="briefing-overlay" role="dialog" aria-modal="true" aria-label="战前简报">
    <main class="briefing-shell" :class="[intro.tone, intro.difficulty]">
      <aside class="briefing-index" aria-hidden="true">
        <span>{{ intro.code }}</span>
        <b>{{ intro.mode === 'endless' ? '∞' : intro.mode === 'timed' ? '12' : '01' }}</b>
        <i></i>
      </aside>

      <section class="briefing-content">
        <header>
          <span>{{ intro.location }}</span>
          <em>{{ intro.difficultyName }} · 战利品 ×{{ intro.rewardMultiplier }}</em>
        </header>
        <p class="briefing-mode">{{ intro.modeName }}</p>
        <h2>{{ intro.title }}</h2>
        <p class="briefing-story">{{ intro.story }}</p>

        <div class="briefing-orders">
          <div>
            <span>本局目标</span>
            <strong>{{ intro.objective }}</strong>
          </div>
          <div>
            <span>前线信号</span>
            <strong>{{ intro.signal }}</strong>
          </div>
        </div>

        <p class="threat-report">{{ intro.threatReport }}</p>
        <p v-if="intro.strainNote" class="threat-report">{{ intro.strainNote }}</p>

        <footer>
          <button class="back-btn" @click="emit('back')">返回调整</button>
          <button class="deploy-btn" @click="emit('deploy')">确认出发</button>
        </footer>
      </section>
    </main>
  </div>
</template>

<style scoped>
.briefing-overlay {
  position: absolute;
  inset: 0;
  z-index: 42;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #edf1eb;
  background: rgba(6, 8, 8, 0.97);
}

.briefing-shell {
  --brief-accent: #86ad78;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  width: min(900px, 100%);
  min-height: 510px;
  overflow: hidden;
  border: 1px solid rgba(228, 233, 224, 0.14);
  border-radius: 7px;
  background: #101413;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.42);
}

.briefing-shell.siege { --brief-accent: #b69362; }
.briefing-shell.disaster { --brief-accent: #a5787e; }
.briefing-shell.hard { --brief-accent: #c18c62; }
.briefing-shell.hell { --brief-accent: #c76561; }

.briefing-index {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 31px 28px;
  border-right: 1px solid rgba(228, 233, 224, 0.1);
  color: var(--brief-accent);
  background: #0b0e0d;
}

.briefing-index span,
.briefing-index i {
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0;
}

.briefing-index b {
  font-size: 68px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.briefing-index i {
  width: 36px;
  height: 3px;
  background: var(--brief-accent);
}

.briefing-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 34px 42px 32px;
}

.briefing-content header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  color: rgba(237, 241, 235, 0.46);
  font-size: 11px;
}

.briefing-content header em {
  color: var(--brief-accent);
  font-style: normal;
  font-weight: 700;
}

.briefing-mode {
  margin-top: 54px;
  color: var(--brief-accent);
  font-size: 12px;
  font-weight: 800;
}

.briefing-content h2 {
  margin-top: 8px;
  font-size: 28px;
  line-height: 1.3;
  letter-spacing: 0;
}

.briefing-story {
  max-width: 590px;
  margin-top: 18px;
  color: rgba(237, 241, 235, 0.69);
  font-size: 14px;
  line-height: 1.8;
}

.briefing-orders {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 32px;
  border-top: 1px solid rgba(228, 233, 224, 0.11);
  border-bottom: 1px solid rgba(228, 233, 224, 0.11);
}

.briefing-orders div {
  padding: 15px 0;
}

.briefing-orders div + div {
  padding-left: 22px;
  border-left: 1px solid rgba(228, 233, 224, 0.11);
}

.briefing-orders span,
.briefing-orders strong {
  display: block;
}

.briefing-orders span {
  margin-bottom: 5px;
  color: rgba(237, 241, 235, 0.39);
  font-size: 10px;
}

.briefing-orders strong {
  color: #e8ece6;
  font-size: 13px;
}

.threat-report {
  margin-top: 14px;
  color: rgba(237, 241, 235, 0.5);
  font-size: 11px;
}

.briefing-content footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 28px;
}

.briefing-content button {
  min-height: 42px;
  padding: 0 22px;
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, transform 0.08s ease;
}

.briefing-content button:active { transform: scale(0.98); }
.briefing-content button:focus-visible { outline: 2px solid #d8e6d3; outline-offset: 3px; }
.back-btn { border: 1px solid rgba(237, 241, 235, 0.16); color: rgba(237, 241, 235, 0.68); background: transparent; }
.back-btn:hover { border-color: rgba(237, 241, 235, 0.3); color: #fff; background: rgba(255, 255, 255, 0.04); }
.deploy-btn { border: 1px solid var(--brief-accent); color: #0a0d0c; background: var(--brief-accent); }
.deploy-btn:hover { filter: brightness(1.12); }

@media (max-width: 700px) {
  .briefing-overlay { align-items: stretch; padding: 10px; }
  .briefing-shell { grid-template-columns: 1fr; min-height: 0; max-height: calc(100vh - 20px); overflow-y: auto; }
  .briefing-index { flex-direction: row; align-items: center; min-height: 76px; padding: 18px 20px; border-right: 0; border-bottom: 1px solid rgba(228, 233, 224, 0.1); }
  .briefing-index b { font-size: 34px; }
  .briefing-content { min-height: 500px; padding: 24px 20px 20px; }
  .briefing-content header { flex-direction: column; gap: 5px; }
  .briefing-mode { margin-top: 30px; }
  .briefing-content h2 { font-size: 23px; }
  .briefing-orders { grid-template-columns: 1fr; }
  .briefing-orders div + div { padding-left: 0; border-top: 1px solid rgba(228, 233, 224, 0.11); border-left: 0; }
  .briefing-content footer { flex-direction: column-reverse; }
  .briefing-content button { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .briefing-content button { transition: none; }
}
</style>
