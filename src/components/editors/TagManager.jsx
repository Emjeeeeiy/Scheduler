import { useRef, useState } from 'react'
import { TAG_ICONS, TAG_SLOTS, useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon } from '../icons.jsx'
import { TAG_ICON_COMPONENTS, TagGlyph } from './TagGlyph.jsx'

function SlotPicker({ value, onPick, label }) {
  return (
    <div className="tag-colors" role="group" aria-label={label}>
      {TAG_SLOTS.map((slot) => (
        <button
          key={slot}
          type="button"
          className={`tag-colors__dot${value === slot ? ' tag-colors__dot--on' : ''}`}
          style={{ background: `var(--color-tag-${slot})` }}
          onClick={() => onPick(slot)}
          aria-label={slot}
          aria-pressed={value === slot}
          title={slot}
        />
      ))}
    </div>
  )
}

/** The full set of glyphs a tag can wear, plus a leading "none" that clears
    it back to a plain colour dot. Laid out as a real grid rather than a
    wrapped row — with two dozen options, equal-width cells that end at the
    same edge read as a picker; a ragged flex-wrap line reads as clutter. */
function IconPicker({ value, onPick, label }) {
  return (
    <div className="tag-icons" role="group" aria-label={label}>
      <button
        type="button"
        className={`tag-icons__btn${value === null ? ' tag-icons__btn--on' : ''}`}
        onClick={() => onPick(null)}
        aria-label="No icon"
        aria-pressed={value === null}
        title="No icon"
      >
        <CloseIcon width="14" height="14" />
      </button>
      {TAG_ICONS.map((key) => {
        const GlyphIcon = TAG_ICON_COMPONENTS[key]
        return (
          <button
            key={key}
            type="button"
            className={`tag-icons__btn${value === key ? ' tag-icons__btn--on' : ''}`}
            onClick={() => onPick(key)}
            aria-label={key}
            aria-pressed={value === key}
            title={key}
          >
            <GlyphIcon width="15" height="15" />
          </button>
        )
      })}
    </div>
  )
}

/** A weekly-hours goal for a tag, edited as whole hours since a minute-level
    goal isn't a thing anyone actually sets. `null` (no goal) is reachable via
    Clear, kept distinct from `0` — a goal of zero hours would just be "no
    goal" wearing a number. */
function GoalInput({ value, onChange, label }) {
  const hours = value ? Math.round(value / 60) : ''
  return (
    <div className="tag-goal" role="group" aria-label={label}>
      <input
        className="input input--sm"
        type="number"
        min="1"
        max="168"
        step="1"
        value={hours}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) && n > 0 ? n * 60 : null)
        }}
        placeholder="Hours"
        aria-label={label}
      />
      <span className="field__hint">hrs / week</span>
      {value !== null && (
        <button type="button" className="ghost-button ghost-button--sm" onClick={() => onChange(null)}>
          Clear
        </button>
      )}
    </div>
  )
}

