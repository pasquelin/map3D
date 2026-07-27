import { mdiPinOffOutline, mdiPinOutline } from '@mdi/js'
import Icon from '@mdi/react'
import type { MarkerData, MenuItem } from 'map3d'

import { type Agent, type Alert, type AnyData, isAgentMarker } from '../data/types'

type MarkerMenuOptions = {
  /** Pour l'entrée « Assigner un agent » : la liste des noms, pas des markers. */
  agents: Agent[]
  isPinned: (id: string | number) => boolean
  togglePin: (id: string | number) => void
}

/**
 * Menus contextuels des markers — le clic ouvre des ACTIONS, l'information vit dans
 * l'infobulle au survol. Déclaré ici, avec le reste du vocabulaire métier : ce n'est
 * pas un hook (aucun état propre), juste une fabrique nourrie par l'état des favoris.
 *
 * L'épinglage est en tête et commun à TOUS les types : c'est le pendant, au menu, du
 * long-press vers la dock, et il doit se lire pareil sur une alerte et sur un agent.
 * Le reste du menu dépend du type.
 */
export function createMarkerMenu({ agents, isPinned, togglePin }: MarkerMenuOptions): (m: MarkerData<AnyData>) => MenuItem[] {
  const pinItem = (m: MarkerData<AnyData>): MenuItem => {
    const pinned = isPinned(m.id)
    return {
      icon: <Icon path={pinned ? mdiPinOffOutline : mdiPinOutline} size={0.7} />,
      // Une seule entrée qui PORTE l'état, plutôt que deux dont l'une resterait
      // sans effet : épinglé, elle propose le retrait.
      label: pinned ? 'Ne plus épingler' : 'Épingler',
      onSelect: () => togglePin(m.id),
    }
  }

  const alertMenu = (alert: Alert): MenuItem[] => [
    { icon: '↗', label: 'Ouvrir la fiche', onSelect: () => console.info('fiche', alert.id) },
    {
      icon: '⇢',
      label: 'Assigner un agent',
      children: agents.map((a) => ({ label: a.name, onSelect: () => console.info('assign', a.id) })),
    },
    { icon: '⚑', label: 'Signaler', children: [{ label: 'N’existe plus' }, { label: 'Mauvaise position' }] },
  ]

  const agentMenu = (agent: Agent): MenuItem[] => [
    { icon: '✆', label: `Appeler ${agent.phone}`, onSelect: () => console.info('call', agent.phone) },
    { icon: '↗', label: 'Ouvrir la fiche', onSelect: () => console.info('fiche agent', agent.id) },
  ]

  return (m) => [pinItem(m), ...(isAgentMarker(m) ? agentMenu(m.data) : alertMenu(m.data as Alert))]
}
