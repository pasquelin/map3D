import type { ReactNode } from 'react'

export type MarkerColor = { base: string; accent: string; contrast: string }

export type AnimationSpec<T> = T | false

/**
 * Thème complet et **entièrement paramétrable** : aucune valeur en dur dans le
 * rendu ne doit exister hors de cet objet. Un couple `{ light, dark }` permet le
 * mode clair/sombre synchronisé avec l'app hôte.
 */
export type MapTheme = {
  colorScheme: 'dark' | 'light'
  colors: {
    background: string
    /** Couleur par type de marker (ex. 'alert-critical', 'agent-available'). */
    marker: Record<string, MarkerColor>
    /** Couleur de repérage par tag (panneau « Couches ») ; tag/champ absent → palette hashée de la lib.
     *  Optionnel : un thème complet écrit avant cet ajout reste valide (et ne crashe pas le panneau). */
    tags?: Record<string, string>
    cluster: { core: string; satellite: string; text: string; ring: string }
    draw: { palette: string[]; default: string }
    ui: { panel: string; text: string; muted: string; accent: string; error: string; border: string }
    /** Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels,
     *  couleurs volontairement très voyantes. Optionnel : thème antérieur valide. */
    attention?: { sonar?: string; target?: string }
    path: { base: string; casing: string }
    zone: { fill: string; stroke: string }
  }
  shadows: { sm: string; md: string; lg: string }
  radii: { sm: number; md: number; lg: number; pill: number }
  typography: {
    fontFamily: string
    sizes: Record<string, number>
    weights: Record<string, number>
  }
  markers: {
    size: number
    ringWidth: number
    gradient: boolean
    gloss: boolean
    icon: 'none' | 'type' | 'number' | ReactNode
    /** Tween de position (déplacement animé des agents). */
    moveTween: { duration: number; easing: (t: number) => number }
  }
  clusters: {
    coreRadius: (total: number) => number
    satelliteRadius: (count: number) => number
    arcSpan: number
    startAngle: number
    maxSatellites: number
  }
  animations: {
    enabled: boolean
    pulse: AnimationSpec<{ duration: number; easing: string; scale: number }>
    halo: AnimationSpec<{ duration: number; easing: string; maxScale: number }>
    bob: AnimationSpec<{ duration: number; amplitude: number }>
    markerEnter: { duration: number; easing: string; stagger: number }
    clusterEnter: { duration: number; easing: string; stagger: number }
    menuOpen: { duration: number; easing: string }
    /** Unique coefficient de lissage caméra (0..1). */
    cameraSmoothing: number
    flyDuration: number
    flyEasing: (t: number) => number
    flyArcHeight: number
  }
  camera: {
    minZoom: number
    maxZoom: number
    maxTilt: number
    zoomStep: number
    dragSpeed: { min: number; max: number }
  }
  clustering: {
    radius: number
    minPoints: number
    maxZoom: number
    levelQuantization: number
    /** Zoom à partir duquel un cluster inséparable (points confondus) éclate en
     *  éventail au clic — le zoom max UTILE de la caméra (au-delà elle entre
     *  dans le bâti 3D). Optionnel : 19 (~76 m d'altitude). */
    spiderfyZoom?: number
  }
  tiles: {
    cacheSize: number
    uploadsPerFrame: number
    parentFallback: boolean
    priorityByDistance: boolean
    filter?: {
      brightness?: number
      saturation?: number
      contrast?: number
      invert?: number
      hueRotate?: number
    }
  }
  globe: {
    tileSurface: 'flat-handoff' | 'sphere-quadtree'
    transitionZoom: number
    atmosphere: boolean
    background: string
    oceanColor: string
    landColor: string
    textureUrl?: string
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type PartialTheme = DeepPartial<MapTheme>
/** Un thème unique, ou un couple clair/sombre. */
export type ThemeInput = MapTheme | { light: MapTheme; dark: MapTheme }
