// ① providers — fournisseurs tiers, réseau, caches.

import type { ApplyDefault, TemplateCategory } from '../../core/templates/types'
import type { FetchPolicy } from './common'

/**
 * `'auto'` = déduit de l'environnement au moment de l'appel (`navigator.language`),
 * jamais figé au chargement du module : la lib doit rester utilisable en SSR, où
 * `navigator` n'existe pas.
 */
export type AutoLocale = 'auto' | (string & {})

/** Fond de carte 2D demandé au fournisseur de tuiles. */
export type TileMapType = 'roadmap' | 'satellite' | 'terrain'

/**
 * D'où viennent les tuiles du fond de carte.
 *
 * - `'external'` — Google Map Tiles : session signée (`createSession`), clé d'API
 *   obligatoire, calque trafic disponible. C'est le défaut, et le seul comportement
 *   qui existait.
 * - `'internal'` — serveur de tuiles auto-hébergé : simples URLs XYZ sur
 *   `origin`, ni session ni clé ni quota, **pas de trafic sur ses propres tuiles** (le
 *   calque trafic est une propriété de la tuile Google, pas une surcouche — il ne s'obtient
 *   qu'en empruntant Google, cf. `trafficViaExternal`). Le volume (mode `'3d'`) vient
 *   alors du relief et des bâtiments (cf. `providers.terrain` / `providers.buildings`)
 *   et non des tuiles 3D photoréalistes.
 *
 * Les deux fournisseurs n'offrent donc pas les mêmes options : le moteur en publie les
 * capacités dans `BasemapState`, et l'UI n'affiche que les boutons qui ont un sens.
 */
export type TileProvider = 'external' | 'internal'

/**
 * Le serveur de tuiles auto-hébergé, commun au fond 2D et au volume.
 *
 * Nœud à part parce que son origine ne sert PAS qu'aux tuiles 2D : le raster, les
 * bâtiments extrudés (et demain le relief) sortent du même serveur. La ranger sous
 * `providers.tiles` la faisait passer pour un réglage du seul fond de carte.
 */
export type InternalServerConfig = {
  /**
   * Origine du serveur (schéma + hôte + port, sans `/` final), substituée à `{origin}`
   * dans tous les gabarits internes : c'est la SEULE valeur à changer entre un poste de
   * dev et la production.
   *
   * ⚠️ Le défaut désigne le serveur du projet. Un hôte tiers **doit** y mettre le sien —
   * ou choisir les fournisseurs `'external'`. Vide, les fournisseurs `'internal'` restent
   * sans effet plutôt que d'émettre des requêtes vers une origine inventée.
   */
  origin: string
  /**
   * Écart d'altitude du sol (m) en deçà duquel le fond raster et les volumes ne sont PAS
   * reconstruits.
   *
   * L'altitude est intégrée à la géométrie des deux calques : la suivre au centimètre
   * rejouerait tout le cache à chaque frame. Réglage commun aux deux, puisqu'ils doivent
   * partager exactement la même référence — sinon les bâtiments flottent au-dessus du
   * raster, ou s'y enfoncent. ⚠️ Était un littéral (1 m) recopié dans les deux calques.
   */
  elevationEpsilon: number
}

/**
 * Budgets d'éviction communs aux caches de tuiles (fond raster, volumes).
 *
 * ⚠️ `maxBytes` est le seul plafond qui borne vraiment la mémoire : entre une tuile de
 * campagne et une tuile de centre-ville, ce que pèse une tuile de volume varie d'un
 * facteur cent, si bien qu'un plafond exprimé en NOMBRE de tuiles laissait passer des
 * centaines de mégaoctets là où il fallait protéger — et bridait là où il n'y avait rien
 * à protéger. Les deux cohabitent : le plus contraignant gagne.
 */
