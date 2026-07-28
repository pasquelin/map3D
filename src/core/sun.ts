// Position du soleil, pure et testable — aucune dépendance à Three ni au DOM.
//
// On ne renvoie PAS un azimut/élévation local (qui dépendrait de l'observateur) mais le
// **point subsolaire** : la lat/lng où le soleil est au zénith à l'instant donné. C'est
// une direction géocentrique (ECEF) indépendante du lieu regardé — le moteur la convertit
// en vecteur monde via `Projection.worldNormal`, exactement comme la verticale locale.
// L'horizon (donc le lever/coucher) tombe alors du produit scalaire `up · soleil` côté
// shader, sans qu'on ait à le calculer ici.

import { RAD2DEG, normalizeLng } from './math'

export type SubsolarPoint = {
  /** Latitude du soleil au zénith (= déclinaison solaire), en degrés. */
  lat: number
  /** Longitude du soleil au zénith, en degrés dans [-180, 180). */
  lng: number
}

/** Jour de l'année (1 = 1er janvier) en temps universel. */
function dayOfYearUTC(d: Date): number {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - startOfYear) / 86_400_000)
}

/**
 * Point subsolaire pour une date (UTC). Modèle NOAA (équation du temps + déclinaison,
 * série de Fourier) : précision ~0,1° sur la déclinaison, largement suffisant pour
 * orienter un ciel. Déterministe — aucune horloge lue ici, la date est fournie.
 */
export function subsolarPoint(date: Date): SubsolarPoint {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  // Angle de l'année (rad) : fraction parcourue depuis le 1er janvier, corrigée de l'heure.
  const g = ((2 * Math.PI) / 365) * (dayOfYearUTC(date) - 1 + (hour - 12) / 24)

  // Équation du temps (minutes) : écart soleil vrai / soleil moyen.
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))

  // Déclinaison solaire (rad).
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  // Le soleil est au zénith là où l'heure solaire vraie vaut 12 h :
  //   UTC + lng/15 + eqTime/60 = 12  ⇒  lng = 15·(12 − UTC) − eqTime/4.
  const lng = normalizeLng(15 * (12 - hour) - eqTime / 4)

  return { lat: decl * RAD2DEG, lng }
}
