import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import { transferablesOf } from './buildingsWorker'
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

describe('transferablesOf', () => {
  it('cède les sept tampons de la tuile, chacun une seule fois', async () => {
    const buffer = await encodeTile([{ rings: [square(100, 100, 200)], props: { render_height: 12 }, id: 3 }])
    const tile = extrudeTile(buffer, defaultConfig.providers.buildings, FRAME, NO_SHADING)
    const list = transferablesOf(tile)
    // Un `ArrayBuffer` listé deux fois fait échouer `postMessage` à l'exécution, et rien
    // dans le typage ne l'empêche : c'est l'erreur que ce test attrape quand un tampon
    // s'ajoute.
    expect(new Set(list).size).toBe(list.length)
    expect(list).toContain(tile.buildings.vStart.buffer)
    expect(list).toContain(tile.buildings.featureIds.buffer)
    expect(list).toContain(tile.buildings.heights.buffer)
  })
})
