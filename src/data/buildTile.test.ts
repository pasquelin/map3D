import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import { transferablesOf } from './buildTile'
import { packTileBVH } from '../core/bvh'
import { extrudeTile, type Shading, type TileFrame } from './mvt'
import { encodeTile, square } from './mvt.fixture'

/** Tuile z14 sur Paris — échelles locales mesurées, comme celles de `BuildingsLayer`. */
const FRAME: TileFrame = {
  z: 14,
  x: 8299,
  y: 5636,
  lat0: 48.85,
  lng0: 2.35,
  metersPerDegLng: 73_300,
  metersPerDegLat: 111_200,
}
const NO_SHADING: Shading = { azimuth: 0, min: 1 }

async function builtTile() {
  const buffer = await encodeTile([{ rings: [square(100, 100, 200)], props: { render_height: 12 }, id: 3 }])
  const tile = extrudeTile(buffer, defaultConfig.providers.buildings, FRAME, NO_SHADING)
  return { ...tile, bvh: packTileBVH(tile.positions, tile.indices) }
}

describe('transferablesOf', () => {
  it('cède les tampons de la tuile ET ceux de son arbre, chacun une seule fois', async () => {
    const tile = await builtTile()
    const list = transferablesOf(tile)
    // Un `ArrayBuffer` listé deux fois fait échouer `postMessage` à l'exécution, et rien
    // dans le typage ne l'empêche : c'est l'erreur que ce test attrape quand un tampon
    // s'ajoute.
    expect(new Set(list).size).toBe(list.length)
    expect(list).toContain(tile.buildings.vStart.buffer)
    expect(list).toContain(tile.buildings.featureIds.buffer)
    expect(list).toContain(tile.buildings.heights.buffer)
    // L'arbre voyage avec la tuile — c'est tout l'objet de la migration.
    for (const root of tile.bvh.roots) expect(list).toContain(root)
  })

  it('ne cède PAS deux fois l’index de la tuile, que l’arbre référence aussi', async () => {
    // `MeshBVH.serialize` renvoie l'index de la géométrie dans son paquet. Avec `indirect`,
    // c'est le MÊME tampon que `tile.indices`, déjà cédé — d'où son exclusion de
    // `PackedBVH`. Ce test est le garde-fou de cette exclusion.
    const tile = await builtTile()
    const list = transferablesOf(tile)
    expect(list.filter((b) => b === tile.indices.buffer)).toHaveLength(1)
  })
})
