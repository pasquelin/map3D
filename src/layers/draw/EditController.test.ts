import { WGS84_ELLIPSOID } from '3d-tiles-renderer'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import { EnuFrame } from '../../core/enu'
import type { Pt } from '../../core/geometry'
import { Projection } from '../../core/Projection'
import type { LatLng } from '../../shared'
import type { Drawing } from '../DrawLayer'
import { EditController, type EditHost } from './EditController'

// Filet anti-régression (Tâche 1) : fige le comportement RÉEL des transformations
// géométriques pures d'`EditController` (basis / rotate / scale / clampScale, lues à
// EditController.ts:278-344) avant tout refactor du dossier `draw/`. Ces fonctions ne
// sont pas exportées (privées au module) — on ne les rend pas publiques pour les tester
// (contrainte de la tâche) : elles sont exercées via la surface publique de la classe
// (`beginMove`/`beginScale`/`beginVertex`/`move`/`end`/`cancel`/`layout`).
//
// Astuce de mesure : `EditController.begin()` construit en interne un `EnuFrame` ancré
// EXACTEMENT sur `ref.points[0]` (cf. EditController.ts:112). En posant le premier coin
// de chaque forme de test À L'ANCRE MÊME du frame de fabrication (`ANCHOR`, sans aucun
// aller-retour lat/lng → local → lat/lng), le frame interne de la classe et celui du test
// sont construits avec des arguments identiques (même `Projection`, même ancre, même
// hauteur) — donc rigoureusement le même repère, sans approximation. Les coordonnées
// locales choisies pour fabriquer les formes (0, 20, 10…) sont alors EXACTEMENT celles
// que lit `EditController` en interne : les valeurs attendues se dérivent à la main par
// simple lecture des formules (translation, `rotate`, `toUV`/`fromUV`, `clampScale`).
//
// Tourne sur le VRAI ellipsoïde WGS84 (calcul pur, aucun WebGL) — même pattern que
// `Camera.test.ts` / `extrude.test.ts` — plutôt que sur un double cartésien qui ne dirait
// rien du vrai comportement de l'ancrage ENU utilisé par `begin()`/`layout()`.

const ANCHOR: LatLng = { lat: 48.85, lng: 2.35 }

function setup(): { projection: Projection; frame: EnuFrame } {
  const projection = new Projection()
  projection.setConfig(defaultConfig)
  const group = new THREE.Group()
  group.updateMatrixWorld()
  projection.setContext(WGS84_ELLIPSOID, group)
  const frame = new EnuFrame(projection, ANCHOR, 0)
  return { projection, frame }
}

/** Rect axis-aligned stocké en 4 coins, premier coin = `ANCHOR` (cf. note de mesure). */
function makeRect(frame: EnuFrame, id: string, w: number, h: number): Drawing {
  return {
    id,
    kind: 'rect',
    points: [ANCHOR, frame.toLatLng({ x: w, z: 0 }), frame.toLatLng({ x: w, z: h }), frame.toLatLng({ x: 0, z: h })],
    color: '#f00',
    width: 2,
    fillOpacity: 0.3,
    closed: true,
    tags: ['draw', 'rect'],
  }
}

/** Rect tourné de 45° (arêtes non alignées aux axes) : force le repère « axes propres » de `computeBasis`. */
function makeRotatedRect(frame: EnuFrame, id: string, side: number): Drawing {
  const s = side / Math.SQRT2
  return {
    id,
    kind: 'rect',
    points: [
      ANCHOR,
      frame.toLatLng({ x: s, z: s }),
      frame.toLatLng({ x: 0, z: 2 * s }),
      frame.toLatLng({ x: -s, z: s }),
    ],
    color: '#f00',
    width: 2,
    fillOpacity: 0.3,
    closed: true,
    tags: ['draw', 'rect'],
  }
}

function makePolygon(frame: EnuFrame, id: string, pts: Pt[]): Drawing {
  return {
    id,
    kind: 'polygon',
    points: [ANCHOR, ...pts.slice(1).map((p) => frame.toLatLng(p))],
    color: '#00f',
    width: 2,
    fillOpacity: 0.3,
    closed: true,
    tags: ['draw', 'polygon'],
  }
}

function makeCircle(frame: EnuFrame, id: string, r: number): Drawing {
  return {
    id,
    kind: 'circle',
    points: [ANCHOR, frame.toLatLng({ x: r, z: 0 })],
    color: '#0f0',
    width: 2,
    fillOpacity: 0.3,
    closed: true,
    tags: ['draw', 'circle'],
  }
}

