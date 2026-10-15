// Design tokens mirrored from DESIGN.md (paper/panel/ink, Inter/Space Mono
// roles, 4/7/10 radii). React Native has no CSS vars: plain JS object.
export const colors = {
  paper: '#f9f9f7',
  panel: '#fcfcfb',
  ink: '#0b0b0b',
  softInk: '#52514e',
  faintInk: '#898781',
  paperDark: '#050505',
  panelDark: '#131313',
  inkDark: '#ffffff',
}

export const radius = { micro: 2, tight: 3, sm: 4, md: 7, lg: 10, pill: 999 }

// Same breakpoints as web: <=900 bottom tabs, <=640 tightened padding.
// Driven by useWindowDimensions, not CSS media queries.
export const BREAKPOINT_NARROW = 900
export const BREAKPOINT_COMPACT = 640
