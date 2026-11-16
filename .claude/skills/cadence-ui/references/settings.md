# Settings: a category, a row, a setting

Settings is a **page**, not a dialog. A side navigation of categories, one open at a time; on a phone it is two screens (a list of categories, then the chosen one with a Back button, switched by `data-mobile-screen` below 900px).

## A new category

1. **Register it** in `SETTINGS_SECTIONS` in `src/components/settings/sections.js`: `{ id, label, blurb }`, in nav order. That file is plain data so `App.jsx` can validate a remembered section id without importing the panels; keep imports out of it.
2. **Write the panel:** `src/components/settings/XSection.jsx` with `export function XSection()`. No props; it gets its data from context hooks and returns a fragment of `<Row>`s.
3. **Map it** in `PANELS` in `src/components/views/SettingsView.jsx` (`x: XSection`).
4. Optionally add a palette deep link: `openSettings('x')` from a `paletteActions` entry in `App.jsx`.
5. `tests/settingsPage.test.jsx` builds its expected nav labels from `SETTINGS_SECTIONS`, so it needs no edit for a new category (it will now cover it); add a test for the panel itself (`tests/settingsAccount.test.jsx` and `settingsTags.test.jsx` are the models). `SettingsView` has a smoke case per section in `tests/smoke/entry.jsx`; add `['SettingsView (x)', <SettingsView section="x" />]`.
6. Docs: PRODUCT.md's Settings paragraph lists the categories, and README's intro does too. DESIGN.md has a "Settings page" section.

## A new row

`Row` (`src/components/settings/SettingsParts.jsx`): `<Row title hint? wide? below? danger?>{control}</Row>`.

- `title` renders as an `h4`, so the page has an outline a screen reader can navigate. `hint` is one short line; leave it out when it would only repeat the title.
- `wide` is for a control that is a whole list or form (tags, shortcuts): the explanation sits above it and the control takes the full width.
- `below` is for what the control reports (a status, "blocked in your browser"), set under the row.
- `danger` marks the one setting that cannot be undone.

Control idioms, so the page reads as one system:

- **Pick one of a few:** a `filter-row` group of chips, not a select.
  ```jsx
  <div className="filter-row" role="group" aria-label="Week starts on">
    {OPTIONS.map((o) => {
      const on = settings.weekStartsOn === o.value
      return (
        <button key={o.value} type="button" className={`filter-chip${on ? ' filter-chip--on' : ''}`} aria-pressed={on}
                onClick={() => updateSetting('weekStartsOn', o.value)}>{o.label}</button>
      )
    })}
  </div>
  ```
- **Pick from a long list:** `<select className="input" aria-label="…">`.
- **A time:** `<input type="time" step={900}>` inside `.field-row > label.field`.
- **An action:** `.settings-actions` holding `ghost-button ghost-button--sm button--icon-label` with an icon carrying `button-icon`.
- **Anything async:** `try { await … } catch (caught) { console.error('Could not X.', caught); pushError('Could not X. Try again.') }`, with a `busy` flag that disables the control.
- **An action disabled for an unverified email** points `aria-describedby` at a `VerifyNotice`.

## A new setting: per device, or per account?

**Per device (the default).** One JSON object in localStorage under `cadence-app:settings`, held by `SettingsContext`.

1. Add the key to `DEFAULT_SETTINGS` in `src/state/SettingsContext.jsx`, with a comment, defaulting to the old hardcoded behaviour.
2. That is all for migration: the revive step spreads the defaults, so a stored object from before the key existed picks it up. A **nested** object needs its own merge (as `shortcuts` has, via `mergeShortcuts`).
3. Read `const { settings, updateSetting } = useSettings()`; write `updateSetting('key', value)`.
4. Stored values are spread **without type coercion**, so validate where you read (an unexpected stored string must not crash your component).

For one component's own remembered UI state, call `usePersistentState('cadence-app:<name>', initial, revive)` directly; `revive` must validate the stored value and must not throw (see `usePersistentState.js`). Use the `cadence-app:` key prefix. (Older keys are inconsistent: `cadence-journal:*`, `cadence:remember_me`; do not copy those.)

**Per account** only when a server (a Cloud Function or an `/api` route) has to read the value, as the daily-digest opt-in does. It is a field on the `users/{uid}` profile document, written with `setDoc(…, { merge: true })` from a `ScheduleContext` method (`updateDigestPreference` is the model), read as `profile?.field`. A new profile field **also needs `firestore.rules` changed** (`profileKeys()` and a `fieldOk` clause) and a rules test; see `cadence-data`.

Appearance, week start, landing view, working hours, shortcuts and the last open category are per device; the digest, photo and tags are per account. Say which in the row's hint when it is not obvious.
