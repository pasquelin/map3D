/**
 * Catégories de couches HÔTE (props React) : effaçables par la gomme sur opt-in
 * `erasable`, non possédées par la lib. Nommées pour partager UNE définition entre
 * `EraseTarget` (config) et `ErasableItem.kind` (registre). La clé `path` est alignée
 * VERBATIM sur `SelectableKind`/`config.selection.selectable` (vocabulaire commun avec
 * l'outil sélection) ; `shape` n'est pas encore un `SelectableKind` (zones non
 * sélectionnables à ce jour) mais suit le même nommage.
 */
export type HostLayerKind = 'path' | 'shape'

/**
 * Catégories d'objets que la **gomme** est autorisée à effacer, une clé par
 * catégorie (`config.erase.targets`). Une catégorie à `false` = ni retirée ni
 * remontée dans `onErase`, par les DEUX modes de gomme (ponctuelle et sélection).
 *
 * `drawing`/`symbol`/`measure` = objets possédés par la lib ; `path`/`shape` = couches
 * hôte (cf. `HostLayerKind`). Les markers ne figurent JAMAIS ici : jamais effaçables.
 */
export type EraseTarget = 'drawing' | 'measure' | 'symbol' | HostLayerKind

/** Politique de la gomme : ce qu'elle peut effacer (défaut : tout `true`). */
export type EraseConfig = {
  /** Un booléen par catégorie effaçable — limite la gomme au cas par cas. */
  targets: Record<EraseTarget, boolean>
}
