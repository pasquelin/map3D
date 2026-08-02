import { useCallback, useState } from 'react'

/**
 * État d'un Set de clés avec bascule ajout/retrait — une préférence d'affichage
 * (groupes pliés/dépliés), pas de la donnée. PARTAGÉ : loupe et sélecteur portent
 * la même mécanique de repli. `initial` optionnel pour démarrer avec des clés déjà posées.
 */
export function useToggleSet<K>(initial?: () => ReadonlySet<K>): [ReadonlySet<K>, (key: K) => void] {
  const [set, setSet] = useState<ReadonlySet<K>>(initial ?? (() => new Set<K>()))
  const toggle = useCallback((key: K) => {
    setSet((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  return [set, toggle]
}
