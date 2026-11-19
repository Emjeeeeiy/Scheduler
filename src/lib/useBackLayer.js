import { useEffect, useRef } from 'react'
import { BACK_RANK, getBackStack } from './backStack.js'

export { BACK_RANK }

/** While `key` is set (anything but null, undefined or false), the phone's Back
    button calls `onBack` instead of leaving the app — see backStack.js. A new
    key is a new layer (the trail uses its length, so each step back is one
    press). Return `false` from `onBack` to refuse: the thing stays open and
    Back keeps its entry.

    `onBack` is read through a ref, for the reason useModalA11y gives for its
    `onClose`: callers pass inline arrows, and a parent re-rendering for an
    unrelated reason must not re-register the layer (which would move it to the
    top of its rank). */
export function useBackLayer(key, onBack, rank = BACK_RANK.tab) {
  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  })

  const active = key !== null && key !== undefined && key !== false
  useEffect(() => {
    if (!active) return undefined
    const stack = getBackStack()
    if (!stack) return undefined
    const id = stack.register(() => onBackRef.current?.(), rank)
    return () => stack.unregister(id)
  }, [active, key, rank])
}
