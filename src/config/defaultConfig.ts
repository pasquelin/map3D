// Valeurs par défaut de `MapConfig` — la base du merge.
//
// Chaque feuille est renseignée : la lib ne doit jamais dépendre d'une config
// fournie. Sauf mention `⚠️` ci-dessous, chaque valeur reprend à l'identique celle
// qui était codée en dur avant l'introduction de ce module, pour que `<Map />` sans
// prop `config` se comporte exactement comme auparavant.
//
// Éclaté par domaine (cf. `defaults/`, en miroir de `types/`) ; ce fichier réassemble
// `defaultConfig` à l'identique.

import type { MapConfig } from './types'
import { providersDefaults } from './defaults/providers'
import { interactionDefaults } from './defaults/interaction'
import { performanceDefaults } from './defaults/performance'
import { zIndexDefaults } from './defaults/zindex'
import { cameraDefaults } from './defaults/camera'
import { clusteringDefaults } from './defaults/clustering'
import { markersDefaults } from './defaults/markers'
import { dataDefaults } from './defaults/data'
import { startupDefaults } from './defaults/startup'
import { skyDefaults } from './defaults/sky'
import { pedestrianDefaults } from './defaults/pedestrian'
import { graticuleDefaults } from './defaults/graticule'
import { catalogDefaults } from './defaults/catalog'
import { watermarkDefaults } from './defaults/watermark'

export const defaultConfig: MapConfig = {
  providers: providersDefaults,
  interaction: interactionDefaults,
  performance: performanceDefaults,
  style: { zIndex: zIndexDefaults },
  camera: cameraDefaults,
  clustering: clusteringDefaults,
  markers: markersDefaults,
  data: dataDefaults,
  startup: startupDefaults,
  sky: skyDefaults,
  pedestrian: pedestrianDefaults,
  graticule: graticuleDefaults,
  catalog: catalogDefaults,
  watermark: watermarkDefaults,
}
