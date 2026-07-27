import type { MarkerData } from 'map3d'

import { type Alert, type AgentStatus, isAgentMarker } from '../data/types'
import { markerTypeSpec } from './markerTypes'

/* ══════════════════ LIBELLÉS MÉTIER ══════════════════
   Tout ce que la lib ne peut pas deviner : le nom d'un type, le titre d'un marker,
   le statut d'un agent. Réutilisé par la loupe, les satellites de cluster, les
   vignettes de sélection, la barre d'état des relations et le dock. */

/**
 * Nom d'un type de marker, accordé en nombre. Les deux formes viennent de la même
 * entrée du registre : impossible d'en ajouter une sans l'autre.
 */
export const clusterTypeLabel = (type: string, count = 1): string => markerTypeSpec(type)?.label[count > 1 ? 1 : 0] ?? type

export const STATUS_LABEL: Record<AgentStatus, string> = {
  available: 'Disponible',
  enroute: 'En route',
  onsite: 'Sur site',
}

/**
 * Titre métier d'un marker — source UNIQUE, partagée par les éléments épinglés, la
 * loupe et le panneau de sélection (`MarkerList` commun, où pastille/avatar et
 * sous-titre de type sont automatiques).
 */
export const markerLabel = (m: MarkerData): string => (isAgentMarker(m) ? m.data.name : (m.data as Alert).title)
