import type { ReactNode } from 'react'

/**
 * Convention PARTAGÉE des sections configurables d'une barre (`components`) : chaque
 * clé vaut `false` (masquer la section), un `ReactNode` (la remplacer), ou rien
 * (garder le défaut de la lib).
 *
 * NB : `ReactNode` englobe déjà `boolean` — d'où le test sur `typeof` plutôt qu'une
 * union discriminante, et d'où la nécessité de ce module : la règle est facile à
 * réimplémenter de travers. `Toolbar` et `MapControls` en avaient deux versions
 * distinctes (`slot()` d'un côté, `isNode()` + `defaultShown()` de l'autre).
 */
export type SlotConfig<K extends string> = Partial<Record<K, boolean | ReactNode>>

/** Cette section est-elle remplacée par un nœud fourni par l'hôte ? */
export const isSlotNode = (v: boolean | ReactNode | undefined): v is ReactNode =>
  v !== undefined && typeof v !== 'boolean'

export type Slots<K extends string> = {
  /** Ce qu'il faut rendre pour `key` : le nœud de l'hôte, rien, ou le défaut fourni. */
  slot: (key: K, node: ReactNode) => ReactNode
  /**
   * La section par défaut est-elle rendue (ni masquée, ni remplacée) ?
   *
   * Indispensable **en plus** de `slot` : un raccourci clavier ne doit être actif que
   * si SON bouton existe réellement. Sans ce prédicat, une section masquée ou
   * remplacée garderait une action clavier fantôme — le rendu et le clavier doivent
   * lire la même vérité, pas deux tests écrits séparément.
   */
  isDefault: (key: K) => boolean
}

/**
 * Résout la configuration de sections d'une barre. Fonction pure (aucun état) :
 * à appeler directement dans le corps du composant.
 */
export function resolveSlots<K extends string>(config: SlotConfig<K> = {}): Slots<K> {
  return {
    slot: (key, node) => {
      const c = config[key]
      if (c === false) return null
      if (isSlotNode(c)) return c
      return node
    },
    isDefault: (key) => !isSlotNode(config[key]) && config[key] !== false,
  }
}
