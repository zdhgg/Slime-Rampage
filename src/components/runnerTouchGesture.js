// One horizontal swipe commits at most one lane. An upward swipe commits a jump.
// A drag never becomes a held key, and cancelling a gesture cannot leave movement queued after a pause.
export function createRunnerTouchGesture(onAction) {
  let start = null
  const reset = () => { start = null }
  const move = event => {
    if (!start || start.id !== event.pointerId || start.committed) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (event.timeStamp - start.time > 900) { reset(); return }

    // 向上轻扫：触发立体跳跃
    if (dy <= -36 && Math.abs(dy) >= Math.abs(dx) * 1.1) {
      start.committed = true
      onAction('jump')
      return
    }

    // 左右轻扫：触发换道
    if (Math.abs(dx) >= 32 && Math.abs(dx) >= Math.abs(dy) * 1.3) {
      start.committed = true
      onAction(dx > 0 ? 1 : -1)
    }
  }
  return {
    reset,
    begin(event) {
      if (event.pointerType !== 'touch') return false
      if (event.isPrimary === false || start) { reset(); return false }
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, committed: false }
      return true
    },
    move,
    end(event) {
      if (start?.id === event.pointerId) { move(event); reset() }
    },
  }
}
