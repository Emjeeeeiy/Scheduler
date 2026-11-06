import { Icon } from '../icons.jsx'

/* The Journal editor's icons. Same grammar as icons.jsx (24×24, 2px round
   stroke, no fill) and drawn on its `Icon` base, but kept in this file so the
   forty-odd glyphs only ship with the Journal chunk rather than in every page's
   bundle. A dot is a zero-length stroke with a round cap, which keeps even
   those inside the "no fills" rule. */

export function BoldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Z" />
      <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7Z" />
    </Icon>
  )
}

export function ItalicIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 4h-9M14 20H5M15 4 9 20" />
    </Icon>
  )
}

export function UnderlineIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />
    </Icon>
  )
}

export function StrikeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="M16 6.5c-.8-1.1-2.2-1.8-4-1.8-2.4 0-4 1.2-4 3 0 1.4 1.1 2.1 2.6 2.6" />
      <path d="M8.5 17.2c.9 1.1 2.1 1.6 3.7 1.6 2.4 0 4-1.2 4-3 0-.9-.4-1.5-1-2" />
    </Icon>
  )
}

export function TextColorIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 18 7-14 7 14M8.5 13h7" />
    </Icon>
  )
}

export function HighlighterIcon(props) {
  return (
    <Icon {...props}>
      <path d="m14.5 5 4.5 4.5-9 9H5.5V14Z" />
      <path d="M4 21h8" />
    </Icon>
  )
}

export function AlignLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </Icon>
  )
}

export function AlignCenterIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </Icon>
  )
}

export function AlignRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
    </Icon>
  )
}

export function AlignJustifyIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </Icon>
  )
}

export function LineSpacingIcon(props) {
  return (
    <Icon {...props}>
      <path d="M11 6h9M11 12h9M11 18h9" />
      <path d="M6 5v14" />
      <path d="m3.5 7.5 2.5-2.5 2.5 2.5M3.5 16.5 6 19l2.5-2.5" />
    </Icon>
  )
}

export function ListBulletIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </Icon>
  )
}

export function ListNumberIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5.2 5.4 4.2V8" />
      <path d="M3.8 11.6c.2-.9 2.9-.9 2.9.5 0 1.1-2.9 1.7-2.9 3h3" />
      <path d="M3.8 17c.9-.5 2.9-.3 2.7.9-.1.6-.8.8-1.4.8.8 0 1.5.2 1.5 1s-1.3 1.2-2.9.5" />
    </Icon>
  )
}

export function ListCheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m3.5 6.5 1.8 1.8L8.5 5" />
      <path d="m3.5 16 1.8 1.8 3.2-3.3" />
      <path d="M12 6.5h8M12 16h8" />
    </Icon>
  )
}

export function IndentIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 5h16M11 10h9M11 14h9M4 19h16" />
      <path d="m4 9.5 3.5 2.5L4 14.5Z" />
    </Icon>
  )
}

export function OutdentIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 5h16M11 10h9M11 14h9M4 19h16" />
      <path d="M8 9.5 4.5 12 8 14.5Z" />
    </Icon>
  )
}

export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  )
}

export function UndoIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4" />
    </Icon>
  )
}

export function RedoIcon(props) {
  return (
    <Icon {...props}>
      <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h4" />
    </Icon>
  )
}

export function ClearFormatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 5h14M12 5v9M9 19h4" />
      <path d="m15.5 15 5 5M20.5 15l-5 5" />
    </Icon>
  )
}

export function SubscriptIcon(props) {
  return (
    <Icon {...props}>
      <path d="m4 5 8 10M12 5 4 15" />
      <path d="M15.5 18.5c.3-1.2 3-1.2 3 .3 0 1.2-3 1.7-3 3h3.2" />
    </Icon>
  )
}

export function SuperscriptIcon(props) {
  return (
    <Icon {...props}>
      <path d="m4 9 8 10M12 9 4 19" />
      <path d="M15.5 4.5c.3-1.2 3-1.2 3 .3 0 1.2-3 1.7-3 3h3.2" />
    </Icon>
  )
}

export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </Icon>
  )
}

export function QuoteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 8c-2 .8-3 2.4-3 5v3h5v-5H6.2c0-1.2.6-2 1.8-2.6Z" />
      <path d="M17 8c-2 .8-3 2.4-3 5v3h5v-5h-2.8c0-1.2.6-2 1.8-2.6Z" />
    </Icon>
  )
}

export function PageIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3h8l5 5v13H6Z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

export function KeyboardIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 6h18v12H3Z" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </Icon>
  )
}

export function PenIcon(props) {
  return (
    <Icon {...props}>
      <path d="m4 20 1-4L16 5a2.1 2.1 0 0 1 3 3L8 19Z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  )
}

export function EraserIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 20h11" />
      <path d="m5.5 15.5 9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 20H8.8l-3.3-3.3a1.6 1.6 0 0 1 0-1.2Z" />
      <path d="m9 12 6 6" />
    </Icon>
  )
}

export function DrawingIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 4.5h17v15h-17Z" />
      <path d="M7 15c1.5-4 3-4 4.5-1.5S14.5 11 17 8" />
    </Icon>
  )
}

export function TableIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 5.5h17v13h-17Z" />
      <path d="M3.5 10h17M3.5 14.5h17M9.5 5.5v13M15 5.5v13" />
    </Icon>
  )
}

export function ImageIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 5h17v14h-17Z" />
      <path d="m3.5 16 5-5 4 4 3-3 5 5" />
      <path d="M9 9.5h.01" />
    </Icon>
  )
}

export function PrinterIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 8V3.5h10V8" />
      <path d="M7 17H4.5V9.5h15V17H17" />
      <path d="M7 14h10v6.5H7Z" />
    </Icon>
  )
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function PushPinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 3.5h6l-.8 6 2.8 3.2H7l2.8-3.2Z" />
      <path d="M12 12.7v7.8" />
    </Icon>
  )
}

export function HorizontalRuleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="M7 6h10M7 18h10" />
    </Icon>
  )
}

export function MoreIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </Icon>
  )
}

export function HelpIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.8.5-1.1 1-1.1 1.8M12 17h.01" />
    </Icon>
  )
}

export function FileTextIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3h8l5 5v13H6Z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </Icon>
  )
}

export function MarginIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 4.5h17v15h-17Z" />
      <path d="M8.5 4.5v15M10 9h7M10 13h7" />
    </Icon>
  )
}

export function MinusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  )
}

export function PlusSmallIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M12 5v14" />
    </Icon>
  )
}

export function SidePanelIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 5h17v14h-17Z" />
      <path d="M9.5 5v14" />
    </Icon>
  )
}
