import { type MarkerData } from '@pasquelin/map3d'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import { typeColor } from '../config/colors'
import { AGENT_AVATARS, type AgentStreamOptions, agentTags, createAgentStream } from '../data/agents'
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
export function useAgentMarkers(options: AgentStreamOptions = {}): {
  agents: Agent[]
  agentMarkers: MarkerData<Agent>[]
} {
  const [agents, setAgents] = useState<Agent[]>([])
  const { count, tickMs, speedScale } = options
  const streamRef = useRef<ReturnType<typeof createAgentStream> | null>(null)

  // Le flux naît DANS l'effet : passé à `useRef`/`useState` en argument, la fabrique
  // serait rappelée à chaque rendu (3 fois par seconde ici) pour un résultat aussitôt
  // jeté — sur une vraie source, autant de connexions ouvertes pour rien.
  //
  // Seul l'EFFECTIF le recrée : il change l'ensemble simulé. La cadence et l'allure
  // passent par `setPace` (effet suivant), sans quoi bouger un slider renverrait tous
  // les agents à leur position de départ à chaque cran.
  useEffect(() => {
    const stream = createAgentStream({ count, tickMs, speedScale })
    streamRef.current = stream
    setAgents(stream.current())
    // Le tick est une mise à jour NON URGENTE : à 16 ms et 500 agents, il redemande
    // 62 rendus par seconde d'un arbre de 4 500 markers et bloquerait alors la saisie
    // (curseurs du banc d'essai, gestes sur la carte). En transition, React peut
    // l'interrompre et n'en garder que la dernière — on perd des positions
    // intermédiaires, jamais une interaction.
    const off = stream.subscribe((next) => startTransition(() => setAgents(next)))
    stream.start()
    return () => {
      off()
      stream.stop()
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  useEffect(() => {
    streamRef.current?.setPace({ tickMs, speedScale })
  }, [tickMs, speedScale])

  // Mémoïsation OBLIGATOIRE : sans elle, TOUT render de l'hôte (un curseur du banc
  // d'essai en produit ~60 par seconde) rendrait un tableau neuf, et la couche de
  // markers se resynchroniserait intégralement — reconstruction de la table par id,
  // `itemsChanged` sur les trois registres, recalcul des clusters — pour des positions
  // qui n'ont pas bougé. Seul le tick du flux doit déclencher ce travail.
  const agentMarkers = useMemo<MarkerData<Agent>[]>(
    () =>
      agents.map((a) => {
        const type = `agent-${a.status}`
        return {
          id: a.id,
          type,
          title: a.name,
          tags: agentTags(a),
          avatar: AGENT_AVATARS[a.id],
          position: a.position,
          selectedColor: typeColor(type),
          data: a,
        }
      }),
    [agents],
  )

  return { agents, agentMarkers }
}
