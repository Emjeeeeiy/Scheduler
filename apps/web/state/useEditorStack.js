'use client'

import { useCallback, useState } from 'react'

// The editor slot from src/App.jsx, extracted verbatim so every Next.js route
// shares one create/view/edit flow. `editor` holds either kind; `mode` is
// create | view | edit. Clicking an item opens read-only 'view' (ItemDetail);
// its Edit button promotes to 'edit'. Explicit Edit affordances skip 'view'.
export function useEditorStack() {
  const [editor, setEditor] = useState(null)

  const openCreate = useCallback((draft = {}) => setEditor({ mode: 'create', kind: 'task', draft }), [])
  const openEdit = useCallback((task) => setEditor({ mode: 'view', kind: 'task', task }), [])
  const openEditEvent = useCallback(
    (event) => setEditor({ mode: 'view', kind: 'event', event }),
    [],
  )
  const editTaskDirect = useCallback(
    (task) => setEditor({ mode: 'edit', kind: 'task', task }),
    [],
  )
  const editEventDirect = useCallback(
    (event) => setEditor({ mode: 'edit', kind: 'event', event }),
    [],
  )
  const startEditing = useCallback((updated) => {
    setEditor((current) => {
      if (!current || current.mode !== 'view') return current
      const key = current.kind === 'event' ? 'event' : 'task'
      return { ...current, mode: 'edit', [key]: updated ?? current[key] }
    })
  }, [])
  const openCreateEvent = useCallback(
    (draft = {}) => setEditor({ mode: 'create', kind: 'event', draft }),
    [],
  )
  const closeEditor = useCallback(() => setEditor(null), [])

  // Switching kind mid-create keeps the chosen day — usually why the editor
  // was opened from a particular cell.
  const changeEditorKind = useCallback((kind) => {
    setEditor((current) => {
      if (!current || current.mode !== 'create' || current.kind === kind) return current
      const draft = current.draft ?? {}
      if (kind === 'event') {
        const startDate = draft.date ?? draft.startDate ?? null
        return {
          mode: 'create',
          kind: 'event',
          draft: {
            title: draft.title,
            startDate,
            endDate: startDate,
            startMin: draft.startMin ?? null,
            tagId: draft.tagId ?? null,
          },
        }
      }
      return {
        mode: 'create',
        kind: 'task',
        draft: {
          title: draft.title,
          date: draft.startDate ?? draft.date ?? null,
          startMin: draft.startMin ?? null,
          tagId: draft.tagId ?? null,
        },
      }
    })
  }, [])

  return {
    editor,
    openCreate,
    openEdit,
    openEditEvent,
    editTaskDirect,
    editEventDirect,
    startEditing,
    openCreateEvent,
    closeEditor,
    changeEditorKind,
  }
}
