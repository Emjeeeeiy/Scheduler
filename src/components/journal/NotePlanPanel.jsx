import { durationLabel, formatDayLabel, minToLabel } from '@cadence/shared/date.js'
import { NOTE_AI_DISCLOSURE } from '../../lib/aiDisclosure.js'
import { VerifyNotice } from '../shell/VerifyNotice.jsx'
import { useNoteScheduleTools } from './NoteScheduleTools.jsx'

/* What "Plan it" found, shown to be accepted or dismissed as a whole — the Day
 * view's "Plan my day" idiom (same `.day-plan` look, same one button for the
 * batch, same single Undo), because a plan from a note is the same kind of thing:
 * a proposal that writes nothing until it is accepted.
 *
 * Chrome, not content: it sits under the day band, above the toolbar, neutral,
 * and is never part of what is printed.
 *
 * A row says where it would go — a time, "No time yet", or "Inbox" — and carries
 * a tick. A task the day already has is shown but NOT ticked, and says so, rather
 * than being quietly dropped: it might be a different thing with the same name.
 */

function Where({ row }) {
  if (row.kind === 'inbox') return 'Inbox'
  if (row.startMin === null) return 'No time'
  return minToLabel(row.startMin)
}

const SCOPE = { note: 'this note', selection: 'your selection' }

/** Why AI did not add to the plan, said so that it is true whether or not there
    are checklist lines to fall back on. (A missing email confirmation has its own
    notice, with its own button.) */
function whyNotAi(message, hasRows) {
  const tail = hasRows ? ' — these are your checklist lines.' : '. Try again in a moment.'
  if (message === 'offline') return `AI needs a connection${hasRows ? tail : '.'}`
  if (message === 'failed') return `Couldn’t reach AI${tail}`
  if (message === 'ai-empty') return `AI found nothing more in the writing — these are your checklist lines.`
  return null
}

export function NotePlanPanel() {
  const tools = useNoteScheduleTools()
  const plan = tools?.plan
  if (!plan) return null

  const { rows, status, source, message, scope, day, applying } = plan
  const chosen = rows.filter((row) => row.include).length
  const thinking = status === 'thinking'
  const where = SCOPE[scope]

  let headline
  if (thinking) {
    headline = rows.length > 0 ? `${rows.length} from your checklist — reading the rest of ${where}…` : `Reading ${where}…`
  } else if (rows.length === 0) {
    // With AI unavailable the honest thing to say is what WAS looked at; the
    // line below says why the rest was not.
    headline = message ? `No checklist lines in ${where} to plan.` : `Nothing to plan in ${where}.`
  } else {
    headline = `${rows.length} thing${rows.length === 1 ? '' : 's'} to do in ${where}. Put the ticked ones on your schedule?`
  }

  // Said where the person is deciding: only when AI has read, or is about to read,
  // the writing. A checklist-only plan sends nothing anywhere.
  const aiRead = thinking || source === 'ai'

  return (
    <section className="day-plan note-plan" aria-label="Plan from this note" aria-busy={thinking}>
      <p className="day-plan__note" aria-live="polite">
        {headline}
        {source === 'ai' && <span className="count-pill day-plan__ai-badge">AI</span>}
      </p>

      {message === 'unverified' ? (
        <VerifyNotice compact>
          Confirm your email address to let AI read the rest of the writing — until then only your checklist lines
          are planned.
        </VerifyNotice>
      ) : message ? (
        <p className="note-plan__message" role="status">
          {whyNotAi(message, rows.length > 0)}
        </p>
      ) : null}

      {rows.length > 0 && (
        <ul className="day-plan__list">
          {rows.map((row, index) => {
            const label = `${row.title}, ${row.kind === 'inbox' ? 'to the inbox' : row.startMin === null ? 'no time yet' : `at ${minToLabel(row.startMin)}`}`
            return (
              <li key={`${index}-${row.title}`} className={`day-plan__row${row.include ? '' : ' day-plan__row--off'}`}>
                <input
                  type="checkbox"
                  className="task-row__check"
                  checked={row.include}
                  disabled={applying}
                  onChange={() => tools.toggleRow(index)}
                  aria-label={label}
                />
                <span className="day-plan__time">
                  <Where row={row} />
                </span>
                <span className="day-plan__title" title={row.title}>
                  {row.title}
                  {row.duplicate ? (
                    <span className="note-plan__flag"> · already on {formatDayLabel(row.date ?? day)}</span>
                  ) : row.date && row.date !== day ? (
                    <span className="note-plan__flag"> · {formatDayLabel(row.date)}</span>
                  ) : null}
                </span>
                <span className="day-plan__length">{durationLabel(row.durationMin)}</span>
              </li>
            )
          })}
        </ul>
      )}

      <div className="day-plan__actions">
        {rows.length > 0 && (
          <button
            type="button"
            className="primary-button primary-button--sm"
            onClick={tools.acceptPlan}
            disabled={applying || chosen === 0}
          >
            {applying ? 'Adding…' : `Add ${chosen} to schedule`}
          </button>
        )}
        <button type="button" className="ghost-button ghost-button--sm" onClick={tools.closePlan}>
          {rows.length > 0 ? 'Dismiss' : 'Close'}
        </button>
      </div>

      {aiRead && <p className="note-plan__privacy">{NOTE_AI_DISCLOSURE}</p>}
    </section>
  )
}
