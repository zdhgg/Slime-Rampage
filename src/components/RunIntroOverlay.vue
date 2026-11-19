<script setup>
import cover from '../assets/playstyles/forest-ruins.webp'
defineProps({
  intro: { type: Object, required: true },
})

const emit = defineEmits(['deploy', 'back'])
</script>

<template>
  <div class="briefing-overlay" role="dialog" aria-modal="true" aria-label="战前简报">
    <main class="briefing-shell" :class="[intro.tone, intro.difficulty]">
      <img class="briefing-cover" :src="cover" alt="" />

      <section class="briefing-content">
        <header>
          <span>{{ intro.location }}</span>
          <em>{{ intro.difficultyName }} · 战力点 ×{{ intro.rewardMultiplier }}</em>
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
  color: var(--adventure-ink);
  background: var(--adventure-scrim);
}

.briefing-shell {
  --brief-accent: var(--adventure-green);
  display: grid;
  grid-template-columns: minmax(185px, 30%) minmax(0, 1fr);
  width: min(900px, 100%);
  min-height: 470px;
  max-height: calc(100dvh - 48px);
  overflow: hidden;
  border: 1px solid var(--adventure-line);
  border-radius: 12px;
  background: var(--adventure-paper);
  box-shadow: var(--adventure-shadow);
}

.briefing-shell.siege { --brief-accent: var(--adventure-gold); }
.briefing-shell.disaster { --brief-accent: #695873; }
.briefing-shell.hard { --brief-accent: #865029; }
.briefing-shell.hell { --brief-accent: var(--adventure-danger); }

.briefing-cover {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  object-position: right center;
}

.briefing-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 29px 34px;
  overflow-y: auto;
}

.briefing-content header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  color: var(--adventure-muted);
  font-size: 11px;
}

.briefing-content header em {
  color: var(--brief-accent);
  font-style: normal;
  font-weight: 700;
}

.briefing-mode {
  margin-top: 32px;
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
  color: var(--adventure-muted);
  font-size: 14px;
  line-height: 1.8;
}

.briefing-orders {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 32px;
  border-top: 1px solid var(--adventure-line);
  border-bottom: 1px solid var(--adventure-line);
}

.briefing-orders div {
  padding: 15px 0;
}

.briefing-orders div + div {
  padding-left: 22px;
  border-left: 1px solid var(--adventure-line);
}

.briefing-orders span,
.briefing-orders strong {
  display: block;
}

.briefing-orders span {
  margin-bottom: 5px;
  color: var(--adventure-muted);
  font-size: 10px;
}

.briefing-orders strong {
  color: var(--adventure-ink);
  font-size: 13px;
}

.threat-report {
  margin-top: 14px;
  color: var(--adventure-muted);
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
.briefing-content button:focus-visible { outline: 2px solid var(--adventure-focus); outline-offset: 3px; }
.back-btn { border: 1px solid var(--adventure-line); color: var(--adventure-muted); background: transparent; }
.back-btn:hover { border-color: #aab7ae; color: var(--adventure-ink); background: var(--adventure-leaf); }
.deploy-btn { border: 1px solid var(--brief-accent); color: #fff; background: var(--brief-accent); }
.deploy-btn:hover { filter: brightness(1.12); }

@media (max-width: 700px) {
  .briefing-overlay { align-items: stretch; padding: 10px; }
  .briefing-shell { grid-template-columns: 1fr; min-height: 0; max-height: calc(100vh - 20px); overflow-y: auto; }
  .briefing-cover { height: 135px; }
  .briefing-content { padding: 20px; overflow: visible; }
  .briefing-content header { flex-direction: column; gap: 5px; }
  .briefing-mode { margin-top: 30px; }
  .briefing-content h2 { font-size: 23px; }
  .briefing-orders { grid-template-columns: 1fr; }
  .briefing-orders div + div { padding-left: 0; border-top: 1px solid var(--adventure-line); border-left: 0; }
  .briefing-content footer { flex-direction: column-reverse; }
  .briefing-content button { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .briefing-content button { transition: none; }
}
</style>
