import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Projection } from '../core/Projection'
import { isInsideFrame, isWithinViewDistance } from './markerCull'

const SIZE = { width: 1000, height: 600 }

describe('isInsideFrame — cadre du canvas, marge comprise', () => {
  it('accepte un point au centre', () => {
    expect(isInsideFrame(500, 300, SIZE.width, SIZE.height, 0)).toBe(true)
  })

  it('rejette un point hors cadre sans marge', () => {
    expect(isInsideFrame(-1, 300, SIZE.width, SIZE.height, 0)).toBe(false)
    expect(isInsideFrame(500, 601, SIZE.width, SIZE.height, 0)).toBe(false)
  })

  /** La marge n'est pas cosmétique : sans elle, les markers du bord clignotent au pan. */
  it('garde un point juste dehors tant qu’il tient dans la marge', () => {
    expect(isInsideFrame(-80, 300, SIZE.width, SIZE.height, 120)).toBe(true)
    expect(isInsideFrame(-200, 300, SIZE.width, SIZE.height, 120)).toBe(false)
  })
})

describe('isWithinViewDistance — portée de vue du mode piéton', () => {
  const PORTEE = 1000

  it('garde ce qui est en deçà de la portée', () => {
    expect(isWithinViewDistance(999 * 999, PORTEE)).toBe(true)
  })

  it('écarte ce qui la dépasse', () => {
    expect(isWithinViewDistance(1001 * 1001, PORTEE)).toBe(false)
  })

  it('garde ce qui est pile à la portée', () => {
    expect(isWithinViewDistance(PORTEE * PORTEE, PORTEE)).toBe(true)
  })

  /** Hors mode piéton, l'occlusion par le globe suffit : la portée ne borne rien. */
  it('ne borne rien quand la portée est nulle ou négative', () => {
    expect(isWithinViewDistance(700_000 * 700_000, 0)).toBe(true)
    expect(isWithinViewDistance(700_000 * 700_000, -1)).toBe(true)
  })
})

/**
 * Le cull de cadre lisait `z <= 1` en NDC pour écarter ce qui est derrière la caméra. Or
 * `z > 1` dit AUSSI « au-delà du far » — et le mode piéton resserre le far à
 * `pedestrian.viewDistanceMeters` (1 km par défaut). Tout marker plus lointain était donc
 * masqué, alors que `MapEngine.render` élargit justement near/far pour le rendu des
 * overlays. Le sens de visée ne confond pas les deux cas.
 */
describe('Projection.isBehindCamera — dos de la caméra, indépendamment du far', () => {
  const projection = new Projection()
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000)
  camera.position.set(0, 0, 0)
  camera.lookAt(0, 0, -1)
  camera.updateMatrixWorld(true)
  // Le sens de visée est posé une fois par passe, pas relu par point : `getWorldDirection`
  // réinverse la matrice monde de la caméra à chaque appel (cf. `setViewDirection`).
  projection.setViewDirection(camera)

  it('accepte un point devant, même au-delà du far', () => {
    expect(projection.isBehindCamera(new THREE.Vector3(0, 0, -50), camera.position)).toBe(false)
    expect(projection.isBehindCamera(new THREE.Vector3(0, 0, -5000), camera.position)).toBe(false)
  })

  it('rejette un point derrière', () => {
    expect(projection.isBehindCamera(new THREE.Vector3(0, 0, 50), camera.position)).toBe(true)
  })

  it('rejette un point exactement dans le plan de la caméra', () => {
    expect(projection.isBehindCamera(new THREE.Vector3(50, 0, 0), camera.position)).toBe(true)
  })
})
