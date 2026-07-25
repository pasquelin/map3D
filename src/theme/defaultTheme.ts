import { easeInOutCubic } from '../core/math'
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
    cluster: { core: '#1e293b', satellite: '#6344F0', text: '#ffffff', ring: '#ffffff' },
    draw: {
      palette: ['#F0503A', '#EE8F0A', '#079A7D', '#2E7CF6', '#6344F0', '#101828'],
      default: '#2E7CF6',
    },
    ui: {
      panel: 'rgba(20,26,30,0.92)',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#2E7CF6',
      error: '#d11a01',
      border: 'rgba(255,255,255,0.10)',
    },
    path: { base: '#2E7CF6', casing: '#ffffff' },
    zone: { fill: '#079A7D', stroke: '#079A7D' },
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
    weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
  markers: {
    size: 44,
    ringWidth: 3,
    gradient: true,
    gloss: true,
    icon: 'type',
    moveTween: { duration: 500, easing: easeInOutCubic },
  },
  clusters: {
    coreRadius: (total) => 25 + Math.min(11, Math.sqrt(total) * 1.7),
    satelliteRadius: (count) => 17 + Math.min(5, Math.sqrt(count) * 1.1),
    arcSpan: Math.PI * 1.55,
    startAngle: -Math.PI * 0.94,
    maxSatellites: 4,
  },
  animations: {
    enabled: true,
    pulse: { duration: 2000, easing: 'ease-out', scale: 1.16 },
    halo: { duration: 2600, easing: 'cubic-bezier(.2,.6,.35,1)', maxScale: 2.1 },
    bob: { duration: 2400, amplitude: 4 },
    markerEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 30 },
    clusterEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 55 },
    menuOpen: { duration: 200, easing: 'cubic-bezier(.32,1.3,.5,1)' },
    cameraSmoothing: 0.15,
    flyDuration: 1.0,
    flyEasing: easeInOutCubic,
    flyArcHeight: 0.15,
  },
  camera: {
    minZoom: 2,
    maxZoom: 21,
    maxTilt: 1.05,
    zoomStep: 0.5,
    dragSpeed: { min: 0.002, max: 0.35 },
  },
  clustering: { radius: 60, minPoints: 2, maxZoom: 18, levelQuantization: 1 },
  tiles: {
    cacheSize: 256,
    uploadsPerFrame: 4,
    parentFallback: true,
    priorityByDistance: true,
  },
  globe: {
    tileSurface: 'flat-handoff',
    transitionZoom: 5,
    atmosphere: true,
    background: '#070C16',
    oceanColor: '#0F2942',
    landColor: '#4F7A45',
  },
}
