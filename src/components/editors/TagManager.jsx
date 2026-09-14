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

/** The two per-tag settings that need more room than a row affords: which
    tag this one files under, and how many hours a week it's meant to get.
    Behind one disclosure rather than two — they are both "the rest of what
    a tag is," and a row with four toggle buttons on it stops reading as a
    row at all.

    The goal is edited in whole hours, since a minute-level weekly target
    isn't a thing anyone sets. `null` (no goal) is reachable via Clear and
    stays distinct from `0`, which would just be "no goal" wearing a number. */
function TagOptions({ tag, tags, onChange, descendantIds }) {
  const hours = tag.goalMinutes ? Math.round(tag.goalMinutes / 60) : ''
  return (
    <div className="tag-options" role="group" aria-label={`Options for ${tag.name}`}>
      <label className="field tag-options__field">
        <span className="field__label">Nest under</span>
        <select
          className="input"
          value={tag.parentId ?? ''}
          onChange={(e) => onChange({ parentId: e.target.value || null })}
        >
          <option value="">Top level</option>
          {tags
            /* A tag can't file under itself, nor under anything already
               filed under it — either would make a loop, and the read side
               would then have to quietly break one of the links to render
               the list at all. Better to not offer the choice. */
            .filter((other) => other.id !== tag.id && !descendantIds.has(other.id))
            .map((other) => (
              <option key={other.id} value={other.id}>
                {'— '.repeat(other.depth ?? 0)}
                {other.name}
              </option>
            ))}
        </select>
      </label>

      <label className="field tag-options__field">
        <span className="field__label">Weekly goal</span>
        <span className="tag-options__goal">
          <input
            className="input input--sm"
            type="number"
            min="1"
            max="168"
            step="1"
            value={hours}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ goalMinutes: Number.isFinite(n) && n > 0 ? n * 60 : null })
            }}
            placeholder="—"
          />
          <span className="field__hint">hours a week</span>
        </span>
      </label>
    </div>
  )
}

export function TagManager({ onClose }) {
  const { tags, tasks, addTag, updateTag, removeTag, importData } = useSchedule()
  const { pushError, pushUndo } = useToast()
  const [name, setName] = useState('')
  const [slot, setSlot] = useState(null)
  const [icon, setIcon] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  // The next unused slot, so the palette is consumed in its validated order.
  const suggested = TAG_SLOTS.find((s) => !tags.some((t) => t.slot === s)) ?? TAG_SLOTS[0]
  const activeSlot = slot ?? suggested

  /** Everything filed under a tag, at any depth — the set the "Nest under"
      picker has to exclude so a tag can't be reparented beneath itself. */
  const descendantsOf = (id) => {
    const out = new Set()
    const queue = [id]
    while (queue.length > 0) {
      const current = queue.pop()
      for (const tag of tags) {
        if (tag.parentId === current && !out.has(tag.id)) {
          out.add(tag.id)
          queue.push(tag.id)
        }
      }
    }
    return out
  }

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
      setEditingId((current) => (current === id ? null : current))
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
              <li
                key={tag.id}
                className="tag-list__group"
                /* Indented by nesting depth rather than drawn with connector
                   lines: the list is short and shallow, and the offset alone
                   already says "this one files under the one above." */
                style={tag.depth ? { paddingLeft: `${tag.depth * 18}px` } : undefined}
              >
                <div className="tag-list__item">
                  <TagGlyph tag={tag} variant="swatch" className="tag-swatch" />
                  <input
                    className="input input--flush"
                    value={tag.name}
                    onChange={(e) => updateTag(tag.id, { name: e.target.value })}
                    aria-label={`Rename ${tag.name}`}
                    maxLength={40}
                  />
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => setEditingId((id) => (id === tag.id ? null : tag.id))}
                    aria-expanded={editingId === tag.id}
                  >
                    {editingId === tag.id ? 'Close' : 'Edit'}
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
                {/* One tag's editing panel: colour, icon, and filing/goal live
                    here instead of on the row, so the list itself stays a
                    quiet name-per-line until a tag is opened for editing. */}
                {editingId === tag.id && (
                  <div className="tag-edit">
                    <div>
                      <span className="field__label">Colour</span>
                      <SlotPicker
                        value={tag.slot}
                        onPick={(next) => updateTag(tag.id, { slot: next })}
                        label={`Colour for ${tag.name}`}
                      />
                    </div>
                    <div>
                      <span className="field__label">Icon</span>
                      <IconPicker
                        value={tag.icon}
                        onPick={(next) => updateTag(tag.id, { icon: next })}
                        label={`Icon for ${tag.name}`}
                      />
                    </div>
                    <TagOptions
                      tag={tag}
                      tags={tags}
                      descendantIds={descendantsOf(tag.id)}
                      onChange={(patch) => updateTag(tag.id, patch)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {confirming && (
          <p className="field__hint">Deleting a tag keeps its tasks — they simply become untagged.</p>
        )}

        <form className="tag-add" onSubmit={onAdd}>
          <div className="tag-add__row">
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
            <button type="submit" className="primary-button" disabled={adding}>
              Add
            </button>
          </div>
          <div>
            <span className="field__label">Colour</span>
            <SlotPicker value={activeSlot} onPick={setSlot} label="Colour for the new tag" />
          </div>
          <div>
            <span className="field__label">Icon</span>
            <IconPicker value={icon} onPick={setIcon} label="Icon for the new tag" />
          </div>
        </form>
      </div>
    </div>
  )
}
