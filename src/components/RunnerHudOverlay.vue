<script setup>
import { computed } from 'vue'

const props = defineProps({
  hud: { type: Object, required: true },
})
const emit = defineEmits(['activate-fever'])

const SECTION_MARKERS = [20, 53.33, 83.33, 100]

const progressPercent = computed(() => `${Math.max(0, Math.min(100, (props.hud.progress || 0) * 100))}%`)
const rapidPercent = computed(() => {
  const max = props.hud.rapidMax || 1
  return `${Math.max(0, Math.min(100, ((props.hud.rapid || 0) / max) * 100))}%`
})
const dashPercent = computed(() => {
  const max = props.hud.dash?.maxCooldown || 1
  const cooldown = props.hud.dash?.cooldown || 0
  return `${Math.max(0, Math.min(100, (1 - cooldown / max) * 100))}%`
})
const laneTelemetry = computed(() => props.hud.lanes || [])
const feverActivePercent = computed(() => {
  if (!props.hud.fever?.active) return '0%'
  return `${Math.max(0, Math.min(100, (props.hud.fever.timer / props.hud.fever.duration) * 100))}%`
})
const countdownLabel = computed(() => {
  if (props.hud.state !== 'countdown') return ''
  const value = Math.ceil(props.hud.countdown || 0)
  return value > 0 ? value : '突破'
})

function onFeverClick() {
  if (props.hud.fever?.charges > 0) {
    emit('activate-fever')
  }
}
</script>

