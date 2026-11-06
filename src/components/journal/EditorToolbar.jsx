import { useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { formatFullDayLabel, todayKey } from '@cadence/shared/date.js'
import { HIGHLIGHT_COLORS, TEXT_COLORS, asMarker } from '../../lib/journalColors.js'
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  JOURNAL_FONTS,
  clampFontSize,
  firstFamily,
  fontForValue,
  parseFontSize,
  toPt,
} from '../../lib/journalFonts.js'
import { LINE_SPACINGS } from './extensions/lineSpacing.js'
import { ColorPicker } from './ColorPicker.jsx'
import { LinkForm } from './LinkForm.jsx'
import { PaperMenu } from './PaperPicker.jsx'
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ClearFormatIcon,
  CodeIcon,
  DrawingIcon,
  HighlighterIcon,
  HorizontalRuleIcon,
  IndentIcon,
  ItalicIcon,
  KeyboardIcon,
  LineSpacingIcon,
  LinkIcon,
  ListBulletIcon,
  ListCheckIcon,
  ListNumberIcon,
  MinusIcon,
  MoreIcon,
  OutdentIcon,
  PlusSmallIcon,
  RedoIcon,
  StrikeIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TextColorIcon,
  UnderlineIcon,
  UndoIcon,
} from './journalIcons.jsx'
import { DayIcon } from '../icons.jsx'
import { MenuItem, ToolButton, ToolPopover, ToolSeparator, TriggerButton } from './ToolbarParts.jsx'
import { useRovingFocus } from './toolbarUtils.js'

/* The formatting toolbar. Every control is a command on the editor; none holds
 * formatting state of its own. What is on, and what the caret is in, is read
 * back from the editor through one selector, so the toolbar re-renders only when
 * one of these values actually changes — not on every keystroke.
 */

const ALIGNMENTS = [
  { id: 'left', label: 'Align left', shortcut: 'alignLeft', icon: AlignLeftIcon },
  { id: 'center', label: 'Align center', shortcut: 'alignCenter', icon: AlignCenterIcon },
  { id: 'right', label: 'Align right', shortcut: 'alignRight', icon: AlignRightIcon },
  { id: 'justify', label: 'Justify', shortcut: 'alignJustify', icon: AlignJustifyIcon },
]

const STYLES = [
  { id: 'p', label: 'Normal text', shortcut: 'normal' },
  { id: 'h1', label: 'Heading 1', shortcut: 'h1', style: { fontSize: '1.4em', fontWeight: 650 } },
  { id: 'h2', label: 'Heading 2', shortcut: 'h2', style: { fontSize: '1.2em', fontWeight: 650 } },
  { id: 'h3', label: 'Heading 3', shortcut: 'h3', style: { fontSize: '1.05em', fontWeight: 650 } },
  { id: 'quote', label: 'Quote', shortcut: 'quote' },
  { id: 'code', label: 'Code block', shortcut: 'codeBlock', style: { fontFamily: 'var(--font-mono)' } },
]

const run = (editor, command) => command(editor.chain().focus()).run()

function readState(editor) {
  const text = editor.getAttributes('textStyle')
  return {
    editable: editor.isEditable,
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    sub: editor.isActive('subscript'),
    sup: editor.isActive('superscript'),
    link: editor.isActive('link'),
    highlightColor: editor.getAttributes('highlight').color ?? null,
    color: text.color ?? null,
    fontFamily: text.fontFamily ?? null,
    fontSize: parseFontSize(text.fontSize),
    align: ALIGNMENTS.find((a) => editor.isActive({ textAlign: a.id }))?.id ?? 'left',
    heading: [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? null,
    bullet: editor.isActive('bulletList'),
    ordered: editor.isActive('orderedList'),
    task: editor.isActive('taskList'),
    quote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
    lineHeight:
      editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? null,
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  }
}

function styleOf(state) {
  if (state.heading) return `h${state.heading}`
  if (state.quote) return 'quote'
  if (state.codeBlock) return 'code'
  return 'p'
}

function applyStyle(editor, id) {
  const chain = editor.chain().focus()
  if (id === 'p') {
    if (editor.isActive('blockquote')) chain.lift('blockquote')
    chain.setParagraph().run()
  } else if (id === 'quote') chain.toggleBlockquote().run()
  else if (id === 'code') chain.toggleCodeBlock().run()
  else chain.setHeading({ level: Number(id.slice(1)) }).run()
}

/* ---------------------------------------------------------------- menus -- */

function StyleMenu({ editor, state, disabled }) {
  const [open, setOpen] = useState(false)
  const current = styleOf(state)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Paragraph style"
      width={220}
      renderTrigger={(props) => (
        <TriggerButton
          {...props}
          wide
          disabled={disabled}
          label="Paragraph style"
          text={STYLES.find((s) => s.id === current).label}
        />
      )}
    >
      {({ close }) =>
        STYLES.map((s) => (
          <MenuItem
            key={s.id}
            label={s.label}
            shortcut={s.shortcut}
            checked={current === s.id}
            style={s.style}
            onSelect={() => {
              applyStyle(editor, s.id)
              close()
            }}
          />
        ))
      }
    </ToolPopover>
  )
}

