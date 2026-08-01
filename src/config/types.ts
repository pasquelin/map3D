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

// `DeepPartial` vient de `theme/types` : une seconde définition ici aurait été un
// doublon libre de diverger, exactement ce que ce module cherche à supprimer ailleurs.
import type { DeepPartial } from '../theme/types'
import type { ApplyDefault, TemplateCategory } from '../core/templates/types'
import type { CoordFormat } from '../core/graticule'

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
 *   `origin`, ni session ni clé ni quota, **pas de trafic** (le calque trafic est une
 *   propriété de la tuile Google, pas une surcouche). Le volume (mode `'3d'`) vient
 *   alors du relief et des bâtiments (cf. `providers.terrain` / `providers.buildings`)
 *   et non des tuiles 3D photoréalistes.
 *
 * Les deux fournisseurs n'offrent donc pas les mêmes options : le moteur en publie les
 * capacités dans `BasemapState`, et l'UI n'affiche que les boutons qui ont un sens.
 */
export type TileProvider = 'external' | 'internal'

// ─────────────────────────────────────────────────────────────────────────────
// ① providers — fournisseurs tiers, réseau, caches
// ─────────────────────────────────────────────────────────────────────────────

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

/** Réglages communs à un appel réseau sortant. */
export type FetchPolicy = {
  /** Abandon d'une requête sans réponse. `0` = pas de limite (comportement d'origine). */
  timeoutMs: number
  /** Réessais après échec réseau ou 5xx. `0` = aucun. */
  retries: number
  /**
   * Attente avant le premier réessai, DOUBLÉE à chaque tour (100 → 200 → 400…), avec
   * une part aléatoire pour désynchroniser les clients. `0` = réessai immédiat.
   *
   * Réessayer sans attendre est ce qu'il ne faut pas faire face à un serveur en
   * difficulté : les trois tentatives partent dans la même poignée de millisecondes,
   * frappent l'incident qui n'a pas eu le temps de passer, et n'ont donc pratiquement
   * aucune chance de réussir là où la première a échoué — pour trois fois le coût.
   * C'est le pendant de `TilesConfig.backoffTransientMs`, qui tenait ce rôle pour les
   * seules tuiles.
   */
  backoffMs: number
}

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
   * temps* soient choisis parmi assez de candidats *en distance* — le plus proche à
   * vol d'oiseau n'est pas le plus rapide en voiture.
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

// ─────────────────────────────────────────────────────────────────────────────
// ② interaction — seuils de geste
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tolérances du pointeur, en pixels écran.
 *
 * Elles forment un ensemble : les régler une par une produit une carte qui répond
 * différemment selon l'objet visé. Un support tactile veut typiquement tout élargir
 * d'un coup — c'est la raison d'être du bloc.
 */
