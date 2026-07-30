// Le mode piéton pose la caméra à `pedestrian.eyeHeightMeters` (1,7 m) du sol. À cette
// hauteur, le test d'horizon ellipsoïde de `project()` — « la surface au point regarde-t-elle
// vers la caméra » — dégénère : la courbure ne pèse que quelques millimètres à portée de vue,
// et il ne reste que la différence de hauteur. Tout marker posé plus haut que les yeux (un
// toit : `settle` échantillonne la surface des tuiles, bâti compris) était donc déclaré
// « derrière le globe ». Mesuré sur l'exemple : 61 markers sur 70 masqués, et les seuls
// survivants étaient les défibrillateurs, relevés en pleine rue.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Ellipsoid } from '3d-tiles-renderer'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import type { FrameContext } from '../core/Layer'
import { DEG2RAD } from '../core/math'
import type { Projection } from '../core/Projection'
import type { LatLng } from '../shared'
import { MarkerLayer } from './MarkerLayer'

const RUE: LatLng = { lat: 48.86, lng: 2.34 }
const TOIT: LatLng = { lat: 48.861, lng: 2.341 }

/**
 * Repère cartésien local : le test ne juge pas la géodésie, seulement les verdicts de cull.
 *
 * L'échelle n'est pas arbitraire — `writePosition` passe des RADIANS. La ramener en degrés
 * ×1000 donne « un millidegré = un mètre », de quoi écrire des distances lisibles dans les
 * cas ci-dessous plutôt que des fractions de radian.
 */
const DEG_SCALE = 1000 / DEG2RAD
const ellipsoid = {
  getCartographicToPosition(latRad: number, lngRad: number, height: number, out: THREE.Vector3) {
    out.set(lngRad * DEG_SCALE, height, latRad * DEG_SCALE)
    return out
  },
} as unknown as Ellipsoid

/** Hauteur du sol par point : 0 en rue, 40 m sur le toit. */
const groundOf = (p: LatLng): number => (p.lat === TOIT.lat ? 40 : 0)

function fakeProjection(): Projection {
  return {
    sampleGroundHeight: (p: LatLng) => groundOf(p),
    // La pose au sol passe par la version mémoïsée ; le double n'a rien à mémoïser.
    sampleGroundHeightCached: (p: LatLng) => groundOf(p),
    // Le vrai test se réduit, en vue rasante, à « le marker est-il plus bas que la caméra ».
    isAboveHorizon: (world: THREE.Vector3, camPos: THREE.Vector3) => camPos.y > world.y,
    worldToScreen: (_w: THREE.Vector3, _c: THREE.Camera, out?: { sx: number; sy: number; z: number }) => {
      const s = out ?? { sx: 0, sy: 0, z: 0 }
      // Plein centre du cadre : seuls l'horizon et le dos de la caméra doivent trancher.
      s.sx = 500
      s.sy = 300
      s.z = 0.5
      return s
    },
    setViewDirection: () => {},
    isBehindCamera: () => false,
  } as unknown as Projection
}

/**
 * Descend les matrices monde puis projette — exactement ce que fait `MapEngine.tick` entre
 * la passe de lecture et la passe d'écriture.
 *
 * `project()` LIT `obj.matrixWorld` sans jamais l'écrire : remonter la chaîne par marker
 * (`getWorldPosition`) coûtait une mise à jour de parents par marker et par frame. La
 * descente unique est donc à la charge de l'appelant, ici comme dans le moteur.
 */
function project(layer: MarkerLayer, group: THREE.Object3D, ctx: FrameContext): void {
  // SANS `force`, comme le moteur : les `CSS2DObject` ont `matrixAutoUpdate` coupé, et
  // c'est l'`updateMatrix()` de `writePosition` qui les marque à recalculer. Forcer la
  // descente ici rendrait le test aveugle à l'oubli de ce marquage.
  group.updateMatrixWorld()
  layer.project(ctx)
}

/** Ancre immobile, à l'image d'`overlayAnchor` : elle ne propage pas de `force`. */
function anchorGroup(): THREE.Object3D {
  const group = new THREE.Object3D()
  group.matrixAutoUpdate = false
  return group
}

function setup() {
  const group = anchorGroup()
  const layer = new MarkerLayer(
    group,
    ellipsoid,
    fakeProjection(),
    () => {},
    () => {},
  )
  layer.setItems([
    { id: 'rue', position: RUE, animateEnter: false },
    { id: 'toit', position: TOIT, animateEnter: false },
  ])
  return { layer, group }
}

/** Caméra à hauteur d'homme : 1,7 m au-dessus du sol de la rue. */
function pedestrianContext(): FrameContext {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000)
  camera.position.set(RUE.lng * 1000, 1.7, RUE.lat * 1000)
  camera.updateMatrixWorld(true)
  return {
    camera,
    cameraState: { lat: RUE.lat, lng: RUE.lng, altitude: 1.7, heading: 0, tilt: 0 },
    size: { width: 1000, height: 600 },
    dt: 1 / 60,
    invalidate: () => {},
  } as unknown as FrameContext
}

/** Visibilité effective d'un nœud, telle que `project()` l'a écrite sur son `CSS2DObject`. */
const visibleOf = (layer: MarkerLayer, id: string): boolean => {
  const node = (layer as unknown as { nodes: Map<string, { obj: THREE.Object3D }> }).nodes.get(id)
  if (!node) throw new Error(`marker ${id} absent`)
  return node.obj.visible
}

