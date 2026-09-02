/* A small stroke-icon set, one consistent grammar (24×24, 2px stroke, round
   caps/joins) for everything that used to be a bare Unicode glyph. Mirrors
   NotificationBell's own BellIcon, which drew a real icon for exactly this
   reason: no character reads unambiguously, and a mixed vocabulary of glyphs
   plus one drawn icon is worse than either alone. Sizing is left to the
   caller (CSS width/height, or explicit props) rather than baked in here. */

function Icon({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** The brand mark — a clock face, echoing the "Cadence" name. */
export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  )
}

export function DashboardIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  )
}

export function DayIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </Icon>
  )
}

export function WeekIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8.5 9.5v10M13.5 9.5v10" />
    </Icon>
  )
}

export function MonthIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path
        d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01M16.5 17.5h.01"
        strokeWidth="2.5"
      />
    </Icon>
  )
}

export function TagIcon(props) {
  return (
    <Icon {...props}>
      <path d="M11.5 3.5H6a2 2 0 0 0-2 2v5.5a2 2 0 0 0 .59 1.41l7 7a2 2 0 0 0 2.82 0l5.5-5.5a2 2 0 0 0 0-2.82l-7-7a2 2 0 0 0-1.41-.59Z" />
      <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function RepeatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5" />
      <path d="M18 4v4h-4M6 20v-4h4" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

export function ChevronLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  )
}

export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

export function ThemeSystemIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </Icon>
  )
}

export function ThemeLightIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" />
    </Icon>
  )
}

export function ThemeDarkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" />
    </Icon>
  )
}

export function WarningIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" strokeWidth="2.6" />
    </Icon>
  )
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

/** Reveal a masked password field. */
export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 12C5.5 7 8.5 5.5 12 5.5S18.5 7 21.5 12C18.5 17 15.5 18.5 12 18.5S5.5 17 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/* The same lens struck through, rather than a second drawing with its own
   silhouette — the pair has to read as one control changing state, and at
   16px a slashed shape says "hidden" faster than a redrawn outline does. The
   iris is dropped here so the slash is the only thing inside the lens. */
export function EyeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 12C5.5 7 8.5 5.5 12 5.5S18.5 7 21.5 12C18.5 17 15.5 18.5 12 18.5S5.5 17 2.5 12Z" />
      <path d="M4.5 4.5l15 15" />
    </Icon>
  )
}

/** A bulleted list — the full task/event index. */
export function ListIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.6" />
    </Icon>
  )
}

/** A panel with an arrow leaving it — sign out. */
export function LogOutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </Icon>
  )
}

/** A tray catching something dropped in — the inbox stat tile. */
export function InboxIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12h4l1.5 3h5L16 12h4" />
      <path d="M5.5 6h13L20 12v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6L5.5 6Z" />
    </Icon>
  )
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 13l4 4L19 7" />
    </Icon>
  )
}

/** An upward line — the completion-rate stat tile. */
export function TrendIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 16l5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </Icon>
  )
}

/** A measured run with a tick at each end — an event, which occupies a span of
    days rather than sitting on one. Deliberately not a second calendar glyph:
    MonthIcon already owns that shape, and the thing that distinguishes an
    event from a task here is the range, not the calendar. */
export function SpanIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="M4 8v8" />
      <path d="M20 8v8" />
    </Icon>
  )
}

/* The one deliberate exception to the stroke grammar above: a third-party
   brand mark (Google's "G") is shown as its own real multi-colour logo on an
   OAuth button, per standard sign-in-button convention — not drawn in this
   app's own icon voice. */
export function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27v-3.1H1.27C.46 8.24 0 10.06 0 12s.46 3.76 1.27 5.37l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.1c.95-2.85 3.6-4.98 6.73-4.98z"
      />
    </svg>
  )
}

/* Moved from NotificationBell.jsx so every drawn icon lives in one file. */
export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  )
}

export function CameraIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </Icon>
  )
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M18 7l-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  )
}

export function UserIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.13-6 7-6s7 2.4 7 6" />
    </Icon>
  )
}

/** Focus Mode's nav icon — a target, for the one thing a Pomodoro round asks
    you to do. */
export function FocusIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function PlayIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5z" strokeLinejoin="round" />
    </Icon>
  )
}

export function PauseIcon(props) {
  return (
    <Icon {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </Icon>
  )
}

export function ResetIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 4v6h6" />
      <path d="M5.5 10A8 8 0 1 1 6 17.5" />
    </Icon>
  )
}
