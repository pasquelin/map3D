import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewportController } from './ViewportController'
import type { DataSource, Viewport } from './types'

/**
 * Le moteur de chargement viewport — celui que réutilise TEL QUEL une source de catalogue
 * à bascule (cf. `CatalogToggleSource`). Ces quatre garanties sont exactement ce qu'une
 * feature ne doit jamais réécrire : anti-rebond, gate de zoom, annulation de la requête
 * précédente, et rejet d'une réponse hors-ordre.
 */

const view = (zoom: number): Viewport => ({
  bounds: { north: 49, south: 48, east: 3, west: 2 },
  center: { lat: 48.5, lng: 2.5 },
  zoom,
})

const DEBOUNCE = 500

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Laisse partir l'anti-rebond, puis les micro-tâches de la promesse de `load`. */
const settle = async (ms = DEBOUNCE) => {
  vi.advanceTimersByTime(ms)
  await vi.advanceTimersByTimeAsync(0)
}

describe('anti-rebond', () => {
  it('ne charge pas avant l’échéance', async () => {
    const load = vi.fn(async () => [1])
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    c.setSource({ load })
    c.push(view(15))
    vi.advanceTimersByTime(DEBOUNCE - 1)
    expect(load).not.toHaveBeenCalled()
    await settle(1)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('une rafale de déplacements ne produit QU’UN chargement, sur la dernière vue', async () => {
    const seen: Viewport[] = []
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    c.setSource({
      load: async (v) => {
        seen.push(v)
        return [1]
      },
    })
    c.push(view(12))
    c.push(view(13))
    c.push(view(14))
    await settle()
    expect(seen.map((v) => v.zoom)).toEqual([14])
  })
})

describe('gate de zoom (`minZoom`)', () => {
  it('n’émet AUCUNE requête sous le seuil, et vide le jeu courant', async () => {
    const load = vi.fn(async () => [1, 2])
    const onData = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource({ minZoom: 13, load })
    c.push(view(11))
    await settle()
    // 💰 Le gate est ce qui rend gratuite une source à 36 000 points quand on dézoome.
    expect(load).not.toHaveBeenCalled()
    expect(onData).toHaveBeenCalledWith([])
  })

  it('charge dès que le seuil est atteint', async () => {
    const load = vi.fn(async () => [1])
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    c.setSource({ minZoom: 13, load })
    c.push(view(13))
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('n’émet le jeu vide QU’UNE FOIS, et toujours le même tableau', async () => {
    const onData = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource({ minZoom: 13, load: async () => [1] })
    c.push(view(11))
    await settle()
    c.push(view(10))
    await settle()
    // Un tableau vide NEUF par tick donnait une identité neuve à la couche marker : tous
    // ses mémos tombaient et la surface de regroupement replanifiait un rebuild complet,
    // toutes les 500 ms de déplacement, pour zéro changement visuel.
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData.mock.calls[0]?.[0]).toEqual([])
  })

  it('ré-émet après être repassé AU-DESSUS du seuil, puis redescendu', async () => {
    const onData = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource({ minZoom: 13, load: async () => [1] })
    c.push(view(11))
    await settle()
    c.push(view(14))
    await settle()
    c.push(view(11))
    await settle()
    expect(onData.mock.calls.map(([d]) => d)).toEqual([[], [1], []])
  })

  it('ABANDONNE la requête en vol en redescendant sous le seuil', async () => {
    const onData = vi.fn()
    const onLoading = vi.fn()
    let resolve: ((v: number[]) => void) | undefined
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData, onLoading)
    c.setSource({ minZoom: 13, load: () => new Promise<number[]>((r) => (resolve = r)) })
    c.push(view(14))
    await settle()
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true])

    c.push(view(11))
    await settle()
    // La réponse partie AU-DESSUS du seuil arrive après coup : sans abandon, elle
    // repeuplait la couche sous le seuil — les milliers de points que le gate refuse.
    resolve?.([1, 2, 3])
    await vi.advanceTimersByTimeAsync(0)
    expect(onData.mock.calls.map(([d]) => d)).toEqual([[]])
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true, false])
  })

  it('sans `minZoom`, aucun seuil ne s’applique', async () => {
    const load = vi.fn(async () => [1])
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    c.setSource({ load })
    c.push(view(0))
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('annulation et courses', () => {
  it('abandonne la requête précédente quand une nouvelle vue arrive', async () => {
    const signals: AbortSignal[] = []
    const source: DataSource<number> = {
      load: (_v, signal) => {
        signals.push(signal)
        return new Promise(() => {}) // jamais résolue : la requête reste en vol
      },
    }
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    c.setSource(source)
    c.push(view(14))
    await settle()
    c.push(view(15))
    await settle()
    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })

  it('jette la réponse d’une requête abandonnée, même si elle se résout après', async () => {
    const onData = vi.fn()
    let resolveFirst: ((v: number[]) => void) | undefined
    let call = 0
    const source: DataSource<number> = {
      load: async () => {
        call++
        if (call === 1) return new Promise<number[]>((r) => (resolveFirst = r))
        return [2]
      },
    }
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource(source)
    c.push(view(14))
    await settle()
    c.push(view(15))
    await settle()
    // La lente arrive APRÈS avoir été abandonnée : `AbortController` seul ne suffit pas,
    // une promesse déjà lancée exécute son `then` — c'est le signal qui la périme.
    resolveFirst?.([1])
    await vi.advanceTimersByTimeAsync(0)
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([2])
  })

  it('une erreur réseau laisse le jeu courant intact', async () => {
    const onData = vi.fn()
    let call = 0
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource({
      load: async () => {
        call++
        if (call === 1) return [1]
        throw new Error('réseau')
      },
    })
    c.push(view(14))
    await settle()
    c.push(view(15))
    await settle()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([1])
  })
})

describe('état de chargement', () => {
  it('signale le vol puis le retour — le drapeau que porte la ligne d’une bascule', async () => {
    const onLoading = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn(), onLoading)
    c.setSource({ load: async () => [1] })
    c.push(view(14))
    await settle()
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true, false])
  })

  it('retombe le drapeau quand la source est RETIRÉE en plein vol', async () => {
    const onLoading = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn(), onLoading)
    c.setSource({ load: () => new Promise(() => {}) }) // jamais résolue
    c.push(view(14))
    await settle()
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true])
    // `run` ne rend `false` que pour la requête ENCORE courante : abandonnée d'ici, elle ne
    // l'est plus, et le drapeau restait à `true` — un indicateur qui tourne pour toujours.
    c.setSource(null)
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true, false])
  })

  it('retombe le drapeau au `dispose`, même avec une requête en vol', async () => {
    const onLoading = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn(), onLoading)
    c.setSource({ load: () => new Promise(() => {}) })
    c.push(view(14))
    await settle()
    c.dispose()
    expect(onLoading.mock.calls.map(([v]) => v)).toEqual([true, false])
  })

  it('ne signale aucun chargement quand le gate de zoom a bloqué', async () => {
    const onLoading = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn(), onLoading)
    c.setSource({ minZoom: 13, load: async () => [1] })
    c.push(view(10))
    await settle()
    expect(onLoading).not.toHaveBeenCalled()
  })
})

describe('cycle de vie', () => {
  it('sans source, rien n’est planifié', async () => {
    const onData = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.push(view(14))
    await settle()
    expect(onData).not.toHaveBeenCalled()
  })

  it('poser une source rejoue la DERNIÈRE vue reçue', async () => {
    const load = vi.fn(async () => [1])
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, vi.fn())
    // La vue arrive avant la source (ordre normal au montage) : sans cette reprise, la
    // couche restait muette jusqu'au prochain déplacement.
    c.push(view(14))
    c.setSource({ load })
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('`dispose` coupe ce qui est en vol et n’émet plus rien', async () => {
    const onData = vi.fn()
    const c = new ViewportController<number>({ debounce: DEBOUNCE }, onData)
    c.setSource({ load: async () => [1] })
    c.push(view(14))
    c.dispose()
    await settle()
    expect(onData).not.toHaveBeenCalled()
  })
})
