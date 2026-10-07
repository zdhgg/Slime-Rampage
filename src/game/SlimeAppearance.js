// Shared portrait / gameplay artwork, in the selection portrait's 400 × 320 space.
// Keep identity here: renderers only supply motion, expressions and status effects.
export const SLIME_PALETTES = {
  summoner: { color: '#edc479', light: '#fff1cc', mid: '#dca85e', dark: '#715331' },
  origin: { color: '#b7cfaf', light: '#edffe4', mid: '#a7cb86', dark: '#426345' },
  glutton: { color: '#a6e77c', light: '#edffb8', mid: '#97d74f', dark: '#345b23' },
  ricochet: { color: '#78d8e8', light: '#e5fdff', mid: '#64d5e4', dark: '#245772' },
  elemental: { color: '#b6a4ff', light: '#f5eaff', mid: '#b09bea', dark: '#514071' },
  shadow: { color: '#f18b8d', light: '#ffd7d3', mid: '#d96c74', dark: '#542a40' },
}

export const SLIME_BODIES = {
  summoner: 'M86 250C65 231 88 207 95 178C100 158 109 143 119 130L106 95L149 112C175 94 222 94 249 111L288 94L279 136C294 158 295 185 305 210C320 233 328 254 305 261C279 269 260 259 238 264C213 270 193 260 174 266C147 271 135 259 112 262C100 262 91 258 86 250Z',
  origin: 'M91 251C71 241 80 213 90 192C102 164 105 135 136 118C159 104 178 112 193 106C226 93 254 112 271 138C292 169 290 198 310 224C331 250 303 265 274 260C246 258 228 269 202 264C177 257 159 270 139 262C118 255 107 259 91 251Z',
  glutton: 'M65 247C53 230 71 208 82 185C95 157 93 133 116 113C139 94 155 110 173 101C198 88 213 98 228 103C263 95 294 119 305 151C317 183 315 203 336 227C356 253 323 269 293 260C265 273 233 260 209 267C180 273 157 260 130 266C110 269 82 261 65 247Z',
  ricochet: 'M92 251C71 239 89 211 96 190C108 157 112 129 142 112C164 99 189 101 202 94L246 77L233 104C269 113 284 145 289 172C294 200 308 218 316 239C324 260 297 267 269 261C242 259 226 269 202 264C178 257 158 269 137 261C116 255 106 259 92 251Z',
  elemental: 'M98 252C78 240 93 216 103 196C120 164 118 139 140 118C156 102 175 98 187 85C194 77 197 67 201 60C204 82 219 93 240 106C270 125 278 145 282 176C287 203 309 220 310 242C312 264 284 265 264 260C244 268 222 261 201 266C178 260 156 270 135 261C120 257 111 260 98 252Z',
  shadow: 'M90 253C67 239 93 215 99 193C108 160 111 137 139 119C167 100 190 111 209 100C233 87 242 66 261 57C254 78 264 98 274 121C292 149 283 184 300 207L325 244C326 263 299 267 275 260L247 270L218 262L192 268L164 260C139 268 113 259 90 253Z',
}

