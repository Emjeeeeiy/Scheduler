# Keyboard shortcuts and the command palette

Both live in `src/App.jsx`. A shortcut is a *setting* (rebindable in Settings → Keyboard), so adding one touches the settings layer too.

## A new single-key shortcut

1. **Declare the action** in `src/state/SettingsContext.jsx`: add `{ id, label }` to `SHORTCUT_ACTIONS` and `id: 'key'` to `DEFAULT_SHORTCUTS`. Values are raw `KeyboardEvent.key` strings (`'n'`, `'ArrowLeft'`).
2. **Handle it** in the window `keydown` effect in `App.jsx`: add an `else if (bound('myAction')) { event.preventDefault(); … }` branch. `bound(id)` compares the pressed key with the binding case-insensitively for single letters.
3. **Add every value the handler reads to that effect's dependency array.** It is a hand-written list; a missing entry gives a handler that reads stale state.
4. **That is all for the Settings UI.** `KeyboardSection` renders one row per `SHORTCUT_ACTIONS` entry, so the new action appears and is rebindable automatically.
5. **Migration is automatic and safe.** `mergeShortcuts` fills in a new action for anyone who stored bindings before it existed, and if its default key is already taken (someone rebound `j` to New task) the new action starts **unbound** (`null`, shown as "None") instead of colliding, because the listener runs the first match.
6. **Pick a default that is a single, unmodified key.** The listener ignores any press with Ctrl, Meta or Alt held, and `KeyboardSection` refuses to bind modified keys, Escape, Tab and Space.
7. Docs: the Keyboard table in README and the shortcuts sentence in PRODUCT.md. Test: `tests/dayNoteShortcut.test.jsx` is the model (it is the only test that drives the shortcut machinery through the real `SHORTCUT_ACTIONS` / `DEFAULT_SHORTCUTS` / `mergeShortcuts`).

## What the listener already guarantees (do not re-implement)

In order: Cmd/Ctrl+K (the palette) is handled **first**, before the typing guard, and yields to a Journal editor that already prevented the default (its Ctrl+K is "insert link"). Then a key is ignored when: focus is in an `input`, `textarea`, `select` or contenteditable; any of Ctrl/Meta/Alt is held; `modalOpen` is true; or it is an auto-repeat (`event.repeat`, otherwise holding `n` stacks modals). So:

- A new **modal must be in `modalOpen`**, or the shortcuts fire underneath it.
- A new **text field** needs nothing; the typing guard covers it. A custom editable surface that is not an input or contenteditable does need to stop propagation itself.
- A shortcut that acts on "the day on screen" uses the existing idiom: `onDatedView ? focusKey : todayKey()` (`onDatedView` is true for Day/Week/Month).

## A command-palette action

`paletteActions` in `App.jsx` is one flat `useMemo` list of `{ id, label, hint?, Icon, onRun }`. Add an entry; `CommandPalette` only filters and navigates the list.

```jsx
{ id: 'view-x', label: 'Go to X', Icon: XIcon, onRun: () => setView('x') },
```

Rules:

- **`onRun` calls the same handler the sidebar or button uses.** There is one code path per action; the palette never has its own copy of the logic.
- **`id` is unique and kebab-case**, prefixed by kind (`view-…`, `new-…`).
- **`hint` is one short phrase** shown beside the label; use it to say a precondition (AI actions show "Confirm your email to use" while unverified and still open the verify path rather than dead-ending).
- **Icons come from `icons.jsx`** (or `journalIcons.jsx` for Journal actions, which live in the lazy chunk; do not import that into the main bundle).
- Search results and the quick-add line (`searchItems`, `quickAdd` in `App.jsx`) return actions in this same shape, so a new kind of result is a new producer of `{ id, label, Icon, onRun }`, not a new palette feature.
- `CommandPalette` is a modal (`aria-modal`, `useModalA11y`); it is covered by `tests/palette.test.jsx` and `tests/paletteAiEntry.test.jsx`.

## Known loose ends

`App.jsx` is ~1250 lines, and the keydown effect, `paletteActions`, `quickAdd` and `searchItems` are the obvious candidates to extract. Do not extract them as a side effect of an unrelated change; if the task is to extract, move them with their tests and keep behaviour identical.
