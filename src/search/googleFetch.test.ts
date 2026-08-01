import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchPolicy } from '../config/types'
import { googleFetch, googleLocaleFields } from './googleFetch'

const policy: FetchPolicy = { timeoutMs: 50, retries: 0, backoffMs: 0 }
const ok = () => new Response('{}', { status: 200 })

afterEach(() => vi.restoreAllMocks())

describe('googleFetch', () => {
  it('pose Content-Type, X-Goog-Api-Key puis X-Goog-FieldMask, avant les extraHeaders', async () => {
    let init: RequestInit | undefined
    const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) => {
      init = opts
      return ok()
    })
    vi.stubGlobal('fetch', fetchMock)
    await googleFetch({
      url: 'https://x',
      apiKey: 'k',
      fields: 'a,b',
      body: { q: 1 },
      policy,
      extraHeaders: { 'X-Extra': 'v' },
      label: 'svc',
    })
    expect(init).toBeDefined()
    expect(Array.from(new Headers(init?.headers).entries())).toEqual(
      expect.arrayContaining([
        ['content-type', 'application/json'],
        ['x-goog-api-key', 'k'],
        ['x-goog-fieldmask', 'a,b'],
        ['x-extra', 'v'],
      ]),
    )
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ q: 1 }))
  })

  it('laisse les extraHeaders remplacer les nôtres — appliqués APRÈS', async () => {
    let init: RequestInit | undefined
    const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) => {
      init = opts
      return ok()
    })
    vi.stubGlobal('fetch', fetchMock)
    await googleFetch({
      url: 'https://x',
      apiKey: 'k',
      fields: 'a',
      body: {},
      policy,
      extraHeaders: { 'X-Goog-Api-Key': 'override' },
      label: 'svc',
    })
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('override')
  })
})

describe('googleLocaleFields', () => {
  it('priorise l’override explicite sur la config', () => {
    expect(googleLocaleFields({ language: 'fr', region: 'fr' }, { languageCode: 'en', regionCode: 'us' })).toEqual({
      languageCode: 'fr',
      regionCode: 'fr',
    })
  })

  it('omet regionCode quand "auto" et non surchargé', () => {
    expect(googleLocaleFields({}, { languageCode: 'fr', regionCode: 'auto' })).toEqual({ languageCode: 'fr' })
  })
})
