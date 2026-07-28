import { WGS84_ELLIPSOID } from '3d-tiles-renderer'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import type { BuildingsConfig } from '../config/types'
import { DEG2RAD } from '../core/math'
import { tileXToLng, tileYToLat } from '../core/googleTiles'
import { defaultTheme } from '../theme/defaultTheme'
import { type ExtrudedTile, extrudeTile, type Shading, type TileFrame } from './mvt'
import { encodeTile, square } from './mvt.fixture'

const cfg: BuildingsConfig = defaultConfig.providers.buildings

/** Tuile z14 sur Paris — celle qui a servi à mesurer la charge réelle (~131 000 triangles). */
const TILE = { z: 14, x: 8299, y: 5636 }
const EXTENT = 4096

/** L'ombrage du thème par défaut — soleil est-sud-est, façade la moins exposée à 62 %. */
const SHADING: Shading = {
  azimuth: defaultTheme.globe.buildingSunAzimuth,
  min: defaultTheme.globe.buildingShadeMin,
}
/** Neutre : `min = 1` annule toute modulation, tout sort à couleur pleine. */
const NO_SHADING: Shading = { azimuth: 0, min: 1 }

/**
 * Le repère que `BuildingsLayer.frameFor` construit : échelles MESURÉES sur le vrai
 * ellipsoïde par différences finies, jamais recalculées depuis une constante.
 */
function frameFor(z: number, x: number, y: number, elevation = 0): TileFrame {
  const lat0 = tileYToLat(y + 0.5, z)
  const lng0 = tileXToLng(x + 0.5, z)
  const d = 1e-4
  const p0 = new THREE.Vector3()
  const p1 = new THREE.Vector3()
  WGS84_ELLIPSOID.getCartographicToPosition(lat0 * DEG2RAD, lng0 * DEG2RAD, elevation, p0)
  WGS84_ELLIPSOID.getCartographicToPosition(lat0 * DEG2RAD, (lng0 + d) * DEG2RAD, elevation, p1)
  const metersPerDegLng = p0.distanceTo(p1) / d
  WGS84_ELLIPSOID.getCartographicToPosition((lat0 + d) * DEG2RAD, lng0 * DEG2RAD, elevation, p1)
  const metersPerDegLat = p0.distanceTo(p1) / d
  return { z, x, y, lat0, lng0, metersPerDegLng, metersPerDegLat }
}

/** La matrice que le calque pose sur le mesh. */
function enuMatrix(frame: TileFrame, elevation = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4()
  WGS84_ELLIPSOID.getEastNorthUpFrame(frame.lat0 * DEG2RAD, frame.lng0 * DEG2RAD, elevation, m)
  return m
}

/**
 * Positions en MÈTRES locaux, quel que soit le format du tampon.
 *
 * En `int16` (le défaut), `extrudeTile` rend des entiers normalisés que la matrice du
 * mesh remet à l'échelle : les tests raisonnent sur des mètres, comme le rendu final.
 */
function metersOf(out: ExtrudedTile): Float64Array {
  const k = out.positions instanceof Int16Array ? out.positionScale / 32767 : 1
  const m = new Float64Array(out.positions.length)
  for (let i = 0; i < out.positions.length; i++) m[i] = out.positions[i]! * k
  return m
}

/** L'ANCIENNE projection : chaque sommet directement en ECEF. C'est la référence. */
function ecefOf(z: number, x: number, y: number, tx: number, ty: number, alt: number): THREE.Vector3 {
  const lng = tileXToLng(x + tx / EXTENT, z)
  const lat = tileYToLat(y + ty / EXTENT, z)
  return WGS84_ELLIPSOID.getCartographicToPosition(lat * DEG2RAD, lng * DEG2RAD, alt, new THREE.Vector3())
}

