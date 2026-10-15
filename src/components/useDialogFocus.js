import { nextTick, onMounted, onUnmounted } from 'vue'

export function useDialogFocus(element, close) {
  let previous
  function keydown(event) {
    if (event.key === 'Escape') {
      event.stopImmediatePropagation()
      event.preventDefault()
      close()
    }
    if (event.key !== 'Tab') return
    const items = [...(element.value?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') || [])]
      .filter((item) => item.getClientRects().length)
    const first = items[0]
    const last = items[items.length - 1]
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || !element.value.contains(document.activeElement))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !element.value.contains(document.activeElement))) {
      event.preventDefault(); first.focus()
    }
  }
  onMounted(async () => {
    previous = document.activeElement
    window.addEventListener('keydown', keydown, true)
    await nextTick()
    element.value?.querySelector('button, input, select')?.focus()
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', keydown, true)
    previous?.isConnected && previous.focus()
  })
}
