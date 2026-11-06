/* The open-note surface, mounted for real in jsdom: the editor, the toolbar,
 * autosave, and the safeguards that decide whether text on screen may be written
 * back. The editor is driven through its command API (found on the DOM node
 * ProseMirror exposes), because jsdom has no layout for real typing — but every
 * save, banner and disabled control below is the genuine component reacting.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultPaper, emptyDoc, normalizeNote, normalizeNoteBody } from '@cadence/shared/journal.js'
import { NoteSurface } from '../src/components/journal/NoteSurface.jsx'
import { ThemeProvider } from '../src/state/ThemeContext.jsx'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'

/* A tiny size limit, so "too large to save" is reachable without writing a
   megabyte into jsdom. Everything else in the module is the real thing. */
vi.mock('@cadence/shared/journal.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, bodyLimitState: (bytes) => (bytes > 1500 ? 'full' : bytes > 1000 ? 'warn' : 'ok') }
})

beforeAll(installProseMirrorDom)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const para = (value) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] })
const docOf = (...blocks) => ({ type: 'doc', content: blocks })

const bodyState = (doc, extra = {}) => ({
  loading: false,
  exists: true,
  body: normalizeNoteBody({ json: typeof doc === 'string' ? doc : JSON.stringify(doc), schemaVersion: 1 }),
  hasPendingWrites: false,
  fromCache: false,
  error: null,
  ...extra,
})

function makeActions() {
  return {
    saveNote: vi.fn(() => Promise.resolve()),
    updateNoteMeta: vi.fn(() => Promise.resolve()),
  }
}

function mount({ doc = docOf(para('hello world')), actions = makeActions(), note, state } = {}) {
  const base = normalizeNote('n1', { title: 'My note', createdAt: 1, updatedAt: 1 })
  const props = {
    note: note ?? base,
    actions,
    defaultPaper: defaultPaper(),
    onBack: vi.fn(),
    onPin: vi.fn(),
    onTrash: vi.fn(),
    onUseForNew: vi.fn(),
  }
  const ui = (bs) => (
    <ThemeProvider>
      <NoteSurface {...props} bodyState={bs} />
    </ThemeProvider>
  )
  const view = render(ui(state ?? bodyState(doc)))
  return {
    ...view,
    actions,
    props,
    update: (next) => view.rerender(ui(next)),
  }
}

async function editorOf(container) {
  await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy())
  return container.querySelector('.ProseMirror').editor
}

const jsonOf = (call) => JSON.parse(call.json)

