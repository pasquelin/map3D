import { TilesRenderer } from '3d-tiles-renderer'
import { describe, expect, it, vi } from 'vitest'
import { attachTileset3d, type Tileset3dSource } from './tileset3d'

const CLE_GOOGLE = 'cle-google'

/** Source d'hôte quelconque : ce qu'elle enregistre ne regarde qu'elle. */
const sourceHote = (): Tileset3dSource => ({ key: 'hote', attach: vi.fn() })

const greffonGoogle = (tiles: TilesRenderer) => tiles.getPluginByName('GOOGLE_CLOUD_AUTH_PLUGIN')
/** Adresse que le tileset ira chercher — posée par le greffon, absente des types de la lib. */
const adresse = (tiles: TilesRenderer) => (tiles as unknown as { rootURL: string | null }).rootURL

describe('attachTileset3d', () => {
  it("branche la source de l'hôte sur le TilesRenderer du moteur", () => {
    const tiles = new TilesRenderer()
    const source = sourceHote()
    expect(attachTileset3d(tiles, source, undefined)).toBe(true)
    expect(source.attach).toHaveBeenCalledExactlyOnceWith(tiles)
  })

  it("fait primer la source de l'hôte sur la clé Google, qui ne sert alors plus le volume", () => {
    const tiles = new TilesRenderer()
    const source = sourceHote()
    expect(attachTileset3d(tiles, source, CLE_GOOGLE)).toBe(true)
    expect(source.attach).toHaveBeenCalledOnce()
    expect(greffonGoogle(tiles)).toBeNull()
  })

  it('sert les tuiles Google en direct avec la seule clé', () => {
    const tiles = new TilesRenderer()
    expect(attachTileset3d(tiles, undefined, CLE_GOOGLE)).toBe(true)
    expect(greffonGoogle(tiles)).toMatchObject({ apiToken: CLE_GOOGLE })
    expect(adresse(tiles)).toContain('tile.googleapis.com')
  })

  it("ne branche rien sans source ni clé : c'est ce qui appelle le globe de repli", () => {
    const tiles = new TilesRenderer()
    expect(attachTileset3d(tiles, undefined, undefined)).toBe(false)
    expect(attachTileset3d(tiles, undefined, '')).toBe(false)
    expect(greffonGoogle(tiles)).toBeNull()
  })
})
