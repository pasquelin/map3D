import type { CatalogConfig } from '../types'

export const catalogDefaults: CatalogConfig = {
  // 50 : une page couvre plus que la hauteur d'un panneau, donc le scroll ne bute pas
  // sur une sentinelle dès la première ligne, sans pour autant charger un référentiel
  // entier à l'ouverture.
  pageSize: 50,
  // Aligné sur `data.search.debounceMs` : c'est le même geste, il n'y a pas de raison
  // que deux champs de recherche de la même carte réagissent différemment.
  debounceMs: 250,
  maxInlineActions: 2,
  // 4 : deux coups de molette d'avance de chaque côté à la hauteur de ligne par
  // défaut. Monter au-delà rend plus de lignes à chaque frame de défilement pour un
  // vide que personne n'a jamais vu.
  overscanRows: 4,
  // 200 px ≈ six lignes : la page suivante part pendant qu'on défile encore, sans
  // précharger un référentiel qu'on ne fera que survoler.
  prefetchMarginPx: 200,
  // Aligné sur `data.search.debounceMs` : une rafale de coches est le même genre de
  // geste qu'une frappe, et la charge est vidée avant que la page ne disparaisse.
  persistDebounceMs: 250,
}