<template>
  <div class="runner-hud">
    <section class="vitals" aria-label="突围状态">
      <div class="mode-label">{{ hud.submodeName || '极速突围' }}</div>
      <div class="hp-row" :aria-label="`生命 ${hud.hp} / ${hud.maxHp}`">
        <span
          v-for="index in hud.maxHp"
          :key="index"
          class="hp-cell"
          :class="{ lost: index > hud.hp }"
        />
      </div>
      <div class="shield-row" :aria-label="`防护凝胶 ${hud.shield || 0} / ${hud.maxShield || 3}`">
        <span>防护</span>
        <i
          v-for="index in (hud.maxShield || 3)"
          :key="index"
          :class="{ empty: index > (hud.shield || 0) }"
        />
      </div>
      <div class="boost-row">
        <span>攻击 <b>{{ hud.attack }}</b></span>
        <span v-if="hud.rapid > 0" class="rapid-label">急速 {{ Math.ceil(hud.rapid) }}s</span>
      </div>
      <div v-if="hud.rapid > 0" class="rapid-track" aria-hidden="true">
        <i :style="{ width: rapidPercent }" />
      </div>
      <div class="dash-row" :class="{ ready: !hud.dash?.cooldown, active: hud.dash?.active }">
        <span>急闪</span>
        <div class="dash-track" aria-hidden="true"><i :style="{ width: dashPercent }" /></div>
        <b>{{ hud.dash?.active ? '跃迁' : hud.dash?.cooldown ? `${hud.dash.cooldown.toFixed(1)}s` : '就绪' }}</b>
      </div>
      <!-- 狂热暴走水晶与手动充能池 -->
      <div
        v-if="hud.fever"
        class="fever-module"
        :class="{ active: hud.fever.active, ready: hud.fever.charges > 0 }"
        role="button"
        tabindex="0"
        :aria-label="`暴走能量 ${hud.fever.charges}点`"
        @click="onFeverClick"
      >
        <div class="fever-head">
          <span>狂热暴走</span>
          <b v-if="hud.fever.active" class="fever-active-tag">暴走 {{ Math.ceil(hud.fever.timer) }}s</b>
          <b v-else-if="hud.fever.charges > 0" class="fever-ready-tag">[F] 释放 ({{ hud.fever.charges }}/2)</b>
          <b v-else class="fever-idle-tag">印记 {{ hud.fever.shards }}/3</b>
        </div>
        <div class="fever-crystals">
          <div
            v-for="cIndex in (hud.fever.maxCharges || 2)"
            :key="cIndex"
            class="fever-crystal"
            :class="{
              charged: cIndex <= hud.fever.charges,
              charging: cIndex === hud.fever.charges + 1 && hud.fever.shards > 0
            }"
          >
            <div class="crystal-segments">
              <i
                v-for="sIndex in (hud.fever.shardsPerCharge || 3)"
                :key="sIndex"
                :class="{
                  filled: cIndex <= hud.fever.charges || (cIndex === hud.fever.charges + 1 && sIndex <= hud.fever.shards)
                }"
              />
            </div>
            <span class="crystal-icon">⚡</span>
          </div>
        </div>
        <div v-if="hud.fever.active" class="fever-timer-bar">
          <i :style="{ width: feverActivePercent }" />
        </div>
      </div>
      <!-- 战术即时增益指示器 -->
      <div v-if="hud.buffs && (hud.buffs.bulletTime > 0 || hud.buffs.booster > 0 || hud.buffs.drone > 0)" class="tactical-buffs">
        <div v-if="hud.buffs.bulletTime > 0" class="tactical-chip bullet-time">
          <span>⏳ 时空力场</span>
          <b>{{ hud.buffs.bulletTime.toFixed(1) }}s</b>
        </div>
        <div v-if="hud.buffs.booster > 0" class="tactical-chip booster">
          <span>🚀 超频冲刺</span>
          <b>{{ hud.buffs.booster.toFixed(1) }}s</b>
        </div>
        <div v-if="hud.buffs.drone > 0" class="tactical-chip drone">
          <span>🤖 浮游史莱姆</span>
          <b>{{ Math.ceil(hud.buffs.drone) }}s</b>
        </div>
      </div>
      <div v-if="hud.weapon" class="weapon-core" :style="{ '--weapon-color': hud.weapon.color }">
        <i class="core-mark" aria-hidden="true" />
        <span>{{ hud.weapon.name }}</span>
        <span class="core-level" :aria-label="`流派等级 ${hud.weapon.level} / 3`">
          <i v-for="level in 3" :key="level" :class="{ active: level <= hud.weapon.level }" />
        </span>
      </div>
    </section>

    <section v-if="laneTelemetry.length" class="lane-readout" aria-label="车道风险">
      <div class="lane-readout-head"><span>路线态势</span><em>当前 {{ (hud.lane || 0) + 1 }} 线</em></div>
      <div class="lane-cells">
        <div
          v-for="lane in laneTelemetry"
          :key="lane.lane"
          class="lane-cell"
          :class="[lane.status, { current: lane.lane === hud.lane }]"
        >
          <span>线{{ lane.lane + 1 }}</span>
          <i><b :style="{ width: `${Math.round(lane.risk * 100)}%` }" /></i>
          <em>{{ lane.intent }}</em>
        </div>
      </div>
    </section>

    <section class="route" aria-label="突围进度">
      <div class="route-head">
        <span>{{ hud.section }}</span>
        <strong>{{ hud.timeLabel }}</strong>
        <span>{{ hud.isEndless ? `已行驶 ${hud.distance}m` : `剩余 ${hud.distance}m` }}</span>
      </div>
      <div class="route-track" :class="{ endless: hud.isEndless }">
        <i v-if="!hud.isEndless" :style="{ width: progressPercent }" />
        <i v-else class="endless-bar" />
        <template v-if="!hud.isEndless">
          <span v-for="marker in SECTION_MARKERS" :key="marker" :style="{ left: `${marker}%` }" />
        </template>
      </div>
    </section>

    <section class="score" aria-label="本局得分">
      <span>得分</span>
      <strong>{{ (hud.score || 0).toLocaleString('en-US') }}</strong>
      <em v-if="hud.combo > 1">连破 ×{{ hud.combo }}</em>
      <div v-if="hud.fever?.active" class="fever-badge">⚡ 暴走狂热 ×2 ⚡</div>
    </section>

    <Transition name="countdown">
      <div v-if="countdownLabel" :key="countdownLabel" class="countdown-mark" role="status" aria-live="assertive">
        {{ countdownLabel }}
      </div>
    </Transition>

    <Transition name="fusion">
      <div
        v-if="hud.fusion"
        :key="`${hud.fusion.id}-${hud.fusion.level}`"
        class="fusion-banner"
        :style="{ '--fusion-color': hud.fusion.color }"
        role="status"
        aria-live="assertive"
      >
        <span>{{ hud.fusion.kicker }}</span>
        <strong>{{ hud.fusion.title }}</strong>
        <em>{{ hud.fusion.description }}</em>
        <div aria-hidden="true">
          <i v-for="level in 3" :key="level" :class="{ active: level <= hud.fusion.level }" />
        </div>
      </div>
    </Transition>

    <Transition name="section">
      <div v-if="hud.state === 'active' && hud.sectionNotice > 0 && !hud.weaponNotice && !hud.weaponChoicePending && !hud.fusion" :key="hud.section" class="section-notice" role="status" aria-live="polite">
        <span>阶段 {{ (hud.sectionIndex || 0) + 1 }}</span>
        <strong>{{ hud.section }}</strong>
      </div>
    </Transition>

    <Transition name="section">
      <div v-if="hud.weaponChoicePending" class="weapon-notice choice" role="status" aria-live="assertive">
        <span>主核心变异待融合</span>
        <strong>贯穿 / 爆裂 / 腐蚀 · 三选一</strong>
      </div>
      <div v-else-if="hud.secondaryChoicePending" class="weapon-notice choice secondary" role="status" aria-live="assertive">
        <span>双核流派二次变异</span>
        <strong>雷电 ⚡ / 烈焰 🔥 / 极寒 ❄️ · 穿门融合</strong>
      </div>
      <div v-else-if="hud.weaponNotice && !hud.fusion" :key="hud.weaponNotice" class="weapon-notice" role="status" aria-live="polite">
        <span>武器状态</span>
        <strong>{{ hud.weaponNotice }}</strong>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.runner-hud {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  color: #eef5f2;
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  letter-spacing: 0;
  pointer-events: none;
}

