import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/* TEMPORARY — Journal visual QA: the dev harness plus the in-memory Journal
   store. Deleted after use. */
export default defineConfig({
  root: here('../..'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^.*\/state\/ScheduleContext\.jsx$/, replacement: here('./mockSchedule.jsx') },
      { find: /^.*\/state\/AuthContext\.jsx$/, replacement: here('./mockAuth.jsx') },
      { find: /^.*\/state\/useJournal\.js$/, replacement: here('./mockJournal.js') },
    ],
  },
  server: { port: 5187, strictPort: true },
})
