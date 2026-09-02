// Contrat d'interception du pointeur, partagé par le moteur et les couches qui prennent la
// main sur un geste (dessin, loupe, placement piéton). Séparé de `MapEngine` : les couches
// n'en importaient que ces deux types, mais l'import fermait un cycle core ↔ layers.

import type { LatLng } from '../shared'

export type PointerPhase = 'down' | 'move' | 'up'

/**
 * Intercepteur de geste. Rend `true` pour CONSOMMER l'événement (les contrôles caméra ne le
 * voient pas), `false` pour le laisser passer. `latLng` est `null` quand le pointeur ne touche
 * ni le sol ni l'ellipsoïde.
 */
export type PointerInterceptor = (phase: PointerPhase, latLng: LatLng | null, event: PointerEvent) => boolean
