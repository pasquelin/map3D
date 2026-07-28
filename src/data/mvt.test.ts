import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import type { BuildingsConfig } from '../config/types'
import { decodeBuildings } from './mvt'
import { encodeTile, hole as trou, square as carre } from './mvt.fixture'

const cfg: BuildingsConfig = defaultConfig.providers.buildings

describe('decodeBuildings', () => {
  it('rend une emprise avec ses hauteurs', async () => {
    const buf = await encodeTile([
      { rings: [carre(100, 100, 200)], props: { render_height: 12, render_min_height: 3 } },
    ])
    const out = decodeBuildings(buf, cfg)
    expect(out.extent).toBe(4096)
    expect(out.footprints).toHaveLength(1)
    expect(out.footprints[0]?.height).toBe(12)
    expect(out.footprints[0]?.minHeight).toBe(3)
  })

  it('retombe sur la hauteur par défaut quand l’attribut manque', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 50)], props: {} }])
    const out = decodeBuildings(buf, cfg)
    expect(out.footprints[0]?.height).toBe(cfg.defaultHeight)
    expect(out.footprints[0]?.minHeight).toBe(0)
  })

  it('rattache un anneau d’aire négative comme TROU du contour précédent', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 400), trou(100, 100, 100)], props: { render_height: 20 } }])
    const out = decodeBuildings(buf, cfg)
    expect(out.footprints).toHaveLength(1)
    expect(out.footprints[0]?.rings).toHaveLength(2)
  })

  it('sépare deux contours de la même feature en deux emprises', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 100), carre(500, 500, 100)], props: { render_height: 9 } }])
    const out = decodeBuildings(buf, cfg)
    expect(out.footprints).toHaveLength(2)
  })

  it('écarte une emprise marquée hide_3d — la donnée refuse l’extrusion', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 100)], props: { render_height: 30, hide_3d: true } }])
    expect(decodeBuildings(buf, cfg).footprints).toHaveLength(0)
  })

  it('écarte une emprise sans volume (hauteur ≤ base)', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 100)], props: { render_height: 5, render_min_height: 5 } }])
    expect(decodeBuildings(buf, cfg).footprints).toHaveLength(0)
  })

  it('retient la couleur portée par la donnée', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 100)], props: { render_height: 8, colour: '#d48741' } }])
    expect(decodeBuildings(buf, cfg).footprints[0]?.color).toBe('#d48741')
  })

  it('rend une tuile vide quand la couche demandée est absente', async () => {
    const buf = await encodeTile([{ rings: [carre(0, 0, 100)], props: { render_height: 8 } }])
    const out = decodeBuildings(buf, { ...cfg, sourceLayer: 'inexistante' })
    expect(out.footprints).toHaveLength(0)
  })
})
