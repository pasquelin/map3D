// Ce que le panneau de réglages a besoin de savoir de `MapConfig`, et que les types
// seuls ne disent pas : les bornes d'un slider, les valeurs admises d'une chaîne, ce
// qui coûte de l'argent, ce qui ne prend effet qu'au remontage.
//
// Rien ici ne DÉCRIT la config : elle est décrite par ses types et son JSDoc. Ce
// module ne fait que la rendre manipulable. Les contrôleurs sont donc DÉDUITS de
// `defaultConfig` par parcours récursif (cf. `collectLeaves`) — une clé ajoutée à la
// config apparaît d'elle-même dans le panneau, sans rien toucher ici. La table
// ci-dessous ne sert qu'aux exceptions : ce qu'un `typeof` ne peut pas deviner.

import { defaultConfig, type MapConfig, type PartialConfig } from 'map3d'

import { CONFIG_LABELS, FOLDER_LABELS } from './configLabels'
import { isRecord } from './isRecord'

const SEP = '.'

// ─────────────────────────────────────────────────────────────────────────────
// Nature d'une feuille
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comment une feuille se présente ET se ré-encode.
 *
 * `key` et `accel` existent parce que `typeof` ment sur ces deux-là : un raccourci
 * désactivé vaut `false` (donc « booléen » pour un parcours naïf, alors que c'est une
 * touche absente), et une commande à modificateur est un objet qu'on ne veut pas
 * éclater en trois contrôleurs.
 */
type LeafKind =
  | 'number'
  | 'boolean'
  | 'string'
  /** Choix fermé (`options`). */
  | 'list'
  /** Choix fermé dont une entrée signifie « clé absente » (optionnelle du type). */
  | 'optionalList'
  /** `string | false` — champ vide = commande désactivée. */
  | 'key'
  /** `EditShortcut` — saisi en accélérateur (`mod+shift+z`), vide = désactivé. */
  | 'accel'
  | 'csvNumber'
  | 'csvString'
  /** Objet libre saisi en JSON (`headers`) — vide = clé absente. */
  | 'json'

