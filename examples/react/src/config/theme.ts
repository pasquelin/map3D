import { type MapTheme, type MarkerColor, type PartialTheme, defaultTheme, mergeTheme } from 'map3d'

import { TAG_COLORS, TYPE_COLORS, ZONE_STROKE } from './colors'

/* ══════════════════ THÈME DE DÉMO — un COUPLE clair/sombre ══════════════════
   `<Map colorScheme>` ne bascule rien par lui-même : `MapProvider` s'en sert pour
   CHOISIR dans un couple `{ light, dark }` (`base = isPair(theme) ? theme[scheme] :
   theme`). Un thème unique, si sombre soit-il, rend donc la prop inopérante — la carte
   reste telle qu'elle est déclarée.

   D'où ce couple. Tout ce qui relève du MÉTIER est commun aux deux : la couleur d'un
   type de marker, d'un tag ou d'une zone ne dépend pas de la luminosité de
   l'interface — une alerte critique est rouge sur fond clair comme sur fond sombre.
   Ne divergent que le fond, les surfaces d'UI et les ombres. */

const mk = (hex: string): MarkerColor => ({ base: hex, accent: hex, contrast: '#ffffff' })

/** Vocabulaire de la démo — identique dans les deux schémas. */
const SHARED: PartialTheme = {
  colors: {
    // Dérivé du registre : un type ajouté atteint le thème — donc les surfaces de la
    // lib (listes, clusters, vignettes, dock) — sans qu'on ait à y penser.
    marker: Object.fromEntries(Object.entries(TYPE_COLORS).map(([type, hex]) => [type, mk(hex)])),
    zone: { fill: ZONE_STROKE, stroke: ZONE_STROKE },
    tags: TAG_COLORS,
    ui: { accent: ZONE_STROKE },
  },
  markers: { size: 44, ringWidth: 3, gradient: true, gloss: true },
  // `clustering` (rayon, minPoints, maxZoom) a migré du thème vers `MapConfig` : ce
  // sont des paramètres d'algorithme, pas d'apparence. Ils se règlent désormais par
  // couche (`cluster:` de `markersLayer`) ou dans `config.clustering`.
  // La géométrie du donut, elle, reste au thème (`clusters`) — la démo prend ses
  // défauts, qui sont ceux de la lib.
  animations: {
    enabled: true,
    halo: { duration: 2600, easing: 'cubic-bezier(.2,.6,.35,1)', maxScale: 2.1 },
    pulse: { duration: 2000, easing: 'ease-out', scale: 1.16 },
    markerEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 30 },
    flyDuration: 1.0,
  },
}

const dark: MapTheme = mergeTheme(defaultTheme, {
  ...SHARED,
  colorScheme: 'dark',
  colors: { ...SHARED.colors, background: '#0d1415' },
})

/**
 * Variante claire. `defaultTheme` est sombre de bout en bout (panneaux translucides
 * noirs, texte blanc, ombres denses) : il ne suffit donc pas d'éclaircir le fond, il
 * faut reprendre chaque couleur qui suppose un fond noir sous elle.
 */
const light: MapTheme = mergeTheme(defaultTheme, {
  ...SHARED,
  colorScheme: 'light',
  colors: {
    ...SHARED.colors,
    // Gris légèrement bleuté plutôt que blanc pur : le fond n'est visible qu'avant le
    // chargement des tuiles, et un blanc franc y fait un flash.
    background: '#e6ecee',
    ui: {
      ...SHARED.colors?.ui,
      panel: 'rgba(255,255,255,0.94)',
      text: '#0f172a',
      muted: '#5b6b7a',
      border: 'rgba(15,23,42,0.12)',
    },
    // Le cœur du donut porte le total : clair sur fond clair, avec un texte sombre et
    // un anneau qui le détache des parts colorées.
    cluster: { core: '#f1f5f9', text: '#0f172a', ring: '#0f172a' },
    // Le rectangle de sélection s'inverse : voile sombre, liseré clair.
    marquee: { fill: 'rgba(15,23,42,0.10)', stroke: '#ffffff', under: '#0f172a' },
  },
  // Des ombres noires à 45 % sur fond clair font des taches ; on descend l'opacité et
  // on garde le décalage, qui est ce qui donne le relief.
  shadows: {
    sm: '0 1px 2px rgba(15,23,42,0.10)',
    md: '0 3px 8px rgba(15,23,42,0.12),0 1px 2px rgba(15,23,42,0.08)',
    lg: '0 10px 26px rgba(15,23,42,0.16),0 3px 8px rgba(15,23,42,0.10)',
  },
})

/** Couple `{ light, dark }` : c'est CE qui rend `<Map colorScheme>` opérant. */
export const theme = { light, dark }

/**
 * Diamètre de l'anneau de sélection, dérivé de la taille de marker du thème — la
 * pastille visible de nos sprites ne couvre que 58/80 du gabarit (r=29 dans un
 * viewBox 80). `theme.markers.size` reste la seule source de la taille.
 *
 * Lu sur `dark` : la taille fait partie du vocabulaire COMMUN (`SHARED.markers`), donc
 * les deux schémas portent la même — la lire ici ou sur `light` revient au même.
 */
export const SELECTION_RING = Math.round(dark.markers.size * (58 / 80)) + 2
