import { useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons.jsx'

/**
 * A password input with its own reveal toggle, shared by both auth forms so
 * the login field, the sign-up field, and its confirm twin behave identically
 * rather than drifting into three hand-written variants.
 *
 * Each instance owns its own visibility. Register's two fields toggle
 * separately on purpose: checking that a mistyped confirmation matches means
 * reading both, and one shared switch would either reveal a password the
 * person didn't ask to expose or hide the one they did.
 *
 * The label is wired by `htmlFor` rather than wrapping the input, the way the
 * plain `.field` markup does — a `<button>` inside a `<label>` folds the
 * toggle into the field's accessible name and makes a click on it ambiguous
 * between pressing the button and focusing the input.
 */
export function PasswordField({ label, value, onChange, autoComplete, minLength }) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input password-field__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setVisible((shown) => !shown)}
          // Named per-field, not a bare "Show password": register has two of
          // these, and "Show confirm password" is the only thing that tells a
          // screen-reader user which one they've landed on.
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  )
}