export type InteractionConfig = {
  /** Tolérance de clic autour du trait d'une forme dessinée. */
  shapeHitTolerancePx: number
  /** Tolérance de clic autour du trait d'un lien de relation. */
  linkHitTolerancePx: number
  /** Aimant de fermeture d'un polygone (dessin et marquee). */
  closeSnapPx: number
  /** Déplacement au-delà duquel un clic devient un glissé (sélection). */
  clickSlopPx: number
  /** Idem pour la saisie d'un marker vers une zone de dépôt. */
  dragSlopPx: number
  /** Idem pour le repositionnement d'un objet sur la carte. */
  repositionSlopPx: number
  /** Déplacement toléré avant qu'un clic carte ne compte plus comme un clic. */
  cleanClickPx: number
  /** Décimation du tracé au lasso. */
  lassoMinStepPx: number
  /** Décalage bas-droite appliqué aux clones d'une duplication. */
  duplicateOffsetPx: number
  /** Appui maintenu avant d'armer une saisie (tactile). */
  longPressMs: number
  /** Facteur d'échelle plancher d'une transformation (anti-écrasement). */
  minScale: number
  /** Inertie des contrôles de navigation. */
  damping: boolean
  lens: {
    /** Glissé minimal pour créer une zone de loupe. */
    minDragPx: number
    /** Côté minimal d'une zone au redimensionnement. */
    minSizePx: number
  }
  history: {
    /** Fenêtre pendant laquelle une rafale d'actions ne fait qu'une entrée d'undo. */
    coalesceMs: number
    /** Profondeur de la pile d'annulation. */
    depth: number
  }
  menu: {
    /** Survol maintenu avant ouverture d'un sous-menu. */
    hoverIntentMs: number
    /** Délai de grâce avant fermeture d'un sous-panneau quitté. */
    submenuCloseMs: number
  }
  /** Outil « sélectionner un bâtiment » (volume interne uniquement). */
  buildingPick: {
    /**
     * Curseur du canvas pendant que l'outil est actif. Curseur **système** — la
     * convention du projet exclut les images de curseur. Posé en style inline sur le
     * canvas, qui l'emporte sur le `grab` de la feuille injectée.
     */
    cursor: string
  }
  /** Tolérance de clic autour du socle d'une relation (le trait, lui, a la sienne). */
  hubHitTolerancePx: number
  /**
   * Cible cliquable du point au sol d'un marker repositionnable.
   *
   * Le point mesure 7 px : sans élargissement, l'attraper relève de l'adresse. La
   * valeur vivait dans la feuille de styles (`::before`), donc hors de ce bloc alors
   * qu'elle en est exactement — une tolérance de pointeur qu'un support tactile veut
   * élargir avec les autres.
   */
  repositionHitPx: number
  /**
   * Filet temporel après un geste : durée pendant laquelle le `click` synthétique qui
   * suit est avalé. Couplé à `longPressMs` — un contexte tactile qui allonge l'un
   * doit pouvoir allonger l'autre.
   */
  clickSuppressMs: number
  /** Décimation du tracé main levée (plancher, en px). Pendant de `lassoMinStepPx`. */
  freehandMinStepPx: number
  /** Zoom du vol « Cibler » depuis un inventaire ou une liste. */
  targetZoom: number
  /** Zoom du vol au clic sur un favori du dock. */
  pinnedFlyZoom: number
  /** Zoom sous lequel la barre de dessin se replie — dessiner suppose la vue proche. */
  drawToolbarMinZoom: number
  /** Plancher de compactage d'une barre avant qu'elle ne passe en colonnes. */
  barMinScale: number
  /** Infobulle de cluster, en pixels écran. */
  tooltip: {
    /** Sous cette hauteur de fenêtre, l'infobulle bascule au-dessous du pointeur. */
    flipBelowPx: number
    /** Demi-largeur estimée, pour le clamp horizontal aux bords. */
    clampMarginPx: number
    /** Décalage vertical quand elle s'ouvre vers le bas. */
    offsetBelowPx: number
    /** Idem vers le haut. */
    offsetAbovePx: number
  }
  /** Éclatement en éventail d'un groupe de markers confondus. */
  spiderfy: {
    /** Rayon d'une PAIRE, en fraction du rayon de pastille (décollement minimal). */
    pairRadiusRatio: number
    /** Rayon plancher de la couronne, en multiples du rayon de pastille. */
    minRingRatio: number
    /** Espacement entre deux pastilles sur la couronne. */
    gapPx: number
    /** Hystérésis de zoom du déclenchement automatique. */
    zoomEpsilon: number
  }
  clusterOpenZoom: {
    /** Marge ajoutée au zoom d'éclatement du cluster (séparation nette). */
    expansion: number
    /** Marge ajoutée quand le zoom d'éclatement dépasse déjà `clustering.maxZoom`. */
    max: number
  }
  /** Symboles tactiques posés sur la carte. */
  symbols: {
    /** Taille écran (px) d'un symbole posé. */
    sizePx: number
    /** Taille des vignettes de la grille de la palette. */
    previewSizePx: number
  }
  shortcuts: ShortcutsConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ performance — budgets de calcul et d'échantillonnage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arbitrages coût/qualité. Ils dépendent de la machine cliente et de la densité de
 * données de l'application, pas de la lib — d'où leur présence ici.
 */
/**
 * Seuil de « la caméra a bougé », partagé par tous ceux qui ouvrent une fenêtre de
 * re-échantillonnage.
 *
 * Il était écrit **trois fois** avec deux valeurs différentes — `MapEngine.hasMoved`
 * (1e-7 / 1e-4), `HeightResettle.note` et `MarkerLayer.noteCamera` (1e-6 / 1e-3) —
 * pour exactement la même question. Le moteur jugeait donc la caméra en mouvement là
 * où les couches la jugeaient immobile.
 */
export type CameraMoveEpsilon = {
  /** Écart de latitude/longitude (degrés) au-delà duquel la caméra a bougé. */
  deg: number
  /** Écart d'altitude, en fraction de l'altitude courante. */
  altitudeRatio: number
  /** Plancher absolu du précédent (m) — près du sol, un ratio seul ne déclenche jamais. */
  altitudeMinMeters: number
}

/**
 * Échantillonnage de la hauteur du sol réel (raycasts sur les tuiles). Chaque appel
 * coûte `1 + samples` raycasts BVH : c'est le poste de calcul le plus sensible de la
 * pose des objets au sol.
 */
export type GroundSampleConfig = {
  /** Durée de validité d'un échantillon mémoïsé. */
  ttlMs: number
  /** Quantification spatiale du cache (degrés) — `1e-4` ≈ 11 m. `0` retire la mémoïsation. */
  cellDeg: number
  /**
   * Cellules retenues avant purge du cache de niveau de rue (`sampleGroundHeightCached`).
   * Borne la mémoire d'une session qui parcourt beaucoup de terrain.
   */
  cacheMaxCells: number
  /** Altitude d'où part le rayon descendant. */
  rayOriginMeters: number
  /** Portée du rayon. Doit rester cohérente avec `rayOriginMeters`. */
  rayFarMeters: number
  /** Rayon de la couronne d'échantillons « niveau de la rue » (min local sous le toit). */
  radiusMeters: number
  /** Nombre de tirs sur cette couronne. */
  samples: number
}

export type PerformanceConfig = {
  /**
   * Device pixel ratio du rendu. `1` force un rendu non-retina : deux fois moins de
   * pixels à remplir, un globe plus doux sur écran haute densité.
   */
  pixelRatio: number
  /**
   * Anticrénelage du contexte WebGL. Arbitrage qualité/charge GPU du même ordre que
   * `pixelRatio`, qui lui était exposé — celui-ci ne l'était pas.
   *
   * ⚠️ Lu à la **création** du contexte : le changer à chaud n'a pas d'effet.
   */
  antialias: boolean
  /**
   * Arbitrage GPU demandé au navigateur à la création du contexte.
   *
   * `'high-performance'` réclame le GPU dédié : sur un portable à double carte, le défaut
   * du navigateur (`'default'`) laisse volontiers une carte 3D plein écran sur le circuit
   * intégré. `'low-power'` fait le choix inverse, batterie d'abord.
   *
   * ⚠️ Lu à la **création** du contexte : le changer à chaud n'a pas d'effet.
   */
  powerPreference: 'default' | 'high-performance' | 'low-power'
  /**
   * Résolution de rendu qui s'adapte à la charge : sous la cadence visée, le canvas est
   * peint à moins de pixels (le CSS le rétablit à la taille du conteneur), et remonte dès
   * que la carte respire. C'est le seul levier qui rende du temps GPU en proportion —
   * diviser le ratio par deux, c'est diviser par quatre les pixels à remplir.
   *
   * Le plancher (`minRatio`) borne la perte de netteté ; le plafond reste `pixelRatio`.
   */
  adaptiveResolution: {
    enabled: boolean
    /** Cadence visée (ms/frame). Au-delà, la résolution descend. */
    targetFrameMs: number
    /** Plancher du ratio, en fraction de `pixelRatio` (0.5 = moitié moins large). */
    minRatio: number
    /** Pas de descente/remontée, en fraction de `pixelRatio`. */
    step: number
    /** Frames consécutives hors cadence avant d'agir — ignore les à-coups isolés. */
    sampleFrames: number
  }
  /**
   * Filtrage anisotrope des textures de tuiles. `0` = maximum du matériel, `1` = aucun.
   *
   * ⚠️ Décisif en vue RASANTE. Sans lui, une texture regardée sous un angle faible est
   * échantillonnée par un mipmap trop grossier dans une direction et trop fin dans l'autre :
   * il en sort un moiré en éventail qui se recalcule à chaque frame, si bien que le sol
   * semble grouiller alors que rien ne bouge. Invisible vu du ciel, insupportable à hauteur
   * d'homme — c'est le mode piéton qui l'a révélé.
   */
  textureAnisotropy: number
  /**
   * Plage de profondeur (m) dans laquelle un overlay DOM reste projeté.
   *
   * Volontairement bien plus large que celle du rendu 3D, que `GlobeControls` resserre
   * pour la précision de profondeur : le `CSS2DRenderer` masque tout ce qui en sort, si
   * bien qu'un marker lointain vu en oblique disparaissait. Ces bornes n'agissent QUE sur
   * le z de clipping des overlays — jamais sur leur position à l'écran, ni sur la 3D.
   */
  overlayDepth: {
    nearMeters: number
    farMeters: number
  }
  /**
   * Ne peindre que ce qui a changé.
   *
   * La boucle de frame tourne toujours (les couches avancent, les tuiles arrivent, les
   * gestes répondent) : ce qui est sauté, c'est le RENDU — la passe WebGL et celle des
   * overlays DOM. Carte immobile, elles reproduisent pourtant une image identique, 60 fois
   * par seconde, pendant des heures sur un poste qui garde la carte ouverte.
   *
   * Une frame est peinte dès que quoi que ce soit le demande : caméra qui bouge, tuile qui
   * arrive, marker qui glisse, geste, changement de réglage… Une couche le signale par
   * `ctx.invalidate()`, l'hôte par `MapEngine.invalidate()`.
   */
  renderOnDemand: {
    enabled: boolean
    /**
     * Frames peintes APRÈS la dernière demande. Un fondu ou une transition qui se termine
     * en deux frames n'a pas à se déclarer à chaque pas.
     */
    idleFrames: number
    /**
     * Délai (ms) au-delà duquel une frame est peinte même sans demande.
     *
     * Filet de sécurité, pas un rafraîchissement : il borne le prix d'un mouvement que
     * personne n'aurait signalé (couche tierce, plugin) à « saccadé » au lieu de « figé ».
     * `0` le retire.
     */
    maxIdleMs: number
  }
  cameraMoveEpsilon: CameraMoveEpsilon
  groundSample: GroundSampleConfig
  /**
   * Marge (px écran) au-delà du cadre au-delà de laquelle un marker est masqué
   * (`display:none`) : le navigateur cesse d'en calculer style, layout et
   * composition. `0` désactive le cull.
   */
  markerCullMarginPx: number
  /**
   * Hystérésis autour d'un seuil d'apparition de markers `static` (`useZoomGate`).
   * Sans elle, une molette arrêtée pile sur la valeur fait clignoter le décor : le zoom
   * oscille de quelques millièmes au ralentissement de l'inertie, et chaque oscillation
   * traverserait le seuil. Même rôle que `relations.zoomBand`, appliqué ici à
   * l'apparition de markers entiers.
   */
  markerZoomBand: number
  /** Côté de la grille de raycasts qui déduit les bounds visibles (`n²` par frame). */
  boundsPickGrid: number
  /**
   * Élargissement de la bbox émise par `onViewportChange`.
   * **Pilote directement le volume de données que l'application charge.**
   */
  boundsMargin: number
  /** Frames d'immobilité avant d'émettre l'événement `viewport`. */
  viewportSettleFrames: number
  /** Intervalle minimal entre deux recalculs de clusters pendant un pan. */
  markerRecomputeMs: number
  /**
   * Intervalle minimal entre deux écritures du bloc de lecture de la vue
   * (`<CameraReadout>`), en ms.
   *
   * L'événement `camera` est émis à la frame : recopier ses valeurs telles quelles
   * ferait quatre écritures DOM par frame pour un texte que l'œil ne peut pas suivre.
   * La dernière valeur est TOUJOURS écrite, cadence ou pas — un bloc figé sur
   * l'avant-dernière position serait pire que rafraîchi trop souvent.
   */
  readoutRefreshMs: number
  resettle: {
    /** Éléments re-échantillonnés par passe (budget de raycasts). */
    batch: number
    /** Cadence de retentative des ancres non résolues (zone non chargée). */
    retryFrames: number
    /** Hystérésis de résolution avant reconstruction d'épaisseur (1.25 = ±25 %). */
    mppBand: number
    /** Longueur de la fenêtre ouverte par un mouvement caméra (frames). */
    windowFrames: number
    /**
     * Longueur de la fenêtre ouverte à la création d'un objet (frames). Plus longue
     * que la précédente : les tuiles sous un objet qui vient d'apparaître n'ont
     * souvent pas fini de se raffiner.
     */
    spawnWindowFrames: number
    /** Une passe traite un lot toutes les N frames — amortit le coût des raycasts. */
    everyNFrames: number
  }
  relations: {
    /** Plafond de subdivision d'un arc drapé. */
    maxSteps: number
    /** Pas d'échantillonnage d'un arc drapé. */
    stepMeters: number
    /** Au-delà de N liens, l'éventail se replie en trait agrégé (seuil de lisibilité). */
    fanMaxLegs: number
    /** Bande d'hystérésis de zoom avant recalcul du regroupement visuel. */
    zoomBand: number
  }
  /** Densité de polygonisation d'un cercle — rendu **et** prédicats géométriques. */
  circleSegments: number
  /**
   * Intervalle d'altitude accepté pour un échantillon de surface. Hors de ces
   * bornes, l'échantillon est jugé aberrant et ignoré. À élargir pour un tileset
   * non terrestre (maquette, intérieur, aérien).
   */
  groundHeightRange: readonly [number, number]
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ data — cadence de chargement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clés `localStorage` de la carte.
 *
 * ⚠️ À distinguer dès que **deux cartes cohabitent sur le même origin** : sans clés
 * propres, elles écrivent au même endroit et la dernière à changer un réglage
 * l'impose à l'autre. Les trois étaient dispersées dans le code (`core/TagFilter`,
 * `layers/draw/DrawSettings`, `SearchBox`), chacune surchargeable par une prop
 * différente — donc trois endroits à penser au lieu d'un.
 */
export type StorageKeysConfig = {
  /** Sélection du filtre « Couches ». */
  tagFilter: string
  /** Réglages de style par outil de dessin. */
  drawSettings: string
  /** Historique de la boîte de recherche. */
  searchHistory: string
  /** État des plugins (activation + config), format `{ [id]: PluginState }`. */
  plugins: string
  /** Templates de dessin locaux (tableau `Template[]`). */
  templates: string
  /** Éléments de catalogue affichés sur la carte (tableau de `CatalogKey`). */
  catalog: string
  /**
   * Réglages du catalogue (persistance, cadrage à l'ajout).
   *
   * Distincte de `catalog` : décocher « conserver » efface la SÉLECTION, et une clé
   * partagée effacerait du même geste le réglage qu'on vient de changer.
   */
  catalogSettings: string
}

/** Boîte de recherche — 💰 chaque frappe non amortie est un appel Places facturé. */
export type DataSearchConfig = {
  /** Longueur minimale de saisie avant d'interroger les fournisseurs. */
  minQuery: number
  /** Anti-rebond de la frappe. 💰 Le levier le plus direct sur le nombre d'appels. */
  debounceMs: number
  /** Résultats affichés par rubrique. */
  limitPerGroup: number
  /** Entrées conservées dans l'historique. */
  historySize: number
  /** Altitude (m) du vol vers un résultat sans emprise connue. */
  flyAltitude: number
  /** Respiration (px) du cadrage d'un résultat qui a une emprise. */
  fitPadding: number
  /** Plafond de re-résolution d'une entrée d'historique avant le vol. */
  resolveLimit: number
}

/**
 * Raccourcis clavier. `false` désactive une commande, une autre touche la remappe.
 *
 * ⚠️ Une trentaine de touches étaient figées dans le code — deux tables
 * `DEFAULT_SHORTCUTS` distinctes, plus les combinaisons à modificateur écrites en
 * `if` dans le gestionnaire, plus le `'x'` de la loupe. Aucune n'était atteignable
 * autrement que par une prop, et les combinaisons ne l'étaient pas du tout : une
 * application dont un raccourci entrait en conflit avec le sien n'avait aucun
 * recours. C'est aussi le premier obstacle d'une carte utilisée sur un clavier
 * non-AZERTY/QWERTY.
 *
 * Les clés sont volontairement listées ici plutôt qu'importées de `layers/DrawLayer` :
 * ce module décrit des réglages et ne doit rien devoir aux couches. Une assertion au
 * point d'usage garantit que les deux ensembles ne divergent pas.
 */
export type ControlShortcuts = {
  /** Réoriente au nord et remet la vue du dessus. */
  north: string | false
  /** Zoom avant d'un cran. */
  zoomIn: string | false
  /** Zoom arrière d'un cran. */
  zoomOut: string | false
  /** Bascule l'inclinaison de la caméra. */
  tilt: string | false
  /** Recul en vue globe. */
  globe: string | false
  /**
   * Bascule de la grille de coordonnées.
   *
   * ⚠️ ICI et non dans `draw`, bien que la grille ait aussi une rangée dans le sous-menu
   * « Mesures » : c'est une commande de VUE, et son bouton des contrôles fonctionne sans
   * aucune couche de dessin montée. Rangée sous `draw`, la touche mourait avec `<DrawLayer>`
   * pendant que l'infobulle du bouton continuait de l'annoncer.
   *
   * `'g'` — le choix évident pour « grille » — est déjà `globe`, d'où le défaut `'k'`.
   * Les échanger tient en une ligne : `{ controls: { graticule: 'g', globe: 'k' } }`.
   */
  graticule: string | false
  /** Ouvre le panneau « Couches » (filtre par tag). */
  layers: string | false
  /** Ouvre le panneau « Catalogue ». Sans source déclarée, la touche est inactive. */
  catalog: string | false
  /** Plein écran. */
  fullscreen: string | false
  /** Bascule 3D photoréaliste ↔ plan 2D. */
  basemap: string | false
  /** Calque trafic — le bouton n'existe qu'en mode plan. */
  traffic: string | false
  /** Entrer / quitter le mode piéton — le bouton n'existe qu'en 3D photoréaliste externe. */
  pedestrian: string | false
}

/** Outils de dessin et modes de sélection — une touche simple chacun. */
export type DrawToolShortcuts = {
  /** Outil sélection. */
  select: string | false
  /** Sélection au rectangle. */
  selectRect: string | false
  /** Sélection au polygone. */
  selectPoly: string | false
  /**
   * Sélection d'un **bâtiment** du volume interne — une ligne du même sélecteur, mais pas
   * un mode de sélection de dessin : elle arme un outil du moteur, et quitte le dessin.
   */
  selectBuilding: string | false
  /** Sélection au lasso. */
  selectLasso: string | false
  /** Ligne. */
  line: string | false
  /** Polygone. */
  polygon: string | false
  /** Rectangle. */
  rect: string | false
  /** Cercle. */
  circle: string | false
  /** Tracé main levée. */
  freehand: string | false
  /** Flèche. */
  arrow: string | false
  /** Règle de mesure. */
  measure: string | false
  /** Gomme. */
  erase: string | false
  /** Palette de symboles tactiques. */
  symbol: string | false
}

/**
 * Commandes d'édition à modificateur. Elles étaient écrites en dur dans la cascade de
 * `keydown` — donc ni remappables ni désactivables, alors que `⌘A` et `⌘D` entrent
 * couramment en conflit avec ceux de l'application hôte.
 *
 * `key` est comparée en minuscule ; `mod` vaut `ctrl`/`meta` indifféremment (`'mod'`),
 * ou l'un des deux explicitement.
 */
export type EditShortcut = { key: string; mod?: 'mod' | 'ctrl' | 'meta'; shift?: boolean } | false

export type EditShortcuts = {
  /** Annuler. */
  undo: EditShortcut
  /** Rétablir. */
  redo: EditShortcut
  /** Variante Windows (`Ctrl+Y`) — historiquement en plus de `Ctrl+Maj+Z`. */
  redoAlt: EditShortcut
  /** Tout sélectionner — n'agit que si un outil de la carte est actif. */
  selectAll: EditShortcut
  /** Dupliquer la sélection. */
  duplicate: EditShortcut
  /** Suppression de la sélection ; les deux touches usuelles par défaut. */
  delete: readonly string[]
  /** Fermeture du polygone en cours. */
  closePolygon: string | false
  /** Déplacement au clavier de la sélection, en pixels écran. */
  nudgePx: number
  /** Idem avec Maj — le pas « rapide ». */
  nudgeFastPx: number
}

/**
 * Touches de DÉPLACEMENT continu sur la carte — les seules du lot qui agissent tant
 * qu'elles sont maintenues, et non au moment de la frappe.
 *
 * Plusieurs touches par direction : les flèches, universelles, et une famille de lettres
 * qui dépend de la disposition du clavier (ZQSD en AZERTY, WASD en QWERTY). Une
 * application internationale pose la sienne sans toucher au code.
 *
 * ⚠️ Ces liaisons servent AUSSI au futur mode vol : c'est le modèle de déplacement qui
 * changera (déplacement libre dans l'axe du regard, altitude comprise), pas les touches.
 */
export type NavigateShortcuts = {
  forward: readonly string[]
  backward: readonly string[]
  left: readonly string[]
  right: readonly string[]
  /** Modificateur d'accélération, maintenu (cf. `camera.keyPan.boost`). */
  boost: readonly string[]
}

/**
 * Mode piéton. L'ENTRÉE dans le mode est un bouton de la barre de navigation : sa touche
 * vit donc dans `controls.pedestrian`, avec les neuf autres. Ne reste ici que ce qui n'a
 * pas de bouton de barre.
 *
 * `immersion` est à `false` par défaut, comme `controls.traffic` : la
 * bascule ne vaut QUE mode piéton actif, et Échap en sort déjà (relâchement natif du
 * Pointer Lock). Brûler une lettre globale pour ça serait déroutant.
 */
export type PedestrianShortcuts = {
  /** Bascule exploration ↔ immersion totale. */
  immersion: string | false
}

export type ShortcutsConfig = {
  controls: ControlShortcuts
  navigate: NavigateShortcuts
  pedestrian: PedestrianShortcuts
  draw: DrawToolShortcuts
  edit: EditShortcuts
  lens: {
    /** Bascule de l'outil loupe. */
    toggle: string | false
  }
}

/**
 * Limites de navigation et pas des commandes de caméra.
 *
 * ⚠️ Ce bloc vivait dans `MapTheme`. Rien de ce qu'il contient ne se VOIT : ce sont
 * des bornes (zoom, inclinaison, distance, garde au sol) et des pas de geste. On les
 * change pour un support tactile, un tileset non terrestre ou une contrainte de
 * couverture de tuiles — jamais pour une charte graphique. Le signe le plus net était
 * `minGroundClearance`, séparé de `performance.groundHeightRange` qui traite du même
 * sujet, dans deux arbres différents.
 *
 * `fov` fait exception et reste **lu à la construction** : toutes les conversions
 * mètres↔pixels de la lib en dérivent et sont mémoïsées.
 */
export type CameraConfig = {
  /**
   * Zoom minimal atteignable (dézoom maximal).
   *
   * ⚠️ Ce réglage n'était **branché nulle part** : c'est `maxDistanceFactor` qui bornait
   * seul l'éloignement, en rayons terrestres. Les deux disent la même chose en deux
   * unités ; le plus contraignant des deux gagne désormais, au lieu que l'un soit ignoré.
   */
  minZoom: number
  /**
   * Zoom maximal atteignable **en mode plan** — le plancher de descente.
   *
   * ⚠️ Lui non plus n'était branché nulle part, alors qu'il annonçait « au-delà la caméra
   * entre dans le bâti 3D ». Le seul garde-fou réel sur la molette était le `cameraRadius`
   * de `GlobeControls`, jamais réglé : **5 mètres**. On pouvait donc descendre au ras du
   * pavé, nez contre une façade, sans plus rien voir.
   */
  maxZoom: number
  /**
   * Zoom maximal en 3D — le pendant de `maxZoom`, comme `maxTilt3d` l'est de `maxTilt2d`.
   *
   * Distinct parce que les deux modes n'ont pas la même contrainte : une carte plate se
   * lit d'autant mieux qu'on s'en approche (noms de rue, numéros), alors qu'en volume,
   * passer sous la hauteur du bâti met la caméra DANS la rue — un mur occupe l'écran et
   * l'on ne se repère plus. La borne s'exprime en zoom, donc en hauteur au-dessus du sol :
   * `altitude = circonférence / 2^zoom`.
   */
  maxZoom3d: number
  /** Inclinaison maximale générale (rad depuis le nadir). */
  maxTilt: number
  /** Pas de zoom d'un cran de molette. */
  zoomStep: number
  dragSpeed: {
    /** Vitesse de déplacement au ras du sol. */
    min: number
    /** Vitesse de déplacement en vue globe. */
    max: number
  }
  /** Champ de vision vertical (degrés). Lu à la construction du moteur seulement. */
  fov: number
  /** Inclinaison max en 3D (rad depuis le nadir) — au-delà, la vue bascule. */
  maxTilt3d: number
  /** Inclinaison max en 2D (rad depuis le nadir). Par défaut alignée sur `maxTilt3d` (~79°) ;
   *  la resserrer borne la couverture de tuiles (une carte plate inclinée vers l'horizon en
   *  demande de plus en plus loin) et remonte l'angle où le graticule s'efface. */
  maxTilt2d: number
  /** Pas d'inclinaison par clic du bouton dédié (rad). */
  tiltStep: number
  /** Facteurs d'altitude par cran de zoom (bouton +/−). */
  zoomFactor: { in: number; out: number }
  /** Distance max caméra↔centre Terre, en rayons terrestres (limite de dézoom). */
  maxDistanceFactor: number
  /** Altitude max des vols, en rayons terrestres. */
  maxAltitudeFactor: number
  /** Garde-fou : hauteur minimale (m) au-dessus du sol RÉEL, tuiles comprises. */
  minGroundClearance: number
  /**
   * Déplacement au clavier (cf. `interaction.shortcuts.navigate`).
   *
   * `speed` est une FRACTION de la hauteur au-dessus du sol parcourue par seconde, et non
   * une vitesse absolue : la carte défile alors à la même allure à l'écran qu'on soit à
   * 150 m ou à 100 km. C'est le principe de `dragSpeed` pour la souris, et celui du mode
   * vol de `GlobeControls`, dont la vitesse est déjà mise à l'échelle de l'altitude.
   */
  keyPan: {
    /** Hauteurs-sol par seconde. `0.8` ≈ un écran par seconde en vue au nadir. */
    speed: number
    /** Multiplicateur tant que le modificateur d'accélération est maintenu. */
    boost: number
  }
  /** Bornes d'altitude (m) du mode suivi. */
  followAltitude: { min: number; max: number }
  /** Défauts de cadrage (`fitBounds`) — surchargeables appel par appel. */
  fitBounds: { margin: number; minAltitude: number; maxAltitude: number }
}

/**
 * Échelle d'empilement des surfaces de la carte.
 *
 * ⚠️ Elle n'existait nulle part **en tant qu'échelle** : douze valeurs réparties sur
 * une trentaine de règles CSS, et le commentaire qui prétendait la documenter
 * (« sous les barres (20) et les panneaux (30/31) ») décrivait un code disparu — les
 * panneaux sont à 999. C'est pourtant le premier réglage dont une application a
 * besoin : ses propres modales, en-têtes et tiroirs doivent pouvoir passer au-dessus
 * ou au-dessous de la carte, et aucune valeur en dur ne peut anticiper sa pile à elle.
 *
 * Les empilements INTERNES à un composant (1 à 4 : swatches, poignées, en-tête
 * collant) n'en font pas partie : ils n'ont de sens que les uns par rapport aux
 * autres, à l'intérieur d'une surface qui, elle, est placée par cette échelle.
 */
/**
 * Échelle d'empilement — **deux plans, pas une seule liste**.
 *
 * La distinction est structurelle, pas cosmétique : `.m3d-overlay` et `.m3d-css2d`
 * créent chacun un contexte d'empilement, donc les valeurs qui vivent DEDANS ne sont
 * jamais comparées à celles du DEHORS. Les mélanger a déjà produit un bug — un
 * `floatingHud: 20` qu'on croyait au-dessus d'un `editOverlay: 15` passait en réalité
 * dessous, parce que les poignées héritaient du 999 de leur overlay conteneur.
 *
 * ── Plan RACINE (enfants de `.m3d-root`, comparés entre eux) ────────────────────
 *   `mapOverlay` < `floatingHud` < `dock` < `ui` < `menu` < `modal`
 *
 * ── Plan CARTE (dans `.m3d-overlay`, comparés entre eux seulement) ──────────────
 *   `relationBar` < `editOverlay` < `listMenu`
 *
 * Régler un niveau du plan carte au-delà de `mapOverlay` ne le fera PAS remonter
 * au-dessus de l'UI : c'est `mapOverlay` qui porte tout ce plan.
 *
 * ── Plan LOCAL (dans la surface qui les porte) ──────────────────────────────────
 *   `tooltip` et `markerSelected` ne se comparent à RIEN de ce qui précède : ils
 *   vivent dans une ancre de marker (`.m3d-css2d` en écrit une par marker) ou dans
 *   un panneau à `backdrop-filter`, deux contextes d'empilement isolés. Leurs
 *   petites valeurs ne sont donc pas une anomalie — les monter ne les ferait
 *   remonter nulle part.
 */
export type ZIndexConfig = {
  /**
   * Plan RACINE. Surfaces de la CARTE : markers (`.m3d-css2d`), poignées d'édition,
   * zone de loupe, ancres de liens. Sous toutes les surfaces d'UI — c'est ce qui
   * garantit qu'un panneau n'est jamais percé par une poignée, et que le nombre de
   * markers à l'écran n'influe pas sur l'empilement (CSS2DRenderer écrit `1..N` sur
   * les ancres ; ce niveau les enferme dans un contexte).
   */
  mapOverlay: number
  /** Plan RACINE. HUD flottant (sélection, loupe) : au-dessus de la carte, sous les barres. */
  floatingHud: number
  /** Plan RACINE. Dock des favoris — volontairement SOUS les barres. */
  dock: number
  /** Plan RACINE. Barres, panneaux, boîte de recherche : le plan des surfaces d'UI. */
  ui: number
  /** Plan RACINE. Menus contextuels et ghosts de glisser-déposer : au sommet. */
  menu: number
  /**
   * Plan RACINE. Infobulles des barres (`.m3d-tip`), portées à la racine par
   * `<MapTooltip>` — donc SŒURS des panneaux, et non enfermées dans la barre.
   *
   * ⚠️ À ne pas confondre avec `tooltip`, qui est un plan LOCAL (l'infobulle d'un
   * marker, enfermée dans son ancre). Celle-ci doit passer au-dessus des panneaux
   * (`ui`) — c'est tout son intérêt — mais RESTER SOUS `menu` : un menu contextuel
   * ouvert est une décision en cours, une infobulle n'est qu'une explication.
   */
  barTooltip: number
  /** Plan RACINE. Modales (dialogue de confirmation) : au-dessus de tout, menus compris. */
  modal: number
  /** Plan CARTE. Barre d'état d'une relation, posée sur la carte. */
  relationBar: number
  /** Plan CARTE. Overlay SVG de sélection (poignées de transformation). */
  editOverlay: number
  /**
   * Plan CARTE. Étiquettes du graticule — volontairement le niveau le plus BAS : la grille
   * est un fond de repère, elle ne doit passer devant rien de ce que la carte porte.
   */
  graticuleLabel: number
  /**
   * Plan LOCAL. Infobulles, DANS la surface qui les porte : l'ancre du marker pour
   * `.m3d-markertip`, la barre ou le panneau pour `.m3d-tip`. Toutes deux sont des
   * contextes d'empilement isolés (z-index d'ancre écrit par CSS2DRenderer,
   * `backdrop-filter` d'un panneau), si bien que cette valeur ne se compare jamais
   * aux niveaux du plan CARTE. La monter ne fera passer l'infobulle au-dessus de rien.
   */
  tooltip: number
  /** Plan CARTE. Menu d'actions d'une ligne de liste. */
  listMenu: number
  /**
   * Marker sélectionné, DANS l'ancre de son propre marker.
   *
   * ⚠️ Ne le hisse pas au-dessus des markers voisins : l'ancre porte un `z-index`
   * numérique, donc elle crée un contexte et cette valeur y reste enfermée. L'ordre
   * ENTRE markers est décidé par le `renderOrder` que le moteur donne à
   * CSS2DRenderer (cf. `setRaised`), pas ici.
   */
  markerSelected: number
}

/**
 * Regroupement des markers proches — paramètres de l'**algorithme** (supercluster).
 *
 * ⚠️ Ils vivaient dans `MapTheme`, du mauvais côté de la ligne que pose le préambule
 * de ce fichier : personne ne change le rayon de regroupement ni le nombre minimal de
 * points pour une charte graphique, mais on le fait pour une densité de données. Ce
 * qui relève bien du thème — rayon du donut, arc, contour — reste dans
 * `theme.clusters`, à ne pas confondre.
 */
export type ClusteringConfig = {
  /** Rayon de regroupement, en pixels écran. */
  radius: number
  /** En deçà, les points restent individuels. */
  minPoints: number
  /** Zoom au-delà duquel le regroupement géographique s'arrête. */
  maxZoom: number
  /** Quantification du zoom pour la stabilité des paliers de cluster. */
  levelQuantization: number
  /**
   * Zoom à partir duquel un cluster inséparable (points confondus) éclate en
   * éventail au clic — le zoom max UTILE de la caméra, au-delà duquel elle entre
   * dans le bâti 3D. `19` ≈ 76 m d'altitude.
   */
  spiderfyZoom: number
}

export type DataConfig = {
  /** Anti-rebond entre l'arrêt de la caméra et la demande de données. */
  viewportDebounceMs: number
  /** Anti-rebond de la sauvegarde de la position caméra (`positionStorageKey`). */
  positionSaveDebounceMs: number
  storageKeys: StorageKeysConfig
  search: DataSearchConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ markers — seuils de lisibilité
// ─────────────────────────────────────────────────────────────────────────────

export type MarkersConfig = {
  /**
   * Zoom en dessous duquel les markers `static` (symboles posés, défibrillateurs)
   * disparaissent de la carte. `0` désactive le masquage.
   *
   * Ils restent dans la RECHERCHE et la loupe : ce seuil dit ce qui est lisible, pas
   * ce que l'utilisateur a choisi de masquer — c'est le rôle du filtre de tags.
   * Chercher « défibrillateur » doit le trouver et y voler quel que soit le zoom.
   *
   * Défaut 13 : en dessous, la vue cadre une région entière et un pictogramme de
   * 40 px n'y est ni lisible ni cliquable.
   *
   * C'est le seuil PAR DÉFAUT : un marker qui déclare `static: { minZoom }` impose le
   * sien — tout le décor ne se lit pas à la même distance.
   */
  staticMinZoom: number
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ startup — intro et disponibilité
// ─────────────────────────────────────────────────────────────────────────────

export type StartupConfig = {
  /** Durée du vol d'introduction (globe → position initiale), en secondes. */
  introDuration: number
  /** Attente maximale des tuiles avant de lancer l'intro malgré tout. */
  introMaxWaitMs: number
  /** Attente maximale avant d'émettre `ready` de force. */
  readyMaxWaitMs: number
  /**
   * Fondu de l'overlay à la fin de l'intro. Pendant de `introDuration`, qui était
   * exposé alors que son fondu de sortie vivait dans la feuille de styles.
   */
  introFadeMs: number
  /** Altitude de départ de l'intro, en rayons terrestres (vue globe). */
  introAltitudeFactor: number
  /**
   * Taille de repli (px) quand le conteneur n'est pas encore mesuré au montage —
   * conteneur masqué, hydratation SSR, layout différé.
   *
   * ⚠️ Ce n'est pas cosmétique : ce couple fixe le premier `aspect` de la caméra,
   * donc la première projection, avant que le `ResizeObserver` ne rende la main. Il
   * était écrit `800`/`600` au fil du code, sans que rien ne le nomme.
   */
  fallbackSize: readonly [number, number]
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ciel atmosphérique procédural (modèle de Preetham + nuages), révélé en FONDU quand on
 * descend vers le sol en 3D. En vue globe (haute altitude) il est invisible : seules les
 * étoiles et le fond d'espace restent — la vue depuis l'espace n'est jamais altérée.
 *
 * Le soleil est le vrai point subsolaire calculé pour `date` ; le lieu vient du centre
 * visé, donc voyager d'un continent à l'autre change le jour/la nuit. Aucune couleur ici :
 * le ciel est calculé physiquement à partir de ces paramètres.
 */
export type SkyConfig = {
  /** Active le ciel. `false` = étoiles + fond couleur seuls (comportement d'avant). */
  enabled: boolean
  /** Voile atmosphérique : `1` = ciel limpide, `~10` = brumeux/laiteux. */
  turbidity: number
  /** Diffusion de Rayleigh — intensité du bleu du ciel. */
  rayleigh: number
  /** Diffusion de Mie — force du halo autour du soleil. */
  mieCoefficient: number
  /** Directionnalité de Mie (0..1) — concentration du halo solaire. */
  mieDirectionalG: number
  clouds: {
    /** Couverture nuageuse : `0` = ciel dégagé, `1` = couvert. */
    coverage: number
    /** Opacité des nuages (0..1). */
    density: number
    /** Échelle du motif de nuages (plus petit = nuages plus grands). */
    scale: number
    /** Élévation apparente de la couche (0..1). */
    elevation: number
  }
  /**
   * Fondu étoiles → ciel, en **altitude caméra (m)**. Au-dessus de `start` : ciel
   * invisible (vue globe intacte). En dessous de `end` : ciel plein. Entre les deux :
   * fondu progressif. `start` doit être > `end`.
   */
  fade: {
    start: number
    end: number
  }
  /**
   * Instant (ms epoch, comme `Date.now()`) qui fixe la position du soleil. `0` = l'heure
   * de montage de la carte, figée. Une valeur > 0 fige un instant précis (déterministe).
   */
  date: number
}

// ─────────────────────────────────────────────────────────────────────────────

/** Corps du piéton — capsule approximée par des rayons palpeurs (aucun BVH). */
export type PedestrianCollisionConfig = {
  /** Demi-largeur du corps (m) : distance en deçà de laquelle un mur repousse. */
  radiusMeters: number
  /** Nombre de rayons horizontaux lancés en éventail autour de la direction de marche. */
  feelers: number
  /** Longueur des palpeurs EN PLUS du rayon (m) — de quoi voir le mur avant de l'atteindre. */
  feelerMarginMeters: number
  /** Montée franchissable d'un pas (m) : trottoir, marche. Au-delà, c'est un mur. */
  maxStepHeightMeters: number
}

/** Choix du point d'entrée en mode piéton — cf. `isGroundPlacement`. */
export type PedestrianPlacementConfig = {
  /**
   * Écart maximal (m) entre la surface visée et le niveau de rue de la couronne. Au-delà,
   * le point est un toit et le clic est refusé.
   */
  maxRoofDeltaMeters: number
  /** Rayon de la couronne d'échantillonnage du sol (m) — cf. `sampleGroundHeight`. */
  ringRadiusMeters: number
  /**
   * Période minimale (ms) entre deux validations du curseur pendant le placement.
   *
   * Chaque validation coûte une dizaine de raycasts (le rayon d'écran, plus la couronne de
   * sol). `pointermove` tire beaucoup plus vite que ça : sans cette limite, viser une rue
   * suffisait à saturer la boucle de rendu.
   */
  refreshMs: number
  /** Déplacement (px) en deçà duquel la validation précédente est réutilisée telle quelle. */
  refreshSlopPx: number
}

/** Balancement de la marche — un effet, désactivé par défaut. */
export type PedestrianHeadBobConfig = {
  enabled: boolean
  amplitudeMeters: number
  /** Oscillations par seconde (Hz) à vitesse de marche nominale. */
  frequency: number
}

/** Durées (ms) de la plongée à l'entrée et de la remontée à la sortie. */
export type PedestrianTransitionsConfig = {
  enterMs: number
  exitMs: number
}

/**
 * Mode piéton / première personne — cf. le guide PEDESTRIAN.md.
 *
 * ⚠️ Tout ce qui suit est de la CONFIG et non du thème : rien ne s'y voit directement.
 * L'apparence du curseur de placement et du réticule vit dans `theme.colors.pedestrian`.
 */
export type PedestrianConfig = {
  /** Hauteur de l'œil au-dessus du sol (m). */
  eyeHeightMeters: number
  /** Vitesse de marche (m/s) — INDÉPENDANTE de l'altitude, contrairement au vol orbital. */
  walkSpeed: number
  /** Multiplicateur appliqué tant que la touche `boost` est maintenue. */
  sprintFactor: number
  /** Sensibilité du regard : degrés de rotation par pixel de souris. */
  lookSpeed: number
  /**
   * Inverse l'axe vertical du regard.
   *
   * ⚠️ Le défaut suit la convention du CLIQUER-GLISSER de la carte (« attraper la scène » :
   * tirer vers le bas relève la vue), et non celle d'un FPS — c'est le même geste que le
   * pan de `GlobeControls`, et deux conventions opposées dans la même vue désorientent.
   * Sous Pointer Lock (immersion totale), la convention FPS s'applique d'elle-même.
   */
  invertY: boolean
  /** Inverse l'axe horizontal du regard. */
  invertX: boolean
  /** Borne du regard vertical (°) — à 90° la base du repère dégénère. */
  pitchMaxDeg: number
  /**
   * Distance de vue (m) : borne le `far` de la caméra, donc le frustum culling, donc les
   * tuiles que le `TilesRenderer` demande. C'est le levier de performance n°1 de la vue
   * rasante — la baisser coûte de l'horizon et rend de la fluidité.
   *
   * Elle borne AUSSI les markers et les pastilles de regroupement : un overlay DOM garde sa
   * taille écran quelle que soit la distance, si bien qu'une alerte à 700 km s'affichait sur
   * la ligne d'horizon au même gabarit que celle d'en face. Un marker cesse donc d'être
   * affiché là où le décor cesse de l'être, jamais au-dessus du vide.
   */
  viewDistanceMeters: number
  /** Début du brouillard (m). Il finit toujours à `viewDistanceMeters` — cf. `pedestrianView`. */
  fogStartMeters: number
  /** Plan proche de la caméra (m) en mode piéton. */
  nearMeters: number
  /**
   * Portée (m) du rayon qui cherche le sol sous les pieds, à chaque frame de marche.
   *
   * ⚠️ Court par nécessité : `sampleGroundHeight` part de 12 km d'altitude et porte sur
   * 40 km — à hauteur d'homme, ce rayon traverse toute la scène pour mesurer deux mètres.
   * C'était le poste le plus cher de la boucle de marche. Il borne aussi la chute : au-delà,
   * le sol est réputé introuvable et la hauteur précédente est conservée.
   */
  groundProbeMeters: number
  /**
   * Distance de référence (m) du niveau de détail des tuiles pendant la marche.
   *
   * ⚠️ Le détail se déduit d'ordinaire de la distance caméra→sol. À hauteur d'homme elle
   * vaut 1,70 m : le calcul réclame alors le zoom MAXIMAL sur toute la distance de vue,
   * soit des dizaines de milliers de tuiles pour une rue. On raisonne donc sur la distance
   * à laquelle on regarde réellement, pas sur celle de ses pieds.
   *
   * Baisser = plus net de près et plus lourd ; monter = plus léger et plus grossier.
   */
  tileDetailDistanceMeters: number
  /**
   * Période minimale (ms) entre deux mises à jour de la couverture de tuiles en marche.
   *
   * ⚠️ Chaque passage reconstruit la cascade de niveaux — un anneau par cran, du plus fin
   * au niveau de base — puis parcourt tout le cache. À hauteur d'homme le niveau le plus fin
   * est élevé, donc la cascade est longue, et la refaire soixante fois par seconde ne sert
   * à rien : à 3 m/s le décor a bougé de cinq centimètres.
   */
  tileRefreshMs: number
  /**
   * Constante de temps (SECONDES) du lissage vertical de l'œil. Trop fort → sensation de
   * flottement ; trop faible → sautillement quand les tuiles se raffinent.
   */
  groundSmoothing: number
  collision: PedestrianCollisionConfig
  placement: PedestrianPlacementConfig
  headBob: PedestrianHeadBobConfig
  transitions: PedestrianTransitionsConfig
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grille de coordonnées géographiques — cf. le guide GRATICULE.md.
 *
 * ⚠️ Tout ce qui suit est de la CONFIG et non du thème : ce qui se VOIT (les quatre
 * couleurs) vit dans `theme.colors.graticule`. La règle qui tranche : une valeur qu'on
 * change pour un écran plus dense ou une machine plus faible est de la config ; une valeur
 * qu'on change pour une charte graphique est du thème.
 */
export type GraticuleConfig = {
  /**
   * État de DÉPART.
   *
   * ⚠️ Ce n'est PAS la source de vérité courante : elle vit dans le moteur
   * (`engine.setGraticuleVisible`). Le sous-menu « Mesures », le bouton des contrôles de vue
   * et le raccourci clavier la pilotent tous les trois, et deux copies d'état auraient
   * divergé — le défaut même que `buildingpickmode` corrige.
   */
  enabled: boolean
  /** Lignes visées à l'écran — c'est ce nombre qui choisit la maille. */
  targetLines: number
  /**
   * Bande morte du changement de maille, en fraction de densité.
   *
   * ⚠️ Pas un confort visuel : sans elle, un zoom arrêté pile sur une frontière de palier
   * rebascule d'une frame à l'autre, et chaque bascule reconstruit toute la géométrie.
   */
  levelHysteresis: number
  /** Bornes de l'échelle (degrés) — `[x, x]` fige la maille. `null` = échelle libre. */
  levelRangeDeg: readonly [number, number] | null
  /** Segments par ligne : c'est cette densification qui fait ÉPOUSER la courbure du globe. */
  segmentsPerLine: number
  /** Plafond dur de lignes par axe — garde-fou mémoire, indépendant du calcul de maille. */
  maxLines: number
  /** Largeur de l'emprise construite, en écrans. En sortir déclenche une reconstruction. */
  bandScreens: number
  /** Latitude d'arrêt des méridiens : au-delà ils se rejoignent et la densité explose. */
  latLimitDeg: number
  /** Décalage vertical du drapage (m) au-dessus de la surface visible. */
  heightOffsetMeters: number
  /** Dérive de hauteur de drapage tolérée (m) avant reconstruction. */
  heightToleranceMeters: number
  /** Opacité des lignes ordinaires. */
  opacity: number
  /** Opacité des lignes remarquables — volontairement plus soutenue. */
  remarkableOpacity: number
  /** Pointillé, en unités MONDE (mètres) comme le reste de la lib. `null` = trait plein. */
  dash: { dash: number; gap: number } | null
  /**
   * Lignes toujours tracées quelle que soit la maille, avec leur clé de libellé (résolue
   * dans `labels.graticule.remarkable`).
   *
   * ⚠️ En config et non en constantes : l'obliquité de l'écliptique (23,4363°) dérive
   * lentement, et un tileset non terrestre n'a ni tropiques ni cercles polaires.
   */
  remarkable: {
    enabled: boolean
    parallels: readonly { lat: number; labelKey: string }[]
    meridians: readonly { lng: number; labelKey: string }[]
  }
  /**
   * Bande de fondu à l'inclinaison, en **fractions du plafond du mode courant**
   * (`camera.maxTilt3d` ou `camera.maxTilt2d`).
   *
   * ⚠️ Des fractions et non des degrés : le plafond vaut 79,2° en 3D mais 36° en mode plan,
   * donc une bande écrite « 60° → 75° » ne se déclencherait JAMAIS à plat. Aux défauts :
   * 59,4°→75,2° en 3D, 27,0°→34,2° en plan.
   */
  tiltFade: { start: number; end: number }
  /** Constante de temps du fondu (ms) — c'est elle qui donne la douceur. */
  fadeMs: number
  /** Fondu croisé au changement de maille (ms) — `0` le supprime (bascule sèche). */
  levelFadeMs: number
  labels: {
    enabled: boolean
    /**
     * `'center-cross'` : latitudes le long du méridien le plus proche du centre, longitudes
     * le long du parallèle le plus proche — c'est ce qui plafonne naturellement le nombre
     * d'étiquettes quel que soit le zoom. `'edges'` les colle aux bords du viewport, ce qui
     * ne recouvre jamais le contenu regardé.
     */
    placement: 'center-cross' | 'edges'
    /** Plafond dur d'étiquettes affichées. */
    maxLabels: number
    /** Écart minimal (px) entre deux étiquettes d'une même chaîne. */
    spacingPx: number
    /** Orienter l'étiquette dans le sens de sa ligne. */
    rotate: boolean
    /** `'auto'` suit la maille : ≥ 1° → `45°N`, minutes → `45°11′N`, secondes → `45°11′25″N`. */
    format: CoordFormat
    /** Afficher le nom des lignes remarquables (« Équateur », « Tropique du Cancer »…). */
    remarkableNames: boolean
    /**
     * Opacité au repos. Les étiquettes se font oublier tant qu'on ne les cherche pas, et
     * redeviennent pleinement opaques sous le pointeur. `1` supprime l'effet.
     */
    idleOpacity: number
    /**
     * Marge (px) autour d'une étiquette pour la juger survolée.
     *
     * ⚠️ Le survol est calculé GÉOMÉTRIQUEMENT, sur la position écran que la couche connaît
     * déjà — les étiquettes restent en `pointer-events: none`. Les rendre survolables en CSS
     * leur ferait intercepter les gestes de la carte : commencer un déplacement sur une
     * étiquette n'aurait plus déplacé la carte.
     */
    hoverPaddingPx: number
  }
}

/** Arbre de réglages complet — chaque feuille a une valeur (cf. `defaultConfig`). */
/**
 * Catalogue d'entités géographiques distantes — cf. `CatalogSource`.
 *
 * 💰 Chaque frappe non amortie est une requête vers l'API de l'hôte, exactement comme
 * pour la boîte de recherche : `debounceMs` est le levier direct sur ce volume.
 */
export type CatalogConfig = {
  /** Éléments demandés par page à `CatalogSource.list`. */
  pageSize: number
  /** Anti-rebond de la frappe avant d'interroger la source. */
  debounceMs: number
  /**
   * Actions de source rendues en ligne sur une ligne de liste.
   *
   * Au-delà, c'est le NOM qui disparaît — déjà tronqué par construction. Les actions
   * excédentaires sont ignorées, avec un avertissement en développement.
   */
  maxInlineActions: number
  /**
   * Lignes rendues hors écran de chaque côté de la fenêtre virtuelle.
   *
   * C'est le curseur entre « pas de vide au défilement rapide » et « travail React par
   * frame de scroll » : chaque unité ajoute DEUX lignes rendues à chaque frame.
   */
  overscanRows: number
  /**
   * 💰 Distance au bas de liste qui déclenche la page suivante (px).
   *
   * Elle décide du VOLUME d'appels à `CatalogSource.list` : une marge large précharge
   * pendant qu'on défile encore (pas d'à-coup) mais demande des pages qu'on ne
   * regardera peut-être jamais. Même levier que `debounceMs` sur la frappe.
   */
  prefetchMarginPx: number
  /**
   * Anti-rebond avant d'écrire la sélection dans le stockage.
   *
   * `localStorage.setItem` est SYNCHRONE : sans amortissement, une rafale de gestes
   * (cocher un agrégat, restaurer une session) écrit autant de fois qu'elle compte
   * d'éléments, sur une charge qui grossit à chaque tour. `0` écrit immédiatement.
   * La charge en attente est toujours vidée avant que la page ne disparaisse.
   */
  persistDebounceMs: number
}

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
}

/** Ce que fournit l'application : n'importe quel sous-arbre de `MapConfig`. */
export type PartialConfig = DeepPartial<MapConfig>