function FontMenu({ editor, state, disabled }) {
  const [open, setOpen] = useState(false)
  const font = fontForValue(state.fontFamily)
  const name = font ? font.label : firstFamily(state.fontFamily)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Font"
      width={230}
      maxHeight={380}
      renderTrigger={(props) => (
        <TriggerButton {...props} wide disabled={disabled} label="Font" text={name} />
      )}
    >
      {({ close }) =>
        JOURNAL_FONTS.map((f) => (
          <MenuItem
            key={f.id}
            label={f.label}
            checked={font?.id === f.id}
            style={{ fontFamily: f.value ?? 'var(--font-sans)' }}
            onSelect={() => {
              run(editor, (c) => (f.value ? c.setFontFamily(f.value) : c.unsetFontFamily()))
              close()
            }}
          />
        ))
      }
    </ToolPopover>
  )
}

function SizeControl({ editor, size, disabled }) {
  const shown = size ?? DEFAULT_FONT_SIZE
  const apply = (raw) => {
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value === shown) return
    run(editor, (c) => c.setFontSize(toPt(clampFontSize(Math.round(value * 2) / 2))))
  }
  return (
    <div className="tb-size" role="group" aria-label="Font size">
      <ToolButton
        icon={MinusIcon}
        label="Smaller text"
        shortcut="smaller"
        disabled={disabled}
        onClick={() => run(editor, (c) => c.decreaseFontSize())}
      />
      <input
        // Re-keyed on the size so the field follows the selection; typing in it
        // is uncontrolled, and only a changed value is applied on blur.
        key={shown}
        className="tb-size__input"
        inputMode="decimal"
        aria-label="Font size in points"
        defaultValue={shown}
        disabled={disabled}
        list="journal-font-sizes"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            apply(event.currentTarget.value)
            editor.commands.focus()
          } else if (event.key === 'Escape') {
            event.currentTarget.value = String(shown)
            editor.commands.focus()
          }
        }}
        onBlur={(event) => apply(event.currentTarget.value)}
      />
      <datalist id="journal-font-sizes">
        {FONT_SIZES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <ToolButton
        icon={PlusSmallIcon}
        label="Larger text"
        shortcut="bigger"
        disabled={disabled}
        onClick={() => run(editor, (c) => c.increaseFontSize())}
      />
    </div>
  )
}

function ColorMenu({ kind, editor, state, paperHex, disabled }) {
  const [open, setOpen] = useState(false)
  const isText = kind === 'text'
  const current = isText ? state.color : state.highlightColor
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label={isText ? 'Text color' : 'Highlight color'}
      width={236}
      renderTrigger={(props) => (
        <TriggerButton
          {...props}
          icon={isText ? TextColorIcon : HighlighterIcon}
          label={isText ? 'Text color' : 'Highlight color'}
          title={isText ? 'Text color' : 'Highlight color'}
          disabled={disabled}
        >
          <span className="tb-colorbar" style={{ '--bar': current ?? 'transparent' }} />
        </TriggerButton>
      )}
    >
      {({ close }) =>
        isText ? (
          <ColorPicker
            label="Text colors"
            swatches={TEXT_COLORS}
            value={current}
            paperHex={paperHex}
            recentKey="cadence-journal:recent-text"
            clearLabel="Automatic"
            onClear={() => {
              run(editor, (c) => c.unsetColor())
              close()
            }}
            onPick={(color) => {
              run(editor, (c) => c.setColor(color))
              close()
            }}
          />
        ) : (
          <ColorPicker
            label="Highlight colors"
            swatches={HIGHLIGHT_COLORS}
            value={current}
            recentKey="cadence-journal:recent-highlight"
            clearLabel="No highlight"
            toValue={asMarker}
            onClear={() => {
              run(editor, (c) => c.unsetHighlight())
              close()
            }}
            onPick={(color) => {
              run(editor, (c) => c.setHighlight({ color }))
              close()
            }}
          />
        )
      }
    </ToolPopover>
  )
}

