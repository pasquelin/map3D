import { CAMERA_FOV } from '../../core/math'
import type { CameraConfig } from '../types'

// ⚠️ Déplacé depuis `theme.camera` : bornes de navigation et pas de geste, pas
// d'apparence. Valeurs reprises à l'identique.
export const cameraDefaults: CameraConfig = {
  // ⚠️ `minZoom` et `maxZoom` étaient inertes (cf. leur JSDoc). Valeurs inchangées :
  // `minZoom: 2` (~10 000 km) reste moins contraignant que `maxDistanceFactor`, donc le
  // dézoom que vous connaissez ne bouge pas — les deux réglages cessent seulement de se
  // contredire.
  minZoom: 2,
  maxZoom: 21,
  // ⚠️ Nouveau. ~153 m au-dessus du sol (40 075 016 / 2^18) : on voit un pâté de maisons
  // entier, chaque bâtiment reste identifiable, et la caméra n'entre jamais dans la rue.
  // Un immeuble haussmannien fait ~20 m — la marge est large, y compris sur les tours.
  maxZoom3d: 18,
  maxTilt: 1.05,

  fov: CAMERA_FOV,
  maxTilt3d: Math.PI * 0.44,
  // Aligné sur la 3D (~79°) : on incline le plan autant qu'un volume. On reste borné AVANT
  // l'horizon (0.44π < 0.5π), donc la couverture de tuiles 2D grossit mais reste finie —
  // le resserrer rebornerait cette couverture (et remonterait l'angle de fondu du graticule).
  maxTilt2d: Math.PI * 0.44,
  tiltStep: Math.PI * 0.11,
  zoomFactor: { in: 0.5, out: 2 },
  maxDistanceFactor: 2.5,
  maxAltitudeFactor: 1.5,
  minGroundClearance: 20,
  // ⚠️ Nouveau : déplacement au clavier. 0,8 hauteur-sol par seconde ≈ un écran par
  // seconde au nadir, ce qui reste lisible ; Maj triple.
  keyPan: { speed: 0.8, boost: 3 },
  followAltitude: { min: 200, max: 2_000_000 },
  fitBounds: { margin: 1.35, minAltitude: 350, maxAltitude: 6_000_000 },
}