export type TileCacheBudget = {
  /** Plafond du nombre de tuiles en cache. */
  maxTiles: number
  /** Plafond de la mémoire retenue par les tuiles montées (octets). `0` = illimité. */
  maxBytes: number
  /**
   * Une frame sur N déclenche le tri d'éviction, qui alloue et coûte O(n log n) : rester
   * au-dessus du plafond le rejouerait sinon à chaque frame, pour évincer une tuile ou
   * deux. ⚠️ Était un littéral (10) dans les deux calques.
   */
  evictEvery: number
  /**
   * Dépassement (en tuiles) au-delà duquel l'éviction est forcée sans attendre son tour,
   * pour borner le pic de mémoire. ⚠️ Était un littéral, et divergent d'un calque à
   * l'autre (200 pour le raster, 16 pour les volumes).
   */
  evictSlack: number
  /**
   * Tuiles montées dans la scène par frame au plus.
   *
   * Le montage (couleurs développées, arbre de collision POSÉ, tampons envoyés au GPU) est
   * la seule part du travail qui reste sur le thread principal. Plusieurs chargements qui
   * aboutissent dans la même frame y additionnent leur coût ; étalés, chaque frame n'en
   * paie qu'une part.
   *
   * ⚠️ Ce coût s'est effondré. L'arbre de collision valait à lui seul ~41 ms par tuile de
   * volume dense — 97 % du montage — et il est désormais construit côté worker : le poser
   * coûte ~0,05 ms, et développer les couleurs ~1 ms. Ce qui reste non mesuré, et qui
   * justifie de ne pas ouvrir ce budget en grand, c'est l'upload GPU des tampons.
   */
  mountPerFrame: number
}

