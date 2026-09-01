import type { RenderOrderConfig, ZIndexConfig } from '../types'

// ⚠️ Nouveau : l'échelle d'empilement, jusqu'ici éparpillée dans la feuille de
// styles. Valeurs reprises à l'identique.
export const zIndexDefaults: ZIndexConfig = {
  // ── Plan RACINE ────────────────────────────────────────────────────────
  // `mapOverlay` enferme TOUT ce que la carte dessine (markers, poignées,
  // loupe) sous les surfaces d'UI. Il valait 999 comme les barres : les
  // poignées d'édition perçaient donc les panneaux, et les ancres de markers
  // (`z-index: 1..N` posés par CSS2DRenderer) passaient devant le HUD dès
  // qu'il y avait plus de ~20 markers à l'écran.
  mapOverlay: 100,
  // Valait 20 — soit SOUS l'overlay carte, l'inverse de ce que sa doc annonçait.
  floatingHud: 900,
  dock: 990,
  ui: 991,
  // Infobulles de barre : AU-DESSUS des panneaux (`ui`), SOUS les menus. Il n'y
  // avait pas d'entier libre entre 991 et 992 — d'où `menu` remonté d'un cran
  // plutôt qu'une égalité, que seul l'ordre du DOM aurait tranchée.
  barTooltip: 992,
  menu: 993,
  // Au-dessus des menus : une modale (confirmation) doit couvrir toute l'UI.
  modal: 1092,
  // ── Plan CARTE (à l'intérieur de `.m3d-overlay`) ───────────────────────
  relationBar: 6,
  editOverlay: 15,
  // Le plus bas du plan CARTE : la grille est un fond de repère, elle passe sous tout.
  graticuleLabel: 1,
  listMenu: 96,
  // ── Plan LOCAL (dans la surface porteuse) ──────────────────────────────
  // Infobulles : enfermées dans l'ancre du marker ou dans le panneau qui les
  // rend, deux contextes isolés. `2` ne les met donc pas « sous » relationBar :
  // les deux ne se comparent jamais. Cf. la note sur le type.
  tooltip: 2,
  // Dans l'ancre d'un marker seulement — cf. la note sur le type.
  markerSelected: 80,
}

/** Cf. `RenderOrderConfig` — valeurs qui étaient en dur dans chaque couche. */
export const renderOrderDefaults: RenderOrderConfig = {
  shapes: 1,
  paths: 1,
  links: 1,
  relations: 2,
  drawings: 4,
}
