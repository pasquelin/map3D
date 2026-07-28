import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import type { TilesConfig } from '../config/types'
import { InternalTileSource } from './internalTiles'
import { createTileSource } from './tileSource'

const ORIGINE = 'http://localhost:8090'

const tiles = (over: Partial<TilesConfig> = {}): TilesConfig => ({
  ...defaultConfig.providers.tiles,
  provider: 'internal',
  ...over,
})

describe('InternalTileSource', () => {
  it('substitue origine, style, densité et coordonnées', () => {
    const src = new InternalTileSource(tiles(), ORIGINE)
    expect(src.tileUrl(14, 8529, 5974)).toBe('http://localhost:8090/styles/liberty/14/8529/5974.png')
  })

  it('demande les tuiles @2x quand retina est actif', () => {
    expect(new InternalTileSource(tiles({ retina: true }), ORIGINE).tileUrl(14, 8529, 5974)).toBe(
      'http://localhost:8090/styles/liberty/14/8529/5974@2x.png',
    )
  })

  it("n'ajoute NI session NI clé à l'URL — aucune requête ne doit partir chez Google", () => {
    const url = new InternalTileSource(tiles(), ORIGINE).tileUrl(3, 1, 2)
    expect(url).not.toContain('session')
    expect(url).not.toContain('key')
    expect(url).not.toContain('?')
  })

  it('tolère une origine terminée par un slash (sinon `//styles/…`)', () => {
    expect(new InternalTileSource(tiles(), 'https://tuiles.exemple.fr/').tileUrl(2, 0, 1)).toBe(
      'https://tuiles.exemple.fr/styles/liberty/2/0/1.png',
    )
  })

  it('suit un changement de style à chaud', () => {
    const src = new InternalTileSource(tiles(), ORIGINE)
    src.setConfig(tiles({ style: 'sombre' }), ORIGINE)
    expect(src.tileUrl(5, 1, 1)).toBe('http://localhost:8090/styles/sombre/5/1/1.png')
  })

  it('ne réclame aucune session', async () => {
    await expect(new InternalTileSource(tiles(), ORIGINE).ensureSession()).resolves.toBeUndefined()
  })

  it('rend la même promesse à chaque appel (une par tuile, sinon)', () => {
    const src = new InternalTileSource(tiles(), ORIGINE)
    expect(src.ensureSession()).toBe(src.ensureSession())
  })
})

describe('createTileSource', () => {
  it('rend null en interne sans origine : rien à servir, donc aucun fond proposé', () => {
    expect(createTileSource(tiles(), '')).toBeNull()
  })

  it('rend null en externe sans clé', () => {
    expect(createTileSource({ ...defaultConfig.providers.tiles, provider: 'external' }, ORIGINE)).toBeNull()
  })

  it('rend une source interne sans clé Google — le fond 2D ne dépend plus de Google', () => {
    const src = createTileSource(tiles(), ORIGINE)
    expect(src).not.toBeNull()
    expect(src?.supportsTraffic).toBe(false)
  })

  it('rend une source Google, avec trafic, quand la clé est là', () => {
    const src = createTileSource({ ...defaultConfig.providers.tiles, provider: 'external' }, ORIGINE, 'CLÉ')
    expect(src?.supportsTraffic).toBe(true)
  })

  it("ignore la clé Google en interne : elle n'a rien à signer", () => {
    expect(createTileSource(tiles(), ORIGINE, 'CLÉ')?.tileUrl(1, 0, 0)).toBe(
      'http://localhost:8090/styles/liberty/1/0/0.png',
    )
  })
})
