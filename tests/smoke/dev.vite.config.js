import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/* TEMPORARY manual-QA harness — not part of the shipped app, delete after use.
   Same context aliases as the SSR smoke build, but as a real dev server so the
   app can be driven in an actual browser without a Firebase project. */
export default defineConfig({
  root: here('../..'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^.*\/state\/ScheduleContext\.jsx$/, replacement: here('./mockSchedule.jsx') },
      { find: /^.*\/state\/AuthContext\.jsx$/, replacement: here('./mockAuth.jsx') },
    ],
  },
  server: { port: 5183, strictPort: true },
})
