// Modèle du moteur de relations. AGNOSTIQUE du métier : il ne connaît que des
// tags (`string[]`), des couleurs et des libellés fournis par la configuration
// appelante. Aucun vocabulaire d'application ne doit apparaître ici.

import type { ProviderRoute } from '../providers/RoutingProvider'

/** Point relié par le moteur — structurellement compatible `LatLng`. */
export type MapPoint = { id: string; lat: number; lng: number; tags: string[] }

/**
 * Sélecteur de tags. `any` = au moins un (sémantique OU, celle de `TagFilter`),
 * `all` = tous requis, `none` = exclusion. Les trois se combinent en ET.
 */
export type TagSelector = { any?: string[]; all?: string[]; none?: string[] }

/** Modes de déplacement acceptés par Google Routes. */
export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER' | 'TRANSIT'

/** `radius` = tout ce qui est sous le rayon ; `fastest` = les N plus rapides. */
export type SelectionMode = 'radius' | 'fastest'

/**
 * Règle de relation : le contrat entre l'application (qui la définit avec son
 * vocabulaire) et le moteur (qui ne voit que des tags et des plafonds).
 */
export type RelationRule = {
  id: string
  /** Libellé affiché au niveau 2 du menu — fourni par l'app, jamais déduit. */
  label: string
  /** Le marker source doit satisfaire ce sélecteur pour que la règle soit proposée. */
  from: TagSelector
  /** Les cibles candidates doivent le satisfaire. */
  to: TagSelector
  /**
   * Couleur de la famille — SEULE variable visuelle porteuse de sens avec le rang.
   * Omise, la couche applique sa couleur par défaut (`RelationLayer.defaultColor`).
   */
  color?: string
  mode: TravelMode
  selection: {
    mode: SelectionMode
    /** `fastest` : nombre de liens conservés au final. */
    count?: number
    /** `radius` : rayon de sélection. */
    radiusMeters?: number
    /** Distance à vol d'oiseau au-delà de laquelle on n'interroge JAMAIS le routage. */
    maxMeters: number
  }
  limit: {
    /** Plafond d'éléments envoyés au fournisseur de routage par interaction. */
    compute: number
    /** Plafond de liens dessinés simultanément. */
    render: number
  }
  /** Durée réelle au-delà de laquelle un lien est écarté après la matrice. */
  cutoffSeconds?: number
}

/** `pending` = temps réel en vol ; `unavailable` = le fournisseur n'a pas répondu pour ce lien. */
export type LinkStatus = 'pending' | 'ready' | 'unavailable'

/**
 * Un lien source → cible. `distanceMeters`/`durationSeconds` sont TOUJOURS des
 * valeurs routières : tant qu'elles sont nulles, rien de chiffré ne s'affiche.
 * La distance à vol d'oiseau sert à sélectionner, jamais à remplir ces champs.
 */
export type Link = {
  /** `${from.id}→${to.id}` — identité stable, clé du pool de rendu. */
  id: string
  from: MapPoint
  to: MapPoint
  status: LinkStatus
  distanceMeters: number | null
  durationSeconds: number | null
  /** 1 = le plus rapide. `null` tant que la matrice n'a pas répondu, ou si elle a échoué. */
  rank: number | null
  color: string
  /** Itinéraire réel — le plus rapide. `null` tant qu'on n'a pas cliqué le lien. */
  route: ProviderRoute | null
}
