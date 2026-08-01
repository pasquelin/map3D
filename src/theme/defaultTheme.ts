import { easeInOutCubic } from '../core/math'
import { BAR_INSET, EDGE, GAP, LENS_PANEL_W, SELECTION_PANEL_W, TEMPLATES_PANEL_W } from '../style/panelGeometry'
import type { MapTheme } from './types'

/** Thème neutre par défaut (base du merge profond). Tout est surchargeable. */
export const defaultTheme: MapTheme = {
  colorScheme: 'dark',
  colors: {
    background: '#0d1415',
    marker: {
      default: { base: '#2E7CF6', accent: '#78BEFF', contrast: '#ffffff' },
    },
    tags: {},
    // Couleur PROPRE au centre du cluster : gris ardoise neutre, distinct des couleurs
    // de type/accent → dit « total » sans se confondre avec une sévérité.
    cluster: { core: '#1e293b', text: '#ffffff', ring: '#ffffff' },
    draw: {
      palette: ['#F0503A', '#EE8F0A', '#079A7D', '#2E7CF6', '#6344F0', '#101828'],
      default: '#2E7CF6',
    },
    ui: {
      // Verre dépoli : l'opacité doit rester LÉGÈRE pour que le `backdrop-filter` des
      // surfaces se voie. À 0.92 il ne restait que 8 % de fond visible — le flou était
      // bien appliqué, mais invisible, et toutes les surfaces paraissaient opaques.
      panel: 'rgba(20,26,30,0.9)',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#2E7CF6',
      error: '#d11a01',
      border: 'rgba(255,255,255,0.10)',
      // Verdicts du panneau de diagnostic. Le vert est volontairement DISCRET (proche du
      // texte) et le rouge distinct d'`error` : ici on lit un budget, pas une panne. Un
      // panneau où tout crie n'apprend rien — c'est le jaune et le rouge qui doivent
      // sauter aux yeux, et eux seuls.
      stat: { ok: '#4ade80', warn: '#facc15', bad: '#f87171' },
    },
    // Signaux opérationnels (pas décoratifs) : jaune vif pour « à traiter »,
    // rouge vif pour le viseur d'urgence — faits pour sauter aux yeux.
    attention: { sonar: '#ffd60a', target: '#ff3b30' },
    // Mode piéton : reprend les couleurs d'état de l'interface plutôt que d'en inventer.
    // Un curseur avec sa propre palette jurerait avec le reste de la carte.
    pedestrian: { placeValid: '#2E7CF6', placeBlocked: '#d11a01', reticle: '#f8fafc' },
    // Grille en JAUNE, et non en blanc comme un atlas : le blanc disparaît sur un fond plan
    // clair (mesuré sur la carte routière de l'exemple, où les lignes ne se voyaient plus),
    // alors que l'ambre tient sur les deux fonds — satellite sombre comme plan clair — sans
    // se confondre avec aucune couleur de la palette de dessin.
    // Les remarquables passent donc à l'ambre FONCÉ : elles doivent rester distinguables des
    // lignes ordinaires, or les deux ne peuvent plus se départager par « blanc vs jaune ».
    graticule: {
      line: '#ffd54a',
      remarkable: '#ff8f00',
      label: '#ffffff',
      labelBackground: 'rgba(0,0,0,0.55)',
    },
    path: { base: '#2E7CF6', casing: '#ffffff', selected: '#ffd54a' },
    zone: { fill: '#079A7D', stroke: '#079A7D' },
    // Reprend à l'identique les replis qui vivaient dans la feuille de styles
    // (`.m3d-marquee*`). Sans défaut ici, ces trois couleurs n'existaient QUE côté
    // CSS : ni lisibles depuis le JS, ni atteignables par une charte, alors que le
    // type les déclare depuis le début.
    marquee: { fill: 'rgba(255,255,255,0.12)', stroke: '#000000', under: '#ffffff' },
  },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 3px 8px rgba(0,0,0,0.35),0 1px 2px rgba(0,0,0,0.3)',
    lg: '0 10px 26px rgba(0,0,0,0.45),0 3px 8px rgba(0,0,0,0.3)',
  },
  radii: { sm: 6, md: 10, lg: 14, pill: 999 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    sizes: { xs: 10.5, sm: 12.5, md: 13.5, lg: 16 },
    weights: { medium: 500, semibold: 600, bold: 700 },
  },
  markers: {
    size: 44,
    ringWidth: 3,
    gradient: true,
    gloss: true,
    icon: 'type',
    moveTween: { duration: 500, easing: easeInOutCubic },
  },
  // Valeurs reprises du donut réellement dessiné par `<DefaultCluster>`, à
  // l'identique : le thème décrit enfin ce que le composant fait.
  clusters: {
    coreRadius: (total) => Math.min(28, 19 + Math.sqrt(total)),
    ringWidth: 30,
    strokeWidth: 2.5,
    segmentGap: 0.045,
    startAngle: Math.PI,
  },
  animations: {
    enabled: true,
    pulse: { duration: 2000, easing: 'ease-out', scale: 1.16 },
    halo: { duration: 2600, easing: 'cubic-bezier(.2,.6,.35,1)', maxScale: 2.1 },
    bob: { duration: 2400, amplitude: 4 },
    markerEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 30 },
    clusterEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 55 },
    menuOpen: { duration: 200, easing: 'cubic-bezier(.32,1.3,.5,1)' },
    flyDuration: 1.0,
    flyEasing: easeInOutCubic,
    // Reprises telles quelles des littéraux qui vivaient dans huit fichiers.
    pan: 0.5,
    zoom: 0.4,
    moveTo: 0.4,
    target: 0.8,
    clusterOpen: 0.6,
    topDown: 0.5,
    globe: 1.0,
  },
  // Valeurs reprises de `style/panelGeometry`, qui en reste l'unique source pour le
  // code sans thème (SSR, hooks montés hors carte).
  spacing: { gap: GAP, edge: EDGE, barInset: BAR_INSET },
  sizing: {
    lensPanelW: LENS_PANEL_W,
    selectionPanelW: SELECTION_PANEL_W,
    templatesPanelW: TEMPLATES_PANEL_W,
    panelMaxHeight: {
      tags: 380,
      symbols: 420,
      search: 340,
      settings: 560,
      settingsSub: 520,
      templates: 460,
      catalog: 380,
    },
    // 34 px : la hauteur d'une ligne du panneau « Couches », dont le catalogue reprend
    // la densité — les deux panneaux s'ouvrent depuis la même barre.
    catalogRowHeight: 34,
    catalogIndent: 18,
    catalogChevronW: 18,
    catalogPanelW: 252,
    catalogSubPanelW: 252,
    iconSize: 0.8,
  },
  // Fond de carte accordé au thème SOMBRE par défaut : les tuiles Google sont
  // produites claires, et leur API n'offre pas de variante sombre. Réglage volontai-
  // rement doux — assez pour que la carte cesse d'éblouir sous une UI sombre, pas
  // assez pour fausser la lecture d'une imagerie satellite. `tiles: undefined` (ou
  // un thème clair) rend les tuiles telles quelles.
  tiles: { filter: { brightness: 0.85, saturation: 0.9, contrast: 1.05 } },
  // `tileSurface` et `transitionZoom` décrivaient une stratégie de rendu, pas une
  // apparence — et n'avaient aucun consommateur. Ne restent que les couleurs, dont
  // `oceanColor` est désormais réellement lue (globes de repli).
  globe: {
    background: '#070C16',
    oceanColor: '#0F2942',
    landColor: '#4F7A45',
    // ⚠️ Nouvelle. Le voile de distance du mode piéton prenait le fond du canvas ; depuis que
    // le ciel se peint au plan far, ce n'est plus lui qu'on voit derrière le décor, et les
    // façades lointaines se découpaient en barre claire sur le bleu. Teinte relevée du ciel
    // par défaut (turbidité 2, rayleigh 1,2) au ras de l'horizon, en milieu de journée.
    hazeColor: '#C4D6E4',
    // Façade plus sombre que le toit : la scène n'a AUCUNE lumière (tout est en
    // MeshBasicMaterial), donc ce contraste porte la face haute.
    buildingColor: '#8A8E96',
    buildingRoofColor: '#C2C6CE',
    // ⚠️ Était le littéral `ROOF_LIGHTEN` de `BuildingsLayer`. Même écart relatif que
    // celui des deux teintes ci-dessus, pour que les emprises colorées par la donnée se
    // lisent comme les autres.
    buildingRoofLighten: 0.35,
    // ⚠️ Nouveaux. Le contraste toit/façade ne suffisait pas : toutes les façades d'un
    // quartier partageaient une teinte unique, quelle que soit leur orientation, et les
    // volumes se lisaient comme une nappe grise.
    //
    // Est-sud-est, et surtout PAS un multiple de 45° : sur une diagonale exacte, les
    // quatre façades d'un bâtiment orthogonal — la forme la plus courante — tombent deux
    // par deux sur la même teinte, et l'angle du bâtiment redevient invisible. 120° donne
    // quatre tons distincts, ce qu'un test vérifie.
    buildingSunAzimuth: 120,
    buildingShadeMin: 0.62,
    // Survol chaud et sélection saturée : elles doivent se distinguer entre elles ET du
    // gris des façades, sur lequel l'ombrage de sommet est déjà cuit.
    buildingHoverColor: '#F2B441',
    buildingSelectColor: '#E8613C',
  },
}
