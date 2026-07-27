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

/** Alertes et agents vivent dans un SEUL layer : leur donnée est cette union. */
export type AnyData = Alert | Agent

/**
 * Discrimination par la DONNÉE, pas par le nom du type : `type.startsWith('agent')`
 * ferait passer pour une personne tout type qui commencerait par ces cinq lettres,
 * et n'apprendrait rien à TypeScript. Le prédicat, lui, rétrécit `m.data` chez
 * l'appelant — d'où l'absence de conversions dans les menus et les infobulles.
 */
export const isAgentMarker = (m: MarkerData<unknown>): m is MarkerData<Agent> =>
  typeof m.data === 'object' && m.data !== null && 'status' in m.data
