import { useEffect, useState } from 'react'
import { TAG_SLOTS, useSchedule } from '../../state/ScheduleContext.jsx'
import { CloseIcon } from '../icons.jsx'

function SlotPicker({ value, onPick, label }) {
  return (
    <div className="tag-colors" role="group" aria-label={label}>
      {TAG_SLOTS.map((slot) => (
        <button
          key={slot}
          type="button"
          className={`tag-colors__dot${value === slot ? ' tag-colors__dot--on' : ''}`}
          style={{ background: `var(--tag-${slot})` }}
          onClick={() => onPick(slot)}
          aria-label={slot}
          aria-pressed={value === slot}
          title={slot}
        />
      ))}
    </div>
  )
}

export function TagManager({ onClose }) {
  const { tags, tasks, addTag, updateTag, removeTag } = useSchedule()
  const [name, setName] = useState('')
  const [slot, setSlot] = useState(null)
  const [confirming, setConfirming] = useState(null)

  // The next unused slot, so the palette is consumed in its validated order.
  const suggested = TAG_SLOTS.find((s) => !tags.some((t) => t.slot === s)) ?? TAG_SLOTS[0]
  const activeSlot = slot ?? suggested

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const countFor = (id) => tasks.filter((t) => t.tagId === id).length

  async function onAdd(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await addTag({ name: trimmed, slot: activeSlot })
    setName('')
    setSlot(null)
  }

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal__panel card" role="dialog" aria-modal="true" aria-label="Tags">
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
              <li key={tag.id} className="tag-list__item">
                <span className="tag-swatch" style={{ background: tag.color }} aria-hidden="true" />
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
                <span className="tag-list__count" title={`${countFor(tag.id)} tasks`}>
                  {countFor(tag.id)}
                </span>
                {confirming === tag.id ? (
                  <span className="tag-list__confirm">
                    <button
                      type="button"
                      className="danger-button danger-button--sm"
                      onClick={async () => {
                        await removeTag(tag.id)
                        setConfirming(null)
                      }}
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
              </li>
            ))}
          </ul>
        )}

        {confirming && (
          <p className="field__hint">Deleting a tag keeps its tasks — they simply become untagged.</p>
        )}

        <form className="tag-add" onSubmit={onAdd}>
          <span
            className="tag-swatch"
            style={{ background: `var(--tag-${activeSlot})` }}
            aria-hidden="true"
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
          <button type="submit" className="primary-button">
            Add
          </button>
        </form>

        <p className="field__hint">
          Colours are offered in a fixed order chosen so neighbouring tags stay distinguishable
          with colour-vision deficiency.
        </p>
      </div>
    </div>
  )
}
