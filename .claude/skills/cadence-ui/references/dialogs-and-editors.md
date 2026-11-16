# Dialogs and editors

Every modal goes through `useModalA11y` (`src/lib/useModalA11y.js`). It gives the dialog its focus trap, Escape-to-close, a counted body scroll lock and focus restore, and it is the reason a dialog opened from a button returns you to that button. Copy `EventEditor.jsx` (the cleaner of the two) or `TaskEditor.jsx`.

## The contract

```jsx
const panelRef = useRef(null)
const titleRef = useRef(null)
useModalA11y(panelRef, { onClose, initialFocusRef: titleRef }) // escapeDisabled: true to block Escape

return (
  <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={heading}>
      <form onSubmit={onSubmit}>
        <div className="modal__head">
          <h2 className="modal__title">{heading}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="stack editor-stack">
          <div className="editor-section">
            <span className="editor-section__label">Schedule</span>
            <label className="field"><span className="field__label">…</span><input className="input" />…</label>
          </div>
        </div>
        <div className="modal__foot">
          {isEdit && <button type="button" className="danger-button">Delete</button>}
          <span className="modal__spacer" />
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  </div>
)
```

Rules the hook relies on:

- **The panel ref must be on the element with `role="dialog"`.** `aria-modal="true"` marks a modal, and `cadence-verify`'s `drift.mjs` flags any file with `aria-modal` that never calls `useModalA11y`.
- **Hide a section by not rendering it**, never by hiding a focusable element with CSS. The trap computes focusable elements from the DOM.
- **`onClose` can be an inline arrow**; the hook reads it through a ref and runs once on mount.
- **One dialog at a time.** Two stacked modals means two Escape handlers. The All items index closes itself before opening an editor for this reason (`editFromIndex` and `editEventFromIndex` in App.jsx call `setItemsOpen(false)` first).
- **A non-modal popover is not a dialog.** `DayPeek` and the Journal toolbar's `tb-pop` panels are anchored `role="dialog"` panels with no `aria-modal` and no trap, positioned with `usePopoverPlacement`. Use that pattern for an anchored panel, `useModalA11y` for a modal.

## Wiring a new dialog into `App.jsx`

1. Hold its open state in `AppShell` and render it conditionally: `{todoOpen && <TodoModal … />}`. Unmounting is what runs the hook's cleanup.
2. **Add its open state to `modalOpen`.** That flag is what stops `n`, `e`, `t`, `j` and the arrow keys firing underneath it. Forgetting it is the classic bug: typing in the dialog's field triggers a shortcut.
3. If an editor serves several items, `key` it by the item so switching remounts the form and its state.
4. If it should be reachable from the palette, add a `paletteActions` entry that sets the same state.
5. If it is a new component file, add a case to `tests/smoke/entry.jsx` and a test that pins what it promises (role and name, what Close and the backdrop do).

## The submit pattern

```jsx
async function onSubmit(event) {
  event.preventDefault()
  if (saving) return                       // a double-press must not write twice
  const trimmed = title.trim()
  if (!trimmed) { titleRef.current?.focus(); return }   // focus the field; no error banner
  setSaving(true)
  try {
    await addTask({ … })                   // the Firestore promise from useSchedule()
    onClose()
  } catch (caught) {
    console.error('Could not save task.', caught)
    pushError('Could not save the task. Try again.')
    setSaving(false)                       // only on failure; success unmounts
  }
}
```

Build the payload from the form state and let `useSchedule()` normalize it; do not pre-validate what `normalize*` already coerces.

## Delete with Undo

```jsx
const deleted = !isOccurrence ? editor.task : null   // a single detached day is not a document: no Undo
try {
  await removeTask(editor.task.id)                   // soft delete: stamps deletedAt
  onClose()
  if (deleted) {
    pushUndo(`Deleted "${deleted.title}".`, async () => {
      try { await restoreItem('task', deleted.id) }  // clears the stamp on the document that is still there
      catch (caught) {
        console.error('Could not restore the task.', caught)
        pushError('Could not restore the task. It is still in the Trash.')
      }
    })
  }
} catch (caught) {
  console.error('Could not delete task.', caught)
  pushError('Could not delete the task. Try again.')
}
```

Undo **clears the Trash stamp**; it never writes the old snapshot back, because that would create a second copy. `pushUndo(message, onAction)` shows an 8 s success toast with an Undo button; `push` returns an id you can `dismiss(id)`; `pushWarning` is for a partly-failed batch.

## Three edit states

An editor opens on an ordinary item, a whole **series** (a repeating rule), or a single **occurrence** of a series. The editor object is `{ mode: 'create' | 'view' | 'edit', kind, draft | task | event }`. Only the first two show the `RepeatPicker`; an occurrence shows the `.series-note` instead, because saving it detaches just that day (`ScheduleContext` handles that; see `cadence-data`). Note the editors detect an occurrence differently (`TaskEditor` checks `occurrenceDate`, `EventEditor` checks `seriesId`): check which one before copying.

## Known gaps (do not copy)

`stats/BarChart.jsx` (`ChartTableModal`) and `views/FocusMode.jsx` (the alarm dialog) each have their own Escape listener and no focus trap, scroll lock or focus restore. They are bugs, not the pattern.
