/* ══════════════════ REGISTRE DES TYPES DE MARKER ══════════════════
   Un type de marker, c'est une couleur, un nom et un pictogramme. Les trois se
   déclarent ICI, en une entrée par type, et tout le reste en dérive : la palette
   (`colors.ts`), les libellés (`labels.ts`), le thème passé à la lib (`theme.ts`),
   les sprites (`icons/markerIcons.ts`) et les satellites de cluster
   (`icons/clusterIcons.tsx`).

   Le geste que cet exemple doit démontrer — brancher SES types métier sur la lib —
   tient donc en une ligne ajoutée à cette table, au lieu de cinq éditions dans cinq
   fichiers dont quatre échoueraient en silence. */

/** Pictogramme intérieur d'un type. Rendu en SVG sur les sprites, en JSX ailleurs. */
export type Glyph = 'shield' | 'dot' | 'warning' | 'info'

export type MarkerTypeSpec = {
  color: string
  /** Nom du type, au singulier puis au pluriel (parts de cluster à plusieurs). */
  label: [string, string]
  glyph: Glyph
}

export const MARKER_TYPES = {
  'alert-critical': { color: '#4d0218', label: ['Critique', 'Critiques'], glyph: 'warning' },
  'alert-high': { color: '#ef4444', label: ['Élevée', 'Élevées'], glyph: 'warning' },
  'alert-medium': { color: '#f59e0b', label: ['Moyenne', 'Moyennes'], glyph: 'warning' },
  'alert-low': { color: '#3b82f6', label: ['Info', 'Infos'], glyph: 'info' },
  'agent-available': { color: '#22c55e', label: ['Agent disponible', 'Agents disponibles'], glyph: 'shield' },
  'agent-enroute': { color: '#06b6d4', label: ['Agent en route', 'Agents en route'], glyph: 'shield' },
  'agent-onsite': { color: '#8b5cf6', label: ['Agent sur place', 'Agents sur place'], glyph: 'dot' },
} satisfies Record<string, MarkerTypeSpec>

const REGISTRY: Record<string, MarkerTypeSpec> = MARKER_TYPES

/**
 * Réglages d'un type — `undefined` pour un type venu d'ailleurs (un symbole de
 * catalogue posé sur la carte). Chaque dérivation choisit alors son propre repli,
 * qu'elle est seule à savoir formuler.
 */
export const markerTypeSpec = (type: string): MarkerTypeSpec | undefined => REGISTRY[type]

export const MARKER_TYPE_IDS = Object.keys(MARKER_TYPES)
