// Vocabulaire visuel du bouton « supprimer » de la lib : icône, classes. Une seule
// définition, pour que le geste se présente pareil partout où il est offert (barre
// d'état d'une relation, pastilles du dock, indice de retrait pendant un drag).
//
// Séparé de `<RemoveButton>` bien qu'il n'ait aujourd'hui que ce consommateur : la
// feuille de styles s'appuie sur ces mêmes noms de classes, et les voir déclarés hors
// d'un composant React rappelle qu'ils sont un contrat partagé, pas un détail interne.

/** Tracé `mdiClose` (Material Design Icons), viewBox 0 0 24 24. */
export const REMOVE_ICON_PATH =
  'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'

/** Classe racine — porte le style rouge commun (cf. `injectStyles`). */
export const REMOVE_CLASS = 'm3d-remove'
/** Classe du libellé : masqué automatiquement quand il est vide. */
export const REMOVE_TEXT_CLASS = 'm3d-remove-text'
