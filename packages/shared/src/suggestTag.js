/* "Standup with the team" → probably Work.
 *
 * Learned from the account's own history rather than from a fixed keyword
 * list: this app cannot know that "Ana" means Personal and "retro" means
 * Work, but the several hundred tasks already filed by hand do. The model is
 * one pass over those, and the suggestion is P(tag | word) summed over the
 * words of a new title.
 *
 * Deliberately a *suggestion*. It fills the tag field on a form nobody has
 * saved yet, where a wrong guess costs one click to change — never applied
 * to an existing task, and never silently on save.
 *
 * The threshold matters more than the scoring does. On a young account
 * almost every word is a coincidence with a sample size of one, so this
 * refuses to answer far more often than it answers, and says nothing rather
 * than something arbitrary.
 */

/* Words that carry no filing signal. Deliberately short — this is not a
   linguistics exercise, and a real stopword list would start throwing away
   words that ARE discriminative in someone's own history ("call", "with"
   and "the" are noise; "review", "meeting" and "gym" are not). */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'be', 'by', 'do', 'for', 'from', 'get', 'go', 'in',
  'is', 'it', 'my', 'of', 'on', 'or', 'out', 'the', 'to', 'up', 'with',
])

/** How many times a word must have been seen at all before it is allowed to
    vote. One task mentioning "chair" while tagged Work does not make every
    future chair a work item. */
const MIN_WORD_SUPPORT = 2

/** How confident the winner has to be, as an average P(tag | word) across
    the words that actually matched. Exclusive: a word split evenly between
    two tags scores exactly 0.5, and a coin flip dressed up as a suggestion
    is worse than no suggestion at all. */
const MIN_CONFIDENCE = 0.5

/** Title words worth learning from: lowercased, punctuation stripped, and
    short or meaningless ones dropped. A bare number goes too — a year says
    nothing about which tag a task belongs to — but a short word carrying a
    digit stays, because "Q3" and "v2" name something and are the one kind
    of two-letter word worth keeping. */
export function significantWords(title) {
  return [
    ...new Set(
      String(title ?? '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(
          (word) =>
            !STOPWORDS.has(word) && !/^\d+$/.test(word) && (word.length >= 3 || /\d/.test(word)),
        ),
    ),
  ]
}

/**
 * One pass over the tagged history, producing what suggestTag needs to
 * answer instantly on every keystroke.
 *
 * Built from a caller-supplied task list so it stays pure and testable; the
 * caller is expected to memoize it against `tasks` rather than rebuild it
 * per render.
 */
export function buildTagModel(tasks) {
  /** word → (tagId → how many times that word appeared on a task with it) */
  const byWord = new Map()

  for (const task of tasks ?? []) {
    // Only tasks someone actually filed teach anything. An untagged task is
    // not evidence for "no tag" — it is usually evidence of not bothering.
    if (!task?.tagId) continue
    for (const word of significantWords(task.title)) {
      const tags = byWord.get(word) ?? new Map()
      tags.set(task.tagId, (tags.get(task.tagId) ?? 0) + 1)
      byWord.set(word, tags)
    }
  }

  return { byWord }
}

/**
 * The tag a title most looks like, or null when nothing is confident enough.
 *
 * @param title      the text being typed
 * @param model      from buildTagModel
 * @param knownTagIds optional Set — tags that still exist. A model built
 *                    before a tag was deleted would otherwise keep
 *                    suggesting it.
 * @return { tagId, confidence } | null
 */
export function suggestTag(title, model, knownTagIds = null) {
  const words = significantWords(title)
  if (words.length === 0 || !model?.byWord) return null

  const scores = new Map()
  let voters = 0

  for (const word of words) {
    const tags = model.byWord.get(word)
    if (!tags) continue

    let total = 0
    for (const [tagId, count] of tags) {
      if (knownTagIds && !knownTagIds.has(tagId)) continue
      total += count
    }
    if (total < MIN_WORD_SUPPORT) continue

    /* Each word casts one vote, split across the tags it has been seen
       with. Splitting rather than counting raw occurrences is what stops a
       tag that simply has more tasks than the others from winning every
       time — a word used exclusively by a small tag is stronger evidence
       than one used occasionally by a large one. */
    for (const [tagId, count] of tags) {
      if (knownTagIds && !knownTagIds.has(tagId)) continue
      scores.set(tagId, (scores.get(tagId) ?? 0) + count / total)
    }
    voters += 1
  }

  if (voters === 0) return null

  let best = null
  for (const [tagId, score] of scores) {
    if (!best || score > best.score || (score === best.score && tagId < best.tagId)) {
      best = { tagId, score }
    }
  }

  const confidence = best.score / voters
  return confidence > MIN_CONFIDENCE ? { tagId: best.tagId, confidence } : null
}
