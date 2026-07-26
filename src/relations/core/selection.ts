// Sélection des cibles d'une relation. Ce fichier contient la FONCTION UNIQUE de
// sélection : les compteurs affichés dans le menu et le calcul réellement lancé
// passent tous deux par `selectTargets`. Deux chemins distincts finiraient par
// diverger, et le menu annoncerait un nombre de liens que la carte ne trace pas.

import { haversineMeters } from './geo'
import type { MapPoint, RelationRule, TagSelector } from './types'

/** Un jeu de tags satisfait-il le sélecteur ? Les trois clauses se combinent en ET. */
export function matchesSelector(tags: readonly string[], sel: TagSelector): boolean {
  if (sel.none && sel.none.some((t) => tags.includes(t))) return false
  if (sel.all && !sel.all.every((t) => tags.includes(t))) return false
  if (sel.any && !sel.any.some((t) => tags.includes(t))) return false
  return true
}

/**
 * Facteur de sur-échantillonnage du mode `fastest` : le plus proche à vol d'oiseau
 * n'est pas le plus rapide (sens uniques, fleuve à contourner, voie rapide). On
 * envoie plus de candidats à la matrice qu'on n'affichera de liens, et c'est la
 * DURÉE qui tranche ensuite.
 */
const FASTEST_OVERSAMPLE = 3

/**
 * Cibles candidates d'une relation, triées par distance croissante à vol d'oiseau.
 * Le tri définitif (par durée réelle) n'a lieu qu'après la matrice — cet ordre-ci
 * ne sert qu'à choisir QUI interroger.
 */
export function selectTargets(source: MapPoint, rule: RelationRule, candidates: readonly MapPoint[]): MapPoint[] {
  const { selection } = rule
  const scored: { point: MapPoint; distance: number }[] = []
  for (const c of candidates) {
    if (c.id === source.id) continue
    if (!matchesSelector(c.tags, rule.to)) continue
    const distance = haversineMeters(source, c)
    // Garde-fou de coût appliqué AVANT tout appel réseau, quel que soit le mode.
    if (distance > selection.maxMeters) continue
    if (selection.mode === 'radius' && distance > (selection.radiusMeters ?? selection.maxMeters)) continue
    scored.push({ point: c, distance })
  }
  scored.sort((a, b) => a.distance - b.distance)
  if (selection.mode === 'radius') return scored.map((s) => s.point)
  // Pas de plafond `limit.compute` ici : `RelationEngine.open` l'applique, et c'est
  // le seul endroit qui doit le faire — sinon le menu ne peut plus signaler qu'une
  // sélection le dépasse, puisqu'elle arriverait déjà tronquée.
  return scored.slice(0, (selection.count ?? 1) * FASTEST_OVERSAMPLE).map((s) => s.point)
}