export type TilesConfig = {
  /** Fournisseur des tuiles du fond de carte — cf. `TileProvider`. */
  provider: TileProvider
  /**
   * Gabarit d'URL d'une tuile raster interne — `{origin}`, `{style}`, `{z}`, `{x}`,
   * `{y}` et `{r}` (cf. `retina`) sont substitués. Aucune query n'est ajoutée : le
   * serveur interne ne signe rien.
   */
  internalTileUrl: string
  /** Nom du style rendu par le serveur interne, substitué à `{style}`. */
  style: string
  /**
   * Demander les tuiles internes en double densité (`{r}` → `@2x`).
   *
   * Défaut `false` : le canvas suit `performance.pixelRatio` (1 par défaut), où une
   * tuile @2x quadruple les octets sans rien ajouter à l'écran. À passer à `true` avec
   * un `pixelRatio` supérieur à 1.
   */
  retina: boolean
  /**
   * Niveau de base, toujours chargé, qui couvre le globe entier — c'est lui qui garantit
   * l'absence de trou pendant que les niveaux fins arrivent. ⚠️ Était codé en dur (2).
   */
  baseZoom: number
  /**
   * Prolonge le fond tuilé jusqu'aux pôles (défaut `true`).
   *
   * Web Mercator ne peut pas les atteindre — la projection les envoie à l'infini et la
   * pyramide s'arrête à ±85,0511°. Il restait donc une calotte d'environ 5° de latitude
   * (~550 km de rayon) sans aucune tuile, où affleurait la sphère de repli : un disque de
   * couleur d'océan au beau milieu de l'Antarctique.
   *
   * Activé, les tuiles de la rangée extrême portent une ligne de sommets supplémentaire
   * posée AU pôle, avec la coordonnée de texture du bord : la dernière ligne de texels est
   * étirée jusqu'au bout, sans requête ni texture en plus. À couper si vous préférez voir
   * franchement la limite réelle de la donnée.
   */
  fillPoles: boolean
  /**
   * Zoom de tuile maximal demandé. ⚠️ Était codé en dur (22, plafond de Google roadmap) :
   * un serveur interne dont le style s'arrête plus tôt réclamait des niveaux inexistants.
   */
  maxZoom: number
  /**
   * Côté (en tuiles) de l'anneau demandé à chaque niveau INTERMÉDIAIRE de la cascade de
   * détail, autour du point visé. Impair de préférence : l'anneau est centré.
   *
   * ⚠️ Nouveau, et il corrige un défaut visible. Le calque ne connaissait que DEUX
   * niveaux — la base et un niveau cible, rabaissé jusqu'à ce que son compte de tuiles
   * tienne sur l'emprise entière. En vue inclinée, l'emprise porte jusqu'à l'horizon : le
   * niveau cible s'effondrait vers la base, et le lointain tombait d'un coup sur une tuile
   * grande comme un quart de continent — un aplat vert uniforme, qui se lisait comme un
   * bug d'affichage.
   *
   * La cascade comble désormais chaque cran par un anneau dont la portée DOUBLE à mesure
   * qu'on grossit. `5` couvre confortablement l'écart d'un niveau au suivant (le niveau
   * plus fin en occupe déjà le quart central) ; monter au-delà ne fait que payer des
   * tuiles redondantes.
   */
  lodRing: number
  /**
   * Langue des libellés gravés dans les tuiles. `'auto'` suit le navigateur.
   *
   * ⚠️ Codé en dur sur `'fr-FR'` jusqu'ici : la carte affichait des noms français
   * quelle que soit la locale de l'application.
   */
  language: AutoLocale
  /**
   * Biais régional (tracé des frontières contestées, toponymie). `'auto'` laisse le
   * fournisseur déduire. ⚠️ Codé en dur sur `'FR'` jusqu'ici.
   */
  region: AutoLocale
  /** Fond de carte 2D demandé au fournisseur. */
  mapType: TileMapType
  /**
   * En fournisseur `'internal'`, **emprunter** le fond Google le temps du trafic (défaut
   * `true`, sans effet en `'external'`).
   *
   * Le trafic n'est pas une surcouche transparente qu'on poserait sur n'importe quel fond :
   * c'est un `layerTypes` gravé DANS la tuile Google. Le proposer en interne revient donc à
   * changer de fournisseur — le bouton reste offert dès qu'une clé (`<Map
   * googleMapsApiKey>`) est là, l'allumer bascule le fond sur Google, l'éteindre revient au
   * serveur interne. Le cache est vidé de part et d'autre : ce sont deux jeux de tuiles.
   *
   * ⚠️ Ce que ça engage : le fond CHANGE d'aspect (style Google, pas le vôtre) et les
   * tuiles redeviennent facturées le temps que le trafic est allumé. `false` rend le
   * comportement d'origine — pas de trafic hors fournisseur externe, bouton masqué.
   */
  trafficViaExternal: boolean
  /** Calques additionnels demandés à la session de tuiles. */
  layerTypes: readonly string[]
  /** Endpoint de création de session de tuiles. */
  sessionUrl: string
  /** Gabarit d'URL de tuile — `{z}`, `{x}`, `{y}` et `{session}` sont substitués. */
  tileUrl: string
  /** Attente après un refus d'identité (clé invalide, quota) avant de réessayer. */
  backoffAuthMs: number
  /** Attente après une panne transitoire (5xx, réseau). */
  backoffTransientMs: number
  /** Téléchargements simultanés. */
  maxInflight: number
  /** Anneau de tuiles préchargées autour du viewport. */
  margin: number
  /** Budget de tuiles demandées pour le niveau de zoom cible. */
  maxRequest: number
  /** Essais par tuile avant abandon définitif. */
  maxAttempts: number
  /** Backoff entre deux essais d'une même tuile. */
  retryDelays: readonly number[]
  /**
   * Demander UN SEUL niveau de détail sur toute l'emprise (celui qui la couvre dans le budget
   * `maxRequest`) au lieu de la cascade d'anneaux fins autour du point visé. La cascade
   * concentre le détail en une **boîte** au centre, grossière autour. Uniforme = même niveau
   * partout, jamais de boîte partielle — le zoom au point visé décide déjà de la finesse, à
   * plat comme en vue inclinée. Relever `maxRequest` étend la portée du niveau fin (plus de
   * RAM). La cascade n'est gardée qu'en **marche** (piéton), où le gradient près→loin à
   * hauteur d'homme est voulu. `false` = cascade partout (comportement d'origine).
   */
  uniformDetail: boolean
  /**
   * Écart de zoom toléré, en crans, entre ce que réclame le sol REGARDÉ et ce que la vue
   * entière permet, avant que `uniformDetail` ne cède la place à la cascade.
   *
   * ⚠️ Un niveau uniforme prend nécessairement celui qu'impose le point le plus LOINTAIN, et
   * le premier plan en hérite. À plat les deux sont du même ordre : l'écart est nul et
   * `uniformDetail` joue son rôle, qui est d'éviter une boîte de détail au centre de l'écran.
   * En vue rasante le rapport explose — mesuré à 73 m d'altitude et 73° d'inclinaison,
   * l'emprise s'étale sur 6,3 × 12,5 km quand le sol regardé est à 73 m, et le niveau tombait
   * à des tuiles de 805 m, onze fois la hauteur de l'œil : sol flou et étiquettes géantes.
   *
   * `1` tolère un cran (invisible) et bascule au-delà. `0` = cascade dès le moindre écart ;
   * une valeur très haute revient à l'ancien comportement, uniforme quoi qu'il arrive.
   */
  uniformMaxSpread: number
} & TileCacheBudget