function AlignMenu({ editor, state, disabled }) {
  const [open, setOpen] = useState(false)
  const current = ALIGNMENTS.find((a) => a.id === state.align) ?? ALIGNMENTS[0]
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Alignment"
      width={210}
      renderTrigger={(props) => (
        <TriggerButton {...props} icon={current.icon} label="Alignment" disabled={disabled} />
      )}
    >
      {({ close }) =>
        ALIGNMENTS.map((a) => (
          <MenuItem
            key={a.id}
            icon={a.icon}
            label={a.label}
            shortcut={a.shortcut}
            checked={state.align === a.id}
            onSelect={() => {
              run(editor, (c) => c.setTextAlign(a.id))
              close()
            }}
          />
        ))
      }
    </ToolPopover>
  )
}

function SpacingMenu({ editor, state, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Line spacing"
      width={200}
      renderTrigger={(props) => (
        <TriggerButton {...props} icon={LineSpacingIcon} label="Line spacing" disabled={disabled} />
      )}
    >
      {({ close }) => (
        <>
          <MenuItem
            label="Paper default"
            checked={state.lineHeight == null}
            onSelect={() => {
              run(editor, (c) => c.unsetLineSpacing())
              close()
            }}
          />
          {LINE_SPACINGS.map((s) => (
            <MenuItem
              key={s.value}
              label={s.label}
              checked={state.lineHeight === s.value}
              onSelect={() => {
                run(editor, (c) => c.setLineSpacing(s.value))
                close()
              }}
            />
          ))}
        </>
      )}
    </ToolPopover>
  )
}

function InsertMenu({ editor, onInsertDrawing, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Insert"
      width={210}
      renderTrigger={(props) => <TriggerButton {...props} text="Insert" label="Insert" disabled={disabled} />}
    >
      {({ close }) => (
        <>
          {onInsertDrawing ? (
            <MenuItem
              icon={DrawingIcon}
              label="Drawing"
              onSelect={() => {
                onInsertDrawing()
                close()
              }}
            />
          ) : null}
          <MenuItem
            icon={HorizontalRuleIcon}
            label="Horizontal line"
            onSelect={() => {
              run(editor, (c) => c.setHorizontalRule())
              close()
            }}
          />
          <MenuItem
            icon={DayIcon}
            label="Today’s date"
            onSelect={() => {
              run(editor, (c) => c.insertContent(formatFullDayLabel(todayKey())))
              close()
            }}
          />
        </>
      )}
    </ToolPopover>
  )
}

function MoreMenu({ editor, state, onHelp, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="More formatting"
      width={240}
      renderTrigger={(props) => (
        <TriggerButton {...props} icon={MoreIcon} label="More formatting" disabled={disabled} />
      )}
    >
      {({ close }) => (
        <>
          <MenuItem
            icon={SubscriptIcon}
            label="Subscript"
            shortcut="subscript"
            checked={state.sub}
            onSelect={() => {
              run(editor, (c) => c.toggleSubscript())
              close()
            }}
          />
          <MenuItem
            icon={SuperscriptIcon}
            label="Superscript"
            shortcut="superscript"
            checked={state.sup}
            onSelect={() => {
              run(editor, (c) => c.toggleSuperscript())
              close()
            }}
          />
          <MenuItem
            icon={CodeIcon}
            label="Code"
            shortcut="code"
            checked={state.code}
            onSelect={() => {
              run(editor, (c) => c.toggleCode())
              close()
            }}
          />
          <MenuItem
            icon={ClearFormatIcon}
            label="Clear formatting"
            shortcut="clear"
            onSelect={() => {
              run(editor, (c) => c.clearFormatting())
              close()
            }}
          />
          <MenuItem
            icon={KeyboardIcon}
            label="Keyboard shortcuts"
            shortcut="help"
            onSelect={() => {
              close()
              onHelp()
            }}
          />
        </>
      )}
    </ToolPopover>
  )
}

/* -------------------------------------------------------------- toolbar -- */

/* TipTap's useEditorState caches its first snapshot, and when the editor only
   appears after that first render — which `immediatelyRender: false` makes the
   normal case — it never refreshes it: the selector keeps seeing `editor: null`
   until the first transaction, and the toolbar sits disabled until the writer
   happens to click into the text. So the part that reads the editor is only
   mounted once there is one, and the hook starts from a real editor. */