/** Host minimal : aucun rendu, `toScreen` projette dans le même repère local (x → x, z → y). */
function makeHost(frame: EnuFrame, drawings: Drawing[]): EditHost {
  return {
    targets: () => drawings,
    anchorHeight: () => 0,
    toScreen: (p) => {
      const l = frame.local(p)
      return { x: l.x, y: l.z }
    },
    snapshotBefore: () => {},
    afterMutate: () => {},
    commit: () => {},
    interaction: () => defaultConfig.interaction,
  }
}

const locals = (frame: EnuFrame, d: Drawing): Pt[] => d.points.map((p) => frame.local(p))

describe('EditController — déplacement (move, sans Maj)', () => {
  it('translate tous les sommets du même vecteur (curseur final − curseur initial)', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 20, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))

    expect(ctrl.beginMove(frame.toLatLng({ x: 5, z: 5 }))).toBe(true)
    ctrl.move(frame.toLatLng({ x: 8, z: 2 }), false)

    // dx = 8-5 = 3, dz = 2-5 = -3, appliqué aux 4 coins d'origine (0,0)-(20,0)-(20,10)-(0,10).
    const l = locals(frame, rect)
    expect([l[0]!.x, l[0]!.z]).toEqual([expect.closeTo(3, 6), expect.closeTo(-3, 6)])
    expect([l[1]!.x, l[1]!.z]).toEqual([expect.closeTo(23, 6), expect.closeTo(-3, 6)])
    expect([l[2]!.x, l[2]!.z]).toEqual([expect.closeTo(23, 6), expect.closeTo(7, 6)])
    expect([l[3]!.x, l[3]!.z]).toEqual([expect.closeTo(3, 6), expect.closeTo(7, 6)])
  })

  it('cancel() restaure exactement la géométrie de départ après translation', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 20, 10)
    const before = rect.points.map((p) => ({ ...p }))
    const ctrl = new EditController(projection, makeHost(frame, [rect]))

    ctrl.beginMove(frame.toLatLng({ x: 0, z: 0 }))
    ctrl.move(frame.toLatLng({ x: 100, z: -50 }), false)
    ctrl.cancel()

    for (let i = 0; i < before.length; i++) {
      expect(rect.points[i]!.lat).toBeCloseTo(before[i]!.lat, 9)
      expect(rect.points[i]!.lng).toBeCloseTo(before[i]!.lng, 9)
    }
    expect(ctrl.active).toBe(false)
  })

  it('begin() échoue sans cible (aucune sélection)', () => {
    const { projection, frame } = setup()
    const ctrl = new EditController(projection, makeHost(frame, []))
    expect(ctrl.beginMove(ANCHOR)).toBe(false)
    expect(ctrl.active).toBe(false)
  })
})

describe('EditController — rotation (move + Maj)', () => {
  it('rotation de 90° (sens direct, formule `rotate` lue en EditController.ts:332) autour du centre', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 20, 20)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    // Centre du rect (0,0)-(20,0)-(20,20)-(0,20) = (10,10).
    const east = frame.toLatLng({ x: 20, z: 10 }) // point au bord Est, à hauteur du centre
    ctrl.beginMove(east)
    // Bascule move → rotate : `move()` fige `start`/`center`/`basis` sur l'état courant à
    // l'instant où `shift` devient vrai (EditController.ts:138-144) — donc rotation de 0°
    // au premier appel avec `shift: true`, il faut un second point pour tourner réellement.
    ctrl.move(east, true)
    // Rayon centre→est = (10,0). +90° via `rotate` (cos=0, sin=1) : x' = 10·0 - 0·1 = 0,
    // z' = 10·1 + 0·0 = 10 → nouveau point à (10, 10+10) = (10, 20), soit le bord Nord.
    const north = frame.toLatLng({ x: 10, z: 20 })
    ctrl.move(north, true)

    const l = locals(frame, rect)
    // Les 4 coins, tournés de +90° autour de (10,10) : (0,0)→(20,0), (20,0)→(20,20),
    // (20,20)→(0,20), (0,20)→(0,0).
    expect([l[0]!.x, l[0]!.z]).toEqual([expect.closeTo(20, 3), expect.closeTo(0, 3)])
    expect([l[1]!.x, l[1]!.z]).toEqual([expect.closeTo(20, 3), expect.closeTo(20, 3)])
    expect([l[2]!.x, l[2]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(20, 3)])
    expect([l[3]!.x, l[3]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(0, 3)])
  })

  it('rotating vaut vrai seulement pendant un geste move + Maj', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    ctrl.beginMove(frame.toLatLng({ x: 0, z: 0 }))
    expect(ctrl.rotating).toBe(false)
    ctrl.move(frame.toLatLng({ x: 1, z: 1 }), true)
    expect(ctrl.rotating).toBe(true)
    ctrl.move(frame.toLatLng({ x: 1, z: 1 }), false)
    expect(ctrl.rotating).toBe(false)
  })
})

