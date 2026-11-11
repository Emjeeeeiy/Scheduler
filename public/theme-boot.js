/* Stamp the stored theme onto <html> before first paint, so the app's first
   frame — the sign-in screen, or the skeleton of a returning session — is
   already in the right one. data-theme is the only thing tokens.css keys off,
   and until React mounts nothing else writes it. 'system' is deliberately left
   unstamped, which is exactly the state tokens.css expects: with no explicit
   choice, its media query decides.

   A classic, render-blocking script loaded from index.html's <head> — the same
   timing the inline version had — kept as its own file so the Content Security
   Policy (vercel.json) can stay `script-src 'self'` with no inline hashes to
   keep in sync. */
try {
  var bootTheme = localStorage.getItem('cadence-app:theme')
  if (bootTheme === 'light' || bootTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', bootTheme)
  }
} catch {
  /* No storage access: <html> stays unstamped, the media query owns the
     theme, and ThemeContext settles it on mount. */
}
