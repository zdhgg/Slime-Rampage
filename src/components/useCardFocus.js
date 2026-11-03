/**
 * 选卡弹窗键盘焦点管理（升级基因进化 / 里程碑觉醒共用）。
 *
 * 纯函数部分（defaultCardIndex / moveCardIndex / digitToIndex）与 Vue 解耦，
 * 供 verify-levelup-keyboard.mjs 在 Node 下直接断言；useCardFocus 负责
 * window 级 keydown 监听与响应式状态。
 *
 * 交互约定：
 *  - 打开默认选中中间卡：floor((n-1)/2) —— 3 卡取第 2 张、5 卡取第 3 张；
 *    偶数张时取偏左中位（4 卡取第 2 张），所有弹窗口径一致。
 *  - ←/→（及 ↑/↓）循环切换：卡组只有 3~5 张，循环比到边界停住更顺手，
 *    玩家连按右移不会"卡住"，与血统选择 StrainSelect 的循环行为一致。
 *  - Enter / 空格 确认当前选中；数字键 1~9 直选对应卡（卡面有角标提示，非隐藏键）。
 *  - 鼠标 mouseenter 同步写回 selectedIndex —— 鼠标与键盘共用同一份状态，
 *    不会出现"鼠标悬停一套、键盘选中一套"打架。
 */
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'

/** 默认中位下标：奇数取正中，偶数取偏左中位 */
export const defaultCardIndex = (count) => (count > 0 ? Math.floor((count - 1) / 2) : 0)

/** 循环移动：dir = +1 / -1，越界回绕 */
export const moveCardIndex = (index, count, dir) =>
  count > 0 ? (index + dir + count) % count : 0

/** 数字键（Digit1~Digit9 / Numpad1~Numpad9）→ 卡组下标；越界返回 -1 表示不处理 */
export const digitToIndex = (code, count) => {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  if (!match) return -1
  const index = Number(match[1]) - 1
  return index < count ? index : -1
}

/**
 * 选项源归一化：getter 函数显式调用、ref 解包、数组原样返回。
 * 注意不能用 unref 一把梭——unref 只解包 ref，普通函数会原样返回
 * （函数 .length 是形参个数而非卡数），曾导致键盘处理器 count=0 整体失效。
 */
export const resolveCardOptions = (source) =>
  (typeof source === 'function' ? source() : unref(source)) || []

/**
 * @param {import('vue').Ref<Array>|() => Array} optionsSource 卡片选项（数组或返回数组的 getter）
 * @param {(card: object) => void} confirm 确认回调（对选中卡 emit select）
 */
export function useCardFocus(optionsSource, confirm) {
  const options = computed(() => resolveCardOptions(optionsSource))
  const selectedIndex = ref(defaultCardIndex(options.value.length))

  // 选项重铺（新一组卡）时回到默认中位
  watch(options, (list) => { selectedIndex.value = defaultCardIndex(list.length) })

  const selectedCard = computed(() => options.value[selectedIndex.value] || null)

  function onKeydown(e) {
    if (e.defaultPrevented) return
    const count = options.value.length
    if (!count) return
    switch (e.code) {
      case 'ArrowRight':
      case 'ArrowDown':
        selectedIndex.value = moveCardIndex(selectedIndex.value, count, 1)
        e.preventDefault()
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        selectedIndex.value = moveCardIndex(selectedIndex.value, count, -1)
        e.preventDefault()
        return
      case 'Enter':
      case 'NumpadEnter':
      case 'Space': {
        if (e.repeat) return
        const card = selectedCard.value
        if (card) {
          e.preventDefault()
          confirm(card)
        }
        return
      }
      default: {
        if (e.repeat) return
        const index = digitToIndex(e.code, count)
        if (index >= 0) {
          e.preventDefault()
          selectedIndex.value = index
          confirm(options.value[index])
        }
      }
    }
  }

  onMounted(() => {
    // 弹窗打开时移除残留焦点（如 HUD 技能栏），防止其 keydown.prevent 吞掉 Enter/Space
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    window.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return { selectedIndex, selectedCard }
}
