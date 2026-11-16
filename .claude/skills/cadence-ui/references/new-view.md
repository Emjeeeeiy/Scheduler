# Adding a view

There is no router. `view` is a string in `usePersistentState(LAST_VIEW_KEY, …)` in `src/App.jsx`, and `<main>` renders one `{view === 'x' && <X … />}` branch per view. So a new view is a registration in several lists. Missing one gives a view that renders but cannot be restored, has no skeleton, or is invisible to the sidebar.

Decide first: a **top-level page** (sidebar entry, like Journal) or a **Schedule tab** (a sub-view of Schedule, like Review)? Note that `'schedule'` is a nav entry but never a view id; the sidebar routes it to whichever of Day/Week/Month/Review is open.

## In `src/App.jsx`

1. **Import it.** Eager (next to the other view imports) for a light view. **Lazy** if it is heavy (the Journal's editor is the model): copy `loadJournal` / `let JournalView = lazy(loadJournal)` / `retryJournal`, the idle prefetch effect (skipped offline and on Save-Data), and the render wrapper `ErrorBoundary key={…Attempt}` > `Suspense fallback={<ViewSkeleton view="…" />}`. React caches a failed lazy import, which is why `retryJournal` replaces the `lazy()`.
2. **Register the id**:
   - top-level page: add to `NAV_ITEMS` (`{ id, label, Icon }`) **and** to the hardcoded list in `isViewId`;
   - Schedule tab: add to `SCHEDULE_TABS` (`isViewId` picks it up through `SCHEDULE_VIEWS`).
   `isViewId` is the one predicate that decides what `?view=`, a remembered view and the landing view may name; a view missing from it never survives a reload.
3. **Add the render branch** in the `<main>` block, passing the callbacks neighbouring views get (`onEdit={openEdit}`, `onCreate={openCreate}`, `onFocusDay={focusDay}` …). Views that must keep running while hidden are mounted and `hidden` (Focus, for its timer); the rest are mounted only while open (Journal, which would otherwise keep a listener and an autosave alive).
4. **Date cursor?** If the view steps through days, add it to `DATE_NAV` (`(key, n) => …`), to `dateLabel`, and to `onDatedView` in the keyboard effect so `←`/`→`/`t`/`n` work.
5. **Own title?** If it draws its own heading, add it to the header-suppression check (`view === 'settings' || view === 'journal' || view === 'focus' ? null : …`), or the shell shows a stray "Today" over it.
6. **Full width?** Add it to the `app-content--wide` condition if it needs the whole content area.
7. **Palette entry** in `paletteActions`: `{ id: 'view-x', label: 'Go to X', Icon: XIcon, onRun: () => setView('x') }`. It must call the same handler the sidebar uses.
8. **Dialogs it opens** must be added to `modalOpen` (see dialogs-and-editors).

## Outside `App.jsx`

9. **Skeleton:** write an `XSkeleton` and add it to `SKELETONS` in `src/components/shell/ViewSkeleton.jsx`. Without it the view falls back to the Dashboard skeleton while loading. Build it from the real view's own structural class names (`frame`, `stack`, `section-head`, …) and `.skel` bars with no readable text, so the swap to content does not shift the layout; `tests/viewSkeleton.test.jsx` pins that rule.
10. **Landing page option:** add `{ value, label }` to `LANDING_VIEW_OPTIONS` in `src/components/settings/GeneralSection.jsx` if the view may be where the app opens.
11. **Session skeleton:** `SessionSkeleton.jsx` draws four placeholder nav bars for the rail. A fifth top-level entry means a fifth bar there and a check of the bottom tab bar's layout in `shell.css` (DESIGN.md's Layout section describes four links within thumb reach).
12. **Manifest shortcut:** optionally add a `/?view=x` entry in `public/manifest.webmanifest`.
13. **Styles:** create `src/styles/x.css`. For an eager view, import it in `App.jsx`'s ordered style imports **at the right position**: that list is in cascade order on purpose, so do not sort it, and place yours after the files whose rules it overrides. For a lazy view, import the CSS from the view file itself so it ships in the chunk (as `JournalView.jsx` and `SettingsView.jsx` do).
14. **The view file:** `src/components/views/XView.jsx`, a named export `XView`. Root `<div className="x frame stack">` with a `.section-head` for the title (template: `ReviewView.jsx`). Data from `useSchedule()` etc., not props.

## Tests and docs

15. `tests/viewRestore.test.jsx` has a table of view ids that must survive a reload; add the new one. `tests/viewSkeleton.test.jsx` covers the skeleton map.
16. Add a case and a markup `expect` to `tests/smoke/entry.jsx` (see `cadence-tests`). If the view reads a new `useSchedule()` member, mirror it in `tests/smoke/mockSchedule.jsx` first.
17. Docs: DESIGN.md (a component section for the view), PRODUCT.md (Capabilities and the view list), README (the views paragraph and Layout tree). Then `cadence-verify`.
