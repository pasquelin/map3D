// La valeur d'une vue mémorisée tient à deux choses : ce qu'on retrouve est ce qu'on a
// sauvé, et l'ORDRE dans lequel on le repose. Le second point est le vrai piège — poser la
// caméra avant le mode de carte, ou sans sortir du piéton, donne une vue silencieusement
// fausse. D'où un journal d'appels plutôt que des assertions isolées.

import { describe, expect, it } from 'vitest'
import type { MapEngine } from '../MapEngine'
import type { CameraState } from '../Camera'
import type { LatLng } from '../../shared'
import { applyView, captureView } from './view'
import type { TemplateView } from './types'

type Call = { name: string; arg?: unknown }

type Fake = {
  engine: MapEngine
  calls: Call[]
  /** Index du premier appel portant ce nom, `-1` s'il n'a pas eu lieu. */
  at: (name: string) => number
}

function fakeEngine(
  over: {
    pose?: CameraState
    mode?: 'plan' | '3d'
    traffic?: boolean
    tags?: string[]
    walking?: { lat: number; lng: number; heading: number; pitch: number }
    immersion?: 'explore' | 'full'
    canEnterPedestrian?: boolean
  } = {},
): Fake {
  const calls: Call[] = []
  const log = (name: string, arg?: unknown): void => void calls.push({ name, arg })
  const pose: CameraState = over.pose ?? { lat: 49.09, lng: 1.48, altitude: 1200, heading: 0.5, tilt: 0.4 }
  const walking = over.walking
  const engine = {
    camera: {
      getPose: () => pose,
      jumpToPose: (p: CameraState) => log('jumpToPose', p),
      flyToPose: (p: CameraState, o: unknown) => log('flyToPose', { p, o }),
    },
    tags: {
      selected: new Set(over.tags ?? ['agent', 'alerte']),
      setSelection: (t: Iterable<string>) => log('setSelection', [...t]),
    },
    getBasemap: () => ({ mode: over.mode ?? '3d', traffic: over.traffic ?? false }),
    getPedestrian: () => ({
      mode: walking ? 'pedestrian' : 'orbit',
      immersion: over.immersion ?? 'explore',
    }),
    getPedestrianPose: () =>
      walking
        ? {
            position: { lat: walking.lat, lng: walking.lng },
            groundHeight: 42,
            heading: walking.heading,
            pitch: walking.pitch,
          }
        : null,
    cancelIntro: () => log('cancelIntro'),
    setMapMode: (m: unknown) => log('setMapMode', m),
    setTrafficVisible: (v: unknown) => log('setTrafficVisible', v),
    exitPedestrian: () => log('exitPedestrian'),
    enterPedestrian: (p: LatLng, look: unknown) => {
      log('enterPedestrian', { p, look })
      return over.canEnterPedestrian ?? true
    },
    setPedestrianImmersion: (l: unknown) => log('setPedestrianImmersion', l),
  } as unknown as MapEngine
  return { engine, calls, at: (name) => calls.findIndex((c) => c.name === name) }
}

const orbitView = (over: Partial<TemplateView> = {}): TemplateView => ({
  lat: 49.09,
  lng: 1.48,
  altitude: 1200,
  heading: 0.5,
  tilt: 0.4,
  mapMode: '3d',
  traffic: false,
  ...over,
})

describe('captureView', () => {
  it('retient la pose complète, le fond de carte et la sélection de tags', () => {
    const { engine } = fakeEngine()
    const view = captureView(engine)
    expect(view).toEqual({
      lat: 49.09,
      lng: 1.48,
      altitude: 1200,
      heading: 0.5,
      tilt: 0.4,
      mapMode: '3d',
      traffic: false,
      tags: ['agent', 'alerte'],
    })
  })

  /** Une vue n'emporte JAMAIS d'éléments — seulement les noms qui les filtrent. */
  it('copie les tags plutôt que de partager le Set du filtre', () => {
    const { engine } = fakeEngine({ tags: ['agent'] })
    const view = captureView(engine)
    expect(Array.isArray(view.tags)).toBe(true)
    expect(view.tags).not.toBe(engine.tags.selected)
  })

  it('n’ajoute pas de bloc piéton en orbite', () => {
    expect(captureView(fakeEngine().engine).pedestrian).toBeUndefined()
  })

  /** `groundHeight` est délibérément laissé de côté : il se remesure à l'arrivée. */
  it('retient le point de station et le regard en première personne', () => {
    const { engine } = fakeEngine({
      walking: { lat: 43.7, lng: 7.26, heading: 1.2, pitch: -0.1 },
      immersion: 'full',
    })
    expect(captureView(engine).pedestrian).toEqual({
      lat: 43.7,
      lng: 7.26,
      heading: 1.2,
      pitch: -0.1,
      immersion: 'full',
    })
  })
})