describe('EditController — redimensionnement (scale)', () => {
  it('poignée de coin (u=1,v=1) : facteur = (curseur − ancrage-opposé) / (poignée − ancrage), lu en EditController.ts:167-168', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    // Poignée (1,1) = coin (10,10) ; ancrage opposé (au=0,av=0) = coin (0,0).
    ctrl.beginScale(frame.toLatLng({ x: 10, z: 10 }), { u: 1, v: 1 })
    // Curseur amené en (20,20) : su = (20-0)/(10-0) = 2, sv = idem = 2 → homothétie ×2
    // depuis le coin (0,0) qui reste fixe.
    ctrl.move(frame.toLatLng({ x: 20, z: 20 }), false)

    const l = locals(frame, rect)
    expect([l[0]!.x, l[0]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(0, 3)])
    expect([l[1]!.x, l[1]!.z]).toEqual([expect.closeTo(20, 3), expect.closeTo(0, 3)])
    expect([l[2]!.x, l[2]!.z]).toEqual([expect.closeTo(20, 3), expect.closeTo(20, 3)])
    expect([l[3]!.x, l[3]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(20, 3)])
  })

  it('poignée d’arête (u=0.5,v=1) : un seul axe bouge, l’autre reste figé à facteur 1', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    // Poignée milieu du bord Nord (u=0.5, v=1) = (5,10).
    ctrl.beginScale(frame.toLatLng({ x: 5, z: 10 }), { u: 0.5, v: 1 })
    // sv = (16-0)/(10-0) = 1.6 ; su reste 1 (h.u === 0.5).
    ctrl.move(frame.toLatLng({ x: 999, z: 16 }), false)

    const l = locals(frame, rect)
    // Axe U (x) inchangé : coins toujours à x=0 et x=10. Axe V (z) étiré ×1.6 : 0→0, 10→16.
    expect(l[0]!.x).toBeCloseTo(0, 3)
    expect(l[1]!.x).toBeCloseTo(10, 3)
    expect(l[0]!.z).toBeCloseTo(0, 3)
    expect(l[2]!.z).toBeCloseTo(16, 3)
  })

  it('Maj + poignée de coin : homothétie, le facteur dominant s’applique aux deux axes (EditController.ts:169-174)', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    ctrl.beginScale(frame.toLatLng({ x: 10, z: 10 }), { u: 1, v: 1 })
    // su = (30-0)/10 = 3, sv = (14-0)/10 = 1.4 → |su-1|=2 > |sv-1|=0.4 → sv devient su = 3.
    ctrl.move(frame.toLatLng({ x: 30, z: 14 }), true)

    const l = locals(frame, rect)
    expect(l[2]!.x).toBeCloseTo(30, 3) // coin opposé étiré ×3 sur X
    expect(l[2]!.z).toBeCloseTo(30, 3) // et ×3 sur Z aussi (facteur dominant imposé aux deux axes)
  })

  it('clampScale : facteur nul (curseur ramené pile sur l’ancrage opposé) clampé au plancher `minScale`, jamais 0', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    ctrl.beginScale(frame.toLatLng({ x: 10, z: 10 }), { u: 1, v: 1 })
    // Curseur ramené exactement sur l'ancrage opposé (0,0) : (cu-au) = 0 → s = 0, non
    // négatif → clampScale(0, 0.02) retourne +0.02 (EditController.ts:340-344), jamais 0.
    ctrl.move(frame.toLatLng({ x: 0, z: 0 }), false)

    const l = locals(frame, rect)
    const minScale = defaultConfig.interaction.minScale
    expect(l[2]!.x).toBeCloseTo(10 * minScale, 6)
    expect(l[2]!.z).toBeCloseTo(10 * minScale, 6)
  })

  it('clampScale : facteur négatif (curseur passé de l’autre côté de l’ancrage) clampé à `-minScale`', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 10)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    ctrl.beginScale(frame.toLatLng({ x: 10, z: 10 }), { u: 1, v: 1 })
    // Curseur en (-0.1, -0.1) : su = sv = (-0.1-0)/10 = -0.01, |s| < minScale (0.02) et s < 0
    // → clampScale(-0.01, 0.02) retourne -minScale (EditController.ts:340-344).
    ctrl.move(frame.toLatLng({ x: -0.1, z: -0.1 }), false)

    const l = locals(frame, rect)
    const minScale = defaultConfig.interaction.minScale
    expect(l[2]!.x).toBeCloseTo(10 * -minScale, 4)
    expect(l[2]!.z).toBeCloseTo(10 * -minScale, 4)
  })
})

