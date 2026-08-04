// Domaine « fond de carte » : le mode affiché, et les CAPACITÉS qui décident de ce que
// l'UI a le droit de proposer.
//
// Deux axes INDÉPENDANTS y jouent : le fournisseur du fond plat
// (`providers.tiles.provider`) et celui du volume (`providers.tiles3d.provider`). Un fond
// 2D auto-hébergé peut cohabiter avec un volume photoréaliste, et l'inverse.
//
// Les deux fournisseurs de tuiles n'offrent pas les mêmes options (trafic seulement par
// emprunt en interne, pas de volume tant que ni relief ni bâtiments ne sont activés). Ces règles
// sont réunies ici, en une fonction pure : dispersées dans les composants, elles
// divergeaient — un bouton restait affiché sans rien derrière.

import type { TileProvider } from '../config/types'

/**
 * Type de carte, commun aux deux fournisseurs :
 * - `'plan'` — carte plate. Externe : tuiles Google drapées. Interne : raster du serveur.
 * - `'3d'` — volume. Externe : tuiles 3D photoréalistes. Interne : relief du terrain et
 *   bâtiments extrudés.
 */
export type MapMode = '3d' | 'plan'

/** Fond de carte affiché, calques optionnels qui en dépendent, et ce qui est possible. */
export type BasemapState = {
  mode: MapMode
  traffic: boolean
  /**
   * Une carte plate est servable : clé Google en `'external'`, origine renseignée en
   * `'internal'`.
   */
  canPlan: boolean
  /**
   * Du volume est servable : un tileset 3D (token Ion ou clé Google) en `'external'`,
   * du relief ou des bâtiments en `'internal'`.
   */
  can3d: boolean
  /**
   * Le trafic est un calque de la tuile Google (`layerTypes` demandé à la session), pas
   * une surcouche transparente : il exige donc un fond 2D présent, hors mode 3D, servi par
   * Google — ou un fournisseur interne qui peut EMPRUNTER Google le temps du calque (cf.
   * `BasemapSupport.canBorrowTraffic`). Diffusé plutôt que redérivé par chaque
   * consommateur — l'UI n'a pas à connaître la règle.
   */
  trafficAvailable: boolean
  /**
   * Un bâtiment est **désignable** : le volume à l'écran est celui du fournisseur interne,
   * fait d'emprises MVT extrudées, chacune avec son identité.
   *
   * Le photoréaliste externe est hors de portée par nature — un maillage texturé fusionné,
   * où il n'y a aucun bâtiment à distinguer d'un autre.
   */
  canPickBuildings: boolean
}

/** Ce que le moteur sait de ses sources, au moment où il publie ses capacités. */
export type BasemapSupport = {
  /** Une source de tuiles 2D a pu être créée (cf. `createTileSource`). */
  hasBasemap2d: boolean
  /** Cette source sait servir le calque trafic. */
  sourceSupportsTraffic: boolean
  /**
   * La source COURANTE ne sert pas le trafic, mais le fond peut passer chez celui qui le
   * sert le temps du calque : fournisseur 2D interne, clé Google fournie, et
   * `providers.tiles.trafficViaExternal` laissé à `true`.
   *
   * Distinct de `sourceSupportsTraffic` parce que ce n'est PAS la même chose : l'un décrit
   * ce que la source montée sait faire, l'autre ce que le moteur peut monter à la place.
   * Les confondre ferait annoncer un fond Google là où il n'y en a pas encore.
   */
  canBorrowTraffic: boolean
  /** D'où doit venir le volume — `providers.tiles3d.provider`. */
  provider3d: TileProvider
  /** Un tileset 3D photoréaliste est monté (token Cesium Ion ou clé Google). */
  has3dTileset: boolean
  /** Le relief interne est activé ET servable. */
  hasRelief: boolean
  /** Les bâtiments internes sont activés ET servables. */
  hasBuildings: boolean
}

/**
 * Capacités du fond de carte pour un mode donné. Pure : c'est la table de vérité de
 * l'UI, et elle se teste sans moteur ni WebGL.
 *
 * NB : `can3d` en externe se déduit de la présence d'un token/clé, pas d'un tileset
 * réellement servi — les tuiles 3D Google sont par exemple bloquées pour les comptes
 * EEA. C'était déjà le cas avant que ces règles soient rassemblées.
 */
export function deriveBasemapCapabilities(mode: MapMode, support: BasemapSupport, traffic: boolean): BasemapState {
  const canPlan = support.hasBasemap2d
  // Le fournisseur de volume décide de ce qui COMPTE : un token Ion ne donne pas de 3D à
  // qui a choisi le volume interne, et un relief interne n'en donne pas à qui attend les
  // tuiles photoréalistes. Les deux axes (2D / 3D) restent indépendants.
  const can3d = support.provider3d === 'external' ? support.has3dTileset : support.hasRelief || support.hasBuildings
  // Servi par la source montée, OU par celle que le moteur mettra à sa place le temps du
  // calque : le bouton doit rester offert PENDANT la bascule, sinon il disparaîtrait à
  // l'aller (source interne encore là) puis au retour (source Google déjà partie).
  const trafficAvailable = (support.sourceSupportsTraffic || support.canBorrowTraffic) && canPlan && mode !== '3d'
  const canPickBuildings = mode === '3d' && support.provider3d === 'internal' && support.hasBuildings
  return {
    mode,
    // Le trafic est un calque du fond plat : hors mode plan il n'a rien à quoi s'accrocher.
    // Forcé ici plutôt que laissé au seul `setTrafficVisible` — plusieurs chemins changent
    // le mode (bascule, config qui retire le fond sous nos pieds), et l'un d'eux publiait
    // un état où `traffic` restait vrai avec `trafficAvailable` faux : l'UI voyait un
    // calque allumé qu'elle n'avait pas le droit d'afficher.
    traffic: traffic && trafficAvailable,
    canPlan,
    can3d,
    trafficAvailable,
    canPickBuildings,
  }
}

/**
 * Le mode demandé a-t-il de quoi s'afficher ?
 *
 * Table de vérité UNIQUE de la bascule : le moteur s'en sert pour refuser un changement
 * qui viderait l'écran, la barre pour ne pas proposer le bouton correspondant, et son
 * raccourci pour ne pas y mener non plus. Trois tests séparés finissaient par diverger —
 * c'est ainsi que le bouton « 3D » restait offert sans volume derrière.
 */
export function canEnterMode(state: BasemapState, mode: MapMode): boolean {
  return mode === '3d' ? state.can3d : state.canPlan
}
