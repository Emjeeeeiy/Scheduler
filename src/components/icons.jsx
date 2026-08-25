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

/* Moved from NotificationBell.jsx so every drawn icon lives in one file. */
export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  )
}
