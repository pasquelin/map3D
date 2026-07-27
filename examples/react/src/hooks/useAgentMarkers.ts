import { type MarkerData } from 'map3d'
import { useEffect, useState } from 'react'

import { typeColor } from '../config/colors'
import { AGENT_AVATARS, agentTags, createAgentStream } from '../data/agents'
import type { Agent } from '../data/types'

/**
 * Abonnement au flux temps réel des agents, converti en markers.
 *
 * `selectedColor` : l'anneau de sélection porte le STATUT de l'agent au lieu d'une
 * teinte fixe — c'est ce que fait `useAgentMarkers` côté Operator.
 *
 * Renvoie AUSSI les agents bruts : le menu « Assigner un agent » a besoin des noms,
 * pas des markers.
 */
export function useAgentMarkers(): { agents: Agent[]; agentMarkers: MarkerData<Agent>[] } {
  const [agents, setAgents] = useState<Agent[]>([])

  // Le flux naît DANS l'effet : passé à `useRef`/`useState` en argument, la fabrique
  // serait rappelée à chaque rendu (3 fois par seconde ici) pour un résultat aussitôt
  // jeté — sur une vraie source, autant de connexions ouvertes pour rien.
  useEffect(() => {
    const stream = createAgentStream()
    setAgents(stream.current())
    const off = stream.subscribe(setAgents)
    stream.start()
    return () => {
      off()
      stream.stop()
    }
  }, [])

  const agentMarkers: MarkerData<Agent>[] = agents.map((a) => ({
    id: a.id,
    type: `agent-${a.status}`,
    tags: agentTags(a),
    avatar: AGENT_AVATARS[a.id],
    position: a.position,
    selectedColor: typeColor(`agent-${a.status}`),
    data: a,
  }))

  return { agents, agentMarkers }
}
