import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { TITLE_MAX, bodyBytes, bodyLimitState, normalizePaper, summarizeDoc } from '@cadence/shared/journal.js'
import { downloadText } from '../../lib/download.js'
import { formatBytes, formatEdited } from '../../lib/journalFormat.js'
import { paperStyle, resolvePaperHex } from '../../lib/journalPaper.js'
import { useOnline } from '../../lib/useOnline.js'
import { useTheme } from '../../state/ThemeContext.jsx'
import { ChevronLeftIcon, TrashIcon, WarningIcon } from '../icons.jsx'
import { EditorToolbar } from './EditorToolbar.jsx'
import { PushPinIcon, SidePanelIcon } from './journalIcons.jsx'
import { ShortcutsHelp } from './ShortcutsHelp.jsx'
import { Drawing } from './extensions/drawing.js'
import { buildExtensions } from './extensions/index.js'
import { useAutosave, useDelayedFlag } from './useAutosave.js'

/* One open note: its title, toolbar, paper and editor, plus everything that
 * keeps what is on screen and what is stored from disagreeing.
 *
 * Mounted with `key={note.id}` by NoteEditor, so each note gets a fresh editor
 * and — importantly — its own undo history. The body it opens on is captured
 * once; after that the stored copy is only listened to (see `remote` below), not
 * re-applied on every snapshot, because re-applying your own saves would fight
 * the caret.
 *
 * The rule behind most of the code here: text on screen is never replaced by
 * something worse. A body this build cannot read opens read-only and is never
 * saved; a save that is too large is refused rather than truncated; a change
 * from another device is shown as a choice rather than applied over unsaved
 * typing.
 */

const SIZE_NOTE = 'This note is getting large. Notes are limited to about 1 MB — consider moving part of it into a new note.'

function Banner({ tone = 'note', children, actions }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <WarningIcon className="banner__icon" />
      <span className="banner__text">{children}</span>
      {actions ? <span className="banner__actions">{actions}</span> : null}
    </div>
  )
}

/** Its own component so typing re-renders this one number, not the surface.
    Split in two for the same reason the toolbar is (see EditorToolbar): the
    hook must start from a real editor, or it never sees the first one. */
function WordCount({ editor }) {
  return editor ? <LiveWordCount editor={editor} /> : <span>0 words</span>
}

function LiveWordCount({ editor }) {
  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => e.storage.characterCount.words(),
  })
  return (
    <span>
      {words} {words === 1 ? 'word' : 'words'}
    </span>
  )
}