type LeafMeta = {
  kind?: LeafKind
  label?: string
  min?: number
  max?: number
  step?: number
  /** Libellé affiché → valeur écrite. */
  options?: Readonly<Record<string, string>>
  /** Lue à la CONSTRUCTION du moteur : le changement ne prend qu'au remontage. */
  cold?: boolean
  /** Pèse sur la facturation d'un fournisseur tiers (💰 du JSDoc d'origine). */
  billing?: boolean
  /** Valeur initiale d'une clé ABSENTE de `defaultConfig` (champ optionnel du type). */
  extra?: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulaires partagés
// ─────────────────────────────────────────────────────────────────────────────

// `AutoLocale` accepte n'importe quelle chaîne. Une liste plutôt qu'un champ libre :
// chaque frappe dans un champ texte relance une session de tuiles ou un appel Places.
const LOCALES = {
  auto: 'auto',
  'fr-FR': 'fr-FR',
  'en-GB': 'en-GB',
  'en-US': 'en-US',
  'de-DE': 'de-DE',
  'es-ES': 'es-ES',
  'ja-JP': 'ja-JP',
} as const

const REGIONS = { auto: 'auto', FR: 'FR', GB: 'GB', US: 'US', DE: 'DE', ES: 'ES', JP: 'JP' } as const

/** Une entrée du type `EditShortcut` désactivée, et son pendant « absent » ailleurs. */
const NONE = ''

/** Entrée d'`optionalList` qui signifie « ne pas écrire la clé ». */
export const UNSET = '(défaut)'

/** Les plafonds mémoire se règlent en mébioctets — un pas d'un octet n'aurait aucun sens. */
const MIB = 1024 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Table des exceptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clé = chemin exact, ou `parent.*` pour tous les enfants directs d'un nœud.
 *
 * N'y figure que ce qui ne se déduit pas : les énumérations, les tableaux, les
 * bornes que le suffixe du nom ne donne pas (cf. `autoRange`), et les deux drapeaux
 * ❄/💰. Tout le reste est absent volontairement.
 */
const CONFIG_META: Readonly<Record<string, LeafMeta>> = {
  // ① providers ───────────────────────────────────────────────────────────────
  // Bascule Google ↔ serveur auto-hébergé, à chaud : c'est le réglage qui fait
  // apparaître ou disparaître les boutons 2D/3D et trafic de la barre.
  'providers.tiles.provider': {
    kind: 'list',
    options: { 'Google (externe)': 'external', 'serveur interne': 'internal' },
  },
  // Choix fermé plutôt que saisie libre : les deux origines réellement utilisées sont la
  // production et le serveur local, et une URL tapée à la main ne se teste qu'en voyant
  // la carte rester vide. `localhost` dépanne quand la production est hors d'atteinte.
  'providers.internal.origin': {
    kind: 'list',
    options: {
      'production — map.gosecure.site': 'https://map.gosecure.site',
      'local — localhost:8090': 'http://localhost:8090',
    },
  },
  'providers.tiles.baseZoom': { min: 0, max: 6, step: 1 },
  'providers.tiles.maxZoom': { min: 2, max: 22, step: 1 },
  // Côté de l'anneau demandé à chaque niveau INTERMÉDIAIRE de la cascade de détail.
  // Impair : l'anneau est centré sur le point visé. Au-delà de 7 on paie surtout des
  // tuiles redondantes — le niveau plus fin couvre déjà le quart central.
  'providers.tiles.lodRing': { min: 1, max: 9, step: 2, billing: true },
  'providers.tiles.uniformMaxSpread': { min: 0, max: 6, step: 1 },
  'providers.tiles.language': { kind: 'list', options: LOCALES },
  'providers.tiles.region': { kind: 'list', options: REGIONS },
  // Les CLÉS s'affichent, les valeurs partent au fournisseur : elles restent les
  // identifiants exacts de l'API, qui ne se traduisent pas.
  'providers.tiles.mapType': {
    kind: 'list',
    options: { plan: 'roadmap', satellite: 'satellite', relief: 'terrain' },
  },
  'providers.tiles.layerTypes': { kind: 'csvString' },
  'providers.tiles.retryDelays': { kind: 'csvNumber' },
  'providers.tiles.maxTiles': { min: 50, max: 2000, step: 10 },
  // Une tuile raster décodée pèse 256×256×4 = 262 Ko sur le GPU : les 500 du plafond
  // ci-dessus en font 131 Mo, que rien ne bornait avant cette clé.
  'providers.tiles.maxBytes': { min: 16 * MIB, max: 512 * MIB, step: 16 * MIB },
  'providers.tiles.evictEvery': { min: 1, max: 60, step: 1 },
  'providers.tiles.evictSlack': { min: 0, max: 500, step: 10 },
  'providers.tiles.mountPerFrame': { min: 1, max: 32, step: 1 },
  'providers.tiles.maxInflight': { min: 1, max: 32, step: 1 },
  'providers.tiles.margin': { min: 0, max: 4, step: 1 },
  'providers.tiles.maxRequest': { min: 10, max: 500, step: 10, billing: true },
  'providers.tiles.maxAttempts': { min: 1, max: 6, step: 1 },

  // À chaud, comme le fournisseur 2D : il commande la visibilité et le pilotage du
  // tileset photoréaliste, pas son enregistrement.
  'providers.tiles3d.provider': {
    kind: 'list',
    options: { 'photoréaliste (externe)': 'external', 'serveur interne': 'internal' },
  },
  'providers.tiles3d.cesiumIonAssetId': { cold: true },

  'providers.buildings.defaultHeight': { min: 2, max: 30, step: 1 },
  // La Burj Khalifa fait 828 m : au-delà, c'est une erreur de saisie OSM (`height=99999`
  // est courant), qui produisait un volume de cent kilomètres.
  'providers.buildings.maxHeight': { min: 50, max: 2000, step: 50 },
  // `int16` divise par deux le plus gros tampon, pour ~4 cm de résolution. À basculer sur
  // `float32` pour comparer à l'œil : la différence ne se voit pas, la mémoire si.
  'providers.buildings.positionPrecision': {
    kind: 'list',
    options: { 'int16 (2× plus léger)': 'int16', float32: 'float32' },
  },
  'providers.buildings.zoom': { min: 10, max: 16, step: 1 },
  'providers.buildings.maxViewAltitude': { min: 200, max: 5000, step: 100 },
  'providers.buildings.requestAltitudeFactor': { min: 1, max: 2, step: 0.1 },
  'providers.buildings.maxViewDistance': { min: 2000, max: 12_000, step: 500 },
  'providers.buildings.margin': { min: 0, max: 3, step: 1 },
  // Bornes RESSERRÉES : une tuile z14 dense pèse ~131 000 triangles, sans commune mesure
  // avec une tuile raster. Les plafonds d'avant (256 / 16 / 128) étaient calqués sur ceux
  // du fond 2D et permettaient de mettre la carte à genoux depuis le panneau.
  'providers.buildings.maxTiles': { min: 4, max: 64, step: 4 },
  // C'est CE plafond qui borne réellement la mémoire : le compte de tuiles ne dit rien de
  // ce qu'elles pèsent, et le rapport va de un à cent entre campagne et centre-ville. Le
  // descendre puis se promener dans Paris montre l'éviction à l'œuvre.
  'providers.buildings.maxBytes': { min: 16 * MIB, max: 512 * MIB, step: 16 * MIB },
  'providers.buildings.evictEvery': { min: 1, max: 60, step: 1 },
  'providers.buildings.evictSlack': { min: 0, max: 64, step: 4 },
  // À 1, la carte perd une frame par tuile montée au lieu de trois. Le monter fait
  // réapparaître le gel d'origine — c'est le réglage qui le démontre.
  'providers.buildings.mountPerFrame': { min: 1, max: 8, step: 1 },
  'providers.buildings.maxInflight': { min: 1, max: 6, step: 1 },
  'providers.buildings.maxRequest': { min: 1, max: 49, step: 1 },
  'providers.buildings.maxAttempts': { min: 1, max: 6, step: 1 },
  'providers.buildings.retryDelays': { kind: 'csvNumber' },

  'providers.routing.routingPreference': {
    kind: 'list',
    billing: true,
    options: {
      'sans trafic': 'TRAFFIC_UNAWARE',
      'avec trafic': 'TRAFFIC_AWARE',
      'trafic optimal': 'TRAFFIC_AWARE_OPTIMAL',
    },
  },
  'providers.routing.languageCode': { kind: 'list', options: LOCALES },
  'providers.routing.regionCode': { kind: 'list', options: REGIONS },
  'providers.routing.matrixFields': { billing: true },
  'providers.routing.routeFields': { billing: true },
  'providers.routing.fastestOversample': { min: 1, max: 10, step: 1, billing: true },
  'providers.routing.refreshIntervalMs': { min: 1000, max: 120_000, step: 1000, billing: true },
  'providers.routing.staleMeters': { billing: true },
  'providers.routing.retries': { min: 0, max: 5, step: 1 },
  'providers.routing.presets.fastest': { kind: 'csvNumber', billing: true },
  'providers.routing.presets.radius': { kind: 'csvNumber' },
  'providers.routing.cache.maxEntries': { min: 10, max: 5000, step: 10 },
  // Absents de `defaultConfig` : optionnels du type, donc invisibles au parcours.
  'providers.routing.units': {
    kind: 'optionalList',
    extra: UNSET,
    options: { métrique: 'METRIC', impérial: 'IMPERIAL' },
  },
  'providers.routing.headers': { kind: 'json', extra: NONE },

  'providers.places.pageSize': { min: 1, max: 20, step: 1, billing: true },
  'providers.places.pageSizeRange': { kind: 'csvNumber' },
  'providers.places.fields': { billing: true },
  'providers.places.languageCode': { kind: 'list', options: LOCALES },
  'providers.places.regionCode': { kind: 'list', options: REGIONS },
  'providers.places.retries': { min: 0, max: 5, step: 1 },
  'providers.places.headers': { kind: 'json', extra: NONE },

  'providers.symbols.cacheMaxEntries': { min: 10, max: 2000, step: 10 },

  // ② interaction ─────────────────────────────────────────────────────────────
  'interaction.minScale': { min: 0.001, max: 1, step: 0.001 },
  'interaction.barMinScale': { min: 0.5, max: 1, step: 0.01 },
  'interaction.history.depth': { min: 1, max: 200, step: 1 },
  'interaction.spiderfy.gapPx': { min: 0, max: 40, step: 1 },
  'interaction.spiderfy.zoomEpsilon': { min: 0, max: 1, step: 0.01 },
  'interaction.clusterOpenZoom.expansion': { min: 0, max: 2, step: 0.05 },
  'interaction.clusterOpenZoom.max': { min: 0, max: 2, step: 0.05 },
  // `false` par défaut sur certaines : un parcours naïf y verrait un booléen.
  'interaction.shortcuts.controls.*': { kind: 'key' },
  'interaction.shortcuts.draw.*': { kind: 'key' },
  'interaction.shortcuts.lens.toggle': { kind: 'key' },
  'interaction.shortcuts.edit.closePolygon': { kind: 'key' },
  'interaction.shortcuts.edit.delete': { kind: 'csvString' },
  // Objets `EditShortcut` : listés un à un — leurs voisins de `edit` sont d'autres
  // natures, donc pas de motif `edit.*` possible.
  'interaction.shortcuts.edit.undo': { kind: 'accel' },
  'interaction.shortcuts.edit.redo': { kind: 'accel' },
  'interaction.shortcuts.edit.redoAlt': { kind: 'accel' },
  'interaction.shortcuts.edit.selectAll': { kind: 'accel' },
  'interaction.shortcuts.edit.duplicate': { kind: 'accel' },

  // ③ performance ─────────────────────────────────────────────────────────────
  'performance.pixelRatio': { min: 0.5, max: 3, step: 0.25 },
  'performance.textureAnisotropy': { min: 0, max: 16, step: 1 },
  'performance.antialias': { cold: true },
  'performance.boundsPickGrid': { min: 2, max: 12, step: 1 },
  'performance.boundsMargin': { min: 0, max: 2, step: 0.05 },
  'performance.circleSegments': { min: 8, max: 256, step: 4 },
  'performance.groundHeightRange': { kind: 'csvNumber' },
  'performance.cameraMoveEpsilon.deg': { min: 1e-8, max: 1e-3, step: 1e-8 },
  'performance.cameraMoveEpsilon.altitudeRatio': { min: 1e-5, max: 1e-1, step: 1e-5 },
  'performance.groundSample.cellDeg': { min: 1e-6, max: 1e-2, step: 1e-6 },
  'performance.groundSample.samples': { min: 0, max: 32, step: 1 },
  'performance.resettle.batch': { min: 1, max: 64, step: 1 },
  'performance.resettle.mppBand': { min: 1, max: 4, step: 0.05 },
  'performance.relations.maxSteps': { min: 8, max: 1024, step: 8 },
  'performance.relations.fanMaxLegs': { min: 1, max: 20, step: 1 },
  'performance.relations.zoomBand': { min: 0, max: 2, step: 0.05 },

  // ④ camera ──────────────────────────────────────────────────────────────────
  // Les trois bornes de zoom sont désormais RÉELLEMENT appliquées (elles étaient
  // déclarées et inertes) : ce sont donc de vrais leviers de navigation, à essayer en
  // direct. `maxZoom3d` est le plancher de descente en volume — altitude au-dessus du
  // sol = 40 075 016 / 2^zoom, soit ~153 m à 18, ~76 m à 19, ~19 m à 21.
  'camera.minZoom': { min: 0, max: 8, step: 1 },
  'camera.maxZoom': { min: 12, max: 22, step: 1 },
  'camera.maxZoom3d': { min: 12, max: 22, step: 1 },
  'camera.minGroundClearance': { min: 1, max: 500, step: 1 },
  'camera.keyPan.speed': { min: 0.05, max: 4, step: 0.05 },
  'camera.keyPan.boost': { min: 1, max: 10, step: 0.5 },
  // Plusieurs touches par direction : les flèches, universelles, et une famille de
  // lettres qui dépend de la disposition du clavier. Saisies en liste séparée par des
  // virgules, en minuscules (`arrowup`, `z`, `shift`).
  'interaction.shortcuts.navigate.*': { kind: 'csvString' },
  'camera.maxTilt': { min: 0, max: Math.PI / 2, step: 0.01 },
  'camera.maxTilt3d': { min: 0, max: Math.PI / 2, step: 0.01 },
  'camera.maxTilt2d': { min: 0, max: Math.PI / 2, step: 0.01 },
  'camera.tiltStep': { min: 0.01, max: 1, step: 0.01 },
  'camera.zoomStep': { min: 0.1, max: 4, step: 0.1 },
  'camera.fov': { min: 20, max: 100, step: 1, cold: true },
  'camera.dragSpeed.min': { min: 0.0001, max: 0.1, step: 0.0001 },
  'camera.dragSpeed.max': { min: 0.01, max: 2, step: 0.01 },
  'camera.zoomFactor.in': { min: 0.1, max: 0.99, step: 0.05 },
  'camera.zoomFactor.out': { min: 1.01, max: 4, step: 0.05 },
  'camera.maxDistanceFactor': { min: 1.05, max: 10, step: 0.05 },
  'camera.maxAltitudeFactor': { min: 0.1, max: 10, step: 0.05 },
  'camera.fitBounds.margin': { min: 1, max: 3, step: 0.05 },

  // ⑤ style ───────────────────────────────────────────────────────────────────
  'style.zIndex.*': { min: 0, max: 10_000, step: 1 },

  // ⑥ clustering ──────────────────────────────────────────────────────────────
  'clustering.radius': { min: 0, max: 200, step: 1 },
  'clustering.minPoints': { min: 2, max: 20, step: 1 },
  'clustering.levelQuantization': { min: 1, max: 8, step: 1 },

  // ⑧ data ────────────────────────────────────────────────────────────────────
  // Lues au montage des composants qui les consomment (TagFilter, DrawSettings,
  // SearchBox) : les changer à chaud ne déplace pas ce qui est déjà écrit.
  'data.storageKeys.*': { cold: true },
  'data.search.minQuery': { min: 1, max: 8, step: 1 },
  'data.search.debounceMs': { min: 0, max: 2000, step: 10, billing: true },
  'data.search.limitPerGroup': { min: 1, max: 30, step: 1 },
  'data.search.historySize': { min: 0, max: 50, step: 1 },
  'data.search.resolveLimit': { min: 1, max: 100, step: 1 },

  // ⑨ startup ─────────────────────────────────────────────────────────────────
  'startup.introDuration': { min: 0, max: 15, step: 0.1 },
  'startup.introAltitudeFactor': { min: 0.2, max: 5, step: 0.05 },
  // Fixe le premier `aspect` de la caméra, avant le ResizeObserver.
  'startup.fallbackSize': { kind: 'csvNumber', cold: true },

  // ⑩ sky ──────────────────────────────────────────────────────────────────────
  'sky.turbidity': { min: 1, max: 20, step: 0.5 },
  'sky.rayleigh': { min: 0, max: 4, step: 0.1 },
  'sky.mieCoefficient': { min: 0, max: 0.05, step: 0.001 },
  'sky.mieDirectionalG': { min: 0, max: 1, step: 0.01 },
  'sky.clouds.coverage': { min: 0, max: 1, step: 0.01 },
  'sky.clouds.density': { min: 0, max: 1, step: 0.01 },
  'sky.clouds.scale': { min: 0.00005, max: 0.001, step: 0.00005 },
  'sky.clouds.elevation': { min: 0, max: 1, step: 0.01 },
  'sky.fade.start': { min: 100_000, max: 2_000_000, step: 10_000 },
  'sky.fade.end': { min: 10_000, max: 500_000, step: 10_000 },
  // Epoch ms, 0 = maintenant : champ nombre libre (aucune borne n'aurait de sens).

  // Mode piéton. Le suffixe `…Meters` déduit [0, def×4] AU PAS DE 1 : beaucoup trop
  // grossier pour des grandeurs corporelles (0,3 m de rayon, 0,1 m de near). `…Deg` et les
  // clés sans suffixe n'ont, elles, aucune borne déduite.
  'pedestrian.eyeHeightMeters': { min: 0.5, max: 3, step: 0.05 },
  'pedestrian.walkSpeed': { min: 0.5, max: 10, step: 0.1 },
  'pedestrian.sprintFactor': { min: 1, max: 10, step: 0.5 },
  'pedestrian.lookSpeed': { min: 0.01, max: 1, step: 0.01 },
  'pedestrian.pitchMaxDeg': { min: 0, max: 89, step: 1 },
  'pedestrian.nearMeters': { min: 0.01, max: 2, step: 0.01 },
  'pedestrian.groundProbeMeters': { min: 1, max: 50, step: 1 },
  'pedestrian.tileDetailDistanceMeters': { min: 10, max: 1000, step: 10 },
  'pedestrian.tileRefreshMs': { min: 0, max: 2000, step: 50 },
  'pedestrian.groundSmoothing': { min: 0, max: 2, step: 0.01 },
  'pedestrian.collision.radiusMeters': { min: 0.1, max: 2, step: 0.05 },
  'pedestrian.collision.feelers': { min: 3, max: 16, step: 1 },
  'pedestrian.collision.feelerMarginMeters': { min: 0, max: 1, step: 0.05 },
  'pedestrian.collision.maxStepHeightMeters': { min: 0, max: 1.5, step: 0.05 },
  'pedestrian.placement.maxRoofDeltaMeters': { min: 0, max: 20, step: 0.5 },
  'pedestrian.placement.ringRadiusMeters': { min: 4, max: 60, step: 1 },
  'pedestrian.placement.refreshMs': { min: 0, max: 200, step: 1 },
  'pedestrian.headBob.amplitudeMeters': { min: 0, max: 0.5, step: 0.01 },
  'pedestrian.headBob.frequency': { min: 0.5, max: 5, step: 0.1 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Accès par chemin
// ─────────────────────────────────────────────────────────────────────────────

function getAt(root: unknown, path: string): unknown {
  return path.split(SEP).reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), root)
}

function setAt(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(SEP)
  const last = keys.pop()
  if (last === undefined) return
  let node = root
  for (const key of keys) {
    if (!isRecord(node[key])) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[last] = value
}

/** Égalité structurelle — un tableau ré-encodé n'est jamais la même référence. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  if (isRecord(a) && isRecord(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => sameValue(a[k], b[k]))
  }
  return false
}

/** Exact d'abord, puis le motif `parent.*` — cf. `CONFIG_META`. */
function metaFor(path: string): LeafMeta {
  const exact = CONFIG_META[path]
  if (exact) return exact
  const dot = path.lastIndexOf(SEP)
  return (dot < 0 ? undefined : CONFIG_META[`${path.slice(0, dot)}.*`]) ?? {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Libellés et bornes déduits du nom
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le suffixe d'un nom porte son unité dans toute la config (`…Px`, `…Ms`, `…Meters`).
 * C'est ce qui permet de ne PAS écrire 200 libellés ni 200 paires de bornes.
 *
 * `strip` distingue les deux cas : `shapeHitTolerancePx` répète son unité dans son nom
 * (« shape hit tolerance (px) »), là où `maxZoom` la sous-entend — la couper donnerait
 * un contrôleur nommé « max », inutilisable au milieu de ses voisins.
 */
const SUFFIXES: readonly {
  re: RegExp
  unit: string
  strip: boolean
  range?: (def: number) => [number, number, number]
}[] = [
  { re: /Px$/, unit: 'px', strip: true, range: (d) => [0, Math.max(120, d * 4), 1] },
  { re: /Ms$/, unit: 'ms', strip: true, range: (d) => [0, Math.max(2000, d * 4), d > 10_000 ? 100 : 10] },
  { re: /Meters$/, unit: 'm', strip: true, range: (d) => [0, Math.max(1000, d * 4), 1] },
  { re: /Frames$/, unit: 'frames', strip: true, range: (d) => [0, Math.max(120, d * 4), 1] },
  { re: /Deg$/, unit: '°', strip: true },
  { re: /Zoom$/, unit: '', strip: false, range: () => [0, 24, 0.5] },
  { re: /Ratio$/, unit: '', strip: false, range: (d) => [0, Math.max(4, d * 4), 0.01] },
  { re: /Altitude$/, unit: 'm', strip: false, range: (d) => [0, Math.max(10_000, d * 4), 10] },
]

/**
 * Libellé d'une feuille : la traduction française d'abord, le nom de la clé en dernier
 * recours. `configLabels.test.ts` vérifie qu'aucune feuille n'atteint ce dernier
 * recours — sans lui, une clé ajoutée à `MapConfig` apparaîtrait toute seule dans le
 * panneau, mais en anglais et sans que rien ne le signale.
 */
export function labelOf(path: string): string {
  return CONFIG_LABELS[path] ?? autoLabel(path)
}

/** Idem pour un dossier de l'arbre. */
export function folderLabelOf(path: string): string {
  return FOLDER_LABELS[path] ?? autoLabel(path)
}

/** Dérivé du nom de la clé — anglais, donc REPLI seulement. Cf. `labelOf`. */
function autoLabel(path: string): string {
  const key = path.split(SEP).pop() ?? path
  const hit = SUFFIXES.find((s) => s.re.test(key))
  const stem = hit?.strip ? key.replace(hit.re, '') || key : key
  const words = stem.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return hit?.unit ? `${words} (${hit.unit})` : words
}

/** Bornes de slider déduites du suffixe et de la valeur par défaut. `null` = champ libre. */
export function autoRange(path: string, def: number): { min: number; max: number; step: number } | null {
  if (!Number.isFinite(def) || def < 0) return null
  const key = path.split(SEP).pop() ?? path
  const range = SUFFIXES.find((s) => s.re.test(key))?.range
  if (!range) return null
  const [min, max, step] = range(def)
  return { min, max, step }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feuilles
// ─────────────────────────────────────────────────────────────────────────────

export type Leaf = {
  /** Chemin pointé dans `MapConfig` — sert aussi de clé du modèle bindé. */
  path: string
  kind: LeafKind
  meta: LeafMeta
  /** Valeur de `defaultConfig`, ou `undefined` pour une clé optionnelle absente. */
  def: unknown
}

/** Nœud d'arborescence : un dossier du panneau, ou une feuille. */
export type ConfigNode = { kind: 'folder'; path: string; children: ConfigNode[] } | { kind: 'leaf'; leaf: Leaf }

function kindOf(value: unknown, meta: LeafMeta): LeafKind {
  if (meta.kind) return meta.kind
  if (Array.isArray(value)) return typeof value[0] === 'number' ? 'csvNumber' : 'csvString'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (meta.options) return 'list'
  return 'string'
}

/**
 * Arborescence des contrôleurs, déduite de `defaultConfig`.
 *
 * Les clés optionnelles du type (`routing.units`, `places.headers`) n'y sont PAS —
 * elles n'ont pas de valeur par défaut à parcourir. `CONFIG_META` les réintroduit
 * via `extra`, insérées dans le dossier de leur parent.
 */
export function buildTree(): ConfigNode[] {
  const extrasByParent = new Map<string, string[]>()
  for (const [path, meta] of Object.entries(CONFIG_META)) {
    if (meta.extra === undefined || path.endsWith('.*')) continue
    const parent = path.slice(0, path.lastIndexOf(SEP))
    extrasByParent.set(parent, [...(extrasByParent.get(parent) ?? []), path])
  }

  const walk = (node: Record<string, unknown>, prefix: string): ConfigNode[] => {
    const out: ConfigNode[] = []
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}${SEP}${key}` : key
      const meta = metaFor(path)
      // Un objet SANS `kind` imposé est un dossier ; avec (`accel`), c'est une feuille.
      if (isRecord(value) && !meta.kind) {
        out.push({ kind: 'folder', path, children: walk(value, path) })
      } else {
        out.push({ kind: 'leaf', leaf: { path, kind: kindOf(value, meta), meta, def: value } })
      }
    }
    for (const path of extrasByParent.get(prefix) ?? []) {
      const meta = metaFor(path)
      out.push({ kind: 'leaf', leaf: { path, kind: kindOf(undefined, meta), meta, def: undefined } })
    }
    return out
  }

  return walk(defaultConfig as unknown as Record<string, unknown>, '')
}

/** Toutes les feuilles à plat, dans l'ordre de l'arbre. */
export function flattenLeaves(nodes: readonly ConfigNode[]): Leaf[] {
  return nodes.flatMap((n) => (n.kind === 'leaf' ? [n.leaf] : flattenLeaves(n.children)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Encodage — valeur de config ↔ valeur affichée par le panneau
// ─────────────────────────────────────────────────────────────────────────────

type Accel = { key: string; mod?: 'mod' | 'ctrl' | 'meta'; shift?: boolean }

const isMod = (s: string): s is 'mod' | 'ctrl' | 'meta' => s === 'mod' || s === 'ctrl' || s === 'meta'

function encodeAccel(value: unknown): string {
  if (!isRecord(value) || typeof value['key'] !== 'string') return NONE
  const { key, mod, shift } = value as Accel
  return [mod, shift ? 'shift' : undefined, key].filter(Boolean).join('+')
}

function decodeAccel(raw: string): Accel | false {
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  const key = parts.pop()
  if (!key) return false
  const lower = parts.map((p) => p.toLowerCase())
  const mod = lower.find(isMod)
  const accel: Accel = { key }
  if (mod) accel.mod = mod
  if (lower.includes('shift')) accel.shift = true
  return accel
}

/** Valeur de config → valeur bindée par Tweakpane (toujours un scalaire). */
export function encodeLeaf(leaf: Leaf, value: unknown): number | boolean | string {
  switch (leaf.kind) {
    case 'number':
      return typeof value === 'number' ? value : 0
    case 'boolean':
      return value === true
    case 'accel':
      return encodeAccel(value)
    case 'key':
      return typeof value === 'string' ? value : NONE
    case 'csvNumber':
    case 'csvString':
      return Array.isArray(value) ? value.join(', ') : NONE
    case 'json':
      return isRecord(value) ? JSON.stringify(value) : NONE
    case 'optionalList':
      return typeof value === 'string' ? value : UNSET
    default:
      return typeof value === 'string' ? value : String(value ?? '')
  }
}

/**
 * Valeur bindée → valeur de config. `undefined` = clé à NE PAS écrire (optionnelle
 * laissée au défaut, ou JSON invalide qu'on refuse plutôt que d'écrire un objet faux).
 */
export function decodeLeaf(leaf: Leaf, raw: unknown): unknown {
  switch (leaf.kind) {
    case 'accel':
      return typeof raw === 'string' ? decodeAccel(raw) : false
    case 'key':
      return typeof raw === 'string' && raw.length > 0 ? raw : false
    case 'csvNumber': {
      if (typeof raw !== 'string') return leaf.def
      const nums = raw
        .split(',')
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isFinite(n))
      // Une saisie en cours (« 100, ») ne doit pas amputer le tableau appliqué.
      return nums.length > 0 ? nums : leaf.def
    }
    case 'csvString':
      return typeof raw === 'string'
        ? raw
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : leaf.def
    case 'json': {
      if (typeof raw !== 'string' || raw.trim() === '') return undefined
      try {
        const parsed: unknown = JSON.parse(raw)
        return isRecord(parsed) ? parsed : undefined
      } catch {
        return undefined
      }
    }
    case 'optionalList':
      return raw === UNSET ? undefined : raw
    default:
      return raw
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modèle bindé ↔ PartialConfig
// ─────────────────────────────────────────────────────────────────────────────

/** Ce que Tweakpane binde : un objet PLAT dont les clés sont les chemins. */
export type FlatModel = Record<string, number | boolean | string>

/** Modèle initial : les valeurs en vigueur (défauts + overrides déjà appliqués). */
export function flatFromConfig(leaves: readonly Leaf[], config: MapConfig): FlatModel {
  const flat: FlatModel = {}
  for (const leaf of leaves) {
    const current = getAt(config, leaf.path)
    flat[leaf.path] = encodeLeaf(leaf, current === undefined ? leaf.meta.extra : current)
  }
  return flat
}

/**
 * Modèle → `PartialConfig` MINIMAL : seules les feuilles qui s'écartent de
 * `defaultConfig` sont écrites.
 *
 * C'est ce que la carte reçoit, ce que le presse-papier exporte et ce que le stockage
 * garde — un seul objet pour les trois, parce que c'est exactement la forme qu'une
 * application colle dans `config={{ … }}`.
 */
export function partialFromFlat(leaves: readonly Leaf[], flat: FlatModel): PartialConfig {
  const out: Record<string, unknown> = {}
  for (const leaf of leaves) {
    const value = decodeLeaf(leaf, flat[leaf.path])
    if (value === undefined || sameValue(value, leaf.def)) continue
    setAt(out, leaf.path, value)
  }
  return out as PartialConfig
}

/**
 * Recopie les nœuds du CHEMIN seulement (partage structurel du reste), écrit la valeur,
 * et retire la clé — puis les dossiers devenus vides — quand `value` est `undefined`.
 */
function writePath(node: Record<string, unknown>, keys: readonly string[], i: number, value: unknown): typeof node {
  const key = keys[i]!
  const copy = { ...node }
  if (i === keys.length - 1) {
    if (value === undefined) delete copy[key]
    else copy[key] = value
    return copy
  }
  const child = copy[key]
  const next = writePath(isRecord(child) ? child : {}, keys, i + 1, value)
  if (Object.keys(next).length === 0) delete copy[key]
  else copy[key] = next
  return copy
}

/**
 * Écrit UNE feuille dans un partiel déjà construit, sans reparcourir les 199 autres.
 *
 * C'est le chemin chaud du panneau : un glissé de slider émet à chaque `pointermove`,
 * parce qu'on règle POUR voir la carte suivre. Repasser `partialFromFlat` à ce
 * rythme-là, c'est 199 décodages et autant de comparaisons structurelles par frame, sur
 * le thread qui rend la 3D — soit fausser la fluidité qu'on est en train de juger.
 *
 * Une feuille revenue à son défaut RETIRE sa clé : le partiel reste minimal, donc
 * toujours exactement ce qu'une application collerait dans `config={{ … }}`.
 */
export function withLeaf(partial: PartialConfig, leaf: Leaf, raw: unknown): PartialConfig {
  const value = decodeLeaf(leaf, raw)
  const drop = value === undefined || sameValue(value, leaf.def)
  return writePath(
    partial as Record<string, unknown>,
    leaf.path.split(SEP),
    0,
    drop ? undefined : value,
  ) as PartialConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clé PROPRE À LA DÉMO, volontairement distincte des `data.storageKeys` de la lib :
 * ce n'est pas la carte qui écrit ici, c'est le banc de réglages autour d'elle.
 */
// Suffixe de version : ce qu'on relit est un `PartialConfig`, dont la forme suit
// `MapConfig` et bouge donc à chaque évolution de la lib. Sans version, une entrée écrite
// par une ancienne forme est réinjectée telle quelle dans le merge — au mieux ignorée, au
// pire elle réintroduit une clé qui n'existe plus. Incrémenter le suffixe ABANDONNE le
// stockage ancien au lieu de le charger.
const CONFIG_STORAGE_KEY = 'm3d:demo-config:v1'

/**
 * La valeur stockée a-t-elle la NATURE attendue pour cette feuille ?
 *
 * `isRecord` ne dit que « c'est un objet » : il laissait passer un partiel écrit par une
 * version antérieure du schéma, une clé renommée depuis dans `MapConfig`, ou un
 * stockage trafiqué — et cette valeur partait telle quelle dans `<Map config>`.
 */
function matchesLeaf(leaf: Leaf, value: unknown): boolean {
  switch (leaf.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'key':
      return value === false || typeof value === 'string'
    case 'accel':
      return value === false || (isRecord(value) && typeof value['key'] === 'string')
    case 'csvNumber':
      return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v))
    case 'csvString':
      return Array.isArray(value) && value.every((v) => typeof v === 'string')
    case 'json':
      return isRecord(value)
    case 'list':
    case 'optionalList':
      // Un choix fermé : une valeur hors liste rendrait un contrôleur vide et une
      // requête au fournisseur avec un paramètre qu'il ne connaît pas.
      return typeof value === 'string' && Object.values(leaf.meta.options ?? {}).includes(value)
    default:
      return typeof value === 'string'
  }
}

/**
 * Réglages du dernier montage, RECONSTRUITS feuille à feuille à partir du schéma.
 *
 * Le stockage n'est pas une source sûre — il survit aux versions et rien n'empêche un
 * tiers d'écrire cette clé. Ce qui n'est plus un chemin de `MapConfig`, ou qui n'a pas
 * la nature de sa feuille, est écarté : sans ce filtre, une valeur mal formée pouvait
 * faire échouer le montage de la carte, et le bouton « Tout réinitialiser » vit DANS le
 * panneau — donc derrière la panne, avec pour seule issue de vider le stockage à la main.
 */
export function loadStoredPartial(): PartialConfig {
  let parsed: unknown
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    return {}
  }
  if (!isRecord(parsed)) return {}

  const out: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const leaf of flattenLeaves(buildTree())) {
    const value = getAt(parsed, leaf.path)
    if (value === undefined) continue
    if (matchesLeaf(leaf, value)) setAt(out, leaf.path, value)
    else dropped.push(leaf.path)
  }
  // Les chemins qui ne sont PLUS des feuilles de `MapConfig` ne sont pas parcourus, donc
  // oubliés sans bruit ; seules les valeurs d'une nature inattendue méritent d'être dites.
  if (dropped.length > 0) console.warn('[config] réglages stockés ignorés (type inattendu) :', dropped)
  return out as PartialConfig
}

/** Oublie les réglages stockés. Utilisé par la trappe de secours (cf. `MapErrorBoundary`). */
export function clearStoredPartial(): void {
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY)
  } catch {
    // Cf. `storePartial` : sans persistance, la démo doit rester utilisable.
  }
}

export function storePartial(partial: PartialConfig): void {
  try {
    if (Object.keys(partial).length === 0) localStorage.removeItem(CONFIG_STORAGE_KEY)
    else localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(partial))
  } catch {
    // Mode privé, quota plein : le panneau doit rester utilisable sans persistance.
  }
}
