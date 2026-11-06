import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

/* A second, narrow test layer alongside `npm test` (node --test, pure logic
   only — it cannot render a component or run an effect). This one exists
   only to prove useModalA11y's actual DOM behaviour (focus trap, focus
   restore) works, not to become a full component-test suite. Scoped to
   *.test.jsx specifically so it can never pick up the node:test-based
   *.test.js files living in the same tests/ folder — those import
   describe/it from 'node:test', not vitest, and would misbehave under this
   runner.

   Two projects, because the files want different runtimes:
   - dom: jsdom was being rebuilt for every test file (25 times, ~70% of the
     run, and slow enough under that load for a findByRole to time out).
     vmThreads builds it once per worker and still isolates each file.
   - node: the api/*.js handler tests never touch the DOM, and @google/genai
     needs Node's web globals (ReadableStream), which a vm context does not
     get. They run on the plain forks pool. */
const testFiles = ['tests/**/*.test.jsx']
const apiTests = ['tests/apiHandlers.test.jsx', 'tests/pushHandlers.test.jsx']

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          pool: 'vmThreads',
          include: testFiles,
          exclude: [...configDefaults.exclude, ...apiTests],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: apiTests,
        },
      },
    ],
  },
})
