// Primitives mathématiques pures : aucune dépendance à Three ni au DOM — testables
// et SSR-safe. Seuls les helpers réellement consommés par le moteur sont conservés.

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI
/** Un tour complet (rad). SOURCE UNIQUE — ne pas réécrire `Math.PI * 2` en littéral. */
export const TAU = Math.PI * 2

/** Circonférence terrestre (m) — base des conversions zoom ↔ altitude ↔ résolution. */
export const EARTH_CIRCUMFERENCE = 40_075_016
/** Mètres par degré de latitude (approx. équirectangulaire, suffisant < 1 km). */
export const M_PER_DEG = 111_320

/**
 * Côté d'une tuile Web Mercator (px). Imposé par le protocole Google 2D Tiles — ce
 * n'est pas un réglage. Défini ICI parce que `metersPerPixelAtZoom` en dépend :
 * l'avoir laissé dans `googleTiles` obligeait ce module à réécrire `256` en littéral,
 * malgré le commentaire « SOURCE UNIQUE » juste au-dessus. `googleTiles` le
 * ré-exporte pour ne pas déplacer son point d'import public.
 */
export const TILE_SIZE = 256

/**
 * FOV vertical (degrés) de la caméra perspective. SOURCE UNIQUE : `MapEngine` la
 * passe à Three, `Projection` s'en sert de repli quand la caméra reçue n'est pas une
 * perspective. Les deux étaient écrites en littéral — divergentes, tous les calculs
 * mètres/pixel de la lib se seraient faussés en silence.
 */
export const CAMERA_FOV = 60

/** Résolution sol Web-Mercator (m/px, tuiles 256 px) à un zoom et une latitude —
 *  SOURCE UNIQUE de la constante ~156543 : ne pas la réécrire en littéral. */
export function metersPerPixelAtZoom(zoom: number, latDeg: number): number {
  return ((EARTH_CIRCUMFERENCE / TILE_SIZE) * Math.cos(latDeg * DEG2RAD)) / 2 ** zoom
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

/**
 * Échelle de zoom PUBLIQUE de la lib (façon carte 2D : 0 = monde, ~20 = rue) ↔
 * altitude caméra. SOURCE UNIQUE : `MapEngine` les ré-exporte pour la compatibilité,
 * et `Camera.setZoom`/`getZoom` les appellent — les avoir réécrites là-bas laissait
 * deux définitions de l'échelle publique libres de diverger.
 */
export const altitudeForZoom = (zoom: number): number => EARTH_CIRCUMFERENCE / Math.pow(2, zoom)
export const zoomForAltitude = (alt: number): number => Math.log2(EARTH_CIRCUMFERENCE / Math.max(1, alt))

/**
 * Résolution (m/px) d'une vue perspective à `distance` mètres du point visé.
 * Partagée par `Projection.metersPerPixel` (distance caméra→point courante) et
 * `Camera.fitBounds` (altitude VISÉE, pas encore atteinte).
 */
export function metersPerPixelAt(distance: number, fovDeg: number, viewportHeight: number): number {
  return (2 * distance * Math.tan((fovDeg * DEG2RAD) / 2)) / Math.max(1, viewportHeight)
}

/** Plus court delta angulaire (degrés) de `from` vers `to`, dans [-180, 180]. */
export function shortestLngDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/** Ramène une longitude dans [-180, 180). SOURCE UNIQUE de la convention d'antiméridien. */
export function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

/**
 * Ramène `lng` à moins de 180° de `ref`, quitte à sortir de [-180, 180] — c'est le
 * « déroulé continu » qui permet de comparer des longitudes de part et d'autre de
 * l'antiméridien. En une opération plutôt qu'en boucle : une valeur aberrante
 * (donnée corrompue) ferait sinon tourner des millions d'itérations.
 */
export function unwrapLng(lng: number, ref: number): number {
  return lng - 360 * Math.round((lng - ref) / 360)
}

/** Interpolation lissée cubique C1 symétrique (t ∈ [0,1]). */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Courbe en S de 0 à 1 entre `a` et `b`, bornée aux extrémités.
 *
 * Se distingue d'`easeInOutCubic`, qui exige un `t` déjà ramené dans [0,1] : ici la remise à
 * l'échelle ET le bornage font partie du travail. C'est précisément ce qu'un site d'appel
 * réécrit de travers quand la primitive n'existe pas.
 */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Approche exponentielle de `target`, INDÉPENDANTE de la cadence : `smoothingSeconds` est une
 * constante de temps, pas un facteur par frame — deux pas à 60 Hz donnent le même résultat
 * qu'un pas à 30 Hz. `<= 0` colle immédiatement à la cible.
 *
 * Vivait dans `pedestrianCollision` (lissage vertical de l'œil), mais la formule n'a rien de
 * piéton : tout fondu de la lib en a besoin, et chaque copie diverge sur sa garde.
 */
export function approach(current: number, target: number, smoothingSeconds: number, dt: number): number {
  if (smoothingSeconds <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / smoothingSeconds))
}

/** Ce que le volume interne doit faire à une hauteur donnée (cf. `volumeVisibility`). */
export type VolumeVisibility = {
  /** Volumes montrés à l'écran. */
  show: boolean
  /** Tuiles téléchargées — vrai dès la bande de préchargement, donc au-dessus de `show`. */
  request: boolean
}

/**
 * Seuil d'affichage du volume interne, en MÈTRES AU-DESSUS DU SOL.
 *
 * ⚠️ Le critère était un zoom de vue (`minViewZoom`). Or le zoom se déduit d'une résolution
 * m/px, donc d'une division par la hauteur du viewport : le même seuil valait 7,6 km sur une
 * fenêtre de 700 px et 15,7 km sur 1 440 px. Une altitude ne dépend ni de la fenêtre ni de la
 * latitude — c'est l'unité dans laquelle la règle se formule et se règle.
 *
 * `requestFactor` ouvre une bande de préchargement AU-DESSUS du seuil d'affichage : les tuiles
 * y sont téléchargées et montées sans être montrées, pour que la descente ne les découvre pas
 * à faire. `1` supprime la bande.
 */
export function volumeVisibility(agl: number, maxAltitude: number, requestFactor: number): VolumeVisibility {
  return { show: agl <= maxAltitude, request: agl <= maxAltitude * requestFactor }
}
