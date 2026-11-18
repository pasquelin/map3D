import { TilesRenderer } from '3d-tiles-renderer'
import { describe, expect, it } from 'vitest'
import { CESIUM_ION_DEFAULT_ASSET_ID, type CesiumIonOptions, cesiumIon, type Tileset3dSource } from './cesium-ion'

const JETON = 'jeton-ion'

/** La source d'un jeton RENSEIGNÉ : elle existe, sinon le test qui s'en sert n'a rien à dire. */
const source = (options: Partial<CesiumIonOptions> = {}): Tileset3dSource => {
  const s = cesiumIon({ token: JETON, ...options })
  if (!s) throw new Error('cesiumIon devait rendre une source')
  return s
}

const greffonIon = (tiles: TilesRenderer) => tiles.getPluginByName('CESIUM_ION_AUTH_PLUGIN')
/** Adresse que le tileset ira chercher — posée par le greffon, absente des types de la lib. */
const adresse = (tiles: TilesRenderer) => (tiles as unknown as { rootURL: string | null }).rootURL

describe('cesiumIon', () => {
  it("branche le greffon Cesium ion sur l'asset Google Photorealistic par défaut", () => {
    const tiles = new TilesRenderer()
    source().attach(tiles)
    expect(greffonIon(tiles)).toMatchObject({ assetId: CESIUM_ION_DEFAULT_ASSET_ID, autoRefreshToken: true })
    expect(adresse(tiles)).toBe(`https://api.cesium.com/v1/assets/${CESIUM_ION_DEFAULT_ASSET_ID}/endpoint`)
  })

  it("sert l'asset demandé quand `assetId` est fourni", () => {
    const tiles = new TilesRenderer()
    source({ assetId: '96188' }).attach(tiles)
    expect(adresse(tiles)).toBe('https://api.cesium.com/v1/assets/96188/endpoint')
  })

  it('garde la même clé pour les mêmes options : un appel en ligne ne remonte pas la carte', () => {
    expect(source().key).toBe(source().key)
    expect(source().key).toBe(source({ assetId: CESIUM_ION_DEFAULT_ASSET_ID }).key)
  })

  it("change de clé avec le jeton ou l'asset : la carte doit alors se remonter", () => {
    const { key } = source()
    expect(source({ token: 'autre-jeton' }).key).not.toBe(key)
    expect(source({ assetId: '96188' }).key).not.toBe(key)
  })

  it('ne rend aucune source sans jeton, absent ou vide', () => {
    expect(cesiumIon({ token: undefined })).toBeUndefined()
    expect(cesiumIon({ token: null })).toBeUndefined()
    // Vide : ce que donne une variable d'environnement déclarée sans valeur.
    expect(cesiumIon({ token: '' })).toBeUndefined()
  })

  it("retombe sur l'asset par défaut quand `assetId` est vide, comme s'il était omis", () => {
    const tiles = new TilesRenderer()
    source({ assetId: '' }).attach(tiles)
    expect(adresse(tiles)).toBe(`https://api.cesium.com/v1/assets/${CESIUM_ION_DEFAULT_ASSET_ID}/endpoint`)
    expect(source({ assetId: '' }).key).toBe(source().key)
  })
})

/**
 * Le critère qui justifie l'entrée à part : un hôte qui ne l'importe pas n'embarque rien de
 * Cesium. Il ne tient que si AUCUN module atteignable depuis `src/index.ts` n'importe le
 * greffon ni cette entrée — un seul import suffirait à le remettre dans tous les bundles,
 * sans qu'aucun test de comportement ne rougisse.
 */
describe("l'entrée principale", () => {
  const coeur = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./cesium-ion.ts', '!./**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const fautifs = (motif: RegExp) =>
    Object.entries(coeur)
      .filter(([, code]) => motif.test(code))
      .map(([fichier]) => fichier)

  it('couvre bien les sources du cœur (sinon les deux gardes ci-dessous ne prouvent rien)', () => {
    expect(Object.keys(coeur)).toEqual(expect.arrayContaining(['./index.ts', './core/MapEngine.ts', './react/Map.tsx']))
  })

  it('ne nomme le greffon Cesium ion dans aucun de ses modules, commentaires compris', () => {
    expect(fautifs(/CesiumIonAuthPlugin/)).toEqual([])
  })

  it("n'importe l'entrée `cesium-ion` dans aucun de ses modules", () => {
    // Chemin relatif ou alias `@/`, avec ou sans extension : les façons d'atteindre un module de `src/`.
    const motif = /(?:from|import)\s*\(?\s*['"](?:\.{1,2}\/(?:[\w.-]+\/)*|@\/)cesium-ion(?:\.[jt]sx?)?['"]/
    expect(fautifs(motif)).toEqual([])
  })
})
