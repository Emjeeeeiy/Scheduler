import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* A second, narrow test layer alongside `npm test` (node --test, pure logic
   only — it cannot render a component or run an effect). This one exists
   only to prove useModalA11y's actual DOM behaviour (focus trap, focus
   restore) works, not to become a full component-test suite. Scoped to
   *.test.jsx specifically so it can never pick up the node:test-based
   *.test.js files living in the same tests/ folder — those import
   describe/it from 'node:test', not vitest, and would misbehave under this
   runner. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.jsx'],
    globals: true,
  },
})
