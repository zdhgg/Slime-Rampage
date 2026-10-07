<script setup>
import { computed, useId } from 'vue'
import { STRAIN_PRESENTATION } from './strainPresentation.js'
import { SLIME_BODIES, SLIME_ART, slimeLayerMarkup } from '../game/SlimeAppearance.js'

const props = defineProps({
  strain: { type: String, default: 'origin' },
  compact: Boolean,
  performing: Boolean,
})
const uid = useId().replace(/:/g, '')
const paint = (name) => `url(#${uid}-${name})`
const look = computed(() => STRAIN_PRESENTATION[props.strain] || STRAIN_PRESENTATION.origin)
const body = computed(() => SLIME_BODIES[props.strain] || SLIME_BODIES.origin)
const art = computed(() => SLIME_ART[props.strain] || SLIME_ART.origin)
const bodyMarkup = computed(() => slimeLayerMarkup(art.value.body, uid))
const faceMarkup = computed(() => slimeLayerMarkup(art.value.face, uid))
</script>

<template>
  <svg
    class="slime-portrait"
    :class="[strain, { compact, performing }]"
    :style="{ '--portrait-color': look.color }"
    :viewBox="compact ? '45 50 310 240' : '0 0 400 320'"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <radialGradient :id="`${uid}-body`" cx=".32" cy=".18" r=".9">
        <stop :stop-color="look.light" />
        <stop offset=".36" :stop-color="look.mid" />
        <stop offset=".78" :stop-color="look.dark" />
        <stop offset="1" :stop-color="look.mid" />
      </radialGradient>
      <linearGradient :id="`${uid}-rim`" x1="0" y1="0" x2=".8" y2="1">
        <stop stop-color="white" stop-opacity=".86" />
        <stop offset=".4" :stop-color="look.light" stop-opacity=".1" />
        <stop offset="1" :stop-color="look.light" stop-opacity=".65" />
      </linearGradient>
      <linearGradient :id="`${uid}-sheen`" x1="0" y1="0" x2=".4" y2="1">
        <stop stop-color="white" stop-opacity=".65" />
        <stop offset="1" stop-color="white" stop-opacity="0" />
      </linearGradient>
      <radialGradient :id="`${uid}-belly`">
        <stop :stop-color="look.color" stop-opacity=".65" />
        <stop offset="1" :stop-color="look.color" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="`${uid}-shadow`">
        <stop stop-color="#000" stop-opacity=".7" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <clipPath :id="`${uid}-clip`"><path :d="body" /></clipPath>
    </defs>

    <ellipse v-if="!compact" cx="200" cy="274" rx="134" ry="25" :fill="paint('shadow')" />
    <g v-if="!compact" class="ambient-motes" :stroke="look.color" stroke-opacity=".5">
      <circle cx="84" cy="145" r="3" /><circle cx="322" cy="155" r="2" />
      <path d="M300 94v8m-4-4h8M101 91v6m-3-3h6" />
    </g>

    <g v-if="strain === 'elemental' && !compact" class="element-orbit" :stroke="look.color">
      <ellipse cx="202" cy="173" rx="151" ry="53" transform="rotate(-22 202 173)" stroke-opacity=".3" stroke-dasharray="3 8" />
      <path d="m73 201 9-14 9 14-9 14Z" fill="#91e3e8" stroke="#d2fbff" />
      <path d="m304 103 8-13 9 13-9 13Z" fill="#e1ac6d" stroke="#ffdcaa" />
      <path d="m266 254 6-9 6 9-6 9Z" fill="#bca2fa" stroke="#eee2ff" />
    </g>
    <g v-if="strain === 'ricochet' && !compact" class="ricochet-shards" :fill="look.color">
      <path d="m73 172 9-7 14 2-11 8Z" opacity=".8" />
      <path d="m307 128 10-8 17 2-12 8Z" opacity=".7" />
      <path d="m306 205 11-8 16 2-12 8Z" opacity=".5" />
      <path d="m57 180 16-8m239-34 16-7" :stroke="look.color" stroke-opacity=".4" />
    </g>

    <g class="slime-actor">
      <g v-if="strain === 'shadow' && !compact" class="shadow-echo">
        <path :d="body" :fill="look.color" opacity=".12" transform="translate(-21 0)" />
        <path :d="body" :fill="look.color" opacity=".06" transform="translate(-42 0)" />
      </g>
      <g v-html="bodyMarkup" />
      <g class="slime-face" v-html="faceMarkup" />
      <g v-if="strain === 'shadow' && performing && !compact" class="portrait-shadow-blade">
        <path d="M263 192C292 172 330 180 380 191C332 196 300 209 265 215Q286 202 263 192Z" fill="#342031" stroke="#f08b9d" stroke-width="2" />
        <path d="M285 187Q332 179 380 191" stroke="#ffe1e6" stroke-width="1.5" />
      </g>
    </g>

    <g v-if="performing && !compact" class="skill-effects" :stroke="look.color">
      <template v-if="strain === 'glutton'">
        <circle class="devour-ring" cx="196" cy="202" r="100" stroke-width="2" />
        <g v-for="n in 6" :key="n" :transform="`rotate(${n * 60} 196 202)`">
          <path class="devour-trail" d="M196 70v32" stroke-width="4" stroke-linecap="round" />
        </g>
      </template>
      <template v-else-if="strain === 'ricochet'">
        <g v-for="n in 4" :key="n" :style="{ '--shot-delay': `${(n - 1) * 120}ms` }">
          <path class="volley-shot" d="M272 170h28m-28 22h28" stroke-width="5" stroke-linecap="round" />
        </g>
      </template>
      <template v-else-if="strain === 'elemental'">
        <circle class="element-burst" cx="200" cy="210" r="40" stroke-width="4" />
        <circle class="element-burst second" cx="200" cy="210" r="40" stroke-width="2" />
      </template>
      <template v-else-if="strain === 'summoner'">
        <g class="pet-preview"><ellipse cx="92" cy="244" rx="24" ry="19" fill="#edc479"/><circle cx="85" cy="244" r="3" fill="#32473e"/><circle cx="99" cy="244" r="3" fill="#32473e"/><path d="m306 226-8-27 18 16 15-16-3 27" fill="#8edacb"/><ellipse cx="314" cy="244" rx="21" ry="17" fill="#8edacb"/><circle cx="308" cy="244" r="3" fill="#32473e"/><circle cx="322" cy="244" r="3" fill="#32473e"/></g>
      </template>
      <template v-else-if="strain === 'shadow'">
        <path class="shadow-path" d="M70 252H324m-12-9 12 9-12 9" stroke-width="1.5" stroke-dasharray="5 7" />
        <path class="shadow-slash" d="m290 175 42 38m-36 2 33-39" stroke-width="3" stroke-linecap="round" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.slime-portrait { display: block; width: 100%; height: 100%; overflow: visible; }