describe('EditController — computeBasis (EditController.ts:278-320)', () => {
  it('rect seul tourné (axes propres) : le resize suit les arêtes de la forme, pas les axes du monde', () => {
    const { projection, frame } = setup()
    const side = 10
    const rect = makeRotatedRect(frame, 'r1', side)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    // Poignée (1,1) = 3ᵉ coin du quad = (0, 2·side/√2). Ancrage opposé = 1ᵉʳ coin = ANCHOR (0,0).
    const s = side / Math.SQRT2
    ctrl.beginScale(frame.toLatLng({ x: 0, z: 2 * s }), { u: 1, v: 1 })
    // Facteur ×2 le long des DEUX axes propres (U, V du quad, à 45°) — pas le long de X/Z monde.
    ctrl.move(frame.toLatLng({ x: 0, z: 4 * s }), false)

    const l = locals(frame, rect)
    // Le 1ᵉʳ coin (ancre) ne bouge pas ; le 3ᵉ coin (poignée) est repoussé à 2× sa distance
    // d'origine à l'ancre, dans la MÊME direction (0, 4s) — donc toujours sur l'axe X=0.
    expect(l[0]!.x).toBeCloseTo(0, 3)
    expect(l[0]!.z).toBeCloseTo(0, 3)
    expect(l[2]!.x).toBeCloseTo(0, 3)
    expect(l[2]!.z).toBeCloseTo(4 * s, 3)
  })

  it('deux formes sélectionnées ensemble : bounding box axis-aligned de l’union (repli AABB)', () => {
    const { projection, frame } = setup()
    const a = makePolygon(frame, 'a', [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ])
    const b = makePolygon(frame, 'b', [
      { x: 0, z: 0 },
      { x: 10, z: 10 },
      { x: 12, z: 10 },
      { x: 12, z: 8 },
    ])
    const ctrl = new EditController(projection, makeHost(frame, [a, b]))
    // Bounding box de l'union : x ∈ [0,12], z ∈ [0,10]. Poignée de coin (1,1) = (12,10).
    ctrl.beginScale(frame.toLatLng({ x: 12, z: 10 }), { u: 1, v: 1 })
    // Étire ×2 depuis l'ancre (0,0) de la bbox : la poignée doit atterrir en (24,20).
    ctrl.move(frame.toLatLng({ x: 24, z: 20 }), false)

    // Le 1ᵉʳ point de `b` (0,0, au coin bbox opposé à la poignée) reste fixe.
    const lb = locals(frame, b)
    expect(lb[0]!.x).toBeCloseTo(0, 3)
    expect(lb[0]!.z).toBeCloseTo(0, 3)
    // Le point (12,8) de `b`, à mi-hauteur de la bbox (u=1, v=0.8), suit le même facteur ×2
    // sur chaque axe indépendamment (bbox non tournée) : (24, 16).
    expect(lb[3]!.x).toBeCloseTo(24, 3)
    expect(lb[3]!.z).toBeCloseTo(16, 3)
  })

  it('cercle seul : bounding box = centre ± rayon sur chaque axe', () => {
    const { projection, frame } = setup()
    const r = 5
    const circle = makeCircle(frame, 'c1', r)
    const ctrl = new EditController(projection, makeHost(frame, [circle]))
    // Bbox du cercle centré en (0,0) rayon 5 : x,z ∈ [-5,5]. Poignée de coin (1,1) = (5,5).
    ctrl.beginScale(frame.toLatLng({ x: 5, z: 5 }), { u: 1, v: 1 })
    // Étire ×2 depuis l'ancre opposée (-5,-5) : la poignée doit atterrir à (-5,-5)+2·(10,10) = (15,15).
    ctrl.move(frame.toLatLng({ x: 15, z: 15 }), false)

    const l = locals(frame, circle)
    // Le centre du cercle (u=0.5,v=0.5 dans la bbox) se déplace : au+((0-(-5))/10)*10*su
    // = -5 + 0.5*10*2 = 5. Le centre migre donc de (0,0) à (5,5).
    expect(l[0]!.x).toBeCloseTo(5, 3)
    expect(l[0]!.z).toBeCloseTo(5, 3)
  })
})