export function EditorToolbar(props) {
  if (!props.editor) {
    // The toolbar's footprint, so the page does not jump when it arrives.
    return <div className="journal-toolbar journal-toolbar--pending" role="toolbar" aria-label="Formatting" aria-busy="true" />
  }
  return <ActiveToolbar {...props} />
}

function ActiveToolbar({
  editor,
  paperProps,
  paperHex,
  linkOpen,
  onLinkOpenChange,
  onHelp,
  onInsertDrawing,
}) {
  const ref = useRef(null)
  useRovingFocus(ref)
  const s = useEditorState({ editor, selector: ({ editor: e }) => readState(e) })
  const off = !s.editable

  return (
    <div ref={ref} className="journal-toolbar" role="toolbar" aria-label="Formatting" aria-controls="note-editor">
      <div className="tb-group">
        <ToolButton
          icon={UndoIcon}
          label="Undo"
          shortcut="undo"
          disabled={off || !s.canUndo}
          onClick={() => run(editor, (c) => c.undo())}
        />
        <ToolButton
          icon={RedoIcon}
          label="Redo"
          shortcut="redo"
          disabled={off || !s.canRedo}
          onClick={() => run(editor, (c) => c.redo())}
        />
      </div>

      <ToolSeparator />
      <div className="tb-group">
        <StyleMenu editor={editor} state={s} disabled={off} />
        <FontMenu editor={editor} state={s} disabled={off} />
        <SizeControl editor={editor} size={s.fontSize} disabled={off} />
      </div>

      <ToolSeparator />
      <div className="tb-group">
        <ToolButton icon={BoldIcon} label="Bold" shortcut="bold" pressed={s.bold} disabled={off} onClick={() => run(editor, (c) => c.toggleBold())} />
        <ToolButton icon={ItalicIcon} label="Italic" shortcut="italic" pressed={s.italic} disabled={off} onClick={() => run(editor, (c) => c.toggleItalic())} />
        <ToolButton icon={UnderlineIcon} label="Underline" shortcut="underline" pressed={s.underline} disabled={off} onClick={() => run(editor, (c) => c.toggleUnderline())} />
        <ToolButton icon={StrikeIcon} label="Strikethrough" shortcut="strike" pressed={s.strike} disabled={off} onClick={() => run(editor, (c) => c.toggleStrike())} />
      </div>

      <ToolSeparator />
      <div className="tb-group">
        <ColorMenu kind="text" editor={editor} state={s} paperHex={paperHex} disabled={off} />
        <ColorMenu kind="highlight" editor={editor} state={s} disabled={off} />
        <ToolPopover
          open={linkOpen}
          onOpenChange={onLinkOpenChange}
          label="Link"
          width={300}
          renderTrigger={(props) => (
            <ToolButton {...props} icon={LinkIcon} label="Insert link" shortcut="link" pressed={s.link} disabled={off} />
          )}
        >
          {({ close }) => <LinkForm editor={editor} close={close} />}
        </ToolPopover>
      </div>

      <ToolSeparator />
      <div className="tb-group">
        <AlignMenu editor={editor} state={s} disabled={off} />
        <SpacingMenu editor={editor} state={s} disabled={off} />
        <ToolButton icon={ListBulletIcon} label="Bulleted list" shortcut="bullets" pressed={s.bullet} disabled={off} onClick={() => run(editor, (c) => c.toggleBulletList())} />
        <ToolButton icon={ListNumberIcon} label="Numbered list" shortcut="numbers" pressed={s.ordered} disabled={off} onClick={() => run(editor, (c) => c.toggleOrderedList())} />
        <ToolButton icon={ListCheckIcon} label="Checklist" shortcut="checklist" pressed={s.task} disabled={off} onClick={() => run(editor, (c) => c.toggleTaskList())} />
        <ToolButton
          icon={OutdentIcon}
          label="Decrease indent"
          shortcut="outdent"
          disabled={off}
          onClick={() =>
            run(editor, (c) => {
              const item = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null
              return item ? c.liftListItem(item) : c.outdent()
            })
          }
        />
        <ToolButton
          icon={IndentIcon}
          label="Increase indent"
          shortcut="indent"
          disabled={off}
          onClick={() =>
            run(editor, (c) => {
              const item = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null
              return item ? c.sinkListItem(item) : c.indent()
            })
          }
        />
      </div>

      <ToolSeparator />
      <div className="tb-group">
        <InsertMenu editor={editor} onInsertDrawing={onInsertDrawing} disabled={off} />
        <PaperMenu {...paperProps} />
        <MoreMenu editor={editor} state={s} onHelp={onHelp} disabled={off} />
      </div>
    </div>
  )
}
