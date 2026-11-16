/* Said wherever AI is offered, so nobody has to find it in a privacy page: what
   leaves the device when an AI feature runs, and who sees it. The routes are
   in api/ (suggest-tag, parse-task, enrich-task, plan-day, ai-schedule,
   note-tasks).

   The Journal is the one place the text someone WROTE can leave the device, and
   only on a button press: "Plan it" sends the note's lines (or the selected
   ones) — never its images or drawings — to note-tasks. Nothing else in the
   Journal sends anything, and the writing is never read in the background. */
export const AI_DISCLOSURE =
  'AI features send task titles (and, in Ask AI, your messages) to Google Gemini. In the Journal, pressing Plan it also sends that note’s text (or your selection) — never its images or drawings. On its free tier, Google may use what it is sent to improve its products.'

/** The shorter line for the Plan it button's tooltip and panel: just the Journal's
    part, where the person is deciding whether to press it. */
export const NOTE_AI_DISCLOSURE =
  'With AI, Plan it sends this note’s text (or your selection) to Google Gemini — never images or drawings.'
