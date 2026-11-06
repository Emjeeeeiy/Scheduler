import { useId, useState } from 'react'
import { normalizeLinkUrl } from '../../lib/journalLinks.js'

/* The body of the link popover. Mounted only while the popover is open, so each
   opening starts from the link under the caret (or empty) rather than carrying
   the last one's text. The URL goes through normalizeLinkUrl first: a bare
   "example.com" becomes a real address, and anything outside the allow-list is
   refused with a reason instead of being silently dropped by the editor. */
export function LinkForm({ editor, close }) {
  const id = useId()
  const existing = editor.getAttributes('link').href ?? ''
  const onLink = editor.isActive('link')
  const [url, setUrl] = useState(existing)
  const [error, setError] = useState('')

  function apply(event) {
    event.preventDefault()
    const result = normalizeLinkUrl(url)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    const chain = editor.chain().focus()
    if (onLink) {
      chain.extendMarkRange('link').setLink({ href: result.href }).run()
    } else if (editor.state.selection.empty) {
      // Nothing selected: the address itself becomes the linked text.
      chain
        .insertContent({
          type: 'text',
          text: url.trim(),
          marks: [{ type: 'link', attrs: { href: result.href } }],
        })
        .run()
    } else {
      chain.setLink({ href: result.href }).run()
    }
    close()
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    close()
  }

  return (
    <form className="link-form" onSubmit={apply} noValidate>
      <label className="field__label" htmlFor={id}>
        Link address
      </label>
      <input
        id={id}
        data-autofocus
        className="input"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={url}
        placeholder="Paste or type a web address"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setUrl(event.target.value)
          setError('')
        }}
      />
      {error ? (
        <p id={`${id}-error`} className="field__hint warn-text" role="alert">
          {error}
        </p>
      ) : null}
      <div className="link-form__actions">
        <button type="submit" className="primary-button">
          Apply
        </button>
        {onLink ? (
          <button type="button" className="ghost-button" onClick={remove}>
            Remove link
          </button>
        ) : null}
        {onLink && existing ? (
          <a className="ghost-button" href={existing} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        ) : null}
      </div>
    </form>
  )
}