export function NoteSurface({
  note,
  bodyState,
  actions,
  defaultPaper,
  onBack,
  onPin,
  onTrash,
  onUseForNew,
  listHidden = false,
  onToggleList,
}) {
  const titleId = useId()
  const titleRef = useRef(null)
  const sheetRef = useRef(null)
  const { theme } = useTheme()
  const online = useOnline()

  /* ------------------------------------------------------------ the body -- */

  const [initial] = useState(() => bodyState.body)
  const unreadable = !initial.valid || !initial.supported
  const [contentError, setContentError] = useState(unreadable)
  const [conflict, setConflict] = useState(null)
  const [sizeState, setSizeState] = useState('ok')
  const [saveError, setSaveError] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [title, setTitle] = useState(note.title)

  const editorRef = useRef(null)
  const titleValue = useRef(note.title)
  const lastSaved = useRef(initial.json) // the stored JSON the editor is known to match
  const remoteHandler = useRef(null)

  /** Queue a write of the current text. Runs from timers and lifecycle events,
      never from render. Returns false to say "not saved" (too large); a write the
      server later refuses comes back through `fail`. */
  function save({ fail }) {
    const editor = editorRef.current
    if (!editor || editor.isDestroyed) return true
    const doc = editor.getJSON()
    const json = JSON.stringify(doc)
    const bytes = bodyBytes(json)
    const limit = bodyLimitState(bytes)
    setSizeState(limit)
    if (limit === 'full') return false
    const { excerpt, hasDrawing } = summarizeDoc(doc)
    lastSaved.current = json
    setSaveError(null)
    actions
      .saveNote(note.id, {
        json,
        title: titleValue.current.trim().slice(0, TITLE_MAX),
        excerpt,
        hasDrawing,
        bytes,
      })
      .catch((caught) => {
        console.error('Could not save the note.', caught)
        setSaveError(caught?.code === 'permission-denied' ? 'You no longer have access to this note.' : 'Could not save your changes.')
        fail()
      })
    return true
  }

  const autosave = useAutosave({ save, enabled: !contentError })

  const extensions = useMemo(
    () =>
      buildExtensions({
        onLink: () => setLinkOpen(true),
        onHelp: () => setHelpOpen(true),
        extra: [Drawing],
      }),
    [],
  )

  const editor = useEditor(
    {
      extensions,
      content: initial.doc,
      editable: !unreadable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      enableContentCheck: true,
      // The editor opens EMPTY on content it cannot parse, so this is the
      // moment saving must stop: an autosave of that blank page would replace
      // the real note with nothing.
      onContentError: () => setContentError(true),
      onUpdate: () => autosave.markDirty(),
      onBlur: () => autosave.flush(),
      editorProps: {
        attributes: {
          id: 'note-editor',
          class: 'note-content',
          'aria-label': 'Note text',
          'aria-multiline': 'true',
          spellcheck: 'true',
        },
        handleKeyDown: (view, event) => {
          // Leave the editor, so Tab is not trapped inside it.
          if (event.key === 'Escape') {
            view.dom.blur()
            return true
          }
          return false
        },
        handleClick: (view, pos, event) => {
          // Links do not open on a plain click — that is how you place the caret
          // inside one — but Ctrl/Cmd-click follows them, as in a document editor.
          if (event.ctrlKey || event.metaKey) {
            const anchor = event.target.closest?.('a[href]')
            if (anchor) {
              window.open(anchor.href, '_blank', 'noopener,noreferrer')
              return true
            }
          }
          return false
        },
      },
    },
    [],
  )

  useEffect(() => {
    editorRef.current = editor
  })

  useEffect(() => {
    /* Only when it actually changes. setEditable emits an update event, which
       autosave would take for typing — so calling it unconditionally on open
       re-saved every note and bumped its "Edited" time. When it does change (a
       body found unreadable after the note was open) the event is wanted: it is
       what tells the toolbar to disable itself, and autosave is already off by
       then because the same state turned it off. */
    if (editor && !editor.isDestroyed && editor.isEditable === contentError) editor.setEditable(!contentError)
  }, [editor, contentError])

  /* ----------------------------------------------- changes from elsewhere -- */

  function applyRemote(remote) {
    const instance = editorRef.current
    if (!instance || instance.isDestroyed) return
    try {
      const doc = instance.schema.nodeFromJSON(remote.doc)
      const tr = instance.state.tr
        .replaceWith(0, instance.state.doc.content.size, doc.content)
        // Not an edit: it must not become an undo step, nor schedule a save.
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
      instance.view.dispatch(tr)
    } catch (caught) {
      console.error('Could not apply the latest version of the note.', caught)
      setContentError(true)
      return
    }
    lastSaved.current = remote.json
    setConflict(null)
  }

  function handleRemote(remote) {
    if (!remote.valid || !remote.supported) {
      setContentError(true)
      return
    }
    // Unsaved typing is never overwritten silently — the writer chooses.
    if (autosave.isDirty()) setConflict(remote)
    else applyRemote(remote)
  }

  // Held in a ref so the effect below reacts to snapshots only, not to the
  // handler's identity changing on every render.
  useEffect(() => {
    remoteHandler.current = handleRemote
  })

  useEffect(() => {
    if (bodyState.loading || !bodyState.exists || bodyState.hasPendingWrites) return
    // Our own save echoing back is the common case, and needs nothing.
    if (bodyState.body.json === lastSaved.current) return
    remoteHandler.current?.(bodyState.body)
  }, [bodyState])

  /* ----------------------------------------------------------------- title -- */

  useEffect(() => {
    // A brand-new note starts with the cursor where the name goes.
    if (!note.title) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [])

  function onTitleChange(event) {
    const value = event.target.value
    setTitle(value)
    titleValue.current = value
    autosave.markDirty()
  }

  /* ----------------------------------------------------------------- paper -- */

  const [paper, setPaper] = useState(note.paper)
  const paperValue = useRef(note.paper)
  const paperTimer = useRef(null)
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })

  function flushPaper() {
    if (!paperTimer.current) return
    clearTimeout(paperTimer.current)
    paperTimer.current = null
    actionsRef.current.updateNoteMeta(note.id, { paper: paperValue.current }).catch((caught) => {
      console.error('Could not save the paper.', caught)
    })
  }

  function changePaper(next) {
    const normalized = normalizePaper(next)
    setPaper(normalized)
    paperValue.current = normalized
    clearTimeout(paperTimer.current)
    // Live on screen immediately; stored once the sliders settle.
    paperTimer.current = setTimeout(flushPaper, 400)
  }

  useEffect(() => flushPaper, []) // eslint-disable-line react-hooks/exhaustive-deps -- flush on close

  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const sheet = useMemo(() => paperStyle(paper), [paper])
  const paperHex = resolvePaperHex(paper, dark)

  /* ---------------------------------------------------------------- status -- */

  const syncing = useDelayedFlag(Boolean(bodyState.hasPendingWrites) && autosave.status === 'saved', 2500)
  let status = 'Saved'
  if (contentError) status = 'Read-only'
  else if (autosave.status === 'dirty') status = 'Saving…'
  else if (autosave.status === 'error') status = 'Not saved'
  else if (syncing) status = online ? 'Syncing…' : 'Saved on this device — syncs when you’re back online'

  const raw = bodyState.body?.json ?? ''

  return (
    <div className="note-surface">
      <div className="note-head">
        <button type="button" className="icon-button note-head__back" aria-label="Back to all notes" onClick={onBack}>
          <ChevronLeftIcon />
        </button>
        <label className="visually-hidden" htmlFor={titleId}>
          Note title
        </label>
        <input
          ref={titleRef}
          id={titleId}
          className="note-title"
          value={title}
          maxLength={TITLE_MAX}
          placeholder="Untitled"
          readOnly={contentError}
          autoComplete="off"
          onChange={onTitleChange}
          onBlur={autosave.flush}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              editor?.commands.focus('start')
            }
          }}
        />
        <div className="note-head__actions">
          {onToggleList ? (
            // Desktop only (hidden under 900px, where the list is its own screen):
            // trades the list for a wider page.
            <button
              type="button"
              className="icon-button note-head__panel"
              aria-pressed={listHidden}
              aria-label={listHidden ? 'Show note list' : 'Hide note list'}
              title={listHidden ? 'Show note list' : 'Hide note list — widen the page'}
              onClick={onToggleList}
            >
              <SidePanelIcon />
            </button>
          ) : null}
          <button
            type="button"
            className={`icon-button${note.pinned ? ' icon-button--on' : ''}`}
            aria-pressed={note.pinned}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            title={note.pinned ? 'Unpin note' : 'Pin note'}
            onClick={onPin}
          >
            <PushPinIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Move note to trash" title="Move to trash" onClick={onTrash}>
            <TrashIcon />
          </button>
        </div>
      </div>

      <p className="note-meta">
        <span>Edited {formatEdited(note.updatedAt) || 'just now'}</span>
        <span aria-hidden="true"> · </span>
        <WordCount editor={editor} />
        <span aria-hidden="true"> · </span>
        <span className="note-meta__status" role="status" aria-live="polite">
          {status}
        </span>
      </p>

      {contentError ? (
        <Banner
          tone="error"
          actions={
            raw ? (
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => downloadText(`note-${note.id}.json`, raw, 'application/json')}>
                Download note data
              </button>
            ) : null
          }
        >
          This note can’t be shown by this version of Cadence, so it’s read-only. Nothing has been changed or deleted.
        </Banner>
      ) : null}
      {conflict ? (
        <Banner
          actions={
            <>
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => { applyRemote(conflict); autosave.reset() }}>
                Load latest
              </button>
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => { setConflict(null); autosave.markDirty() }}>
                Keep mine
              </button>
            </>
          }
        >
          This note was changed on another device while you were editing.
        </Banner>
      ) : null}
      {saveError ? (
        <Banner tone="error" actions={<button type="button" className="ghost-button ghost-button--sm" onClick={autosave.markDirty}>Try again</button>}>
          {saveError} Your text is still here.
        </Banner>
      ) : null}
      {sizeState === 'full' ? (
        <Banner tone="error">
          This note is too large to save, so your latest changes are <strong>not</strong> saved. Move some of it into a new note.
        </Banner>
      ) : sizeState === 'warn' ? (
        <Banner>{SIZE_NOTE} ({formatBytes(bodyBytes(lastSaved.current))} so far.)</Banner>
      ) : null}

      <EditorToolbar
        editor={editor}
        paperHex={paperHex}
        linkOpen={linkOpen}
        onLinkOpenChange={setLinkOpen}
        onHelp={() => setHelpOpen(true)}
        // No .focus() in the chain: TipTap re-focuses the text a frame later,
        // which would take focus back from the drawing it just selected.
        onInsertDrawing={() => editorRef.current?.commands.insertDrawing()}
        paperProps={{
          paper,
          disabled: contentError,
          onChange: changePaper,
          onUseForNew: () => onUseForNew(paper),
          onReset: () => changePaper(defaultPaper),
        }}
      />

      <div className="note-sheet-wrap">
        <div ref={sheetRef} className="note-sheet" style={sheet.style} {...sheet.attrs}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {helpOpen ? <ShortcutsHelp onClose={() => setHelpOpen(false)} /> : null}
    </div>
  )
}
