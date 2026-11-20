/* The one real call to Gemini (api/_lib/gemini.js), with the SDK itself faked.
 * Every route test mocks generateJson whole, so what generateJson hands the SDK —
 * here, the optional output ceiling — is not exercised anywhere else.
 *
 * Named .test.jsx and listed in vitest.config.js's apiTests: it imports an api
 * file, which needs the node project (see that file's comment). */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: sdk.generateContent }
    }
  },
  ApiError: class ApiError extends Error {},
}))

import { generateJson } from '../api/_lib/gemini.js'

const call = (extra = {}) =>
  generateJson({ model: 'm', systemInstruction: 's', prompt: 'p', schema: { type: 'object' }, ...extra })

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
  sdk.generateContent.mockResolvedValue({ text: '{"ok":true}' })
})

describe('generateJson', () => {
  it('returns the parsed JSON the model wrote', async () => {
    await expect(call()).resolves.toEqual({ ok: true })
  })

  it('asks for JSON in the given schema, with the system instruction', async () => {
    await call()
    const request = sdk.generateContent.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'm',
      contents: 'p',
      config: { systemInstruction: 's', responseMimeType: 'application/json', responseSchema: { type: 'object' } },
    })
  })

  describe('maxOutputTokens', () => {
    it('is passed on when a route asks for a ceiling', async () => {
      await call({ maxOutputTokens: 4096 })
      expect(sdk.generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(4096)
    })

    // Every other route is unchanged: no key at all, not a key set to undefined.
    it('is left out of the request when none is given', async () => {
      await call()
      expect('maxOutputTokens' in sdk.generateContent.mock.calls[0][0].config).toBe(false)
    })

    it.each([[0], [-5], [1.5], ['4096'], [null], [NaN]])('ignores %p, which is not a usable ceiling', async (value) => {
      await call({ maxOutputTokens: value })
      expect('maxOutputTokens' in sdk.generateContent.mock.calls[0][0].config).toBe(false)
    })
  })
})
