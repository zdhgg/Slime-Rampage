<script setup>
import SkillIcon from './SkillIcon.vue'

const props = defineProps({ combo: { type: Object, required: true } })
const emit = defineEmits(['configure'])

const ELEMENT_META = {
  fire: { icon: '🔥', color: '#ff965a' },
  water: { icon: '💧', color: '#6fd8f7' },
  poison: { icon: '☠️', color: '#8ee66a' },
  lightning: { icon: '⚡', color: '#ffe066' },
}

function toggle(id, checked) {
  const equipped = checked ? [...props.combo.equipped, id] : props.combo.equipped.filter(item => item !== id)
  if (!equipped.length || equipped.length > 4) return
  emit('configure', equipped, equipped.includes(props.combo.main) ? props.combo.main : equipped[0])
}
function elementName(id) {
  return props.combo.elements?.find(item => item.id === id)?.name || ''
}
function elementMeta(id) {
  return ELEMENT_META[id] || { icon: '✦', color: '#8cffc8' }
}
function skillChip(skill) {
  return {
    id: skill.cardId || skill.id,
    iconKey: skill.iconKey || (skill.id === 'primal_orbit' ? 'orbit' : 'waves'),
    color: skill.color || '#8cffc8',
    route: 'memory',
    spec: 'origin',
  }
}
function mainSkillName() {
  return props.combo.skills?.find(item => item.id === props.combo.main)?.name || ''
}
</script>
<template>
  <details class="origin-loadout" @keydown.stop @keyup.stop>
    <summary>
      <span class="loadout-title">
        <span class="loadout-orb" aria-hidden="true"></span>
        <span>超载配置</span>
      </span>
      <span class="loadout-meta">
        <b v-if="mainSkillName()" class="loadout-main-pill">{{ mainSkillName() }}</b>
        <em class="loadout-count">{{ combo.equipped.length }}/4</em>
      </span>
    </summary>

    <div class="loadout-body">
      <p class="loadout-hint">
        主技能每次超载必发，协同随机出场；最多装备四项能力。已释放连招保留原配置。
        <span v-if="combo.tripleUnlocked" class="triple-badge">
          三重超载 {{ combo.tripleCount }}/3
          <span class="triple-pips" aria-hidden="true">
            <i v-for="i in 3" :key="i" :class="{ lit: i <= combo.tripleCount }"></i>
          </span>
        </span>
      </p>

      <label class="main-picker">
        <span class="picker-label">核心主技</span>
        <select :value="combo.main" @change="emit('configure', combo.equipped, $event.target.value)">
          <option v-for="skill in combo.skills.filter(item => combo.equipped.includes(item.id))" :key="skill.id" :value="skill.id">{{ skill.name }}</option>
        </select>
      </label>

      <div class="skill-list">
        <label
          v-for="skill in combo.skills"
          :key="skill.id"
          class="skill-row"
          :class="{
            equipped: combo.equipped.includes(skill.id),
            'is-main': skill.id === combo.main,
          }"
          :style="{ '--skill-accent': skill.color || '#8cffc8' }"
        >
          <input
            type="checkbox"
            :checked="combo.equipped.includes(skill.id)"
            :disabled="(combo.equipped.includes(skill.id) && combo.equipped.length === 1) || (!combo.equipped.includes(skill.id) && combo.equipped.length >= 4)"
            @change="toggle(skill.id, $event.target.checked)"
          >
          <span class="skill-icon-wrap">
            <SkillIcon :skill="skillChip(skill)" size="inline" />
          </span>
          <span class="skill-name">
            {{ skill.name }}
            <em v-if="!skill.innate && skill.level > 1" class="skill-lv">Lv.{{ skill.level }}</em>
          </span>
          <small class="role-pill" :class="{ main: skill.id === combo.main, off: !combo.equipped.includes(skill.id) }">
            {{ skill.id === combo.main ? '主技能' : combo.equipped.includes(skill.id) ? '协同候选' : '未装备' }}
          </small>
        </label>
      </div>

      <!-- 元素注入由等级排名派生：主技能第 1 名、协同第 2 名、第三技能第 3 名（只读） -->
      <div v-if="combo.inject?.primary || combo.reactionName" class="inject-box">
        <p v-if="combo.inject?.primary" class="inject-line">
          <span class="inject-tag">注入</span>
          <span class="inject-step" :style="{ '--el-color': elementMeta(combo.inject.primary).color }">
            主 {{ elementMeta(combo.inject.primary).icon }} {{ elementName(combo.inject.primary) }}
          </span>
          <template v-if="combo.inject.secondary && combo.inject.secondary !== combo.inject.primary">
            <span class="inject-sep">·</span>
            <span class="inject-step" :style="{ '--el-color': elementMeta(combo.inject.secondary).color }">
              协同 {{ elementMeta(combo.inject.secondary).icon }} {{ elementName(combo.inject.secondary) }}
            </span>
          </template>
          <template v-if="combo.tripleUnlocked">
            <span class="inject-sep">·</span>
            <span class="inject-step" :style="{ '--el-color': elementMeta(combo.inject.third).color }">
              第三 {{ combo.inject.third ? `${elementMeta(combo.inject.third).icon} ${elementName(combo.inject.third)}` : '（缺第 3 元素）' }}
            </span>
          </template>
        </p>
        <p v-if="combo.reactionName" class="inject-line reaction-line">
          <span class="inject-tag reaction">连招</span>
          <span class="reaction-pill">{{ combo.reactionName }}</span>
          <template v-for="r in combo.secondaryReactions" :key="r.id">
            <span class="inject-sep">·</span>
            <span class="reaction-pill sub">{{ r.name }}</span>
          </template>
        </p>
      </div>
    </div>
  </details>