describe('EditController — sommet (vertex)', () => {
  it('déplace uniquement le sommet visé, les autres sont intacts', () => {
    const { projection, frame } = setup()
    const poly = makePolygon(frame, 'p1', [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ])
    const before = poly.points.map((p) => ({ ...p }))
    const ctrl = new EditController(projection, makeHost(frame, [poly]))

    expect(ctrl.beginVertex(frame.toLatLng({ x: 10, z: 0 }), 'p1', 1)).toBe(true)
    ctrl.move(frame.toLatLng({ x: 3, z: 7 }), false)

    const l = locals(frame, poly)
    expect(l[0]!.x).toBeCloseTo(0, 6)
    expect(l[0]!.z).toBeCloseTo(0, 6)
    expect(l[1]!.x).toBeCloseTo(3, 3)
    expect(l[1]!.z).toBeCloseTo(7, 3)
    expect(poly.points[2]!.lat).toBeCloseTo(before[2]!.lat, 9)
    expect(poly.points[2]!.lng).toBeCloseTo(before[2]!.lng, 9)
  })

  it('beginVertex échoue sur une forme inconnue ou un index hors bornes', () => {
    const { projection, frame } = setup()
    const poly = makePolygon(frame, 'p1', [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ])
    const ctrl = new EditController(projection, makeHost(frame, [poly]))
    expect(ctrl.beginVertex(ANCHOR, 'inconnu', 0)).toBe(false)
    expect(ctrl.beginVertex(ANCHOR, 'p1', 5)).toBe(false)
    expect(ctrl.active).toBe(false)
  })
})

describe('EditController — normalisation d’un rect à 2 points diagonaux', () => {
  it('un rect stocké en 2 coins diagonaux passe en 4 coins avant tout geste (diagonalToCorners)', () => {
    const { projection, frame } = setup()
    const rect: Drawing = {
      id: 'r1',
      kind: 'rect',
      points: [ANCHOR, frame.toLatLng({ x: 10, z: 10 })],
      color: '#f00',
      width: 2,
      fillOpacity: 0.3,
      closed: true,
      tags: ['draw', 'rect'],
    }
    const ctrl = new EditController(projection, makeHost(frame, [rect]))
    ctrl.beginMove(ANCHOR)
    ctrl.cancel()

    // `normalizeRect` a dû tourner AVANT le calcul du geste : 4 coins désormais présents,
    // dans l'ordre `diagonalToCorners` (a, (b.x,a.z), b, (a.x,b.z)).
    expect(rect.points).toHaveLength(4)
    const l = locals(frame, rect)
    expect([l[0]!.x, l[0]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(0, 3)])
    expect([l[1]!.x, l[1]!.z]).toEqual([expect.closeTo(10, 3), expect.closeTo(0, 3)])
    expect([l[2]!.x, l[2]!.z]).toEqual([expect.closeTo(10, 3), expect.closeTo(10, 3)])
    expect([l[3]!.x, l[3]!.z]).toEqual([expect.closeTo(0, 3), expect.closeTo(10, 3)])
  })
})

describe('EditController — layout() (fromUV/toUV appliqués aux poignées)', () => {
  it('poignées de coin d’un rect placées aux 4 sommets, poignées d’arête aux milieux (toScreen = repère local)', () => {
    const { projection, frame } = setup()
    const rect = makeRect(frame, 'r1', 10, 20)
    const ctrl = new EditController(projection, makeHost(frame, [rect]))

    const specs = ctrl.layout()
    // 4 coins + 4 arêtes (rect avec un autre voisin possible = 1 seule forme ici).
    expect(specs.filter((s) => s.kind === 'scale')).toHaveLength(8)
    const corner11 = specs.find((s) => s.id.type === 'scale' && s.id.u === 1 && s.id.v === 1)
    expect(corner11).toBeDefined()
    expect(corner11!.x).toBeCloseTo(10, 3)
    expect(corner11!.y).toBeCloseTo(20, 3)
    const edge = specs.find((s) => s.id.type === 'scale' && s.id.u === 0.5 && s.id.v === 0)
    expect(edge).toBeDefined()
    expect(edge!.x).toBeCloseTo(5, 3)
    expect(edge!.y).toBeCloseTo(0, 3)
  })

  it('sélection vide : aucune poignée', () => {
    const { projection, frame } = setup()
    const ctrl = new EditController(projection, makeHost(frame, []))
    expect(ctrl.layout()).toEqual([])
  })
})
