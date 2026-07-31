import { describe, expect, it } from 'vitest'
import { DEG2RAD } from '../core/math'
import { defaultLabels } from './defaultLabels'
import { mergeLabels } from './mergeLabels'
import { makeReadoutFormatter } from './readout'

const readout = (over?: Parameters<typeof mergeLabels>[1]) => makeReadoutFormatter(mergeLabels(defaultLabels, over))

describe('makeReadoutFormatter', () => {
  it('garde une largeur STABLE en conservant les décimales nulles', () => {
    // La raison d'être des minima : sans eux, « 2 » puis « 2,29448 » n'ont pas la même
    // largeur et le bloc tressaute à chaque frame d'un déplacement.
    const f = readout()
    expect(f.coord(2)).toBe('2.00000')
    expect(f.zoom(15)).toBe('15.0')
  })

  it('rend les coordonnées au point décimal même sous des libellés français', () => {
    // Choix documenté (`labels.readout.numberLocale`) : une coordonnée WGS84 se recopie
    // ailleurs, où le point est la convention — alors que l'altitude, juste au-dessus,
    // suit bien la locale de `measure`.
    const f = readout()
    expect(f.coord(48.858372)).toBe('48.85837')
    expect(f.altitude(2400)).toMatch(/2[.,]4/)
  })

  it('suit la locale demandée pour les coordonnées', () => {
    expect(readout({ readout: { numberLocale: 'fr-FR' } }).coord(2.29448)).toBe('2,29448')
  })

  it('respecte les décimales demandées', () => {
    const f = readout({ readout: { coordDecimals: 2, zoomDecimals: 0 } })
    expect(f.coord(48.858372)).toBe('48.86')
    expect(f.zoom(15.4)).toBe('15')
  })

  it('rend les coordonnées négatives signées', () => {
    expect(readout().coord(-0.1276)).toBe('-0.12760')
  })

  describe('cap', () => {
    const f = readout()
    const deg = (d: number) => d * DEG2RAD

    it('rend les degrés depuis les radians du moteur', () => {
      expect(f.heading(0)).toBe('0°')
      expect(f.heading(deg(127))).toBe('127°')
    })

    it('ramène un cap négatif dans [0, 360[', () => {
      // `headingFromForward` produit un `atan2`, donc [-π, π] : un cap ouest arrive à −90°.
      expect(f.heading(deg(-90))).toBe('270°')
    })

    it('n’écrit jamais 360° — c’est le nord, et il s’écrit 0°', () => {
      // La régression que ce test verrouille : normaliser AVANT l'arrondi laissait 359,7°
      // devenir un « 360° » qui n'existe pas.
      expect(f.heading(deg(359.7))).toBe('0°')
    })

    it('respecte les décimales et le gabarit demandés', () => {
      const fine = readout({ readout: { degreeDecimals: 1, degreeFormat: '{value} deg' } })
      expect(fine.heading(deg(359.7))).toBe('359.7 deg')
    })
  })

  describe('inclinaison', () => {
    const f = readout()
    const deg = (d: number) => d * DEG2RAD

    it('rend le nadir et l’horizon aux bornes de la convention moteur', () => {
      // 0 = à la verticale (vue du dessus), π/2 = regard porté vers l'horizon.
      expect(f.tilt(0)).toBe('0°')
      expect(f.tilt(Math.PI / 2)).toBe('90°')
    })

    it('rend les inclinaisons intermédiaires', () => {
      expect(f.tilt(deg(42))).toBe('42°')
    })

    it('ne normalise PAS sur 360 — un angle entre vecteurs ne boucle pas', () => {
      // La différence avec le cap : `tiltFromNadir` est un `angleTo`, donc [0, 180°].
      // Lui appliquer le modulo du cap ferait lire « 0° » (nadir) pour un demi-tour.
      expect(f.tilt(Math.PI)).toBe('180°')
    })
  })

  it('formate l’altitude avec le système d’unités de `measure`', () => {
    // L'altitude n'a pas de système d'unités à elle : une carte en impérial la lit en
    // pieds sans avoir à le redire dans `readout`.
    const f = readout({
      measure: {
        numberLocale: 'en-US',
        major: '{value} mi',
        minor: '{value} ft',
        majorThreshold: 1609.344,
        majorFactor: 1609.344,
        minorFactor: 0.3048,
        majorDecimals: 1,
      },
    })
    expect(f.altitude(30.48)).toBe('100 ft')
    expect(f.altitude(1609.344)).toBe('1 mi')
  })
})