export type RoutingCacheConfig = {
  /** Durée de vie d'une réponse de routage. */
  ttlMs: number
  /** Quantification des positions dans la clé de cache (tolérance de dérive). */
  cellMeters: number
  /** Plafond d'entrées avant éviction LRU. */
  maxEntries: number
}

/** Paliers proposés par le menu de relations — 💰 ils décident du volume facturé. */
export type RoutingPresets = {
  /** « Les N plus rapides » ; chaque palier coûte `N × fastestOversample` cases de matrice. */
  fastest: readonly number[]
  /**
   * Rayons de sélection, **en mètres** — l'unité de base, comme partout.
   *
   * Ils sont AFFICHÉS via `labels.measure`, donc un jeu impérial les rend en miles
   * sans rien changer ici. Mais les paliers eux-mêmes restent métriques : 500 m,
   * 1 km, 3 km donnent « 0.3 mi », « 0.6 mi », « 1.9 mi » — exacts mais bizarres à
   * lire. Un contexte impérial veut ses propres paliers ronds :
   * `[402.336, 804.672, 3218.688]` (¼, ½, 2 miles).
   */
  radius: readonly number[]
}

export type RoutingConfig = FetchPolicy & {
  /** Endpoint `computeRouteMatrix` — à viser sur un proxy serveur en production. */
  matrixUrl: string
  /** Endpoint `computeRoutes`. */
  routesUrl: string
  /**
   * Candidats interrogés par lien affiché, en multiple du nombre demandé.
   *
   * 💰 **Multiplie directement la matrice facturée** : demander les 5 plus rapides
   * en interroge 15. Le sur-échantillonnage sert à ce que les N plus rapides *en
   * temps* soient choisis parmi assez de candidats *en distance* — le plus proche
   * à vol d'oiseau n'est pas le plus rapide en voiture.
   */
  fastestOversample: number
  /**
   * Dérive (m) d'une extrémité au-delà de laquelle temps et tracé sont refaits.
   * 💰 Plus la valeur est basse, plus on rappelle le fournisseur.
   */
  staleMeters: number
  /** Intervalle minimal entre deux recalculs d'une même relation. 💰 Plafond de débit. */
  refreshIntervalMs: number
  presets: RoutingPresets
  /**
   * En-têtes supplémentaires. Requis pour viser un **proxy serveur** (le cas annoncé
   * par `RoutingProvider`) : `X-Goog-Api-Key` ne convient pas à un backend qui attend
   * un `Authorization`. Fusionnés avec ceux du fournisseur, et prioritaires.
   */
  headers?: Readonly<Record<string, string>>
  /**
   * Système d'unités des textes renvoyés. Absent = déduit de `languageCode` par le
   * fournisseur, ce qui était le seul comportement possible jusqu'ici.
   */
  units?: 'METRIC' | 'IMPERIAL'
  /** FieldMask de la matrice — 💰 conditionne directement la facturation Google. */
  matrixFields: string
  /** FieldMask d'un itinéraire — 💰 idem. */
  routeFields: string
  /** Qualité de routage demandée — 💰 `TRAFFIC_AWARE_OPTIMAL` est le palier le plus cher. */
  routingPreference: string
  /** 🌍 Langue des textes renvoyés. `'auto'` suit le navigateur. */
  languageCode: AutoLocale
  /** 🌍 Biais régional. `'auto'` laisse le fournisseur déduire. */
  regionCode: AutoLocale
  /** Demander plusieurs itinéraires (seul le plus rapide est tracé aujourd'hui). */
  alternatives: boolean
  cache: RoutingCacheConfig
}

