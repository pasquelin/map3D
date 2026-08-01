// Le maillon que `buildingPick.test.ts` ne couvre pas : la provenance du `faceIndex`.
//
// `buildingAtVertex` se teste sur un `Uint32Array`, mais elle est nourrie par un raycast
// three-mesh-bvh en mode `indirect` (cf. `BUILD_OPTIONS` de `core/bvh`). Rien ne garantit
// a priori que l'index de face rendu par ce mode soit celui de la géométrie d'origine —
// s'il était remappé, le survol colorerait un bâtiment voisin, et aucun test unitaire ne
// le dirait. Ce test monte donc une vraie géométrie extrudée, y attache l'arbre, et vérifie
// que le rayon retombe sur le bâtiment qu'il vise.
//
// Sans WebGL : `Raycaster` et `MeshBVH` sont du calcul CPU, ils n'ont pas besoin de contexte.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import type { BuildingsConfig } from '../config/types'
import { attachPackedBVH, packTileBVH } from '../core/bvh'
import { extrudeTile, type Shading, type TileFrame } from '../data/mvt'
import { encodeTile, square } from '../data/mvt.fixture'
import { buildingAtVertex, buildingAttrs } from './buildingPick'

/** Tuile z14 sur Paris, échelles locales du même ordre que celles mesurées par le calque. */
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
/** `float32` : les positions sortent en mètres, le test vise donc en mètres. */
const CFG: BuildingsConfig = { ...defaultConfig.providers.buildings, positionPrecision: 'float32' }

/** Deux carrés nettement séparés, de hauteurs distinctes — de quoi confondre visiblement. */
async function twoBuildings() {
  const buffer = await encodeTile([
    { rings: [square(200, 200, 400)], props: { render_height: 10 }, id: 100 },
    { rings: [square(2400, 2400, 400)], props: { render_height: 50 }, id: 200 },
  ])
  return extrudeTile(buffer, CFG, FRAME, NO_SHADING)
}

/** Le mesh que `BuildingsLayer.buildMesh` monte, réduit à ce que le rayon touche. */
function meshOf(tile: Awaited<ReturnType<typeof twoBuildings>>): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(tile.positions as Float32Array, 3))
  geo.setIndex(new THREE.BufferAttribute(tile.indices, 1))
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  // Comme en production : l'arbre arrive construit depuis le worker.
  attachPackedBVH(mesh, packTileBVH(tile.positions, tile.indices))
  mesh.updateMatrixWorld(true)
  return mesh
}

/** Centre horizontal des sommets du bâtiment `index` — d'où viser à la verticale. */
function centerOf(positions: Float32Array, from: number, to: number): { x: number; y: number } {
  let sx = 0
  let sy = 0
  for (let v = from; v < to; v++) {
    sx += positions[v * 3]!
    sy += positions[v * 3 + 1]!
  }
  const n = to - from
  return { x: sx / n, y: sy / n }
}

describe('faceIndex → bâtiment, à travers le BVH', () => {
  it('rend le bâtiment réellement visé, et pas son voisin', async () => {
    const tile = await twoBuildings()
    const mesh = meshOf(tile)
    const positions = tile.positions as Float32Array
    const { vStart } = tile.buildings
    const ray = new THREE.Raycaster()
    ;(ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true

    for (const expected of [0, 1]) {
      const c = centerOf(positions, vStart[expected]!, vStart[expected + 1]!)
      // Rayon vertical descendant, bien au-dessus du plus haut des deux volumes.
      ray.set(new THREE.Vector3(c.x, c.y, 500), new THREE.Vector3(0, 0, -1))
      const hit = ray.intersectObject(mesh, true)[0]
      expect(hit?.faceIndex).toBeTypeOf('number')
      const vertex = mesh.geometry.getIndex()!.getX(hit!.faceIndex! * 3)
      expect(buildingAtVertex(vStart, vertex)).toBe(expected)
    }
  })

  it('remonte les attributs du bâtiment visé', async () => {
    const tile = await twoBuildings()
    const mesh = meshOf(tile)
    const positions = tile.positions as Float32Array
    const { vStart } = tile.buildings
    const ray = new THREE.Raycaster()
    ;(ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true

    // Le second carré : celui de 50 m, dont l'identifiant est 200. Si le mapping dérivait,
    // c'est la hauteur de l'autre (10 m) qui remonterait — l'erreur qu'un utilisateur voit.
    const c = centerOf(positions, vStart[1]!, vStart[2]!)
    ray.set(new THREE.Vector3(c.x, c.y, 500), new THREE.Vector3(0, 0, -1))
    const hit = ray.intersectObject(mesh, true)[0]
    const vertex = mesh.geometry.getIndex()!.getX(hit!.faceIndex! * 3)
    const attrs = buildingAttrs(tile.buildings, buildingAtVertex(vStart, vertex))
    expect(attrs).toEqual({ featureId: 200, height: 50, minHeight: 0, props: {} })
    // Le rayon touche bien le TOIT, à la hauteur annoncée.
    expect(hit!.point.z).toBeCloseTo(50, 5)
  })
})
