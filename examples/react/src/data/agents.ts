import { moveAlong } from './geo'
import type { Agent, AgentStatus } from './types'

/**
 * Avatars de démo (clé `avatar` GÉRÉE par la lib : pastille photo cerclée couleur du
 * type, prioritaire sur `icon`). Volontairement partiels — chaque ville a des agents
 * avec photo et des agents sans (repli sprite), pour comparer les deux rendus.
 */
export const AGENT_AVATARS: Record<string, string> = {
  'agent-0': 'https://i.pravatar.cc/80?img=12',
  'agent-2': 'https://i.pravatar.cc/80?img=32',
  'agent-4': 'https://i.pravatar.cc/80?img=15',
  'agent-6': 'https://i.pravatar.cc/80?img=47',
  'agent-8': 'https://i.pravatar.cc/80?img=68',
}

/** Activité lisible portée en tag (filtre « Couches »), dérivée du statut. */
const ACTIVITY: Record<AgentStatus, string> = { available: 'standby', enroute: 'move', onsite: 'onsite' }

/** Tags d'un agent : ['user', <activité>, <ville>] — de quoi filtrer par métier ET par secteur. */
export const agentTags = (a: Agent): string[] => ['user', ACTIVITY[a.status], a.city]

/**
 * Effectif de terrain : 11 agents sur trois villes, dans les trois statuts. Ce sont
 * des positions de départ réelles (patrouille, poste fixe, intervention en cours) —
 * le « temps réel » ne fait qu'y ajouter un delta de déplacement.
 */
const ROSTER: Agent[] = [
  // ── Paris
  { id: 'agent-0', name: 'Sam MacCloud', phone: '+33 6 09 82 88 04', status: 'available', city: 'paris', position: { lat: 48.8566, lng: 2.3522 } },
  { id: 'agent-1', name: 'Agent Alban', phone: '+33 6 28 13 16 22', status: 'enroute', city: 'paris', position: { lat: 48.8698, lng: 2.3079 } },
  { id: 'agent-2', name: 'Léa Fontaine', phone: '+33 6 77 41 09 88', status: 'onsite', city: 'paris', position: { lat: 48.8443, lng: 2.3743 } },
  { id: 'agent-3', name: 'Karim Belhadj', phone: '+33 6 12 55 34 21', status: 'available', city: 'paris', position: { lat: 48.8809, lng: 2.36 } },
  // ── Nice
  { id: 'agent-4', name: 'Yanis Moretti', phone: '+33 6 44 71 25 03', status: 'available', city: 'nice', position: { lat: 43.697, lng: 7.27 } },
  { id: 'agent-5', name: 'Chloé Bonnet', phone: '+33 6 51 90 33 17', status: 'enroute', city: 'nice', position: { lat: 43.7018, lng: 7.2648 } },
  { id: 'agent-6', name: 'Marc Delaunay', phone: '+33 6 63 08 74 52', status: 'onsite', city: 'nice', position: { lat: 43.6952, lng: 7.2789 } },
  { id: 'agent-7', name: 'Inès Bertrand', phone: '+33 6 22 47 61 90', status: 'available', city: 'nice', position: { lat: 43.6668, lng: 7.2172 } },
  // ── Vernon
  { id: 'agent-8', name: 'Julien Lefèvre', phone: '+33 6 31 76 12 45', status: 'available', city: 'vernon', position: { lat: 49.0942, lng: 1.4841 } },
  { id: 'agent-9', name: 'Fatou Diallo', phone: '+33 6 85 29 40 66', status: 'enroute', city: 'vernon', position: { lat: 49.0903, lng: 1.4762 } },
  { id: 'agent-10', name: 'Thibault Roy', phone: '+33 6 17 53 88 29', status: 'onsite', city: 'vernon', position: { lat: 49.0936, lng: 1.4857 } },
]

const TICK_MS = 300

/**
 * Vitesse de déplacement par statut, en **mètres par seconde** — les vraies allures
 * du terrain. Le pas d'un tick s'en déduit (`vitesse × durée`), au lieu d'un delta
 * en degrés qui ne veut rien dire : 0,0001° valent 11 m en latitude et 7 m en
 * longitude à Paris, et le marker filait à 200 km/h.
 */
const SPEED_MPS: Record<AgentStatus, number> = {
  available: 1.3, // patrouille à pied (~4,7 km/h)
  enroute: 8.3, // véhicule en ville (~30 km/h)
  onsite: 0.15, // posté : quelques pas autour du point
}

/**
 * Sinuosité de la marche : le cap oscille autour d'une direction de base au lieu de
 * tourner toujours dans le même sens — sinon la trajectoire est un cercle parfait,
 * d'autant plus serré que l'agent est lent.
 */
const WANDER_RAD = 0.9

/**
 * Flux « temps réel » simulé : chaque agent suit un cap propre, qui serpente
 * lentement, à l'allure de son statut. Caps et périodes sont dérivés de l'index
 * (nombre d'or) — ajouter un agent au `ROSTER` suffit, il n'y a pas de tableau
 * parallèle à tenir à jour.
 */
export function createAgentStream() {
  const agents: Agent[] = ROSTER.map((a) => ({ ...a, position: { ...a.position } }))
  const baseHeading = agents.map((_, i) => (i * 2.399963) % (Math.PI * 2))
  const listeners = new Set<(a: Agent[]) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  // Temps simulé, en secondes : pas de `Date.now()`, le flux reste reproductible.
  let elapsed = 0
  return {
    current: () => agents.map((a) => ({ ...a })),
    subscribe(cb: (a: Agent[]) => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start() {
      timer ??= setInterval(() => {
        const dt = TICK_MS / 1000
        elapsed += dt
        agents.forEach((a, i) => {
          const heading = baseHeading[i]! + WANDER_RAD * Math.sin(elapsed * (0.11 + i * 0.013))
          a.position = moveAlong(a.position, heading, SPEED_MPS[a.status] * dt)
        })
        listeners.forEach((cb) => cb(agents.map((a) => ({ ...a, position: { ...a.position } }))))
      }, TICK_MS)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
