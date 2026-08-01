import type { GraticuleConfig } from '../types'

export const graticuleDefaults: GraticuleConfig = {
  // Éteinte par défaut : c'est un calque de repère, pas un décor. Une carte qui
  // l'afficherait d'office imposerait sa grille à toutes les applications hôtes.
  enabled: false,
  targetLines: 8,
  levelHysteresis: 0.15,
  levelRangeDeg: null,
  segmentsPerLine: 128,
  maxLines: 64,
  bandScreens: 2,
  // 85° : au-delà les méridiens se rejoignent — même borne que la couverture de tuiles.
  latLimitDeg: 85,
  heightOffsetMeters: 0,
  // 5 m : sous cette dérive, le décalage projeté reste sous le pixel à toute altitude où
  // la grille est lisible.
  heightToleranceMeters: 5,
  opacity: 0.55,
  remarkableOpacity: 0.85,
  dash: null,
  remarkable: {
    enabled: true,
    parallels: [
      { lat: 0, labelKey: 'equator' },
      // Obliquité de l'écliptique (2026). Elle dérive de ~0,013°/siècle : c'est une
      // donnée, pas une constante — d'où sa place ici plutôt qu'en littéral du code.
      { lat: 23.4363, labelKey: 'tropicCancer' },
      { lat: -23.4363, labelKey: 'tropicCapricorn' },
      { lat: 66.5637, labelKey: 'arcticCircle' },
      { lat: -66.5637, labelKey: 'antarcticCircle' },
    ],
    meridians: [
      { lng: 0, labelKey: 'primeMeridian' },
      // −180 et non 180 : `normalizeLng` ramène dans [-180, 180), et c'est la convention
      // unique du dépôt. Écrit 180, l'antiméridien ne se reconnaîtrait jamais lui-même.
      { lng: -180, labelKey: 'antimeridian' },
    ],
  },
  tiltFade: { start: 0.75, end: 0.95 },
  fadeMs: 250,
  levelFadeMs: 300,
  labels: {
    enabled: true,
    placement: 'center-cross',
    maxLabels: 40,
    spacingPx: 90,
    rotate: true,
    format: 'auto',
    remarkableNames: true,
    // 0,65 : assez présent pour se lire d'un coup d'œil, assez discret pour qu'on voie la
    // carte au travers — c'est un repère, pas une annotation.
    idleOpacity: 0.65,
    hoverPaddingPx: 4,
  },
}
