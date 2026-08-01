// Réglages de la carte — le pendant « comportement » du thème.
//
// Pourquoi un module à part : `MapTheme` décrit ce qui se VOIT (couleurs, tailles,
// mouvement), `MapConfig` décrit ce qui se RÈGLE (fournisseurs tiers, seuils de
// geste, budgets de calcul, cadence de chargement). Les deux sont des arbres de
// valeurs mergés profondément sur une base complète, mais ils ne changent pas pour
// les mêmes raisons : on change de thème pour une charte graphique, de config pour
// une clé d'API, un quota, ou un support tactile.
//
// La règle est la même que pour le thème : **chaque feuille a une valeur par
// défaut**. `<Map />` sans aucune prop fonctionne. Un override partiel ne fournit
// que ce qu'il change — `mergeConfig` complète le reste.
//
// Éclaté par domaine (cf. les modules de ce dossier) ; ce fichier réassemble
// `MapConfig`/`PartialConfig` et réexporte tous les sous-types.

// `DeepPartial` vient de `theme/types` : une seconde définition ici aurait été un
// doublon libre de diverger, exactement ce que ce module cherche à supprimer ailleurs.
import type { DeepPartial } from '../../theme/types'
import type { ProvidersConfig } from './providers'
import type { InteractionConfig } from './interaction'
import type { PerformanceConfig } from './performance'
import type { CameraConfig } from './camera'
import type { ZIndexConfig } from './zindex'
import type { ClusteringConfig } from './clustering'
import type { MarkersConfig } from './markers'
import type { DataConfig } from './data'
import type { StartupConfig } from './startup'
import type { SkyConfig } from './sky'
import type { PedestrianConfig } from './pedestrian'
import type { GraticuleConfig } from './graticule'
import type { CatalogConfig } from './catalog'
import type { WatermarkConfig } from './watermark'
import type { CaptureConfig } from './capture'
import type { SelectionConfig } from './selection'
import type { EraseConfig } from './erase'

export * from './common'
export * from './providers'
export * from './interaction'
export * from './performance'
export * from './camera'
export * from './zindex'
export * from './clustering'
export * from './data'
export * from './markers'
export * from './startup'
export * from './sky'
export * from './pedestrian'
export * from './graticule'
export * from './catalog'
export * from './watermark'
export * from './capture'
export * from './selection'
export * from './erase'

export type MapConfig = {
  providers: ProvidersConfig
  interaction: InteractionConfig
  performance: PerformanceConfig
  camera: CameraConfig
  /** Empilement des surfaces — cf. `ZIndexConfig`. */
  style: { zIndex: ZIndexConfig }
  clustering: ClusteringConfig
  markers: MarkersConfig
  data: DataConfig
  startup: StartupConfig
  /** Ciel atmosphérique procédural — cf. `SkyConfig`. */
  sky: SkyConfig
  /** Mode piéton / première personne — cf. `PedestrianConfig`. */
  pedestrian: PedestrianConfig
  /** Grille de coordonnées géographiques — cf. `GraticuleConfig`. */
  graticule: GraticuleConfig
  /** Catalogue d'entités géographiques distantes — cf. `CatalogConfig`. */
  catalog: CatalogConfig
  /** Signature « map3D » (attribution PolyForm) — cf. `WatermarkConfig`. */
  watermark: WatermarkConfig
  /** Capture d'image de la carte (« Prendre une photo », `engine.capture()`) — cf. `CaptureConfig`. */
  capture: CaptureConfig
  /** Politique de sélectionnabilité (quels types l'outil sélection peut atteindre) — cf. `SelectionConfig`. */
  selection: SelectionConfig
  /** Politique de la gomme : ce qu'elle est autorisée à effacer — cf. `EraseConfig`. */
  erase: EraseConfig
}

/** Ce que fournit l'application : n'importe quel sous-arbre de `MapConfig`. */
export type PartialConfig = DeepPartial<MapConfig>
