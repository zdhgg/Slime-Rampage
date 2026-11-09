/** Selection state for an origin overload loadout. The innate skill occupies one slot. */
export const ORIGIN_COMBO_CAP = 4
export const ORIGIN_COMBO_INNATE = 'primal_orbit'

export function createOriginComboState() {
  return { main: ORIGIN_COMBO_INNATE, equipped: [ORIGIN_COMBO_INNATE], bag: [], revision: 0 }
}

/** Reconcile older saves and loadouts with the currently known skills. */
export function reconcileOriginCombo(state, knownIds) {
  const known = new Set([ORIGIN_COMBO_INNATE, ...(knownIds || [])])
  const result = state && typeof state === 'object' ? state : createOriginComboState()
  const equipped = [...new Set(Array.isArray(result.equipped) ? result.equipped : [])]
    .filter(id => known.has(id)).slice(0, ORIGIN_COMBO_CAP)
  if (!equipped.length) equipped.push(ORIGIN_COMBO_INNATE)
  result.equipped = equipped
  if (!equipped.includes(result.main)) result.main = equipped[0]
  const allowed = new Set(equipped.filter(id => id !== result.main))
  result.bag = [...new Set(Array.isArray(result.bag) ? result.bag : [])].filter(id => allowed.has(id))
  return result
}

/** Replace the equipped set and select its primary skill. Invalid input is rejected. */
export function setOriginComboLoadout(state, equipped, main, knownIds) {
  const known = new Set([ORIGIN_COMBO_INNATE, ...(knownIds || [])])
  if (!state || !Array.isArray(equipped) || !equipped.length || equipped.length > ORIGIN_COMBO_CAP ||
      new Set(equipped).size !== equipped.length || !equipped.includes(main) ||
      equipped.some(id => !known.has(id))) return false
  state.main = main
  state.equipped = [...equipped]
  state.bag = []
  state.revision = (Number(state.revision) || 0) + 1
  return true
}

/**
 * Draw one eligible auxiliary skill without replacement. Unavailable skills stay
 * in the bag for later; an empty eligible subset does not start a new cycle.
 * Call only when the skill is actually about to execute.
 */
export function drawOriginAuxiliary(state, isEligible, random = Math.random) {
  if (!state || !Array.isArray(state.equipped) || typeof isEligible !== 'function') return null
  const choices = state.equipped.filter(id => id !== state.main)
  if (!choices.length) return null
  if (!Array.isArray(state.bag)) state.bag = []
  state.bag = [...new Set(state.bag)].filter(id => choices.includes(id))
  if (!state.bag.length) {
    state.bag = [...choices]
    for (let i = state.bag.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
      ;[state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]]
    }
  }
  const index = state.bag.findIndex(isEligible)
  if (index < 0) return null
  return state.bag.splice(index, 1)[0]
}
