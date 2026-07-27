import { GOLDEN, moveAlong, vogel } from './geo'
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
  {
    id: 'agent-0',
    name: 'Sam MacCloud',
    phone: '+33 6 09 82 88 04',
    status: 'available',
    city: 'paris',
    position: { lat: 48.8566, lng: 2.3522 },
  },
  {
    id: 'agent-1',
    name: 'Agent Alban',
    phone: '+33 6 28 13 16 22',
    status: 'enroute',
    city: 'paris',
    position: { lat: 48.8698, lng: 2.3079 },
  },
  {
    id: 'agent-2',
    name: 'Léa Fontaine',
    phone: '+33 6 77 41 09 88',
    status: 'onsite',
    city: 'paris',
    position: { lat: 48.8443, lng: 2.3743 },
  },
  {
    id: 'agent-3',
    name: 'Karim Belhadj',
    phone: '+33 6 12 55 34 21',
    status: 'available',
    city: 'paris',
    position: { lat: 48.8809, lng: 2.36 },
  },
  // ── Nice
  {
    id: 'agent-4',
    name: 'Yanis Moretti',
    phone: '+33 6 44 71 25 03',
    status: 'available',
    city: 'nice',
    position: { lat: 43.697, lng: 7.27 },
  },
  {
    id: 'agent-5',
    name: 'Chloé Bonnet',
    phone: '+33 6 51 90 33 17',
    status: 'enroute',
    city: 'nice',
    position: { lat: 43.7018, lng: 7.2648 },
  },
  {
    id: 'agent-6',
    name: 'Marc Delaunay',
    phone: '+33 6 63 08 74 52',
    status: 'onsite',
    city: 'nice',
    position: { lat: 43.6952, lng: 7.2789 },
  },
  {
    id: 'agent-7',
    name: 'Inès Bertrand',
    phone: '+33 6 22 47 61 90',
    status: 'available',
    city: 'nice',
    position: { lat: 43.6668, lng: 7.2172 },
  },
  // ── Vernon
  {
    id: 'agent-8',
    name: 'Julien Lefèvre',
    phone: '+33 6 31 76 12 45',
    status: 'available',
    city: 'vernon',
    position: { lat: 49.0942, lng: 1.4841 },
  },
  {
    id: 'agent-9',
    name: 'Fatou Diallo',
    phone: '+33 6 85 29 40 66',
    status: 'enroute',
    city: 'vernon',
    position: { lat: 49.0903, lng: 1.4762 },
  },
  {
    id: 'agent-10',
    name: 'Thibault Roy',
    phone: '+33 6 17 53 88 29',
    status: 'onsite',
    city: 'vernon',
    position: { lat: 49.0936, lng: 1.4857 },
  },
]

/** Cadence par défaut du flux — réglable, cf. `AgentStreamOptions`. */
export const TICK_MS = 300

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

/** Effectif relevé sur le terrain. Au-delà, `rosterOf` renforce artificiellement. */
export const ROSTER_SIZE = ROSTER.length

const STATUSES: AgentStatus[] = ['available', 'enroute', 'onsite']

/**
 * Effectif de `count` agents : le `ROSTER` d'abord, puis des renforts générés.
 *
 * Les renforts se déduisent de leur index (angle en nombre d'or, rayon en spirale
 * autour du poste dont ils viennent) — aucun `Math.random`, donc le même effectif
 * redonne exactement la même scène d'un rechargement à l'autre, ce dont dépend toute
 * comparaison de réglage.
 */