</template>
<style scoped>
/* z-index 低于升级遮罩(10)：选卡时随战场一起被毛玻璃压暗，不抢三选一焦点 */
.origin-loadout {
  position: absolute;
  bottom: 14px;
  left: 14px;
  z-index: 8;
  width: min(352px, calc(100% - 28px));
  box-sizing: border-box;
  max-height: 48%;
  overflow: auto;
  padding: 0;
  border: 1px solid rgba(124, 240, 206, 0.34);
  border-radius: 14px;
  background: linear-gradient(155deg, rgba(16, 30, 32, 0.92), rgba(11, 20, 24, 0.94));
  color: #e6f6ef;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(160, 255, 224, 0.14);
  backdrop-filter: blur(10px);
}

summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4px;
  list-style: none;
  user-select: none;
}
summary::-webkit-details-marker { display: none; }

.origin-loadout[open] > summary {
  border-bottom: 1px solid rgba(124, 240, 206, 0.16);
  background: linear-gradient(90deg, rgba(90, 209, 200, 0.14), rgba(140, 255, 200, 0.04));
}

.loadout-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #b7ffdf;
}

.loadout-orb {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffffff, #5ad1c8 65%, #1d7f76);
  box-shadow: 0 0 8px rgba(140, 255, 200, 0.8);
}

.loadout-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.loadout-main-pill {
  max-width: 118px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(140, 255, 200, 0.14);
  border: 1px solid rgba(140, 255, 200, 0.32);
  color: #e2fff1;
  font-size: 11px;
  font-weight: 700;
}

.loadout-count {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 800;
  color: #8cffc8;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
}

.loadout-body {
  padding: 10px 14px 12px;
  display: grid;
  gap: 9px;
}

.loadout-hint {
  margin: 0;
  color: rgba(206, 232, 224, 0.72);
  font-size: 11.5px;
  line-height: 1.48;
}

.triple-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 209, 102, 0.14);
  border: 1px solid rgba(255, 209, 102, 0.35);
  color: #ffe394;
  font-weight: 700;
}

.triple-pips {
  display: inline-flex;
  gap: 3px;
}
.triple-pips i {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
}
.triple-pips i.lit {
  background: #ffd166;
  box-shadow: 0 0 6px rgba(255, 209, 102, 0.8);
}

.main-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(140, 255, 200, 0.2);
}

.picker-label {
  font-size: 11.5px;
  font-weight: 800;
  color: #8cffc8;
  white-space: nowrap;
}

select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  color: #ecfff7;
  background: rgba(12, 25, 28, 0.9);
  border: 1px solid rgba(140, 255, 200, 0.32);
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 700;
}

.skill-list {
  display: grid;
  gap: 5px;
}

.skill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.skill-row.equipped {
  border-color: color-mix(in srgb, var(--skill-accent) 34%, transparent);
  background: color-mix(in srgb, var(--skill-accent) 9%, rgba(255, 255, 255, 0.03));
}

.skill-row.is-main {
  border-color: color-mix(in srgb, var(--skill-accent) 72%, transparent);
  background: color-mix(in srgb, var(--skill-accent) 16%, rgba(14, 30, 32, 0.72));
  box-shadow: 0 0 12px color-mix(in srgb, var(--skill-accent) 18%, transparent);
}

.skill-row input[type='checkbox'] {
  accent-color: #5ad1c8;
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
}

.skill-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--skill-accent) 18%, rgba(0, 0, 0, 0.35));
  border: 1px solid color-mix(in srgb, var(--skill-accent) 42%, transparent);
}

.skill-name {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-weight: 700;
  color: #effdf7;
}

.skill-lv {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  color: var(--skill-accent);
}

.role-pill {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  color: #b7ded2;
  background: rgba(255, 255, 255, 0.08);
}

.role-pill.main {
  color: #0e2420;
  background: linear-gradient(90deg, #8cffc8, #5ad1c8);
}

.role-pill.off {
  color: rgba(200, 220, 214, 0.45);
  background: rgba(255, 255, 255, 0.04);
}

.inject-box {
  display: grid;
  gap: 5px;
  padding: 7px 9px;
  border-radius: 9px;
  background: rgba(140, 255, 200, 0.06);
  border: 1px solid rgba(140, 255, 200, 0.2);
}

p.inject-line {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  line-height: 1.45;
  color: #c8f7e4;
}

.inject-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(90, 209, 200, 0.22);
  color: #8cffc8;
  font-size: 10px;
  font-weight: 800;
}

.inject-tag.reaction {
  background: rgba(255, 209, 102, 0.22);
  color: #ffe08a;
}

.inject-step {
  color: var(--el-color, #d6fff0);
  font-weight: 700;
}

.inject-sep {
  opacity: 0.45;
}

.reaction-pill {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 209, 102, 0.16);
  border: 1px solid rgba(255, 209, 102, 0.42);
  color: #ffe69b;
  font-weight: 800;
}

.reaction-pill.sub {
  background: rgba(162, 155, 254, 0.16);
  border-color: rgba(162, 155, 254, 0.4);
  color: #d7d2ff;
}
</style>
