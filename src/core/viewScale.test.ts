import { describe, expect, it } from 'vitest'
import { zoomForAltitude } from './math'
import { viewScaleDistance } from './viewScale'

/** Ni borne, ni vue rasante : le cas du survol ordinaire. */
const ORBITE = 0
/** Borne de la vue rasante — `pedestrian.tileDetailDistanceMeters` par défaut. */
const MARCHE = 120

describe('viewScaleDistance', () => {
  it('rend la distance au point visé quand il y en a un', () => {
    expect(viewScaleDistance(1455, 1455, ORBITE)).toBe(1455)
  })

  /**
   * L'invariant qui rend le changement sûr : à plat, le point visé est SOUS la caméra, donc
   * la distance vaut l'altitude et le zoom ne bouge pas d'un iota. Aucun seuil existant
   * (`staticMinZoom`, `clustering.maxZoom`) n'a besoin d'être ré-étalonné.
   */
  it('vaut l’altitude en vue nadir', () => {
    const altitude = 1455
    expect(zoomForAltitude(viewScaleDistance(altitude, altitude, ORBITE))).toBe(zoomForAltitude(altitude))
  })

  /**
   * Le cas qui motive tout : à 85°, l'altitude tombe à `distance × cos(85°)` ≈ 127 m pour une
   * distance de vue inchangée. L'ancien calcul y gagnait 3,5 niveaux de zoom.
   */
  it('ne suit plus l’effondrement de l’altitude à l’inclinaison', () => {
    const distance = 1455
    const altitudeInclinee = distance * Math.cos((85 * Math.PI) / 180)
    const zoomCorrige = zoomForAltitude(viewScaleDistance(distance, altitudeInclinee, ORBITE))
    expect(zoomCorrige).toBeCloseTo(zoomForAltitude(distance), 6)
    expect(zoomForAltitude(altitudeInclinee) - zoomCorrige).toBeGreaterThan(3)
  })

  it('retombe sur l’altitude quand le regard ne vise rien', () => {
    expect(viewScaleDistance(null, 800, ORBITE)).toBe(800)
  })

  describe('vue rasante', () => {
    it('borne un point de fuite lointain à la distance de référence', () => {
      expect(viewScaleDistance(4650, 1.7, MARCHE)).toBe(MARCHE)
    })

    /** Regard vers le ciel : c'est la borne qui sert de référence, pas les 1,70 m des yeux. */
    it('prend la borne quand le regard ne vise rien', () => {
      expect(viewScaleDistance(null, 1.7, MARCHE)).toBe(MARCHE)
    })

    it('garde une cible plus proche que la borne', () => {
      expect(viewScaleDistance(30, 1.7, MARCHE)).toBe(30)
    })
  })
})