const path = (d, attrs = {}) => ({ tag: 'path', attrs: { d, ...attrs } })
const ellipse = (cx, cy, rx, ry, attrs = {}) => ({ tag: 'ellipse', attrs: { cx, cy, rx, ry, ...attrs } })
const circle = (cx, cy, r, attrs = {}) => ({ tag: 'circle', attrs: { cx, cy, r, ...attrs } })
const group = (children, attrs = {}) => ({ tag: 'g', attrs, children })
const line = (d, stroke, width, attrs = {}) => path(d, { fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', ...attrs })

function makeBody(id, look) {
  const body = SLIME_BODIES[id]
  const details = []
  if (id === 'summoner') details.push(circle(202, 160, 9, { fill: look.light }), circle(185, 147, 5, { fill: look.light }), circle(199, 141, 5, { fill: look.light }), circle(213, 146, 5, { fill: look.light }))
  if (id === 'ricochet') details.push(line('m116 216 16-16-8-7 20-17m100 49 17-17-7-8 17-18', look.light, 2, { opacity: .45 }))
  if (id === 'elemental') details.push(
    path('m202 191 16 23-16 20-16-20Z', { fill: '#ead8ff', opacity: .3 }),
    path('m202 201 8 13-8 11-8-11Z', { fill: '#fff0ff', opacity: .55 }),
  )
  if (id === 'shadow') details.push(line('m259 107-22 34 22-6-15 29m-118 52 21 20-5 13', look.light, 2, { opacity: .2 }))
  return [
    path(body, { fill: '@body', stroke: look.dark, 'stroke-width': 5 }),
    group([
      ellipse(215, 230, 125, 56, { fill: '#081815', opacity: .24 }),
      ellipse(202, 220, 118, 58, { fill: '@belly' }),
      path('M75 218C106 246 141 245 171 250C220 261 270 237 318 232L316 269H77Z', { fill: look.color, opacity: .2 }),
      path('M111 180C117 137 145 112 182 121C204 126 216 137 234 134C256 130 271 146 277 159C249 147 226 165 205 153C167 132 142 156 111 180Z', { fill: '@sheen' }),
      group([[121, 207, 8], [265, 188, 11], [245, 233, 5], [165, 238, 4], [231, 141, 5]].map(([x,y,r]) =>
        circle(x,y,r, { stroke: look.light, fill: look.color, 'stroke-opacity': .35, 'fill-opacity': .18 })), { class: 'inner-bubbles' }),
      ...details,
    ], { 'clip-path': '@clip' }),
    path(body, { fill: 'none', stroke: '@rim', 'stroke-width': 2.2 }),
    line('M119 150c8-15 18-23 31-26', '#fff', 7, { opacity: .7 }),
    ellipse(164, 119, 5, 3, { fill: '#fff', opacity: .7 }),
    line('M291 227c7 10 4 17-9 19', look.light, 3, { opacity: .55 }),
  ]
}

function makeFace(id, look) {
  if (id === 'glutton') return [
    line('m137 162 30 6m51 0 28-9', '#244021', 6),
    group([
      ellipse(153, 180, 10, 12, { fill: '#152518' }), ellipse(232, 180, 10, 12, { fill: '#152518' }),
      circle(156, 176, 3, { fill: '#f7ffe9' }), circle(235, 176, 3, { fill: '#f7ffe9' }),
    ], { class: 'slime-eyes' }),
    group([
      path('M161 203Q192 193 226 201C227 227 213 239 194 239C174 239 163 226 161 203Z', { fill: '#1d291d', stroke: '#4f792e', 'stroke-width': 3 }),
      path('m169 202 6 13 7-15m27 0 7 13 5-11', { fill: '#f4ffd8' }),
      path('M178 231q15-14 33-1-14 12-33 1', { fill: '#c48379' }),
    ], { class: 'glutton-mouth' }),
  ]
  if (id === 'shadow') return [
    group([
      path('m141 168 34 13-27 8Zm76 13 33-17-6 22Z', { fill: '#2b1c2c' }),
      line('m149 178 19 5-16 1m72-1 18-8-3 9', '#ffe9d3', 3),
    ], { class: 'slime-eyes' }),
    line('m190 210 18-5', '#402434', 4),
  ]
  return [
    group([
      ellipse(157, 180, id === 'ricochet' ? 10 : 11, 15, { fill: '#172c2a' }),
      ellipse(230, 180, id === 'ricochet' ? 10 : 11, 15, { fill: '#172c2a' }),
      circle(160, 175, 3.8, { fill: '#fff' }), circle(233, 175, 3.8, { fill: '#fff' }),
    ], { class: 'slime-eyes' }),
    ...(id === 'ricochet' ? [line('m142 162 28 8m46 0 24-9', '#245361', 4)] : []),
    ...(id === 'elemental' ? [path('m194 143 7-10 7 10-7 8Z', { fill: '#f6e5ff', opacity: .85 })] : []),
    line('M183 206q11 13 23 0', '#233c32', 4),
    ellipse(136, 204, 10, 4, { fill: look.light, opacity: .3 }), ellipse(251, 204, 10, 4, { fill: look.light, opacity: .3 }),
  ]
}

export const SLIME_ART = Object.fromEntries(Object.entries(SLIME_PALETTES).map(([id, look]) =>
  [id, { body: makeBody(id, look), face: makeFace(id, look) }]))

// Only our static artwork is serialized, never user-provided markup.
export function slimeLayerMarkup(layers, uid) {
  return layers.map(({ tag, attrs, children }) => `<${tag} ${Object.entries(attrs).map(([key, value]) =>
    `${key}="${typeof value === 'string' && value.startsWith('@') ? `url(#${uid}-${value.slice(1)})` : value}"`).join(' ')}>${children ? slimeLayerMarkup(children, uid) : ''}</${tag}>`).join('')
}