export function TagManager({ onClose }) {
  const { tags, tasks, addTag, updateTag, removeTag, importData } = useSchedule()
  const { pushError, pushUndo } = useToast()
  const [name, setName] = useState('')
  const [slot, setSlot] = useState(null)
  const [icon, setIcon] = useState(null)
  const [pickingIconFor, setPickingIconFor] = useState(null)
  const [settingGoalFor, setSettingGoalFor] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  // The next unused slot, so the palette is consumed in its validated order.
  const suggested = TAG_SLOTS.find((s) => !tags.some((t) => t.slot === s)) ?? TAG_SLOTS[0]
  const activeSlot = slot ?? suggested

  const countFor = (id) => tasks.filter((t) => t.tagId === id).length

  /* Three fast clicks on Add used to file three identical tags: the input
     only cleared after addTag's write resolved, so a second click before
     then resubmitted the same still-visible name. `adding` closes that
     window for every submit path at once — a repeat click, and Enter in the
     input, which fires the form's submit directly and would otherwise skip
     right past a merely-disabled button. Clearing the field up front (not
     after the write settles) is what actually stops a second submit from
     ever seeing the old name; on failure the text comes back so nothing
     typed is lost. */
  async function onAdd(event) {
    event.preventDefault()
    if (adding) return
    const trimmed = name.trim()
    if (!trimmed) return
    setAdding(true)
    setName('')
    setSlot(null)
    setIcon(null)
    try {
      await addTag({ name: trimmed, slot: activeSlot, icon })
    } catch (caught) {
      console.error('Could not add tag.', caught)
      pushError('Could not add the tag. Try again.')
      setName(trimmed)
    } finally {
      setAdding(false)
    }
  }

  async function onRemove(id) {
    if (deleting) return
    // Snapshotting before the delete, not the row afterward — removeTag
    // itself doesn't hand back what it removed.
    const snapshot = tags.find((t) => t.id === id)
    setDeleting(true)
    try {
      await removeTag(id)
      setConfirming(null)
      if (snapshot) {
        pushUndo(`Deleted "${snapshot.name}".`, async () => {
          try {
            await importData({ tags: [snapshot] })
          } catch (caught) {
            console.error('Could not restore the tag.', caught)
            pushError('Could not restore the tag.')
          }
        })
      }
    } catch (caught) {
      console.error('Could not delete tag.', caught)
      pushError('Could not delete the tag. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label="Tags">
        <div className="modal__head">
          <h2 className="modal__title">Tags</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {tags.length === 0 ? (
          <p className="empty empty--sm">No tags yet. Add one below.</p>
        ) : (
          <ul className="tag-list">
            {tags.map((tag) => (
              <li key={tag.id} className="tag-list__group">
                <div className="tag-list__item">
                  <TagGlyph tag={tag} variant="swatch" className="tag-swatch" />
                  <input
                    className="input input--flush"
                    value={tag.name}
                    onChange={(e) => updateTag(tag.id, { name: e.target.value })}
                    aria-label={`Rename ${tag.name}`}
                    maxLength={40}
                  />
                  <SlotPicker
                    value={tag.slot}
                    onPick={(next) => updateTag(tag.id, { slot: next })}
                    label={`Colour for ${tag.name}`}
                  />
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => setPickingIconFor((id) => (id === tag.id ? null : tag.id))}
                    aria-expanded={pickingIconFor === tag.id}
                  >
                    {pickingIconFor === tag.id ? 'Close' : 'Icon'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => setSettingGoalFor((id) => (id === tag.id ? null : tag.id))}
                    aria-expanded={settingGoalFor === tag.id}
                  >
                    {settingGoalFor === tag.id ? 'Close' : tag.goalMinutes ? `${Math.round(tag.goalMinutes / 60)}h/wk` : 'Goal'}
                  </button>
                  <span className="tag-list__count" title={`${countFor(tag.id)} tasks`}>
                    {countFor(tag.id)}
                  </span>
                  {confirming === tag.id ? (
                    <span className="tag-list__confirm">
                      <button
                        type="button"
                        className="danger-button danger-button--sm"
                        disabled={deleting}
                        onClick={() => onRemove(tag.id)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setConfirming(tag.id)}
                      aria-label={`Delete ${tag.name}`}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>
                {pickingIconFor === tag.id && (
                  <IconPicker
                    value={tag.icon}
                    onPick={(next) => updateTag(tag.id, { icon: next })}
                    label={`Icon for ${tag.name}`}
                  />
                )}
                {settingGoalFor === tag.id && (
                  <GoalInput
                    value={tag.goalMinutes}
                    onChange={(next) => updateTag(tag.id, { goalMinutes: next })}
                    label={`Weekly hour goal for ${tag.name}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {confirming && (
          <p className="field__hint">Deleting a tag keeps its tasks — they simply become untagged.</p>
        )}

        <form className="tag-add" onSubmit={onAdd}>
          <TagGlyph
            tag={{ color: `var(--color-tag-${activeSlot})`, icon }}
            variant="swatch"
            className="tag-swatch"
          />
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New tag"
            maxLength={40}
            aria-label="New tag name"
          />
          <SlotPicker value={activeSlot} onPick={setSlot} label="Colour for the new tag" />
          <button
            type="button"
            className="ghost-button ghost-button--sm"
            onClick={() => setPickingIconFor((id) => (id === 'new' ? null : 'new'))}
            aria-expanded={pickingIconFor === 'new'}
          >
            {pickingIconFor === 'new' ? 'Close' : 'Icon'}
          </button>
          <button type="submit" className="primary-button" disabled={adding}>
            Add
          </button>
        </form>
        {pickingIconFor === 'new' && (
          <IconPicker value={icon} onPick={setIcon} label="Icon for the new tag" />
        )}

        <p className="field__hint">
          Colours are offered in a fixed order chosen so neighbouring tags stay distinguishable
          with colour-vision deficiency. An icon is optional, and stays off unless you pick one.
        </p>
      </div>
    </div>
  )
}
