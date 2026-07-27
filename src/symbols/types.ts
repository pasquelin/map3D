/**
 * Entrée de catalogue : un symbole **disponible** à la pose (pas encore posé). Le
 * `key` est l'identifiant stable côté catalogue — c'est lui qui est stocké dans le
 * symbole placé, jamais le rendu. Un catalogue peut donc changer de graphisme sans
 * invalider les données déjà enregistrées.
 */
export type SymbolEntry = {
  key: string
  label: string
  /** Groupe de rangement dans la palette (chaîne libre : le catalogue décide). */
  category: string
  description?: string
  /** Termes supplémentaires pris en compte par la recherche de la palette. */
  keywords?: string[]
  /**
   * Symbole **multi-points** (graphique tactique : périmètre, axe, zone) : il se
   * pose par collecte de points successifs, pas par un simple dépôt — cf. étape
   * multi-points. Les entrées multi-points sont ignorées au dépôt tant
   * que ce mode n'est pas implémenté.
   */
  multiPoint?: boolean
  /** Multi-points : nombre minimum de points de contrôle (2 = ligne, 3 = surface). */
  minPoints?: number
  /** Couleur de référence (graphiques tactiques surtout) — indicative. */
  color?: string
  /** Tags du symbole posé. Défaut : `['symbol', category]`. */
  tags?: string[]
}

/** Catalogue de symboles posables, groupés par `category`. */
export type SymbolCatalog = {
  /** Identifiant du catalogue (ex. `'mil-std-2525d'`) — trace dans le GeoJSON. */
  id: string
  entries: SymbolEntry[]
  /**
   * Variantes proposées et leur couleur de repérage (`{ friendly: '#00A8FF', … }`).
   * C'est le CATALOGUE qui les déclare : la palette et la couche de rendu restent
   * ainsi agnostiques de MIL-STD, et un catalogue sans variantes n'affiche pas de
   * sélecteur. Les libellés, eux, vivent dans `labels.symbols.affiliations`.
   */
  variantColors?: Record<string, string>
}

/**
 * Rendu d'un symbole. Le SVG est **déjà ancré** : le point géographique correspond
 * au CENTRE de son viewBox.
 *
 * C'est une exigence, pas une convention de confort. Les symboles MIL-STD ont un
 * point d'ancrage interne qui n'est pas le centre de l'image (un poste de
 * commandement pend sous son mât) : rendre le SVG brut centré sur sa boîte
 * décalerait le symbole de plusieurs pixels par rapport au terrain. Recentrer le
 * viewBox sur l'ancre est la responsabilité du provider — la couche, elle, place
 * bêtement le centre de l'image sur la coordonnée.
 */
export type RenderedSymbol = {
  svg: string
  /** Côté (px) auquel ce SVG est prévu pour être affiché. */
  size: number
}

export type SymbolRenderOptions = {
  size?: number
  /**
   * Variante du symbole — pour MIL-STD, l'**affiliation** (ami, hostile, neutre,
   * inconnu), qui change le SIDC donc le graphisme. Générique par construction :
   * la couche n'y voit qu'une chaîne opaque qu'elle transmet et persiste.
   */
  variant?: string
}

/**
 * Fournisseur de graphisme, injecté par l'hôte (même patron que
 * `createGooglePlacesSearch` / `createGoogleRoutesProvider`). `render` est
 * **synchrone** — donc mémoïsant côté provider — parce qu'il est appelé à chaque
 * rendu React ; le chargement d'un éventuel SDK passe par `ready`.
 */
export type SymbolRenderer = {
  /** `null` = pas (encore) rendable : la couche affiche un placeholder discret. */
  render: (key: string, opts?: SymbolRenderOptions) => RenderedSymbol | null
  /** Résolue quand `render` peut répondre — la couche se re-rend à ce moment-là. */
  ready?: Promise<void>
}