describe('extrudeTile — géométrie en repère ENU local', () => {
  it('replace les sommets là où la projection ECEF directe les mettait', async () => {
    // Quatre emprises réparties aux extrémités de la tuile : c'est LOIN du centre que
    // l'approximation du plan tangent coûte le plus cher.
    const coins = [
      square(20, 20, 200),
      square(EXTENT - 260, 20, 200),
      square(20, EXTENT - 260, 200),
      square(EXTENT - 260, EXTENT - 260, 200),
    ]
    const buf = await encodeTile(coins.map((rings) => ({ rings: [rings], props: { render_height: 30 } })))
    const frame = frameFor(TILE.z, TILE.x, TILE.y)
    const out = extrudeTile(buf, cfg, frame, NO_SHADING)
    const matrix = enuMatrix(frame)

    expect(out.positions.length).toBeGreaterThan(0)

    // Le premier sommet de chaque emprise est le premier point de son carré, à la base.
    let worst = 0
    for (const rings of coins) {
      const p = rings[0]!
      const attendu = ecefOf(TILE.z, TILE.x, TILE.y, p.x, p.y, 0)
      // On cherche le sommet reconstruit le plus proche : l'ordre d'écriture est un détail
      // d'implémentation, la POSITION ne l'est pas.
      let best = Infinity
      const v = new THREE.Vector3()
      const pos = metersOf(out)
      for (let i = 0; i < pos.length; i += 3) {
        v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!).applyMatrix4(matrix)
        best = Math.min(best, v.distanceTo(attendu))
      }
      worst = Math.max(worst, best)
    }
    // Le plan tangent dévie de d²/2R sur une tuile z14 (~1,7 km en demi-diagonale, soit
    // ~0,23 m). Le fond raster, tessellé en 2×2 sur la même emprise, en fait autant.
    expect(worst).toBeLessThan(0.5)
  })

  it('extrude murs ET toit, et referme les anneaux sans arête dégénérée', async () => {
    const buf = await encodeTile([{ rings: [square(1000, 1000, 400)], props: { render_height: 10 } }])
    const out = extrudeTile(buf, cfg, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    // 4 arêtes × 4 sommets de mur + 4 sommets de toit. L'anneau refermé par `loadGeometry`
    // (le dernier point recopie le premier) ne doit PAS produire une cinquième arête.
    expect(out.positions.length / 3).toBe(20)
    // 4 quads (6 index) + 2 triangles de toit.
    expect(out.indices.length).toBe(4 * 6 + 2 * 3)
  })

  it('pose la base et le sommet aux hauteurs de la donnée', async () => {
    const buf = await encodeTile([
      { rings: [square(2000, 2000, 200)], props: { render_height: 42, render_min_height: 7 } },
    ])
    const out = extrudeTile(buf, cfg, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    const pos = metersOf(out)
    const ups = new Set<number>()
    for (let i = 2; i < pos.length; i += 3) ups.add(Math.round(pos[i]!))
    expect([...ups].sort((a, b) => a - b)).toEqual([7, 42])
  })

  it('quantifie les positions sans écart visible — int16 et float32 se superposent', async () => {
    // Une emprise loin du centre : c'est là que l'échelle de quantification est la plus
    // large, donc le pas le plus grossier.
    const buf = await encodeTile([
      { rings: [square(EXTENT - 400, EXTENT - 400, 300)], props: { render_height: 47, render_min_height: 3 } },
    ])
    const frame = frameFor(TILE.z, TILE.x, TILE.y)
    const exact = metersOf(extrudeTile(buf, { ...cfg, positionPrecision: 'float32' }, frame, NO_SHADING))
    const packed = metersOf(extrudeTile(buf, { ...cfg, positionPrecision: 'int16' }, frame, NO_SHADING))
    expect(packed).toHaveLength(exact.length)
    let worst = 0
    for (let i = 0; i < exact.length; i++) worst = Math.max(worst, Math.abs(exact[i]! - packed[i]!))
    // ~4 cm sur une tuile z14 : sous la précision de la donnée OSM, et très en dessous du
    // pixel à toute distance où l'on voit un bâtiment.
    expect(worst).toBeLessThan(0.05)
  })

  it('rend des mètres tels quels en float32, sans échelle à appliquer', async () => {
    const buf = await encodeTile([{ rings: [square(2000, 2000, 200)], props: { render_height: 42 } }])
    const out = extrudeTile(buf, { ...cfg, positionPrecision: 'float32' }, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    expect(out.positions).toBeInstanceOf(Float32Array)
    expect(out.positionScale).toBe(1)
  })

  it('borne une hauteur aberrante — `height=99999` est une faute courante dans OSM', async () => {
    const buf = await encodeTile([{ rings: [square(2000, 2000, 200)], props: { render_height: 99999 } }])
    const out = extrudeTile(buf, { ...cfg, maxHeight: 1000 }, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    const pos = metersOf(out)
    let highest = 0
    for (let i = 2; i < pos.length; i += 3) highest = Math.max(highest, pos[i]!)
    expect(Math.round(highest)).toBe(1000)
  })

  it('rend une palette où le thème occupe les deux premières entrées', async () => {
    const buf = await encodeTile([
      { rings: [square(100, 100, 200)], props: { render_height: 12 } },
      { rings: [square(2000, 2000, 200)], props: { render_height: 12, colour: 'beige' } },
    ])
    const out = extrudeTile(buf, cfg, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    expect(out.palette[0]).toEqual({ color: null, roof: false })
    expect(out.palette[1]).toEqual({ color: null, roof: true })
    // Une couleur de donnée entre par paire : façade puis toit, éclairci par l'appelant.
    expect(out.palette[2]).toEqual({ color: 'beige', roof: false })
    expect(out.palette[3]).toEqual({ color: 'beige', roof: true })
    // Les mots-clés CSS sortent BRUTS : c'est `THREE.Color`, côté calque, qui les connaît.
    expect(out.palette).toHaveLength(4)
  })

  it('perce le toit d’un trou sans le boucher', async () => {
    const plein = await encodeTile([{ rings: [square(0, 0, 800)], props: { render_height: 10 } }])
    const troue = await encodeTile([
      { rings: [square(0, 0, 800), square(200, 200, 200).slice().reverse()], props: { render_height: 10 } },
    ])
    const frame = frameFor(TILE.z, TILE.x, TILE.y)
    const a = extrudeTile(plein, cfg, frame, NO_SHADING)
    const b = extrudeTile(troue, cfg, frame, NO_SHADING)
    // Le trou ajoute ses propres façades (4 arêtes) et fait tomber le toit sur 8 triangles.
    expect(b.indices.length).toBeGreaterThan(a.indices.length)
    expect(b.positions.length).toBeGreaterThan(a.positions.length)
  })
})

describe('extrudeTile — ombrage cuit dans les sommets', () => {
  /**
   * Un carré donne quatre façades cardinales. C'est le cas où l'ombrage se vérifie
   * vraiment : sans lui, les quatre sortent identiques — c'est ce qui aplatissait les
   * volumes en une nappe grise.
   */
  const carre = async () => encodeTile([{ rings: [square(1000, 1000, 400)], props: { render_height: 20 } }])

  it('donne quatre teintes DISTINCTES aux quatre façades d’un carré', async () => {
    const out = extrudeTile(await carre(), cfg, frameFor(TILE.z, TILE.x, TILE.y), SHADING)
    // Les 16 premiers sommets sont les murs (4 arêtes × 4), le reste le toit.
    const facades = new Set<number>()
    for (let i = 0; i < 16; i++) facades.add(out.shade[i]!)
    /**
     * Garde-fou sur `buildingSunAzimuth` autant que sur l'ombrage lui-même : un azimut
     * multiple de 45° fait tomber les façades opposées deux par deux sur la même teinte,
     * et l'angle d'un bâtiment orthogonal — la forme la plus courante — redevient
     * invisible. Le défaut du thème doit rester hors des diagonales.
     */
    expect(facades.size).toBe(4)
  })

  it('n’ombre jamais le toit', async () => {
    const out = extrudeTile(await carre(), cfg, frameFor(TILE.z, TILE.x, TILE.y), SHADING)
    expect(new Set(out.shade.subarray(16))).toEqual(new Set([255]))
  })

  it('étale les façades entre `min` et la couleur pleine', async () => {
    // Soleil plein EST : la façade qui lui fait face a exactement sa normale, celle d'en
    // face exactement l'opposée — les deux bornes sont donc atteintes au sommet près. Un
    // carré est aligné nord-sud, l'azimut par défaut (135°) ne toucherait aucune borne.
    const out = extrudeTile(await carre(), cfg, frameFor(TILE.z, TILE.x, TILE.y), { azimuth: 90, min: 0.62 })
    const murs = [...out.shade.subarray(0, 16)]
    expect(Math.min(...murs)).toBe(Math.round(0.62 * 255))
    expect(Math.max(...murs)).toBe(255)
    // Les deux façades perpendiculaires tombent pile à mi-chemin.
    expect(new Set(murs).size).toBe(3)
  })

  it('rend la même teinte partout quand `min` vaut 1 — l’ombrage est débrayable', async () => {
    const out = extrudeTile(await carre(), cfg, frameFor(TILE.z, TILE.x, TILE.y), NO_SHADING)
    expect(new Set(out.shade)).toEqual(new Set([255]))
  })

  it('tourne avec le soleil : changer l’azimut de 180° échange les façades opposées', async () => {
    const buf = await carre()
    const frame = frameFor(TILE.z, TILE.x, TILE.y)
    const a = extrudeTile(buf, cfg, frame, { azimuth: 0, min: 0.5 })
    const b = extrudeTile(buf, cfg, frame, { azimuth: 180, min: 0.5 })
    // La façade la plus claire de l'un doit être la plus sombre de l'autre.
    const brightest = [...a.shade.subarray(0, 16)].indexOf(Math.max(...a.shade.subarray(0, 16)))
    expect(b.shade[brightest]).toBe(Math.min(...b.shade.subarray(0, 16)))
  })
})