.vitals,
.route,
.score {
  position: absolute;
  top: 20px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

.vitals {
  left: 24px;
  width: 210px;
}

.mode-label {
  margin-bottom: 8px;
  color: rgba(235, 244, 242, 0.72);
  font-size: 12px;
  font-weight: 800;
}

.hp-row {
  display: flex;
  gap: 5px;
  height: 12px;
}

.hp-cell {
  width: 28px;
  height: 8px;
  border: 1px solid rgba(203, 255, 166, 0.7);
  border-radius: 2px;
  background: #83df51;
  box-shadow: 0 0 10px rgba(131, 223, 81, 0.25);
}

.hp-cell.lost {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: none;
}

.shield-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 11px;
  margin-top: 6px;
  color: rgba(211, 243, 242, 0.58);
  font-size: 9px;
  font-weight: 800;
}

.shield-row i {
  width: 18px;
  height: 4px;
  border: 1px solid rgba(129, 229, 224, 0.72);
  border-radius: 1px;
  background: #70d8d3;
  box-shadow: 0 0 8px rgba(112, 216, 211, 0.3);
}

.shield-row i.empty {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: none;
}

.boost-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 9px;
  color: rgba(235, 244, 242, 0.66);
  font-size: 11px;
  font-weight: 700;
}

.boost-row b {
  color: #f4d87c;
  font-size: 13px;
}

.dash-row {
  display: grid;
  grid-template-columns: 24px 1fr 32px;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: rgba(235, 244, 242, 0.52);
  font-size: 9px;
  font-weight: 800;
}

