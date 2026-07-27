// Formatage des grandeurs affichées (distances, durées) — module PUR : il ne
// dépend que des libellés, jamais de Three ni de React. C'est ce qui permet au
// core des relations (headless) et à `DrawLayer` (Three) de partager exactement
// le même formatage sans qu'aucun des deux n'importe l'autre.

import { formatLabel } from './mergeLabels'
import type { MapLabels } from './types'

/** Formateur de distance de l'outil règle ET des étiquettes de liens. */
export function makeDistanceFormatter(measure: MapLabels['measure']): (meters: number) => string {
  // Seuil, diviseur et décimales viennent des labels : le système métrique était
  // câblé en dur (bascule à 1000, division par 1000), ce qui rendait tout affichage
  // impérial impossible même en traduisant les gabarits.
  // `Intl.NumberFormat` et non `toFixed` : ce dernier impose le point décimal quelle
  // que soit la locale — la lib affichait « 2.40 km » sous des libellés français qui
  // promettent « 2,4 km » — et conserve les zéros de fin. `maximumFractionDigits`
  // seul (sans minimum) supprime aussi le « ,00 » d'un compte rond.
  const locale = measure.numberLocale === 'auto' ? undefined : measure.numberLocale
  const major = new Intl.NumberFormat(locale, { maximumFractionDigits: measure.majorDecimals })
  const minor = new Intl.NumberFormat(locale, { maximumFractionDigits: measure.minorDecimals })
  return (m) =>
    m >= measure.majorThreshold
      ? formatLabel(measure.major, { value: major.format(m / measure.majorFactor) })
      : // `minorFactor` et non la valeur brute : sans lui, la petite unité restait le
        // mètre quoi qu'annonce le gabarit — des « pieds » qui valaient des mètres.
        formatLabel(measure.minor, { value: minor.format(m / measure.minorFactor) })
}

/**
 * Formateur de durée de trajet. Les secondes ne sont montrées que sous la minute :
 * au-delà, une précision à la seconde est du bruit sur un temps de trajet routier.
 */
export function makeDurationFormatter(duration: MapLabels['duration']): (seconds: number) => string {
  return (s) => {
    const total = Math.max(0, Math.round(s))
    if (total < duration.minorThreshold) return formatLabel(duration.seconds, { value: total })
    // 60 s/min et 60 min/h restent des invariants : seuls les SEUILS de bascule
    // sont des choix d'affichage, et eux seuls sont réglables.
    const minutes = Math.round(total / 60)
    if (minutes < duration.majorThreshold) return formatLabel(duration.minutes, { value: minutes })
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? formatLabel(duration.hours, { h }) : formatLabel(duration.hoursMinutes, { h, m })
  }
}

/**
 * Étiquette d'un lien : « 2,4 km · 9 min ». Les trois états sont distincts et
 * explicites — l'attente affiche `…`, l'échec affiche « temps indisponible ».
 * JAMAIS de repli sur la distance à vol d'oiseau : afficher une valeur estimée
 * là où l'utilisateur attend un temps réel est un mensonge silencieux.
 */
export function makeLinkLabelFormatter(
  labels: MapLabels,
): (distanceMeters: number | null, durationSeconds: number | null, failed: boolean) => string {
  const distance = makeDistanceFormatter(labels.measure)
  const duration = makeDurationFormatter(labels.duration)
  return (distanceMeters, durationSeconds, failed) => {
    if (failed) return labels.relations.unavailable
    if (distanceMeters === null || durationSeconds === null) return labels.relations.pending
    return formatLabel(labels.relations.linkLabel, {
      distance: distance(distanceMeters),
      duration: duration(durationSeconds),
    })
  }
}
