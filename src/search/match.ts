// Normalisation et scoring de la recherche textuelle, partagés par tous les
// fournisseurs (`SearchProvider`) — un seul endroit décide ce que « ça correspond »
// veut dire, sinon les rubriques d'une même liste ne se comparent plus entre elles.

import type { LatLng } from '../shared'

/**
 * Forme comparable d'un texte : accents retirés, casse repliée, espaces compactés.
 * « Saint-Étienne » et « saint etienne » doivent se trouver l'un l'autre.
 *
 * `NFD` décompose « é » en « e » + accent combinant, que la plage `U+0300–U+036F`
 * supprime — le seul moyen sans table de correspondance par langue.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Aucune correspondance — valeur rendue par `scoreMatch`, exportée pour la lisibilité des filtres. */
export const NO_MATCH = 0

/**
 * Pertinence d'un titre pour une saisie, les deux DÉJÀ normalisés :
 *
 * | 3 | le titre commence par la saisie    | « **Sam**ir Kaddour »   |
 * | 2 | un mot du titre commence par elle  | « Julie **Sam**son »    |
 * | 1 | sous-chaîne ailleurs               | « La **Sam**aritaine »  |
 * | 0 | rejeté                             |                         |
 *
 * Volontairement pas de distance d'édition : sur une carte, une frappe approximative
 * qui ramène le mauvais agent coûte plus cher qu'une absence de résultat.
 */
export function scoreMatch(normalizedTitle: string, needle: string): number {
  const at = normalizedTitle.indexOf(needle)
  if (at < 0) return NO_MATCH
  if (at === 0) return 3
  return normalizedTitle[at - 1] === ' ' ? 2 : 1
}

/**
 * Correspondance retenue, avant mise en forme : l'élément SOURCE et ses deux
 * critères de classement. Séparer le classement de la construction de l'entrée
 * évite d'allouer un `SearchEntry` (et ses closures `select`/`menu`) pour des
 * correspondances qui seront tronquées juste après.
 */
export type Hit<T> = { item: T; score: number; distance: number }

/**
 * Classe les correspondances — pertinence d'abord, proximité à égalité — et ne
 * garde que les `limit` premières.
 *
 * Le total, lui, reste à la charge de l'appelant (`hits.length`) : une troncature
 * ne doit jamais pouvoir se lire comme une absence de résultats.
 */
export function rankHits<T>(hits: Hit<T>[], limit: number): T[] {
  hits.sort((a, b) => b.score - a.score || a.distance - b.distance)
  const top: T[] = []
  for (let i = 0; i < hits.length && i < limit; i++) top.push(hits[i]!.item)
  return top
}

/**
 * Comparateur de PROXIMITÉ (écart angulaire au carré), pas une distance : à score
 * égal, l'élément le plus proche de la vue passe devant — sur une carte, entre deux
 * homonymes, celui qu'on cherche est celui qu'on regarde.
 *
 * Ni racine ni formule géodésique : seul l'ordre relatif compte, et ceci tourne sur
 * chaque candidat à chaque frappe. La longitude est pondérée par le cosinus de la
 * latitude, sans quoi un degré de longitude pèserait autant à Oslo qu'à l'équateur.
 */
export function proximityRank(a: LatLng, b: LatLng): number {
  const dLat = a.lat - b.lat
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)
  return dLat * dLat + dLng * dLng
}

/**
 * Cache de normalisation clé sur l'objet SOURCE (`MarkerData`, `ShapeData`,
 * `Drawing`) : un élément dont la référence n'a pas changé n'est jamais
 * renormalisé. Décisif sur un flux temps réel, où le tableau de markers est
 * reconstruit à chaque tick alors que la plupart des objets sont préservés.
 *
 * `WeakMap` et non `Map` : un élément retiré de la carte doit pouvoir être
 * collecté, sans que personne ait à penser à purger le cache.
 */
export function createTitleCache<T extends object>(titleOf: (item: T) => string | undefined) {
  const cache = new WeakMap<T, string>()
  return (item: T): string => {
    const hit = cache.get(item)
    if (hit !== undefined) return hit
    const normalized = normalizeSearch(titleOf(item) ?? '')
    cache.set(item, normalized)
    return normalized
  }
}
