// Formatage du bloc de lecture de la vue (altitude, coordonnées, zoom) — module PUR,
// dans l'esprit de `measure.ts` : il ne dépend que des libellés, ni de Three ni de
// React. C'est ce qui le rend testable sans monter de carte, et réutilisable par un
// hôte qui préfère afficher ces valeurs dans son propre bandeau.

import { RAD2DEG } from '../core/math'
import { makeDistanceFormatter } from './measure'
import { formatLabel } from './mergeLabels'
import type { MapLabels } from './types'

/**
 * Grandeur affichable du bloc de lecture.
 *
 * Déclarée ici, avec le formateur qui la sert, et non dans le composant React : la
 * couche qui écrit ces valeurs vit dans le cœur agnostique et ne connaît pas React.
 */
export type ReadoutField = 'altitude' | 'latitude' | 'longitude' | 'heading' | 'tilt' | 'zoom'

/** Les grandeurs du bloc, déjà mises en forme et prêtes à écrire dans le DOM. */
export type ReadoutFormatter = {
  /** Altitude de l'œil au-dessus de la surface (mètres en entrée). */
  altitude: (meters: number) => string
  /** Latitude ou longitude, en degrés décimaux signés. */
  coord: (degrees: number) => string
  /** Cap **en radians** (0 = nord, positif vers l'est), rendu en degrés dans `[0, 360[`. */
  heading: (radians: number) => string
  /** Inclinaison **en radians** (0 = nadir, π/2 = horizon), rendue en degrés. */
  tilt: (radians: number) => string
  /** Zoom façon carte 2D (échelle Google). */
  zoom: (zoom: number) => string
}

/**
 * Formateurs du bloc de lecture. À construire UNE fois par jeu de libellés :
 * `Intl.NumberFormat` coûte cher à créer et le bloc se rafraîchit en boucle.
 *
 * L'altitude délègue à `makeDistanceFormatter` — c'est une distance comme une autre,
 * donc elle suit `measure` (seuil, unités, décimales) sans redire son système ici.
 */
export function makeReadoutFormatter(labels: MapLabels): ReadoutFormatter {
  const { coordDecimals, zoomDecimals, degreeDecimals, degreeFormat, numberLocale } = labels.readout
  const locale = numberLocale === 'auto' ? undefined : numberLocale
  // Minimum ET maximum : sans le minimum, une décimale nulle disparaît, la largeur du
  // nombre change, et le bloc tressaute à chaque frame pendant un déplacement.
  const coord = new Intl.NumberFormat(locale, {
    minimumFractionDigits: coordDecimals,
    maximumFractionDigits: coordDecimals,
  })
  const zoom = new Intl.NumberFormat(locale, {
    minimumFractionDigits: zoomDecimals,
    maximumFractionDigits: zoomDecimals,
  })
  const angle = new Intl.NumberFormat(locale, {
    minimumFractionDigits: degreeDecimals,
    maximumFractionDigits: degreeDecimals,
  })
  const step = 10 ** degreeDecimals
  /** Radians → degrés arrondis à la précision affichée. */
  const degreesOf = (radians: number): number => Math.round(radians * RAD2DEG * step) / step
  const writeAngle = (degrees: number): string => formatLabel(degreeFormat, { value: angle.format(degrees) })
  return {
    altitude: makeDistanceFormatter(labels.measure),
    coord: (degrees) => coord.format(degrees),
    // Normalisation APRÈS arrondi, et non avant : « 359,7° » arrondi au degré donne
    // 360°, un cap qui n'existe pas — c'est le nord, et il s'écrit 0°.
    heading: (radians) => writeAngle(((degreesOf(radians) % 360) + 360) % 360),
    // Pas de normalisation ici : `tiltFromNadir` produit un angle entre deux vecteurs,
    // donc déjà dans [0°, 180°] — et en pratique borné bien avant par le moteur.
    tilt: (radians) => writeAngle(degreesOf(radians)),
    zoom: (z) => zoom.format(z),
  }
}
