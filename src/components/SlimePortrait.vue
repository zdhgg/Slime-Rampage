<script setup>
import { computed, useId } from 'vue'
import { STRAIN_PRESENTATION } from './strainPresentation.js'
import { SLIME_BODIES, SLIME_ART, slimeLayerMarkup } from '../game/SlimeAppearance.js'

const ARENA_ORIGIN_BODY = 'M101 246C84 242 79 229 86 210L98 180C106 157 111 137 132 121C147 109 163 113 178 105C192 97 198 83 209 84C220 85 225 98 223 109C244 103 254 118 251 132C270 143 280 163 284 184C289 205 298 217 307 232C318 250 301 258 284 254C270 250 261 253 250 260C234 269 217 261 201 266C182 270 167 259 151 264C130 269 119 256 101 256Z'

const props = defineProps({
  strain: { type: String, default: 'origin' },
  element: { type: String, default: 'fire' },
  compact: Boolean,
  performing: Boolean,
})
const uid = useId().replace(/:/g, '')
const paint = (name) => `url(#${uid}-${name})`
const look = computed(() => STRAIN_PRESENTATION[props.strain] || STRAIN_PRESENTATION.origin)
const body = computed(() => props.strain === 'origin' ? ARENA_ORIGIN_BODY : (SLIME_BODIES[props.strain] || SLIME_BODIES.origin))
const art = computed(() => SLIME_ART[props.strain] || SLIME_ART.origin)
const bodyMarkup = computed(() => slimeLayerMarkup(art.value.body, uid))
const faceMarkup = computed(() => slimeLayerMarkup(art.value.face, uid))
const artV1Src = computed(() => ({
  glutton: '/assets/art/v1/slime-glutton-v1.png',
  ricochet: '/assets/art/v1/slime-ricochet-v1.png',
  elemental: '/assets/art/v1/slime-elemental-v1.png',
  shadow: '/assets/art/v1/slime-shadow-v1.png',
  summoner: '/assets/art/v1/slime-summoner-v1.png',
}[props.strain] || ''))
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
    <g v-if="!compact && !artV1Src" class="ambient-motes" :stroke="look.color" stroke-opacity=".5">
      <circle cx="84" cy="145" r="3" /><circle cx="322" cy="155" r="2" />
      <path d="M300 94v8m-4-4h8M101 91v6m-3-3h6" />
    </g>

    <g v-if="strain === 'elemental' && !compact && !artV1Src" class="element-orbit" :stroke="look.color">
      <ellipse cx="202" cy="173" rx="151" ry="53" transform="rotate(-22 202 173)" stroke-opacity=".3" stroke-dasharray="3 8" />
      <path d="m73 201 9-14 9 14-9 14Z" fill="#91e3e8" stroke="#d2fbff" />
      <path d="m304 103 8-13 9 13-9 13Z" fill="#e1ac6d" stroke="#ffdcaa" />
      <path d="m266 254 6-9 6 9-6 9Z" fill="#bca2fa" stroke="#eee2ff" />
    </g>
    <g v-if="strain === 'ricochet' && !compact && !artV1Src" class="ricochet-shards" :fill="look.color">
      <path d="m73 172 9-7 14 2-11 8Z" opacity=".8" />
      <path d="m307 128 10-8 17 2-12 8Z" opacity=".7" />
      <path d="m306 205 11-8 16 2-12 8Z" opacity=".5" />
      <path d="m57 180 16-8m239-34 16-7" :stroke="look.color" stroke-opacity=".4" />
    </g>

    <image
      v-if="artV1Src"
      class="art-v1-portrait"
      :href="artV1Src"
      x="38"
      y="22"
      width="324"
      height="276"
      preserveAspectRatio="xMidYMid meet"
    />
    <g v-else-if="strain === 'origin'" class="slime-actor origin-actor">
      <path :d="ARENA_ORIGIN_BODY" fill="none" />
      <path :d="ARENA_ORIGIN_BODY" :fill="paint('body')" :stroke="look.dark" stroke-width="5" stroke-linejoin="round" />
      <g :clip-path="paint('clip')">
        <ellipse cx="206" cy="229" rx="112" ry="42" fill="#18362c" opacity=".2" />
        <ellipse cx="197" cy="218" rx="105" ry="51" :fill="paint('belly')" />
        <path d="M82 222C117 243 153 245 190 250C227 255 269 242 309 226L319 248C291 264 264 255 245 264C224 273 205 264 188 268C165 273 148 261 128 264L96 257Z" :fill="look.dark" opacity=".2" />
        <path d="M201 112C194 103 198 92 211 83C215 96 224 103 222 113Q212 121 201 112Z" :fill="look.mid" opacity=".78" />
        <path d="M204 111Q208 100 216 93M209 102Q215 102 219 106" fill="none" :stroke="look.light" stroke-width="1.5" stroke-linecap="round" />
        <ellipse cx="127" cy="202" rx="5" ry="3.5" :fill="look.light" fill-opacity=".14" :stroke="look.light" stroke-opacity=".38" />
        <ellipse cx="263" cy="190" rx="5.5" ry="4" :fill="look.light" fill-opacity=".14" :stroke="look.light" stroke-opacity=".38" />
        <ellipse cx="239" cy="230" rx="3.5" ry="2.5" :fill="look.light" fill-opacity=".14" :stroke="look.light" stroke-opacity=".38" />
        <path d="M111 178C118 142 142 118 171 118C191 118 202 130 220 129C242 127 260 140 274 158C249 147 233 155 216 151C196 146 182 135 163 140C143 144 126 161 111 178Z" :fill="paint('sheen')" />
      </g>
      <path :d="ARENA_ORIGIN_BODY" fill="none" :stroke="paint('rim')" stroke-width="2.1" />
      <path d="M112 160C121 138 139 121 158 117" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" opacity=".56" />
      <g class="slime-face" v-html="faceMarkup" />
    </g>
    <g v-else class="slime-actor">
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
        <g class="element-burst" :stroke="element === 'fire' ? '#ffae70' : element === 'water' ? '#94dbef' : element === 'lightning' ? '#f0d588' : '#a8d886'">
          <path v-if="element === 'lightning'" d="M220 190l35-25-10 22 40-20-12 24 40-18" stroke-width="4" stroke-linejoin="round" />
          <path v-else-if="element === 'water'" d="M242 190h80m-15-12 18 12-18 12" stroke-width="4" stroke-linecap="round" />
          <g v-else-if="element === 'poison'"><ellipse cx="292" cy="232" rx="55" ry="20" fill="#a8d886" fill-opacity=".2" stroke-dasharray="4 7" /><circle cx="278" cy="213" r="12" /><circle cx="305" cy="219" r="16" /></g>
          <g v-else><path d="M237 188h50" stroke-width="6" stroke-linecap="round" /><circle cx="306" cy="188" r="16" fill="#ffae70" fill-opacity=".6" /></g>
        </g>
      </template>
      <template v-else-if="strain === 'summoner'">
        <g class="pet-preview" stroke-linejoin="round">
          <path d="M69 252c-4-14 5-28 23-29 15-1 26 9 25 25-1 14-9 16-25 15-14 1-20-2-23-11Z" fill="#e3b96e" stroke="#674c35" stroke-width="2" />
          <path d="m73 235 11-10 13-2 12 5 7 9-12-3-8 6-10-5Z" fill="#a7804d" stroke="#674c35" stroke-width="1.5" />
          <path d="m84 225 13-2 12 5-12 4-5 6Z" fill="#e8c17b" />
          <ellipse cx="85" cy="247" rx="2.5" ry="3.5" fill="#273b34" /><ellipse cx="100" cy="247" rx="2.5" ry="3.5" fill="#273b34" />
          <path d="M90 253q3 3 6 0" fill="none" stroke="#674c35" stroke-width="1.5" stroke-linecap="round" />
          <path d="M302 230q-7-9-5-22 9 2 12 13 5-13 18-17 0 13-10 23" fill="#83d3bd" stroke="#315e57" stroke-width="2" />
          <path d="M293 247c-1-13 8-23 21-23 14 0 22 9 22 22 0 13-9 18-22 17-14 0-21-5-21-16Z" fill="#83d3bd" stroke="#315e57" stroke-width="2" />
          <path d="m319 214-6 10" fill="none" stroke="#d5fff0" stroke-width="2" stroke-linecap="round" />
          <ellipse cx="307" cy="246" rx="2.5" ry="3.5" fill="#203d3a" /><ellipse cx="322" cy="246" rx="2.5" ry="3.5" fill="#203d3a" />
          <path d="M312 252q3 3 6 0" fill="none" stroke="#315e57" stroke-width="1.5" stroke-linecap="round" />
        </g>
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
.art-v1-portrait { transform-box: fill-box; transform-origin: center bottom; animation: art-v1-breathe 3.8s ease-in-out infinite; }
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
@keyframes art-v1-breathe { 0%, 100% { transform: translateY(0) scale(1, 1); } 50% { transform: translateY(-2px) scale(1.018, .982); } }
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