describe('opening a note', () => {
  it('leaves the toolbar live straight away, with no click needed', async () => {
    // Regression: useEditorState never refreshed when the editor appeared after
    // the first render, so the toolbar sat disabled until the first transaction.
    const { container } = mount()
    await editorOf(container)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' }).disabled).toBe(false))
    expect(screen.getByRole('button', { name: 'Page and paper' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bulleted list' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true) // nothing to undo yet
  })

  it('counts the words it opened with', async () => {
    const { container } = mount({ doc: docOf(para('one two three')) })
    await editorOf(container)
    await waitFor(() => expect(screen.getByText('3 words')).toBeTruthy())
  })

  it('does not write the note just because it was opened', async () => {
    // Regression: setEditable() emits an update by default, which autosave took
    // for typing — so opening a note re-saved it and bumped its Edited time.
    vi.useFakeTimers()
    const { container, actions } = mount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(container.querySelector('.ProseMirror')).toBeTruthy()
    expect(actions.saveNote).not.toHaveBeenCalled()
    expect(container.querySelector('.note-meta__status').textContent).toBe('Saved')
  })

  it('shows the title and starts a new note with the caret there', async () => {
    const note = normalizeNote('n2', { title: '', createdAt: 1, updatedAt: 1 })
    const { container } = mount({ note })
    await editorOf(container)
    expect(document.activeElement?.classList.contains('note-title')).toBe(true)
  })
})

describe('autosave', () => {
  it('saves the text, title and a plain-text excerpt together, once typing pauses', async () => {
    const { container, actions } = mount()
    const editor = await editorOf(container)
    vi.useFakeTimers()
    act(() => {
      editor.commands.insertContent(' and more words')
    })
    expect(container.querySelector('.note-meta__status').textContent).toBe('Saving…')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(actions.saveNote).toHaveBeenCalledTimes(1)
    const [id, payload] = actions.saveNote.mock.calls[0]
    expect(id).toBe('n1')
    expect(payload.title).toBe('My note')
    expect(payload.excerpt).toContain('and more words')
    expect(payload.hasDrawing).toBe(false)
    expect(payload.bytes).toBeGreaterThan(40)
    expect(JSON.stringify(jsonOf(payload))).toContain('and more words')
    expect(container.querySelector('.note-meta__status').textContent).toBe('Saved')
  })

  it('saves a changed title', async () => {
    const { container, actions } = mount()
    await editorOf(container)
    vi.useFakeTimers()
    // fireEvent goes through React's value tracking; assigning .value directly would not.
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Renamed' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(actions.saveNote).toHaveBeenCalledTimes(1)
    expect(actions.saveNote.mock.calls[0][1].title).toBe('Renamed')
  })

  it('writes the note when it is closed mid-edit', async () => {
    const { container, actions, unmount } = mount()
    const editor = await editorOf(container)
    act(() => {
      editor.commands.insertContent('unsaved')
    })
    unmount()
    expect(actions.saveNote).toHaveBeenCalledTimes(1)
    expect(actions.saveNote.mock.calls[0][1].json).toContain('unsaved')
  })

  it('refuses a save that is too large, says so, and keeps the text', async () => {
    const { container, actions } = mount()
    const editor = await editorOf(container)
    vi.useFakeTimers()
    act(() => {
      editor.commands.insertContent('x'.repeat(2000))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(actions.saveNote).not.toHaveBeenCalled()
    expect(container.querySelector('.note-meta__status').textContent).toBe('Not saved')
    expect(container.querySelector('.banner--error').textContent).toMatch(/too large to save/i)
    expect(editor.getText()).toContain('xxxxxxxxxx') // never truncated
  })

  it('reports a write the server refuses, and offers to try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const actions = makeActions()
    actions.saveNote.mockImplementation(() => Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' })))
    const { container } = mount({ actions })
    const editor = await editorOf(container)
    vi.useFakeTimers()
    act(() => {
      editor.commands.insertContent('x')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(container.querySelector('.note-meta__status').textContent).toBe('Not saved')
    expect(container.querySelector('.banner--error').textContent).toMatch(/no longer have access/i)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('a body this version cannot read', () => {
  const alien = docOf(para('kept'), { type: 'holographicChart', attrs: { data: [1, 2] } })

  it('opens read-only with a clear message, and never saves', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container, actions } = mount({ doc: alien })
    const editor = await editorOf(container)
    await waitFor(() => expect(container.querySelector('.banner--error')).toBeTruthy())
    expect(container.querySelector('.banner--error').textContent).toMatch(/read-only/i)
    expect(container.querySelector('.note-meta__status').textContent).toBe('Read-only')
    expect(screen.getByRole('button', { name: 'Download note data' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bold' }).disabled).toBe(true)
    expect(screen.getByLabelText('Note title').readOnly).toBe(true)
    expect(editor.isEditable).toBe(false)

    vi.useFakeTimers()
    act(() => {
      editor.commands.insertContent('x') // even a forced edit must not reach storage
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(actions.saveNote).not.toHaveBeenCalled()
  })

  it('treats a body from a newer build, and a corrupt one, the same way', async () => {
    const newer = bodyState(emptyDoc())
    newer.body = normalizeNoteBody({ json: JSON.stringify(emptyDoc()), schemaVersion: 99 })
    const a = mount({ state: newer })
    await editorOf(a.container)
    expect(a.container.querySelector('.note-meta__status').textContent).toBe('Read-only')
    a.unmount()

    const b = mount({ state: bodyState('{this is not json') })
    await editorOf(b.container)
    expect(b.container.querySelector('.note-meta__status').textContent).toBe('Read-only')
    expect(b.actions.saveNote).not.toHaveBeenCalled()
  })
})

describe('changes from another device', () => {
  const remoteOf = (text) => bodyState(docOf(para(text)))

  it('applies quietly when there is nothing unsaved', async () => {
    const { container, update, actions } = mount()
    const editor = await editorOf(container)
    update(remoteOf('changed elsewhere'))
    await waitFor(() => expect(editor.getText()).toBe('changed elsewhere'))
    expect(container.querySelector('.banner')).toBeNull()
    // …and applying someone else's text is not an edit of ours.
    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(actions.saveNote).not.toHaveBeenCalled()
    expect(editor.can().undo()).toBe(false)
  })

  it('ignores the echo of its own save', async () => {
    const { container, update, actions } = mount()
    const editor = await editorOf(container)
    vi.useFakeTimers()
    act(() => {
      editor.commands.insertContent('!')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    const saved = actions.saveNote.mock.calls[0][1].json
    update(bodyState(saved)) // the snapshot that comes back
    expect(container.querySelector('.banner')).toBeNull()
    expect(editor.getText()).toContain('!')
  })

  it('does not overwrite unsaved typing — it asks', async () => {
    const { container, update } = mount()
    const editor = await editorOf(container)
    act(() => {
      editor.commands.insertContent(' my edit')
    })
    update(remoteOf('their version'))
    await waitFor(() => expect(container.querySelector('.banner')).toBeTruthy())
    expect(container.querySelector('.banner').textContent).toMatch(/changed on another device/i)
    expect(editor.getText()).toContain('my edit')
  })

  it('"Load latest" takes theirs and does not write mine back afterwards', async () => {
    const { container, update, actions } = mount()
    const editor = await editorOf(container)
    act(() => {
      editor.commands.insertContent(' my edit')
    })
    update(remoteOf('their version'))
    await waitFor(() => screen.getByRole('button', { name: 'Load latest' }))
    vi.useFakeTimers()
    act(() => {
      screen.getByRole('button', { name: 'Load latest' }).click()
    })
    expect(editor.getText()).toBe('their version')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(actions.saveNote).not.toHaveBeenCalled()
    expect(container.querySelector('.banner')).toBeNull()
  })

  it('"Keep mine" dismisses the banner and saves my version', async () => {
    const { container, update, actions } = mount()
    const editor = await editorOf(container)
    act(() => {
      editor.commands.insertContent(' my edit')
    })
    update(remoteOf('their version'))
    await waitFor(() => screen.getByRole('button', { name: 'Keep mine' }))
    vi.useFakeTimers()
    act(() => {
      screen.getByRole('button', { name: 'Keep mine' }).click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(container.querySelector('.banner')).toBeNull()
    expect(actions.saveNote).toHaveBeenCalledTimes(1)
    expect(actions.saveNote.mock.calls[0][1].json).toContain('my edit')
  })

  it('refuses a remote body it cannot read, rather than applying it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container, update } = mount()
    const editor = await editorOf(container)
    update(bodyState(docOf(para('fine'), { type: 'holographicChart' })))
    await waitFor(() => expect(container.querySelector('.note-meta__status').textContent).toBe('Read-only'))
    expect(editor.getText()).toBe('hello world')
  })
})

describe('paper', () => {
  it('stores a paper change once, shortly after the last tweak', async () => {
    const { container, actions } = mount()
    await editorOf(container)
    await waitFor(() => screen.getByRole('button', { name: 'Page and paper' }))
    const sheet = container.querySelector('.note-sheet')
    expect(sheet.dataset.pattern).toBe('dots') // the default paper
    vi.useFakeTimers()
    act(() => {
      screen.getByRole('button', { name: 'Page and paper' }).click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => {
      screen.getByRole('button', { name: 'Legal pad' }).click()
    })
    expect(sheet.dataset.pattern).toBe('lined') // live
    expect(sheet.dataset.margin).toBe('double')
    expect(actions.updateNoteMeta).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(actions.updateNoteMeta).toHaveBeenCalledTimes(1)
    expect(actions.updateNoteMeta.mock.calls[0][1].paper).toMatchObject({ pattern: 'lined', paperColor: '#fff6a8' })
  })
})