export type PlacesConfig = FetchPolicy & {
  /** Endpoint `places:searchText`. */
  url: string
  /** FieldMask — 💰 conditionne la facturation Places. */
  fields: string
  /**
   * En-têtes supplémentaires, mêmes usage et priorité que `RoutingConfig.headers` :
   * viser un **proxy serveur** pour ne pas exposer la clé côté client. Sans eux, `url`
   * pouvait bien désigner un backend, mais aucun moyen de s'y authentifier — le
   * scénario était ouvert pour le routage et fermé pour la recherche.
   */
  headers?: Readonly<Record<string, string>>
  /** Nombre de résultats demandés (borné à `pageSizeRange` par le fournisseur). */
  pageSize: number
  /** Bornes acceptées par l'API pour `pageSize`. */
  pageSizeRange: readonly [number, number]
  /** 🌍 Langue des résultats. `'auto'` suit le navigateur. */
  languageCode: AutoLocale
  /** 🌍 Biais régional des résultats. */
  regionCode: AutoLocale
}

export type SymbolsProviderConfig = {
  /** Plafond du cache de vignettes rendues. ⚠️ Non borné jusqu'ici. */
  cacheMaxEntries: number
}

/** D'où vient le volume (mode `'3d'`). */
export type Tiles3dConfig = {
  /**
   * Fournisseur du relief et du bâti :
   *
   * - `'external'` — tuiles 3D photoréalistes (Cesium Ion, ou Google en direct), selon le
   *   token/la clé passés à `<Map>`. C'est le défaut.
   * - `'internal'` — relief et bâtiments reconstruits depuis le serveur auto-hébergé
   *   (cf. `providers.terrain` / `providers.buildings`). Aucun tileset photoréaliste
   *   n'est alors monté : rien n'est streamé ni facturé chez le fournisseur externe.
   *
   * Indépendant de `providers.tiles.provider` : un fond 2D auto-hébergé peut cohabiter
   * avec un volume photoréaliste, et l'inverse.
   *
   * Modifiable à chaud : le réglage commande la visibilité et le pilotage du tileset
   * photoréaliste, pas son enregistrement. Un tileset gelé n'émet aucune requête, donc
   * `'internal'` ne fait rien facturer même quand un token est configuré.
   */
  provider: TileProvider
  /**
   * Asset Cesium Ion servi par défaut (Google Photorealistic 3D Tiles).
   *
   * ⚠️ L'identifiant était écrit dans le moteur et répété dans DEUX blocs de
   * documentation : trois copies d'une valeur qui désigne un fournisseur, seule de
   * son espèce à vivre hors de `providers`.
   */
  cesiumIonAssetId: string
  /**
   * Masque les bâtiments internes au-dessus de `providers.buildings.maxViewAltitude` : de
   * plus haut ils ne couvrent que quelques pixels et leur chargement borné laisse un
   * « carré » dans le vide. Ils sont alors fondus puis masqués — mais **gardés en mémoire**
   * tant qu'on reste dans la bande de `requestAltitudeFactor`, sans quoi l'apparition
   * repartirait d'un cache vide et surgirait au lieu de fondre. La RAM/VRAM n'est rendue
   * qu'au-dessus de cette bande. Le critère est une hauteur au-dessus du sol, donc **valable
   * à toute inclinaison**. **Le mode ne change pas** (on reste en `'3d'`).
   * `false` = bâtiments toujours affichés. Interne seulement.
   */
  hideVolumeWhenClamped: boolean
  /** Durée du fondu d'opacité des bâtiments à l'apparition/disparition (ms). `0` = net. */
  volumeFadeMs: number
}

/**
 * Bâtiments extrudés depuis les tuiles vectorielles du serveur interne — le volume du
 * fournisseur `'internal'` (cf. `Tiles3dConfig.provider`), qui remplace là les tuiles 3D
 * photoréalistes.
 *
 * Pas de drapeau d'activation : `providers.tiles3d.provider` dit déjà d'où vient le
 * volume. Un second interrupteur ne pourrait que le contredire — et donner un mode `'3d'`
 * sans rien à l'écran.
 */
