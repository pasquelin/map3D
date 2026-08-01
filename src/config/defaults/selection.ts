import type { SelectionConfig } from '../types'

// Défaut ouvert : tout ce qui est sélectionnable l'est. L'hôte restreint au cas
// par cas via `config.selection.selectable` ou la prop `<Map config>`.
export const selectionDefaults: SelectionConfig = {
  selectable: { marker: true, path: true, cluster: true },
}
