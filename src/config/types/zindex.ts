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
