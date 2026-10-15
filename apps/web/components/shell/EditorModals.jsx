'use client'

import { ItemDetail } from '../editors/ItemDetail.jsx'
import { TaskEditor } from '../editors/TaskEditor.jsx'
import { EventEditor } from '../editors/EventEditor.jsx'

// The modal half of the editor slot — same keying as src/App.jsx so stepping
// from an occurrence to its rule rebuilds the form instead of reusing state.
export function EditorModals({ stack }) {
  const { editor, closeEditor, startEditing, editTaskDirect, changeEditorKind } = stack

  return (
    <>
      {editor && editor.mode === 'view' && (
        <ItemDetail editor={editor} onClose={closeEditor} onEdit={startEditing} />
      )}
      {editor && editor.mode !== 'view' && editor.kind === 'event' && (
        <EventEditor
          key={editor.mode === 'edit' ? `event-${editor.event.id}` : 'create-event'}
          editor={editor}
          onClose={closeEditor}
          onChangeKind={changeEditorKind}
        />
      )}
      {editor && editor.mode !== 'view' && editor.kind !== 'event' && (
        <TaskEditor
          key={editor.mode === 'edit' ? editor.task.id : 'create-task'}
          editor={editor}
          onClose={closeEditor}
          onEditTask={editTaskDirect}
          onChangeKind={changeEditorKind}
        />
      )}
    </>
  )
}
