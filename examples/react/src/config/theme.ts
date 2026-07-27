import { type MapTheme, type MarkerColor, defaultTheme, mergeTheme } from 'map3d'

import { TAG_COLORS, TYPE_COLORS, ZONE_STROKE } from './colors'

/* ══════════════════ THÈME DE DÉMO (dark statique) ══════════════════ */

const mk = (hex: string): MarkerColor => ({ base: hex, accent: hex, contrast: '#ffffff' })

export const theme: MapTheme = mergeTheme(defaultTheme, {
  colorScheme: 'dark',
  colors: {
    background: '#0d1415',
    ui: { accent: ZONE_STROKE },
    // Dérivé du registre : un type ajouté atteint le thème — donc les surfaces de la
    // lib (listes, clusters, vignettes, dock) — sans qu'on ait à y penser.
    marker: Object.fromEntries(Object.entries(TYPE_COLORS).map(([type, hex]) => [type, mk(hex)])),
    zone: { fill: ZONE_STROKE, stroke: ZONE_STROKE },
    tags: TAG_COLORS,
  },
  markers: { size: 44, ringWidth: 3, gradient: true, gloss: true },
  clustering: { radius: 60 },
  clusters: { maxSatellites: 4, arcSpan: (279 * Math.PI) / 180 },
  animations: {
    enabled: true,
    halo: { duration: 2600, easing: 'cubic-bezier(.2,.6,.35,1)', maxScale: 2.1 },
    pulse: { duration: 2000, easing: 'ease-out', scale: 1.16 },
    markerEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 30 },
    flyDuration: 1.0,
  },
})

/**
 * Diamètre de l'anneau de sélection, dérivé de la taille de marker du thème — la
 * pastille visible de nos sprites ne couvre que 58/80 du gabarit (r=29 dans un
 * viewBox 80). `theme.markers.size` reste la seule source de la taille.
 */
export const SELECTION_RING = Math.round(theme.markers.size * (58 / 80)) + 2
