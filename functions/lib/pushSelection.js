/* Which notifications to actually push, given what's already been pushed.
 *
 * buildNotifications (shared/lib/notifications.js, synced from
 * src/lib/notifications.js) is deliberately stateless — the in-app bell
 * re-derives its full list on every render, and an item disappearing on its
 * own once it stops being true is the point. A scheduled push run every few
 * minutes needs the opposite: state. Without it, a task sitting inside the
 * "starting soon" window would fire a fresh push on every single poll —
 * the same task, over and over, for the whole hour before it starts.
 *
 * This is that missing layer, kept exactly as small and pure as
 * buildNotifications itself: given the current list and what was already
 * sent, decide what's new — and let go of anything that resolved (was done,
 * rescheduled, or aged out of its window), so a task can notify again later
 * if it genuinely comes back around (rescheduled, then overdue a second
 * time). No Firebase import here at all — this is exercised directly by
 * functions/test/pushSelection.test.js with zero setup, the same way
 * src/lib is tested by tests/*.test.js.
 */

/**
 * @param items         buildNotifications' current output for one user
 * @param alreadySentIds ids pushed on a previous run (a plain array, as
 *                        stored on the user's pushState doc)
 * @return { toSend, nextSentIds } — `toSend` is the subset of `items` that
 *         hasn't been pushed yet; `nextSentIds` is what to persist back onto
 *         that doc so the next run knows what this one already covered.
 */
export function selectPushable(items, alreadySentIds) {
  const sent = new Set(alreadySentIds ?? [])
  const currentIds = new Set(items.map((item) => item.id))

  const toSend = items.filter((item) => !sent.has(item.id))

  // Drop anything from the sent set that isn't current anymore — that's
  // what lets the same task notify again if it resolves and later comes
  // back (e.g. rescheduled off overdue, then later overdue again).
  const nextSentIds = [...sent].filter((id) => currentIds.has(id))
  for (const item of toSend) nextSentIds.push(item.id)

  return { toSend, nextSentIds }
}
