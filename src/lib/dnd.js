/* Drag-and-drop wire format.
 *
 * Two custom MIME types, not one type carrying a `kind` field. The difference
 * matters: every drop handler in the app already gates on
 * `dataTransfer.types.includes(...)`, so a target opts into what it accepts by
 * which type it names. The inbox never lists DRAG_EVENT, and therefore cannot
 * be handed an event to unschedule — a document that has no inbox to go to.
 * A shared type with a runtime `kind` branch would put that guarantee back in
 * the hands of whoever remembers to write the check.
 *
 * The task type's value is unchanged from when it lived in DayColumn.jsx; only
 * its home moved, since three components import it and none of them owns it.
 */

export const DRAG_TASK = 'application/x-cadence-task'
export const DRAG_EVENT = 'application/x-cadence-event'

/** Read a payload back off a drop, tolerating anything that is not ours. */
export function readDrag(event, type) {
  const raw = event.dataTransfer.getData(type)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function hasDrag(event, type) {
  return event.dataTransfer.types.includes(type)
}
