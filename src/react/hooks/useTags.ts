import { useSyncExternalStore } from 'react'
import type { TagFilter } from '../../core/TagFilter'
import { useMapContext } from '../context'

/**
 * Accès réactif au filtre « Couches » (`engine.tags`) : re-rend au changement de
 * sélection ou du registre des tags présents sur la carte. Renvoie le `TagFilter`
 * lui-même (`selected`, `all()`, `toggle`, `clear`…).
 */
export function useTags(): TagFilter {
  const tags = useTagSelection()
  useSyncExternalStore(tags.onRegistry, () => tags.registryVersion)
  return tags
}

/**
 * Variante ne suivant QUE la sélection — pour les consommateurs qui alimentent
 * eux-mêmes le registre (couches) ou n'affichent que l'état actif (badge) : pas
 * de re-render quand seuls les compteurs de tags évoluent (flux temps réel).
 */
export function useTagSelection(): TagFilter {
  const { engine } = useMapContext()
  const tags = engine.tags
  useSyncExternalStore(tags.onSelection, () => tags.selectionVersion)
  return tags
}
