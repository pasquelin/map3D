// `getPose`/`jumpToPose` n'existent que pour MÉMORISER une vue et la retrouver : leur seule
// spécification utile est donc l'aller-retour. Le test tourne sur le VRAI ellipsoïde WGS84
// (calcul pur, aucun WebGL) plutôt que sur un double cartésien — un faux repère rendrait
// l'aller-retour exact sans rien dire du cap réel, qui est justement ce qui se joue ici.

import { WGS84_ELLIPSOID } from '3d-tiles-renderer'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import { Camera, type CameraState } from './Camera'
import { DEG2RAD } from './math'
import { Projection } from './Projection'

function setup(): { camera: Camera; three: THREE.PerspectiveCamera } {
  const projection = new Projection()
  projection.setConfig(defaultConfig)
  const group = new THREE.Group()
  group.updateMatrixWorld()
  projection.setContext(WGS84_ELLIPSOID, group)
  const three = new THREE.PerspectiveCamera(60, 16 / 9, 1, 1e7)
  const camera = new Camera(three, projection)
  camera.setConfig(defaultConfig)
  return { camera, three }
}

const pose = (lat: number, lng: number, altitude: number, headingDeg: number, tiltDeg: number): CameraState => ({
  lat,
  lng,
  altitude,
  heading: headingDeg * DEG2RAD,
  tilt: tiltDeg * DEG2RAD,
})

describe('Camera — pose mémorisable', () => {
  /**
   * Le cas qui motive tout : Vernon en vue oblique, Nice en vue rapprochée. Les deux doivent
   * se recharger à l'identique, cap et inclinaison compris.
   */
  it.each([
    ['nadir', pose(49.09, 1.48, 1200, 0, 0)],
    ['cap est', pose(49.09, 1.48, 1200, 90, 0)],
    ['cap sud', pose(49.09, 1.48, 1200, 180, 30)],
    ['cap ouest', pose(43.7, 7.26, 800, -90, 45)],
    ['rasant', pose(43.7, 7.26, 300, 137, 85)],
    ['haute latitude', pose(69.65, 18.96, 5000, 42, 60)],
    ['antiméridien', pose(-16.5, 179.9, 2500, -170, 20)],
  ])('retrouve la pose « %s » à l’identique', (_name, saved) => {
    const { camera } = setup()
    camera.jumpToPose(saved)
    const read = camera.getPose()
    expect(read.lat).toBeCloseTo(saved.lat, 6)
    expect(read.lng).toBeCloseTo(saved.lng, 6)
    expect(read.altitude).toBeCloseTo(saved.altitude, 3)
    expect(read.heading).toBeCloseTo(saved.heading, 5)
    expect(read.tilt).toBeCloseTo(saved.tilt, 5)
  })

  /**
   * `placeOrbit` doit être une VRAIE généralisation de `placeNadir`, sinon charger une vue
   * mémorisée à plat ferait rouler l'image par rapport à ce que `flyTo` produit au même
   * endroit — un écart que rien à l'écran n'expliquerait.
   */
  it('à cap et inclinaison nuls, repose exactement la pose nadir de `jumpTo`', () => {
    const { camera, three } = setup()
    camera.jumpTo({ lat: 48.86, lng: 2.34 }, 900)
    const nadirPos = three.position.clone()
    const nadirQuat = three.quaternion.clone()

    camera.jumpToPose(pose(48.86, 2.34, 900, 0, 0))
    expect(three.position.distanceTo(nadirPos)).toBeLessThan(1e-3)
    expect(three.quaternion.angleTo(nadirQuat)).toBeLessThan(1e-6)
  })

  /** Une vue prise en 3D et rechargée sur une carte plate se redresse au lieu de basculer. */
  it('borne l’inclinaison à `maxTilt` (celle du mode courant)', () => {
    const { camera } = setup()
    camera.maxTilt = 30 * DEG2RAD
    camera.jumpToPose(pose(48.86, 2.34, 900, 0, 80))
    expect(camera.getPose().tilt).toBeCloseTo(30 * DEG2RAD, 5)
  })

  /** Une inclinaison négative renverserait la caméra : le plancher n'est pas négociable. */
  it('refuse une inclinaison négative', () => {
    const { camera } = setup()
    camera.jumpToPose(pose(48.86, 2.34, 900, 0, -20))
    expect(camera.getPose().tilt).toBeCloseTo(0, 5)
  })

  /**
   * Charger une vue est une prise de main : un suivi ou un vol encore en cours la
   * repositionnerait à la frame suivante, et la vue « chargée » n'aurait jamais eu lieu.
   */
  it('coupe vol et suivi', () => {
    const { camera } = setup()
    camera.follow(() => ({ lat: 0, lng: 0 }))
    expect(camera.isControlling()).toBe(true)
    camera.jumpToPose(pose(48.86, 2.34, 900, 0, 0))
    expect(camera.isControlling()).toBe(false)

    camera.flyTo({ lat: 10, lng: 10 })
    camera.jumpToPose(pose(48.86, 2.34, 900, 0, 0))
    expect(camera.isFlying()).toBe(false)
  })

  /** Version animée : elle vise la pose, elle ne la pose pas tout de suite. */
  it('`flyToPose` arrive sur la pose demandée en fin de vol', () => {
    const { camera } = setup()
    camera.jumpTo({ lat: 48.86, lng: 2.34 }, 5000)
    const target = pose(49.09, 1.48, 1200, 90, 40)
    camera.flyToPose(target, { duration: 0.05 })
    expect(camera.isFlying()).toBe(true)
    // 60 frames par seconde de vol : `update` avance de `speed` et se termine à t ≥ 1.
    for (let i = 0; i < 10 && camera.isFlying(); i++) camera.update()
    expect(camera.isFlying()).toBe(false)
    const read = camera.getPose()
    expect(read.lat).toBeCloseTo(target.lat, 6)
    expect(read.heading).toBeCloseTo(target.heading, 5)
    expect(read.tilt).toBeCloseTo(target.tilt, 5)
  })
})
