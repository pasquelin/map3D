import type { LatLng, MarkerData } from 'map3d'

import type { CityId } from './cities'

/* ══════════════════ TYPES MÉTIER DE LA DÉMO ══════════════════ */

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type Alert = {
  id: number
  severity: Severity
  title: string
  /** Adresse réelle du point — ce qu'un opérateur lit avant d'engager quelqu'un. */
  address: string
  city: CityId
}

export type AgentStatus = 'available' | 'enroute' | 'onsite'

export type Agent = {
  id: string
  name: string
  phone: string
  status: AgentStatus
  /** Secteur d'affectation : un agent ne quitte pas sa ville. */
  city: CityId
  position: LatLng
}

/**
 * Défibrillateur : DÉCOR de la carte. Il ne bouge pas, ne demande rien, et sert de
 * repère une fois qu'on est sur zone — c'est ce que dit `static: true` sur son
 * marker (cf. `data/defibs.ts`).
 */
export type Defib = {
  id: string
  /** Même champ que `Alert.title` : `markerLabel` les lit tous les deux ainsi. */
  title: string
  address: string
  /** Accès public, ou intérieur d'un bâtiment aux heures d'ouverture. */
  access: 'public' | 'intérieur'
  city: CityId
}

/** Alertes, agents et décor vivent dans un SEUL layer : leur donnée est cette union. */
export type AnyData = Alert | Agent | Defib

/**
 * Discrimination par la DONNÉE, pas par le nom du type : `type.startsWith('agent')`
 * ferait passer pour une personne tout type qui commencerait par ces cinq lettres,
 * et n'apprendrait rien à TypeScript. Le prédicat, lui, rétrécit `m.data` chez
 * l'appelant — d'où l'absence de conversions dans les menus et les infobulles.
 */
export const isAgentMarker = (m: MarkerData<unknown>): m is MarkerData<Agent> =>
  typeof m.data === 'object' && m.data !== null && 'status' in m.data

/** Même principe pour le décor — discriminé par `access`, propre au défibrillateur. */
export const isDefibMarker = (m: MarkerData<unknown>): m is MarkerData<Defib> =>
  typeof m.data === 'object' && m.data !== null && 'access' in m.data