describe('applyView', () => {
  /**
   * Le mode fixe `camera.maxTilt` : posée avant lui, une vue oblique se ferait borner par la
   * limite du mode qu'on quitte. Et sans `cancelIntro` en tête, l'intro reprend la main.
   */
  it('prend la main, règle le mode, puis pose la caméra — dans cet ordre', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView({ mapMode: 'plan', traffic: true }))
    expect(f.at('cancelIntro')).toBeLessThan(f.at('setMapMode'))
    expect(f.at('setMapMode')).toBeLessThan(f.at('setTrafficVisible'))
    expect(f.at('setTrafficVisible')).toBeLessThan(f.at('jumpToPose'))
    expect(f.calls.find((c) => c.name === 'setMapMode')?.arg).toBe('plan')
    expect(f.calls.find((c) => c.name === 'setTrafficVisible')?.arg).toBe(true)
  })

  it('repose exactement la pose sauvée', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView())
    expect(f.calls.find((c) => c.name === 'jumpToPose')?.arg).toEqual({
      lat: 49.09,
      lng: 1.48,
      altitude: 1200,
      heading: 0.5,
      tilt: 0.4,
    })
  })

  it('anime le trajet quand une durée est demandée', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView(), { duration: 1.2 })
    expect(f.at('jumpToPose')).toBe(-1)
    expect(f.calls.find((c) => c.name === 'flyToPose')?.arg).toMatchObject({ o: { duration: 1.2 } })
  })

  /** Sans `tags` dans la vue, le filtre en place ne doit pas être touché. */
  it('laisse le filtre « Couches » intact quand la vue n’en porte pas', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView())
    expect(f.at('setSelection')).toBe(-1)
  })

  it('restitue la sélection de tags d’un coup', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView({ tags: ['agent', 'alerte'] }))
    expect(f.calls.find((c) => c.name === 'setSelection')?.arg).toEqual(['agent', 'alerte'])
  })

  /**
   * Tant qu'on marche, le contrôleur piéton repositionne la caméra à chaque frame : la pose
   * posée avant la sortie serait effacée sans laisser de trace.
   */
  it('quitte le mode piéton avant de poser une vue en orbite', () => {
    const f = fakeEngine({ walking: { lat: 43.7, lng: 7.26, heading: 0, pitch: 0 } })
    applyView(f.engine, orbitView())
    expect(f.at('exitPedestrian')).toBeGreaterThanOrEqual(0)
    expect(f.at('exitPedestrian')).toBeLessThan(f.at('jumpToPose'))
  })

  it('n’appelle pas `exitPedestrian` quand on est déjà en orbite', () => {
    const f = fakeEngine()
    applyView(f.engine, orbitView())
    expect(f.at('exitPedestrian')).toBe(-1)
  })

  it('replonge au point de station avec le regard mémorisé', () => {
    const f = fakeEngine()
    applyView(
      f.engine,
      orbitView({ pedestrian: { lat: 43.7, lng: 7.26, heading: 1.2, pitch: -0.1, immersion: 'full' } }),
    )
    expect(f.calls.find((c) => c.name === 'enterPedestrian')?.arg).toEqual({
      p: { lat: 43.7, lng: 7.26 },
      look: { heading: 1.2, pitch: -0.1 },
    })
    expect(f.at('jumpToPose')).toBeLessThan(f.at('enterPedestrian'))
    expect(f.calls.find((c) => c.name === 'setPedestrianImmersion')?.arg).toBe('full')
  })

  /** `enterPedestrian` coupe les vols : un survol interrompu à mi-course serait un à-coup. */
  it('ignore la durée demandée pour une vue piéton', () => {
    const f = fakeEngine()
    applyView(
      f.engine,
      orbitView({ pedestrian: { lat: 43.7, lng: 7.26, heading: 0, pitch: 0, immersion: 'explore' } }),
      { duration: 2 },
    )
    expect(f.at('flyToPose')).toBe(-1)
    expect(f.at('jumpToPose')).toBeGreaterThanOrEqual(0)
  })

  /**
   * Sol pas encore streamé ou volume indisponible : le mode refuse. La vue reste celle de la
   * pose caméra — même endroit, même cap — et surtout on ne règle pas une immersion dans un
   * mode où l'on n'est pas entré.
   */
  it('n’impose pas d’immersion quand l’entrée en piéton échoue', () => {
    const f = fakeEngine({ canEnterPedestrian: false })
    applyView(f.engine, orbitView({ pedestrian: { lat: 43.7, lng: 7.26, heading: 0, pitch: 0, immersion: 'full' } }))
    expect(f.at('enterPedestrian')).toBeGreaterThanOrEqual(0)
    expect(f.at('setPedestrianImmersion')).toBe(-1)
  })
})

/** La garantie qui justifie la feature : ce qu'on sauve est ce qu'on repose. */
describe('captureView → applyView', () => {
  it('rejoue à l’identique ce qui a été capturé', () => {
    const source = fakeEngine({
      pose: { lat: 43.7, lng: 7.26, altitude: 800, heading: -1.4, tilt: 0.9 },
      mode: 'plan',
      traffic: true,
      tags: ['agent'],
    })
    const view = captureView(source.engine)
    const target = fakeEngine()
    applyView(target.engine, view)
    expect(target.calls.find((c) => c.name === 'jumpToPose')?.arg).toEqual({
      lat: 43.7,
      lng: 7.26,
      altitude: 800,
      heading: -1.4,
      tilt: 0.9,
    })
    expect(target.calls.find((c) => c.name === 'setMapMode')?.arg).toBe('plan')
    expect(target.calls.find((c) => c.name === 'setTrafficVisible')?.arg).toBe(true)
    expect(target.calls.find((c) => c.name === 'setSelection')?.arg).toEqual(['agent'])
  })
})
