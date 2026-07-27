import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchPolicy } from '../config/types'
import { fetchWithPolicy, HttpError } from './fetchPolicy'

const policy = (over: Partial<FetchPolicy> = {}): FetchPolicy => ({
  timeoutMs: 50,
  retries: 2,
  backoffMs: 0,
  ...over,
})

const ok = () => new Response('{}', { status: 200 })
const fail = (status: number) => new Response('boom', { status })

afterEach(() => vi.restoreAllMocks())

describe('fetchWithPolicy', () => {
  it('renvoie la réponse sans réessayer quand elle est ok', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const res = await fetchWithPolicy('https://x', {}, policy())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('réessaie un 5xx jusqu’au budget puis rejette', async () => {
    const fetchMock = vi.fn(async () => fail(503))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithPolicy('https://x', {}, policy({ retries: 2 }), undefined, 'svc')).rejects.toThrow(HttpError)
    // retries: 2 = trois tentatives au total, pas deux.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('ne réessaie JAMAIS un refus (429 : quota)', async () => {
    // Le point de la table `FATAL_STATUS` : la requête a été refusée, pas perdue.
    // Réessayer ne ferait que consommer le quota plus vite.
    const fetchMock = vi.fn(async () => fail(429))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithPolicy('https://x', {}, policy())).rejects.toThrow(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ne réessaie pas un 400', async () => {
    const fetchMock = vi.fn(async () => fail(400))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithPolicy('https://x', {}, policy())).rejects.toThrow(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('s’arrête net quand l’appelant abandonne, sans épuiser les réessais', async () => {
    const ctrl = new AbortController()
    const fetchMock = vi.fn(async () => {
      ctrl.abort()
      return fail(500)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithPolicy('https://x', {}, policy({ retries: 3 }), ctrl.signal)).rejects.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('espace les réessais du backoff demandé', async () => {
    const fetchMock = vi.fn(async () => fail(500))
    vi.stubGlobal('fetch', fetchMock)
    const started = Date.now()
    await expect(fetchWithPolicy('https://x', {}, policy({ retries: 1, backoffMs: 60 }))).rejects.toThrow()
    // Une seule pause (deux tentatives), d'au moins la base — la part aléatoire ne
    // fait que l'allonger. Sans backoff, l'écart serait de l'ordre de la milliseconde.
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('abandonne une tentative qui dépasse le timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithPolicy('https://x', {}, policy({ timeoutMs: 20, retries: 0 }), undefined, 'svc')).rejects.toThrow(
      /délai dépassé/,
    )
  })
})