export function rosterOf(count: number): Agent[] {
  // Copie de surface : le flux REMPLACE `position`, il ne la mute pas — `ROSTER` reste
  // donc intact sans qu'on ait à cloner le point (cf. `snapshot` dans le flux).
  const base = ROSTER.slice(0, Math.min(count, ROSTER.length)).map((a) => ({ ...a }))
  for (let i = ROSTER.length; i < count; i++) {
    const seed = ROSTER[i % ROSTER.length]!
    const rank = i - ROSTER.length
    base.push({
      id: `agent-${i}`,
      name: `Renfort ${rank + 1}`,
      phone: seed.phone,
      status: STATUSES[i % STATUSES.length]!,
      city: seed.city,
      // Même recette que les points de renfort de `data/generate` : spirale de Vogel
      // autour du poste d'origine (cf. `vogel`).
      position: vogel(seed.position, rank, 120),
    })
  }
  return base
}

/** Réglages du flux — le banc d'essai de l'exemple les pilote en direct. */
export type AgentStreamOptions = {
  /** Effectif simulé (défaut : le `ROSTER` complet). */
  count?: number
  /** Cadence du flux, en ms. */
  tickMs?: number
  /** Multiplicateur des allures de `SPEED_MPS` — `0` fige les agents. */
  speedScale?: number
}

/**
 * Flux « temps réel » simulé : chaque agent suit un cap propre, qui serpente
 * lentement, à l'allure de son statut. Caps et périodes sont dérivés de l'index
 * (nombre d'or) — ajouter un agent au `ROSTER` suffit, il n'y a pas de tableau
 * parallèle à tenir à jour.
 */
export function createAgentStream(options: AgentStreamOptions = {}) {
  let tickMs = Math.max(16, options.tickMs ?? TICK_MS)
  let speedScale = options.speedScale ?? 1
  const agents: Agent[] = rosterOf(options.count ?? ROSTER.length)
  const baseHeading = agents.map((_, i) => (i * GOLDEN) % (Math.PI * 2))
  const listeners = new Set<(a: Agent[]) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  // Temps simulé, en secondes : pas de `Date.now()`, le flux reste reproductible.
  let elapsed = 0

  /**
   * Copie de surface SEULEMENT : `moveAlong` REMPLACE `a.position` par un objet neuf à
   * chaque pas, il ne le mute jamais. Cloner la position en plus n'isolerait donc rien
   * et allouerait un objet par agent et par tick — 31 000 par seconde au réglage haut
   * (500 agents à 16 ms), dans la boucle même dont on mesure la fluidité.
   */
  const snapshot = (): Agent[] => agents.map((a) => ({ ...a }))

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const start = () => {
    timer ??= setInterval(() => {
      const dt = tickMs / 1000
      elapsed += dt
      agents.forEach((a, i) => {
        const heading = baseHeading[i]! + WANDER_RAD * Math.sin(elapsed * (0.11 + i * 0.013))
        a.position = moveAlong(a.position, heading, SPEED_MPS[a.status] * speedScale * dt)
      })
      // Snapshot hissé HORS de la boucle des abonnés : un par tick, pas un par abonné —
      // et tous voient alors rigoureusement la même donnée.
      const tick = snapshot()
      listeners.forEach((cb) => cb(tick))
    }, tickMs)
  }

  // Fonctions nommées plutôt que méthodes : `setPace` appelait `this.stop()`, ce qui
  // cassait dès qu'un appelant déstructurait l'API (`const { setPace } = stream`).
  return {
    current: snapshot,
    subscribe(cb: (a: Agent[]) => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start,
    stop,
    /**
     * Change l'allure SANS recréer le flux : les agents gardent leur position et leur
     * cap. Recréer le flux à chaque cran d'un slider les renverrait à leur point de
     * départ — la carte sauterait au lieu de ralentir.
     */
    setPace(next: { tickMs?: number; speedScale?: number }) {
      if (next.speedScale !== undefined) speedScale = next.speedScale
      const wanted = next.tickMs === undefined ? tickMs : Math.max(16, next.tickMs)
      if (wanted === tickMs) return
      tickMs = wanted
      // Seule la cadence impose de reposer l'intervalle — et seulement s'il tourne.
      if (timer) {
        stop()
        start()
      }
    },
  }
}