describe('MarkerLayer — occlusion en vue rasante', () => {
  it('masque le marker au-dessus des yeux tant que la vue n’est pas déclarée rasante', () => {
    const { layer, group } = setup()
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'rue')).toBe(true)
    expect(visibleOf(layer, 'toit')).toBe(false)
  })

  it('cesse d’occulter par l’horizon une fois la caméra au ras du sol', () => {
    const { layer, group } = setup()
    layer.setGrounded(true)
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'rue')).toBe(true)
    expect(visibleOf(layer, 'toit')).toBe(true)
  })

  it('rétablit l’occlusion en sortie du mode piéton', () => {
    const { layer, group } = setup()
    layer.setGrounded(true)
    project(layer, group, pedestrianContext())
    layer.setGrounded(false)
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'toit')).toBe(false)
  })
})

/**
 * L'horizon écarté, plus rien ne bornait la distance : depuis Paris, les markers de Nice
 * restaient à l'écran, alignés sur la ligne d'horizon et à la même taille que ceux d'en
 * face (un overlay DOM ne rapetisse pas). La portée de vue prend donc le relais — celle du
 * far de la caméra et de la fin du brouillard, pour qu'aucun marker ne flotte au-dessus du
 * vide.
 */
describe('MarkerLayer — portée de vue en mode piéton', () => {
  /** À la même hauteur que la caméra : seule la distance doit trancher. */
  const LOINTAIN: LatLng = { lat: 48.86, lng: 2.36 }

  function setupDistance() {
    const group = anchorGroup()
    const layer = new MarkerLayer(
      group,
      ellipsoid,
      fakeProjection(),
      () => {},
      () => {},
    )
    layer.setItems([
      { id: 'proche', position: RUE, animateEnter: false },
      // 0,02° de longitude → 20 m dans le repère du test.
      { id: 'lointain', position: LOINTAIN, animateEnter: false },
    ])
    return { layer, group }
  }

  /** Portée resserrée à 10 m : le marker à 20 m doit sortir, celui sous les pieds rester. */
  const withRange = (meters: number): MapConfig => ({
    ...defaultConfig,
    pedestrian: { ...defaultConfig.pedestrian, viewDistanceMeters: meters },
  })

  it('écarte le marker au-delà de la portée de vue', () => {
    const { layer, group } = setupDistance()
    layer.setConfig(withRange(10))
    layer.setGrounded(true)
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'proche')).toBe(true)
    expect(visibleOf(layer, 'lointain')).toBe(false)
  })

  it('garde le marker quand la portée le couvre', () => {
    const { layer, group } = setupDistance()
    layer.setConfig(withRange(1000))
    layer.setGrounded(true)
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'lointain')).toBe(true)
  })

  /** Hors marche, la portée du mode piéton ne borne rien : c'est l'horizon qui décide. */
  it('n’applique pas la portée hors mode piéton', () => {
    const { layer, group } = setupDistance()
    layer.setConfig(withRange(10))
    project(layer, group, pedestrianContext())
    expect(visibleOf(layer, 'lointain')).toBe(true)
  })
})

/**
 * Contrat de la passe d'écriture, et la raison pour laquelle la couche coûte ce qu'elle
 * coûte : `project()` LIT `obj.matrixWorld`, il ne l'écrit jamais.
 *
 * L'ancienne version appelait `getWorldPosition()` par marker, ce qui déclenche
 * `updateWorldMatrix(true, false)` — une remontée de toute la chaîne de parents, par
 * marker et par frame. C'est le moteur qui descend la scène des overlays, une seule fois
 * pour tous, entre `update` et `project` (cf. `MapEngine.tick`).
 */
describe('MarkerLayer — contrat de la passe de projection', () => {
  /** Matrice monde d'un nœud, telle qu'elle est au moment où on la lit. */
  const worldOf = (layer: MarkerLayer, id: string): THREE.Matrix4 => {
    const node = (layer as unknown as { nodes: Map<string, { obj: THREE.Object3D }> }).nodes.get(id)
    if (!node) throw new Error(`marker ${id} absent`)
    return node.obj.matrixWorld
  }

  it('ne met pas à jour les matrices monde lui-même', () => {
    const { layer } = setup()
    const identity = new THREE.Matrix4()
    // Le marker a bien une position LOCALE (posée par `setItems` → `settle`)…
    expect(worldOf(layer, 'toit').equals(identity)).toBe(true)

    // …et une projection sciemment privée de descente préalable ne doit pas la propager.
    // Toute autre valeur que l'identité signifierait que la couche a rétabli les matrices
    // dans son dos, et repayé la remontée de chaîne qu'on a justement supprimée.
    layer.project(pedestrianContext())
    expect(worldOf(layer, 'toit').equals(identity)).toBe(true)
  })

  it('projette sur la matrice que le moteur vient de descendre', () => {
    const { layer, group } = setup()
    project(layer, group, pedestrianContext())
    // 40 m de haut (le toit), dans le repère du test : la descente a eu lieu.
    expect(worldOf(layer, 'toit').elements[13]).toBe(40)
  })
})