.slime-actor { transform-origin: 200px 262px; animation: slime-breathe 3.8s ease-in-out infinite; }
.glutton .slime-actor { animation-duration: 3s; }
.elemental .slime-actor { animation-name: slime-levitate; }
:deep(.slime-eyes) { transform-origin: 194px 180px; animation: slime-blink 6s infinite; }
:deep(.inner-bubbles) { animation: bubble-drift 4s ease-in-out infinite alternate; }
.ambient-motes { animation: bubble-drift 5s ease-in-out infinite alternate; }
.element-orbit { transform-origin: 202px 173px; animation: orbit-tilt 7s ease-in-out infinite alternate; }
.ricochet-shards { animation: bubble-drift 3s ease-in-out infinite alternate; }
.pet-preview { animation: pet-preview .85s ease-in-out alternate infinite; }
@keyframes pet-preview { to { transform: translateY(-12px); } }
.shadow-echo { opacity: .45; }
.compact :deep(*) { animation: none !important; }
.performing.glutton .slime-actor { animation: slime-gulp 1s ease both; }
.performing.glutton :deep(.glutton-mouth) { transform-origin: 194px 208px; animation: mouth-gulp 1s ease both; }
.performing.ricochet .slime-actor { animation: slime-recoil .12s ease 4; }
.performing.elemental .slime-actor { animation: slime-cast 1s ease both; }
.performing.shadow .slime-actor { animation: slime-strike 1s ease both; }
.portrait-shadow-blade { transform-origin: 265px 202px; animation: shadow-blade 1s ease both; }
.shadow-path { animation: shadow-path 1s ease both; }
.performing.origin .slime-actor { animation: slime-gulp 1s ease both; }
.devour-ring { transform-origin: 196px 202px; animation: devour-in .8s ease-out both; }
.devour-trail { animation: devour-pull .65s ease-in both; }
.volley-shot { animation: volley-out .45s ease-out var(--shot-delay) both; }
.element-burst { transform-origin: 200px 210px; animation: burst-out 1s ease-out both; }
.element-burst.second { animation-delay: .15s; }
.shadow-slash { stroke-dasharray: 120; animation: slash-out 1s ease-out both; }
@keyframes slime-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.025, .975); } }
@keyframes slime-levitate { 0%, 100% { transform: translateY(-2px); } 50% { transform: translateY(-9px) scale(.99, 1.015); } }
@keyframes slime-blink { 0%, 43%, 47%, 100% { transform: scaleY(1); } 45% { transform: scaleY(.08); } }
@keyframes bubble-drift { to { transform: translateY(-6px); } }
@keyframes orbit-tilt { to { transform: rotate(8deg); } }
@keyframes slime-gulp { 25% { transform: scale(1.12, .87); } 52% { transform: scale(.94, 1.09); } 76% { transform: scale(1.03, .97); } }
@keyframes mouth-gulp { 30% { transform: scale(1.2, 1.35); } 65% { transform: scale(.85, .7); } }
@keyframes slime-recoil { 50% { transform: translateX(-7px) scale(.97, 1.02); } }
@keyframes slime-cast { 25% { transform: translateY(-15px) scale(.94, 1.06); } 60% { transform: scale(1.06, .94); } }
@keyframes slime-strike { 0% { transform: translateX(-28px); } 20% { transform: translateX(-38px) scale(.93, 1.04); } 42%, 60% { transform: translateX(36px) scale(1.1, .85); opacity: .5; } 78% { transform: translateX(36px); opacity: 1; } 100% { transform: translateX(0); } }
@keyframes shadow-blade { 0%, 12% { transform: scaleX(.08); opacity: 0; } 22% { transform: scaleX(.35); opacity: 1; } 38%, 53% { transform: scaleX(1); opacity: 1; } 75%, 100% { transform: scaleX(.08); opacity: 0; } }
@keyframes shadow-path { 0% { opacity: 0; } 15%, 40% { opacity: .65; } 70%, 100% { opacity: 0; } }
@keyframes devour-in { from { transform: scale(1.3); opacity: 0; } 25% { opacity: .8; } to { transform: scale(.12); opacity: 0; } }
@keyframes devour-pull { from { transform: translateY(-12px); opacity: 0; } 20% { opacity: 1; } to { transform: translateY(100px); opacity: 0; } }
@keyframes volley-out { from { transform: translateX(-12px); opacity: 0; } 12% { opacity: 1; } to { transform: translateX(92px); opacity: 0; } }
@keyframes burst-out { from { transform: scale(.5); opacity: 1; } to { transform: scale(3.8); opacity: 0; } }
@keyframes slash-out { 0%, 36% { stroke-dashoffset: 120; opacity: 0; } 48% { stroke-dashoffset: 0; opacity: 1; } 78%, 100% { stroke-dashoffset: -120; opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .slime-portrait :deep(*) { animation: none !important; }
  .skill-effects { display: none; }
}
</style>
