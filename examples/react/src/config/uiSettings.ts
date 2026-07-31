import type { ControlGroup, DrawTool, DrawToolbarSection, MapControlButton, SelectMode } from 'map3d'

/* ══════════════════ SURFACES D'INTERFACE, PILOTABLES ══════════════════
   `<Map>` monte son interface à partir de ses props : `toolbar`, `controls`, `search`,
   `dock`, `draw`, `cluster`, `relations`. Chacune se retire (`false`), se règle (objet)
   ou prend ses défauts (absente) — et, pour les deux barres, se découpe au bouton près.

   Ce module ne fait que rendre ces choix ADRESSABLES depuis le banc d'essai : un
   enregistrement plat de booléens, que `App` retraduit en props. Écrire l'inverse
   (le panneau fabriquant les props) l'obligerait à connaître les callbacks métier
   (`lens.getId`, `dock.items`, `draw.onChange`) qui, eux, appartiennent à l'app. */

/* Ces cinq listes réénumèrent des unions de la lib. Elles sont typées en
   `Record<Union, true>` plutôt qu'en tableau : un membre ajouté à `DrawTool` ou à
   `MapControlButton` devient alors une ERREUR DE COMPILATION ici, là où un
   `readonly DrawTool[]` acceptait sans broncher une liste devenue incomplète — le
   nouveau bouton n'aurait simplement jamais paru dans le panneau. */
const keysOf = <K extends string>(all: Record<K, true>): readonly K[] => Object.keys(all) as K[]

/**
 * Ordre d'affichage — et surtout ordre PASSÉ en prop `tools`.
 *
 * Il doit suivre `DEFAULT_DRAW_TOOLS` de la lib : c'est le tableau qu'on lui rend
 * quand toutes les cases sont cochées, et un ordre différent réarrangeait la barre
 * (`symbol` se retrouvait après `erase` au lieu d'être entre `arrow` et `measure`).
 */
export const DRAW_TOOLS = keysOf<DrawTool>({
  select: true,
  line: true,
  polygon: true,
  rect: true,
  circle: true,
  freehand: true,
  arrow: true,
  symbol: true,
  measure: true,
  erase: true,
})

export const SELECT_MODES = keysOf<SelectMode>({ rect: true, poly: true, lasso: true })

export const TOOLBAR_SECTIONS = keysOf<DrawToolbarSection>({
  navigate: true,
  select: true,
  symbol: true,
  measure: true,
  lens: true,
  plugins: true,
  stylePanel: true,
  settings: true,
  undo: true,
  redo: true,
  clear: true,
})

export const CONTROL_BUTTONS = keysOf<MapControlButton>({
  pan: true,
  rotate: true,
  compass: true,
  zoomIn: true,
  zoomOut: true,
  tilt: true,
  topDown: true,
  globe: true,
  graticule: true,
  layers: true,
  fullscreen: true,
  mode3d: true,
  plan: true,
  traffic: true,
  pedestrian: true,
  target: true,
})

export const CONTROL_GROUPS = keysOf<ControlGroup>({
  drag: true,
  compass: true,
  zoom: true,
  view: true,
  basemap: true,
  pedestrian: true,
  target: true,
  layers: true,
  fullscreen: true,
})

export type UiSettings = {
  toolbar: {
    enabled: boolean
    position: 'left' | 'right'
    /** Zoom sous lequel la barre se replie. `0` la garde toujours visible. */
    minZoom: number
    /** L'outil loupe, qui se règle DANS la barre — `false` retire bouton et raccourci. */
    lens: boolean
    tools: Record<DrawTool, boolean>
    selectModes: Record<SelectMode, boolean>
    sections: Record<DrawToolbarSection, boolean>
  }
  controls: {
    enabled: boolean
    position: 'left' | 'right'
    /** La prop `target` fournie ajoute le bouton « revenir à la cible ». */
    target: boolean
    buttons: Record<MapControlButton, boolean>
    groups: Record<ControlGroup, boolean>
  }
  search: boolean
  dock: boolean
  /** Gestionnaire de templates (haut-droite) : sauvegardes de dessin. */
  templates: {
    enabled: boolean
    /** `true` : provider API de démo (in-memory, prime sur le local). `false` : localStorage seul. */
    useApi: boolean
  }
  draw: boolean
  cluster: boolean
  relations: boolean
  /** Sonde `DrawDebug` : logs console + `window.drawApi`. */
  drawDebug: boolean
  /** Moniteur `StatsOverlay` : FPS/RAM (stats.js) + compteurs `renderer.info`, en haut à droite. */
  stats: boolean
}

const allOn = <K extends string>(keys: readonly K[]): Record<K, boolean> =>
  Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>

/** Ce que la démo montre par défaut : tout, comme avant l'arrivée du banc d'essai. */
export const defaultUiSettings: UiSettings = {
  toolbar: {
    enabled: true,
    position: 'left',
    minZoom: 11,
    lens: true,
    tools: allOn(DRAW_TOOLS),
    selectModes: allOn(SELECT_MODES),
    sections: allOn(TOOLBAR_SECTIONS),
  },
  controls: {
    enabled: true,
    position: 'right',
    target: true,
    buttons: allOn(CONTROL_BUTTONS),
    groups: allOn(CONTROL_GROUPS),
  },
  search: true,
  dock: true,
  templates: { enabled: true, useApi: false },
  draw: true,
  cluster: true,
  relations: true,
  drawDebug: true,
  // Outil de mesure : éteint par défaut, on l'allume pour profiler.
  stats: false,
}

/** Les clés cochées, dans l'ordre déclaré — la forme qu'attendent `tools`/`selectModes`. */
export const enabledKeys = <K extends string>(order: readonly K[], state: Record<K, boolean>): K[] =>
  order.filter((k) => state[k])

/**
 * `SlotConfig` / `buttons` n'écrivent QUE les entrées à masquer.
 *
 * Un `{ navigate: true }` explicite serait équivalent pour la lib, mais l'absence dit
 * « défaut » sans le faire dire à dix `true` — et c'est ce que l'hôte écrirait à la
 * main dans son propre code.
 */
export const hiddenOnly = <K extends string>(
  order: readonly K[],
  state: Record<K, boolean>,
): Partial<Record<K, boolean>> =>
  Object.fromEntries(order.filter((k) => !state[k]).map((k) => [k, false])) as Partial<Record<K, boolean>>
