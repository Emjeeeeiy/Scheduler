import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/* SSR build of the smoke entry. The two aliases swap the real contexts — which
   would reach for Firebase — for fixtures, so no production module has to know
   it is being tested. */
export default defineConfig({
  root: here('../..'),
  plugins: [react()],
  resolve: {
    /* Matched against the import SPECIFIER, not the resolved path — hence
       regexes rather than absolute paths. They must match the WHOLE specifier
       (`^.*`): an alias regex replaces only the part it matched, so anchoring
       just the tail would leave the leading `../` glued onto the replacement. */
    alias: [
      { find: /^.*\/state\/ScheduleContext\.jsx$/, replacement: here('./mockSchedule.jsx') },
      { find: /^.*\/state\/AuthContext\.jsx$/, replacement: here('./mockAuth.jsx') },
    ],
  },
  build: {
    ssr: here('./entry.jsx'),
    outDir: here('../../node_modules/.smoke'),
    emptyOutDir: true,
    minify: false,
  },
  logLevel: 'warn',
})
