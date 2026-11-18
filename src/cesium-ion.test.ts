import { TilesRenderer } from '3d-tiles-renderer'
import { describe, expect, it } from 'vitest'
import { CESIUM_ION_DEFAULT_ASSET_ID, cesiumIon } from './cesium-ion'

const JETON = 'jeton-ion'

const greffonIon = (tiles: TilesRenderer) => tiles.getPluginByName('CESIUM_ION_AUTH_PLUGIN')
/** Adresse que le tileset ira chercher — posée par le greffon, absente des types de la lib. */
const adresse = (tiles: TilesRenderer) => (tiles as unknown as { rootURL: string | null }).rootURL

describe('cesiumIon', () => {
  it("branche le greffon Cesium ion sur l'asset Google Photorealistic par défaut", () => {
    const tiles = new TilesRenderer()
    cesiumIon({ token: JETON }).attach(tiles)
    expect(greffonIon(tiles)).toMatchObject({ assetId: CESIUM_ION_DEFAULT_ASSET_ID, autoRefreshToken: true })
    expect(adresse(tiles)).toBe(`https://api.cesium.com/v1/assets/${CESIUM_ION_DEFAULT_ASSET_ID}/endpoint`)
  })

  it("sert l'asset demandé quand `assetId` est fourni", () => {
    const tiles = new TilesRenderer()
    cesiumIon({ token: JETON, assetId: '96188' }).attach(tiles)
    expect(adresse(tiles)).toBe('https://api.cesium.com/v1/assets/96188/endpoint')
  })

  it('garde la même clé pour les mêmes options : un appel en ligne ne remonte pas la carte', () => {
    expect(cesiumIon({ token: JETON }).key).toBe(cesiumIon({ token: JETON }).key)
    expect(cesiumIon({ token: JETON }).key).toBe(cesiumIon({ token: JETON, assetId: CESIUM_ION_DEFAULT_ASSET_ID }).key)
  })

  it("change de clé avec le jeton ou l'asset : la carte doit alors se remonter", () => {
    const { key } = cesiumIon({ token: JETON })
    expect(cesiumIon({ token: 'autre-jeton' }).key).not.toBe(key)
    expect(cesiumIon({ token: JETON, assetId: '96188' }).key).not.toBe(key)
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

  it("n'importe le greffon Cesium ion dans aucun de ses modules", () => {
    expect(fautifs(/CesiumIonAuthPlugin/)).toEqual([])
  })

  it("n'importe l'entrée `cesium-ion` dans aucun de ses modules", () => {
    // Chemin relatif ou alias `@/` : les deux façons d'atteindre un module de `src/`.
    expect(fautifs(/(?:from|import)\s*\(?\s*['"](?:\.{1,2}\/(?:[\w.-]+\/)*|@\/)cesium-ion['"]/)).toEqual([])
  })
})
