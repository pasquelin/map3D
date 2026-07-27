import type { MarkerData } from 'map3d'

import type { AgentStatus } from '../data/types'
import { markerTypeSpec } from './markerTypes'

/* ══════════════════ LIBELLÉS MÉTIER ══════════════════
   Tout ce que la lib ne peut pas deviner : le nom d'un type, le titre d'un marker,
   le statut d'un agent. Réutilisé par la loupe, les satellites de cluster, les
   vignettes de sélection, la barre d'état des relations et le dock. */

/**
 * Nom d'un type de marker, accordé en nombre. Les deux formes viennent de la même
 * entrée du registre : impossible d'en ajouter une sans l'autre.
 */
export const clusterTypeLabel = (type: string, count = 1): string =>
  markerTypeSpec(type)?.label[count > 1 ? 1 : 0] ?? type

export const STATUS_LABEL: Record<AgentStatus, string> = {
  available: 'Disponible',
  enroute: 'En route',
  onsite: 'Sur site',
}

/**
 * Titre d'un marker — partagé par les éléments épinglés, la loupe et le panneau de
 * sélection.
 *
 * Lit `MarkerData.title` et RIEN d'autre. Toutes les fabriques de la démo l'alimentent
 * déjà (le nom pour un agent, le titre pour une alerte ou un défibrillateur), et c'est
 * le seul champ que porte AUSSI un marker venu d'une autre couche — un symbole posé,
 * qui arrive désormais dans les mêmes pastilles et n'a ni `name` ni `title` dans sa
 * donnée. Lire la donnée métier faisait des lignes vides sans rien apporter.
 */
export const markerLabel = (m: MarkerData): string => m.title ?? String(m.id)
