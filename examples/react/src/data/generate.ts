import type { LatLng, MarkerData } from '@pasquelin/map3d'

import { CITY_LIST, type City } from './cities'
import { GOLDEN, moveAlong, vogel } from './geo'
import { seedToMarker } from './toMarkers'
import type { Alert, Defib, Severity } from './types'

/* ══════════════════ RENFORT PROCÉDURAL ══════════════════
   Les jeux de `alerts.ts` et `defibs.ts` sont des points RELEVÉS : ils démontrent des
   comportements précis (superpositions, seuils `static` propres, drapeaux d'attention)
   et ne se remplacent pas. Ce module ne fait que les PROLONGER quand le banc d'essai
   demande plus de volume — parce qu'un réglage de clustering, de cull ou de budget de
   raycasts ne se juge pas sur quarante points.

   Tout est dérivé de l'index : pas de `Math.random`, donc deux sessions au même
   effectif donnent exactement la même scène. Sans quoi comparer deux réglages
   reviendrait à comparer deux jeux de données différents. */

/* Les trois plages d'identifiants de la démo, écrites ENSEMBLE : c'est leur séparation
   qui compte, et elle ne se vérifie que si elles se lisent d'un bloc. */

/** Alertes de renfort — au-dessus des ids relevés (1 à 99). */
const GEN_ALERT_ID = 1000

/** DAE de renfort — le préfixe `dae-gen-` les sépare déjà des `dae-NN` relevés. */
const GEN_DEFIB_ID = 1

/** Alertes posées à la main — au-dessus de tout le reste, quel que soit l'effectif. */
export const MANUAL_ID_BASE = 900_000

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']
const ACCESS: Defib['access'][] = ['public', 'intérieur']

/** Au-delà de cette couronne, la spirale sortirait de la zone de couverture. */
const MAX_RING = 64

/**
 * Position du `index`-ième point généré : spirale de Vogel (cf. `geo.vogel`) autour du
 * centre d'une ville, les villes prises à tour de rôle.
 *
 * L'espacement `rayon / 8` est calibré pour que la 64ᵉ couronne atteigne exactement le
 * rayon de couverture — au-delà, le point est ramené SUR ce rayon : un renfort doit
 * rester dans la ville qu'il sert.
 */
function spiral(index: number): { position: LatLng; city: City } {
  const city = CITY_LIST[index % CITY_LIST.length]!
  const ring = Math.floor(index / CITY_LIST.length)
  const position =
    ring < MAX_RING
      ? vogel(city.center, ring, city.radiusMeters / 8)
      : moveAlong(city.center, ring * GOLDEN, city.radiusMeters)
  return { position, city }
}

/**
 * Boucle commune aux deux jeux de renfort : `count` points posés le long de la spirale,
 * décalés de `shift` rangs.
 *
 * `shift` est ce qui empêche deux familles de tomber au même endroit — les deux boucles
 * étaient écrites deux fois pour cette seule différence.
 */
function generated<D>(
  count: number,
  shift: number,
  build: (index: number, at: { position: LatLng; city: City }) => MarkerData<D>,
): MarkerData<D>[] {
  const out: MarkerData<D>[] = []
  for (let i = 0; i < count; i++) out.push(build(i, spiral(i + shift)))
  return out
}

/** Alertes de renfort, numérotées au-dessus de tout id relevé (cf. `GEN_ALERT_ID`). */
export const syntheticAlerts = (count: number): MarkerData<Alert>[] =>
  generated<Alert>(count, 0, (i, { position, city }) => {
    const severity = SEVERITIES[i % SEVERITIES.length]!
    const id = GEN_ALERT_ID + i
    const data: Alert = {
      id,
      severity,
      title: `Alerte générée ${id}`,
      address: `${city.label} (généré)`,
      city: city.id,
    }
    return seedToMarker(`alert-${severity}`, position, data, ['alert', severity, city.id], {
      // Le titre du MARKER situe le point ; celui de la donnée reste le libellé métier.
      title: `${data.title} — ${city.label}`,
      // Un sur sept porte un drapeau d'attention : de quoi voir ce que 200 viseurs
      // animés coûtent réellement, sans en couvrir toute la carte.
      urgent: severity === 'critical' && i % 7 === 0,
      new: i % 11 === 0,
    })
  })

/** Défibrillateurs de renfort — `static: true`, donc soumis à `markers.staticMinZoom`. */
export const syntheticDefibs = (count: number): MarkerData<Defib>[] =>
  // Décalé de 7 rangs : les DAE générés ne se posent pas sur les alertes générées.
  generated<Defib>(count, 7, (i, { position, city }) => {
    const n = GEN_DEFIB_ID + i
    const data: Defib = {
      id: `dae-gen-${n}`,
      title: `DAE généré ${n}`,
      address: `${city.label} (généré)`,
      access: ACCESS[i % ACCESS.length]!,
      city: city.id,
    }
    return seedToMarker('defib', position, data, ['defib', city.id], {
      title: `${data.title} — ${city.label}`,
      static: true,
    })
  })

/** Alerte posée à la main depuis le banc d'essai (bouton « poser au centre »). */
export function manualAlert(id: number, position: LatLng, severity: Severity): MarkerData<Alert> {
  const data: Alert = {
    id,
    severity,
    title: `Alerte manuelle ${id}`,
    address: 'Posée depuis le banc d’essai',
    city: 'paris',
  }
  return seedToMarker(`alert-${severity}`, position, data, ['alert', severity, 'manuel'], {
    // Posée à la main, donc déplaçable à la main : le point au sol se saisit et
    // `onReposition` reçoit la nouvelle position, comme le pin éditable de la démo.
    repositionable: true,
  })
}