export type BuildingsConfig = {
  /** Gabarit d'URL d'une tuile vectorielle — `{origin}`, `{z}`, `{x}`, `{y}` substitués. */
  tileUrl: string
  /** Couche du schéma OpenMapTiles portant les emprises. */
  sourceLayer: string
  /** Attribut de hauteur totale (m au-dessus du sol). */
  heightField: string
  /** Attribut de hauteur de base — un porche, un bâtiment sur pilotis ne partent pas de 0. */
  minHeightField: string
  /** Attribut booléen excluant une emprise de l'extrusion. */
  hideField: string
  /** Attribut de couleur propre à l'emprise ; à défaut, le thème décide. */
  colorField: string
  /** Hauteur (m) retenue quand l'attribut manque — une emprise sans hauteur reste visible. */
  defaultHeight: number
  /**
   * Hauteur (m) maximale retenue. Au-delà, l'emprise est ramenée à cette borne.
   *
   * ⚠️ Nouveau : la hauteur venait BRUTE de la donnée. Une erreur de saisie OSM courante
   * (`height=99999`) produisait un bâtiment de cent kilomètres — dont le volume englobant
   * gardait la tuile visible en permanence, déséquilibrait son arbre de collision, et
   * arrêtait la caméra sur un fantôme.
   */
  maxHeight: number
  /**
   * Format des positions transmises au GPU.
   *
   * - `'int16'` (défaut) — coordonnées entières normalisées sur l'étendue de la tuile,
   *   soit ~4 cm de résolution : sous la précision de la donnée OSM, et sous le pixel à
   *   toute distance utile. **Deux fois moins d'octets** que `'float32'` sur le plus gros
   *   tampon, en mémoire vive comme à l'upload.
   * - `'float32'` — repli, pour un cas d'usage qui exigerait mieux que le centimètre.
   */
  positionPrecision: 'int16' | 'float32'
  /** Zoom des tuiles demandées : le `maxzoom` des données (14 en OpenMapTiles). */
  zoom: number
  /**
   * Hauteur maximale AU-DESSUS DU SOL (m) à laquelle les bâtiments restent affichés.
   * Au-delà, ils sont fondus, masqués et détruits (cf. `tiles3d.hideVolumeWhenClamped`).
   *
   * ⚠️ Remplace `minViewZoom`/`showZoomOffset`, exprimés en zoom de vue. Le zoom se déduit
   * d'une résolution m/px, donc d'une division par la hauteur du viewport : le seuil glissait
   * d'un facteur 2 entre une fenêtre de 700 px et une de 1 440 px (bâtiments encore affichés
   * à 15 km sur l'une, 31 km sur l'autre). Une altitude ne dépend ni de la fenêtre ni de la
   * latitude.
   */
  maxViewAltitude: number
  /**
   * Bande de préchargement au-dessus de `maxViewAltitude`, en multiple de celle-ci : les
   * tuiles y sont téléchargées et extrudées sans être montrées, pour que la descente ne
   * les découvre pas à faire. `1` supprime la bande — l'affichage arrive alors par
   * à-coups.
   *
   * ⚠️ Ce qu'elle masque a changé de nature : le montage ne coûte plus ~41 ms (l'arbre est
   * construit côté worker, cf. `workerPoolSize`) mais ~1 ms. Ce n'est donc plus un gel
   * qu'elle absorbe, c'est la LATENCE du pipeline — téléchargement et extrusion compris.
   */
  requestAltitudeFactor: number
  /**
   * Portée maximale (m) de l'emprise servie aux bâtiments : au-delà, rien n'est demandé ni
   * montré, le fond raster reste seul.
   *
   * ⚠️ C'est la borne qui rend la couverture CONTINUE en vue inclinée. Sans elle, l'emprise
   * venait d'une grille de rayons dont ceux qui franchissent l'horizon étaient ignorés :
   * portée en dents de scie entre 2,8 et 36,3 km, deux effondrements brutaux (59°, 74°), et
   * de 8 à 1 058 tuiles demandées pour la même altitude. Cf. `core/math.clampRange`.
   *
   * Monter la portée se paie en RAM : le pic de tuiles croît en n² (24 tuiles à 6 km, 40 à
   * 8 km), donc `maxTiles`/`maxBytes` doivent suivre.
   */
  maxViewDistance: number
  /** Anneau de tuiles préchargées autour du viewport. */
  margin: number
  /** Téléchargements simultanés. */
  maxInflight: number
  /**
   * Workers d'extrusion tournant en parallèle.
   *
   * ⚠️ Nouveau, et c'est le pendant obligé de l'arbre de collision construit côté worker
   * (cf. `buildTile`) : une tuile dense y coûte désormais ~60 ms au lieu de ~19, et un fil
   * unique les sérialiserait. Mesuré sur 24 tuiles z14 parisiennes — 1430 ms à un worker,
   * 775 ms à deux, 587 ms à trois, 559 ms à quatre, puis plus rien, et une RÉGRESSION à
   * huit (591 ms) : au-delà du plateau, les workers se disputent la mémoire et chacun
   * retient plusieurs mégaoctets de tuile en vol.
   *
   * Le pool se borne de lui-même au nombre de cœurs moins un (il en laisse un au thread
   * principal) et à un plafond interne. `1` retrouve le comportement d'un worker unique ;
   * `0` est ramené à 1 — pour tout mettre sur le thread principal, il n'y a pas de
   * réglage, c'est le repli automatique des environnements sans `Worker`.
   *
   * ⚠️ Ne sert à rien au-delà de `maxInflight` : la file ne lance pas plus de
   * téléchargements que ça, donc les workers en trop resteraient oisifs.
   */
  workerPoolSize: number
  /** Budget de tuiles demandées pour une vue. */
  maxRequest: number
  /** Essais par tuile avant abandon définitif. */
  maxAttempts: number
  /** Backoff entre deux essais d'une même tuile. */
  retryDelays: readonly number[]
  /**
   * Attributs MVT remontés par le pick de bâtiment (`buildingMenu`). **Vide par défaut** :
   * la donnée en porte des dizaines par emprise, et les transporter toutes coûterait, par
   * tuile, plus que toute la géométrie. L'hôte demande ce qu'il affiche.
   */
  pickFields: readonly string[]
} & TileCacheBudget