.dash-row b {
  color: rgba(235, 244, 242, 0.45);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.dash-row.ready b {
  color: #8de3d7;
}

.dash-row.active b {
  color: #ffffff;
}

.dash-track {
  height: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
}

.dash-track i {
  display: block;
  height: 100%;
  background: #8de3d7;
  transition: width 0.12s linear;
}

.fever-module {
  margin-top: 9px;
  padding: 6px 8px;
  border-radius: 5px;
  background: rgba(14, 23, 31, 0.72);
  border: 1px solid rgba(255, 209, 102, 0.22);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.fever-module:hover {
  background: rgba(18, 30, 42, 0.85);
}

.fever-module.ready {
  border-color: rgba(255, 209, 102, 0.85);
  box-shadow: 0 0 10px rgba(255, 209, 102, 0.25);
}

.fever-module.active {
  border-color: #ff5500;
  box-shadow: 0 0 14px rgba(255, 85, 0, 0.4);
  animation: fever-module-pulse 0.4s infinite alternate;
}

@keyframes fever-module-pulse {
  from { border-color: #ff5500; }
  to { border-color: #ffd166; }
}

.fever-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 9px;
  font-weight: 800;
  color: rgba(255, 230, 140, 0.75);
}

.fever-idle-tag {
  color: rgba(255, 230, 140, 0.5);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.fever-ready-tag {
  color: #ffd166;
  font-size: 9px;
  font-weight: 900;
  text-shadow: 0 0 8px rgba(255, 209, 102, 0.8);
  animation: fever-tag-pulse 0.6s infinite alternate;
}

@keyframes fever-tag-pulse {
  from { opacity: 0.8; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1.02); }
}

.fever-active-tag {
  color: #ff6b4a;
  font-size: 9px;
  font-weight: 900;
  text-shadow: 0 0 8px rgba(255, 107, 74, 0.8);
}

.fever-crystals {
  display: flex;
  gap: 6px;
  margin-top: 5px;
}

.fever-crystal {
  flex: 1;
  height: 22px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.fever-crystal.charged {
  border-color: #ffd166;
  box-shadow: inset 0 0 8px rgba(255, 209, 102, 0.45);
}

.crystal-segments {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  gap: 2px;
  padding: 2px;
}

.crystal-segments i {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  transition: background 0.15s;
}

.crystal-segments i.filled {
  background: linear-gradient(180deg, #ffd166, #f77f00);
  box-shadow: 0 0 4px rgba(255, 209, 102, 0.6);
}

.crystal-icon {
  position: relative;
  z-index: 2;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

.fever-crystal.charged .crystal-icon {
  color: #ffffff;
  text-shadow: 0 0 6px #ffd166;
}

.fever-timer-bar {
  height: 3px;
  margin-top: 5px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.fever-timer-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ff0055, #ffd166);
  transition: width 0.1s linear;
}

.rapid-label {
  color: #cbb3f0;
}

.rapid-track {
  width: 144px;
  height: 3px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.rapid-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #b99ae8;
  transition: width 0.1s linear;
}

.tactical-buffs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

.tactical-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.tactical-chip.bullet-time {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(110, 231, 183, 0.7);
  color: #a7f3d0;
}

.tactical-chip.booster {
  background: rgba(245, 158, 11, 0.25);
  border-color: rgba(251, 191, 36, 0.7);
  color: #fde68a;
}

.tactical-chip.drone {
  background: rgba(236, 72, 153, 0.25);
  border-color: rgba(244, 114, 182, 0.7);
  color: #fbcfe8;
}

.weapon-core {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: rgba(235, 244, 242, 0.7);
  font-size: 10px;
  font-weight: 800;
}

.weapon-core > .core-mark {
  width: 3px;
  height: 13px;
  border-radius: 1px;
  background: var(--weapon-color);
}

.core-level {
  display: flex;
  gap: 3px;
}

.core-level i {
  width: 13px;
  height: 3px;
  background: rgba(255, 255, 255, 0.15);
}

.core-level i.active {
  background: var(--weapon-color);
  box-shadow: 0 0 7px color-mix(in srgb, var(--weapon-color) 50%, transparent);
}

.route {
  left: 50%;
  width: min(520px, 42vw);
  transform: translateX(-50%);
}

.route-head {
  display: grid;
  grid-template-columns: 1fr 70px 1fr;
  align-items: end;
  margin-bottom: 8px;
  color: rgba(235, 244, 242, 0.62);
  font-size: 11px;
  font-weight: 700;
}

.route-head strong {
  color: #fff4c4;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.route-head span:last-child {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.route-track {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.13);
}

.route-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #83df51;
  box-shadow: 0 0 12px rgba(131, 223, 81, 0.32);
  transition: width 0.1s linear;
}

.route-track.endless .endless-bar {
  width: 100%;
  background: linear-gradient(90deg, #83df51, #79d5e6, #ffd166, #83df51);
  background-size: 200% 100%;
  animation: endless-flow 2.5s linear infinite;
  box-shadow: 0 0 14px rgba(121, 213, 230, 0.5);
}

@keyframes endless-flow {
  0% { background-position: 0% 0%; }
  100% { background-position: 200% 0%; }
}

.route-track span {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border: 1px solid rgba(226, 237, 236, 0.54);
  border-radius: 50%;
  background: #111b24;
  transform: translate(-50%, -50%);
}

.lane-readout {
  position: absolute;
  top: 66px;
  left: 50%;
  width: min(390px, 42vw);
  transform: translateX(-50%);
  color: rgba(235, 244, 242, 0.64);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

.lane-readout-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 9px;
  font-weight: 800;
}

.lane-readout-head em {
  color: rgba(235, 244, 242, 0.42);
  font-style: normal;
}

.lane-cells {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.lane-cell {
  display: grid;
  grid-template-columns: 22px 1fr 25px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 18px;
  padding: 0 5px;
  border-left: 2px solid rgba(255, 255, 255, 0.16);
  background: rgba(7, 15, 22, 0.36);
  font-size: 9px;
  font-weight: 800;
}

.lane-cell.current {
  background: rgba(131, 223, 81, 0.1);
}

.lane-cell.open { border-left-color: #8de3d7; }
.lane-cell.warning { border-left-color: #f0b35f; }
.lane-cell.danger { border-left-color: #df765f; }

.lane-cell > span,
.lane-cell > em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lane-cell > em {
  color: rgba(235, 244, 242, 0.45);
  font-size: 8px;
  font-style: normal;
  text-align: right;
}

.lane-cell.open > em { color: #8de3d7; }
.lane-cell.warning > em { color: #f0b35f; }
.lane-cell.danger > em { color: #df765f; }

.lane-cell > i {
  height: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
}

.lane-cell > i b {
  display: block;
  height: 100%;
  background: currentColor;
}

.lane-cell.open > i b { color: #8de3d7; }
.lane-cell.warning > i b { color: #f0b35f; }
.lane-cell.danger > i b { color: #df765f; }

.score {
  top: 78px;
  right: 24px;
  min-width: 150px;
  text-align: right;
}

.score span {
  display: block;
  color: rgba(235, 244, 242, 0.52);
  font-size: 10px;
  font-weight: 700;
}

.score strong {
  display: block;
  color: #f4d87c;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.score em {
  display: block;
  margin-top: 2px;
  color: #86d8ed;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.fever-badge {
  margin-top: 5px;
  padding: 3px 7px;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff4500, #ffb703);
  box-shadow: 0 0 12px rgba(255, 120, 0, 0.6);
  color: #ffffff;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  animation: fever-badge-pulse 0.5s ease-in-out infinite alternate;
}

@keyframes fever-badge-pulse {
  from { transform: scale(0.96); }
  to { transform: scale(1.05); }
}

.countdown-mark {
  position: absolute;
  left: 50%;
  top: 36%;
  min-width: 160px;
  transform: translate(-50%, -50%);
  color: #fff0aa;
  font-size: clamp(48px, 7.5vh, 72px);
  font-weight: 900;
  line-height: 1;
  text-align: center;
  text-shadow: 0 0 24px rgba(248, 211, 101, 0.35), 0 3px 12px rgba(0, 0, 0, 0.85);
  opacity: 0.92;
}

.fusion-banner {
  position: absolute;
  left: 50%;
  top: 31%;
  display: grid;
  min-width: 280px;
  transform: translate(-50%, -50%);
  color: #eef5f2;
  text-align: center;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.9);
}

.fusion-banner::before,
.fusion-banner::after {
  content: '';
  position: absolute;
  top: 31px;
  width: 72px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--fusion-color));
}

.fusion-banner::before {
  right: calc(100% + 14px);
}

.fusion-banner::after {
  left: calc(100% + 14px);
  transform: scaleX(-1);
}

.fusion-banner > span {
  color: var(--fusion-color);
  font-size: 10px;
  font-weight: 900;
}

.fusion-banner > strong {
  margin-top: 2px;
  color: #f6faf7;
  font-size: 25px;
  line-height: 1.2;
}

.fusion-banner > em {
  margin-top: 3px;
  color: rgba(238, 245, 242, 0.68);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.fusion-banner > div {
  display: flex;
  justify-content: center;
  gap: 5px;
  margin-top: 9px;
}

.fusion-banner > div i {
  width: 30px;
  height: 3px;
  background: rgba(255, 255, 255, 0.16);
}

.fusion-banner > div i.active {
  background: var(--fusion-color);
  box-shadow: 0 0 10px color-mix(in srgb, var(--fusion-color) 50%, transparent);
}

.section-notice {
  position: absolute;
  left: 50%;
  top: 18%;
  display: flex;
  align-items: baseline;
  gap: 10px;
  transform: translateX(-50%);
  padding: 9px 14px;
  border-left: 2px solid #82dff0;
  border-radius: 2px;
  background: rgba(7, 15, 22, 0.72);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.weapon-notice {
  position: absolute;
  left: 50%;
  top: 18%;
  display: flex;
  align-items: baseline;
  gap: 10px;
  transform: translateX(-50%);
  padding: 9px 14px;
  border-left: 2px solid #83df51;
  border-radius: 2px;
  color: #eef5f2;
  background: rgba(7, 15, 22, 0.76);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.weapon-notice.choice {
  border-left-color: #f0b35f;
}

.weapon-notice span {
  color: rgba(238, 245, 242, 0.56);
  font-size: 10px;
  font-weight: 800;
}

.weapon-notice strong {
  font-size: 15px;
}

.section-notice span {
  color: #82dff0;
  font-size: 10px;
  font-weight: 800;
}

.section-notice strong {
  font-size: 16px;
}

.countdown-enter-active,
.countdown-leave-active,
.fusion-enter-active,
.fusion-leave-active,
.section-enter-active,
.section-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.countdown-enter-from,
.countdown-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.12);
}

.section-enter-from,
.section-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

.fusion-enter-from,
.fusion-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.08);
}

@media (max-width: 1050px) {
  .route {
    top: 86px;
    width: min(500px, 56vw);
  }

  .lane-readout {
    top: 132px;
    width: min(390px, 56vw);
  }
}

@media (max-width: 620px) {
  .vitals {
    left: 14px;
    width: 170px;
  }

  .hp-cell {
    width: 22px;
  }

  .score {
    top: 20px;
    right: 14px;
    min-width: 105px;
  }

  .score strong {
    font-size: 18px;
  }

  .route {
    top: 89px;
    width: calc(100vw - 28px);
  }

  .lane-readout {
    top: 135px;
    width: calc(100vw - 28px);
  }

  .lane-cell {
    grid-template-columns: 20px 1fr;
    height: 20px;
  }

  .lane-cell > em {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .countdown-enter-active,
  .countdown-leave-active,
  .fusion-enter-active,
  .fusion-leave-active,
  .section-enter-active,
  .section-leave-active,
  .route-track i,
  .rapid-track i {
    transition: none;
  }
}
</style>
