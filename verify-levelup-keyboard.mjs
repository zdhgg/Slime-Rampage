// 升级基因进化选卡键盘操作：默认中位、循环切换、确认触发、鼠标同步、无冲突。
// 运行：node verify-levelup-keyboard.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'

import { defaultCardIndex, digitToIndex, moveCardIndex, resolveCardOptions } from './src/components/useCardFocus.js'

let n = 0
const ok = (message) => console.log(`  ✓ ${++n}. ${message}`)

// ── 1. 默认中位：奇数取正中，偶数取偏左中位，全口径一致 ──
assert.equal(defaultCardIndex(1), 0)
assert.equal(defaultCardIndex(3), 1) // 基因进化 3 卡 → 第 2 张
assert.equal(defaultCardIndex(5), 2) // 五系拟态 5 卡 → 第 3 张
assert.equal(defaultCardIndex(4), 1) // 偶数 → 偏左中位
assert.equal(defaultCardIndex(2), 0)
assert.equal(defaultCardIndex(0), 0)
ok('默认选中中间卡（3 卡→第 2 张、5 卡→第 3 张、偶数取偏左中位）')

// ── 2. 左右循环切换：越界回绕，不会卡在边界 ──
assert.equal(moveCardIndex(1, 3, 1), 2)
assert.equal(moveCardIndex(2, 3, 1), 0) // 右端回绕到首张
assert.equal(moveCardIndex(0, 3, -1), 2) // 左端回绕到末张
assert.equal(moveCardIndex(1, 3, -1), 0)
assert.equal(moveCardIndex(0, 0, 1), 0) // 空卡组安全
ok('←/→ 循环切换（右端回绕首张、左端回绕末张，空卡组安全）')

// ── 3. 数字键切换：1~n 有效、越界与非法键不处理 ──
assert.equal(digitToIndex('Digit1', 3), 0)
assert.equal(digitToIndex('Digit3', 3), 2)
assert.equal(digitToIndex('Digit4', 3), -1) // 超出卡数
assert.equal(digitToIndex('Digit0', 3), -1)
assert.equal(digitToIndex('KeyA', 3), -1)
ok('数字键 1~n 对应卡片下标，越界/非法键不响应')

// ── 3.5 选项源归一化：getter 函数必须被调用，不能 unref 原样返回 ──
// 回归断言：unref(函数) 返回函数本身（.length = 形参数 = 0），
// 键盘处理器 count=0 直接 return → 方向键/Enter/数字键全部失效。
const CARDS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
assert.equal(resolveCardOptions(() => CARDS).length, 3) // getter → 数组
assert.equal(resolveCardOptions(ref(CARDS)).length, 3) // ref → 数组
assert.equal(resolveCardOptions(CARDS).length, 3) // 数组直传兼容
assert.deepEqual(resolveCardOptions(null), []) // 空源安全
ok('选项源归一化：getter/ref/数组都能解出真实卡数（修复 unref 不吃函数的 bug）')

// ── 4. SFC 接线：键盘与鼠标共用同一份 selectedIndex ──
const sfc = readFileSync(new URL('./src/components/LevelUpModal.vue', import.meta.url), 'utf8')
assert.match(sfc, /useCardFocus\(\s*\(\) => props\.options/)
assert.match(sfc, /\$event|@mouseenter="selectedIndex = idx"/) // 鼠标悬停写回同一状态
assert.equal((sfc.match(/@mouseenter="selectedIndex = idx"/g) || []).length, 2) // 3 卡 + 里程碑两面板
assert.match(sfc, /'is-selected': selectedIndex === idx/)
ok('基因进化与里程碑面板共用 useCardFocus，mouseenter 写回同一 selectedIndex（单套状态）')

// ── 5. 可发现快捷键：卡面数字角标 + 底部提示条，无隐藏键 ──
assert.match(sfc, /<kbd class="key-hint" aria-hidden="true">\{\{ idx \+ 1 \}\}<\/kbd>/)
assert.equal((sfc.match(/← → 或数字键切换 · Enter 确认/g) || []).length, 2)
ok('数字键角标与操作提示条已标注在界面上（无隐藏键）')

// ── 6. 键盘选中态有独立样式（糖果卡牌金框发光），鼠标悬停仍有反馈 ──
const selectedRule = sfc.match(/\.skill-card\.is-selected\s*\{([^}]+)\}/)?.[1] || ''
assert.match(selectedRule, /border-color: #F59E0B/)
assert.match(selectedRule, /0 0 28px rgba\(251, 191, 36/)
assert.match(sfc, /\.skill-card:hover/)
ok('键盘选中金框发光与鼠标悬停样式分离')

// ── 7. 无冲突：面板期间引擎暂停、InputManager 挂起放行按键给 UI ──
const input = readFileSync(new URL('./src/game/InputManager.js', import.meta.url), 'utf8')
assert.match(input, /if \(this\.suspended\) return/) // 挂起时不劫持按键
const engine = readFileSync(new URL('./src/game/GameEngine.js', import.meta.url), 'utf8')
assert.match(engine, /this\.input\.suspended = true/) // 暂停 → 挂起输入
const app = readFileSync(new URL('./src/App.vue', import.meta.url), 'utf8')
assert.match(app, /if \(isModalOpen\.value\) return/) // 选卡期间 Esc 保持原样不触发暂停切换
ok('选卡期间引擎暂停 + 输入挂起，方向键/空格不与移动或技能冲突，Esc 行为不变')

// ── 8. 确认键限制：Enter 确认，空格阻止原生点击，数字键只切换 ──
const focus = readFileSync(new URL('./src/components/useCardFocus.js', import.meta.url), 'utf8')
assert.match(focus, /case 'Enter':\s*case 'NumpadEnter': \{\s*e\.preventDefault\(\)\s*if \(e\.repeat\) return[\s\S]*?confirm\(card\)/)
assert.match(focus, /case 'Space':\s*\/\/[^\n]*\s*e\.preventDefault\(\)\s*return/)
assert.equal((focus.match(/\bconfirm\(/g) || []).length, 1)
assert.match(focus, /window\.removeEventListener\('keydown', onKeydown\)/)
ok('仅 Enter 确认且忽略长按，空格拦截原生点击，弹窗卸载时解除监听')

console.log(`\nverify-levelup-keyboard：全部 ${n} 组断言通过 ✅`)