/**
 * Gestionnaire de templates (sauvegardes de dessin). Valeurs pures uniquement — le
 * `TemplateProvider` async, lui, est injecté en prop du panneau (comme les autres
 * fournisseurs), jamais dans la config. `baseUrl:''` = pas d'API, localStorage seul.
 */
export type TemplatesConfig = {
  /** Racine de l'API REST des templates. Vide = pas de backend (cache local seul). */
  baseUrl: string
  /** En-têtes du provider HTTP par défaut (auth d'un proxy serveur). */
  headers: Readonly<Record<string, string>>
  fetch: FetchPolicy
  /** Catégories de DESSIN offertes à la sauvegarde — réglable, jamais en dur dans l'UI. */
  categories: readonly TemplateCategory[]
  /** Catégories cochées par défaut dans le formulaire « Sauver ». */
  defaultCategories: readonly TemplateCategory[]
  /** Mode d'application par défaut d'un template sur le dessin courant. */
  defaultApply: ApplyDefault
  /** Autorise l'export/import de fichiers `.m3dt`. */
  allowExport: boolean
  /**
   * Offre la case « Vue » au formulaire : un template mémorise alors AUSSI d'où on
   * regarde (pose caméra, fond de carte, filtre « Couches », vue piéton) — de quoi avoir
   * un template par site plutôt qu'un dessin sans lieu. Cf. `TemplateView`.
   */
  saveView: boolean
  /** Case « Vue » cochée d'avance. Sans effet si `saveView` est faux. */
  defaultSaveView: boolean
  /**
   * Rejoue la vue d'un template à son chargement (modes « ajouter » et « remplacer » —
   * « retirer » ne déplace jamais la carte). `false` charge les formes sans bouger : le
   * réglage d'une application qui pilote son cadrage elle-même.
   */
  applyView: boolean
  /** Durée (s) du trajet vers la vue chargée ; `0` = repositionnement instantané. */
  viewFlyDuration: number
}

export type ProvidersConfig = {
  /** Serveur auto-hébergé, partagé par le fond 2D et le volume. */
  internal: InternalServerConfig
  tiles: TilesConfig
  tiles3d: Tiles3dConfig
  buildings: BuildingsConfig
  routing: RoutingConfig
  places: PlacesConfig
  symbols: SymbolsProviderConfig
  templates: TemplatesConfig
}
