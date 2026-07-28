// Tuiles vectorielles (Mapbox Vector Tile) → volumes de bâtiments prêts à téléverser.
//
// Ce module est **sans three.js et sans DOM** : c'est ce qui lui permet de tourner tel
// quel dans un Web Worker (cf. `buildingsWorker.ts`) ET sur le thread principal quand
// l'environnement n'a pas de `Worker` (SSR, tests). Un seul chemin de code, donc aucun
// risque de voir les deux diverger.
//
// `@mapbox/vector-tile`, `pbf` et `earcut` sont importés STATIQUEMENT. La paresse est d'un
// cran au-dessus : ce module n'est atteint que par le worker (blob chargé à la première
// tuile) ou par l'`import()` de repli de `BuildingsSource`. Un hôte qui garde le volume
// photoréaliste ne télécharge donc jamais le décodeur — et le worker, lui, n'a aucun
// découpage interne, ce qui lui permet d'être empaqueté en un seul blob autonome.
//
// NB : rien à décompresser ici. Le serveur annonce `Content-Encoding: gzip`, donc le
// navigateur rend déjà le protobuf en clair à `Response.arrayBuffer()`.

import { VectorTile } from '@mapbox/vector-tile'
import earcut from 'earcut'
// pbf 5 n'a plus d'export par défaut : le lecteur et l'écrivain sont séparés.
import { PbfReader } from 'pbf'
import type { BuildingsConfig } from '../config/types'
import { DEG2RAD, RAD2DEG } from '../core/math'

/** Un anneau en coordonnées TUILE (0…`extent`), y vers le bas. */
export type Ring = readonly { x: number; y: number }[]

/**
 * Une emprise à extruder : contour extérieur en premier, trous ensuite (cours
 * intérieures). Les hauteurs sont en mètres au-dessus du sol.
 */
export type Footprint = {
  rings: readonly Ring[]
  height: number
  minHeight: number
  /** Couleur portée par la donnée elle-même ; sinon le thème décide. */
  color?: string
  /** `feature.id` MVT, `undefined` quand la donnée n'en porte pas. */
  featureId: number | undefined
  /** Attributs retenus par `cfg.pickFields` ; `undefined` quand la liste est vide. */
  props: Record<string, unknown> | undefined
}

export type DecodedTile = {
  /** Résolution du repère de la tuile (4096 en OpenMapTiles). */
  extent: number
  footprints: readonly Footprint[]
}

/**
 * Repère local d'une tuile : de quoi passer des coordonnées de tuile aux mètres
 * East-North-Up autour de son centre.
 *
 * Les deux échelles sont **mesurées par l'appelant sur le vrai ellipsoïde** (différences
 * finies, cf. `BuildingsLayer.frameFor`) plutôt que recalculées ici : ce module ne
 * contient donc aucune géodésie, et ne peut pas dériver de celle du moteur.
 */
export type TileFrame = {
  z: number
  x: number
  y: number
  /** Centre de la tuile (degrés) — origine du repère. */
  lat0: number
  lng0: number
  /** Mètres par degré de longitude / de latitude, à cette latitude et sur cet ellipsoïde. */
  metersPerDegLng: number
  metersPerDegLat: number
}

/**
 * Une entrée de palette : la couleur telle que la donnée l'écrit, et la face concernée.
 *
 * Les couleurs ne sont PAS résolues ici. La donnée mélange hexadécimal et mots-clés CSS
 * (`beige`, `silver`, `lightyellow` cohabitent avec `#5a81a0` sur une seule tuile
 * parisienne) : les résoudre demanderait de recopier la table des 147 noms CSS de three.js
 * dans le worker, pour la voir diverger. On rend donc les chaînes brutes — une douzaine
 * par tuile — et c'est l'appelant, qui a `THREE.Color`, qui tranche.
 */
export type PaletteEntry = {
  /** Couleur de la donnée, ou `null` = « le thème décide ». */
  color: string | null
  /** Face haute : l'appelant en éclaircit la teinte pour donner du volume. */
  roof: boolean
}

/**
 * Soleil de convention qui module les façades selon leur orientation — cf.
 * `theme.globe.buildingSunAzimuth` / `buildingShadeMin`.
 */
export type Shading = {
  /** Azimut en degrés depuis le nord, sens horaire. */
  azimuth: number
  /** Teinte de la façade la moins exposée, en fraction (0 = noire, 1 = pas d'ombrage). */
  min: number
}

/**
 * Ce qu'il faut pour désigner un bâtiment dans une tuile, sans attribut par sommet.
 *
 * `extrudeTile` écrit TOUS les sommets d'une emprise avant de passer à la suivante : les
 * plages sont donc contiguës et croissantes, et une recherche binaire sur `vStart` suffit
 * à retrouver le bâtiment d'un sommet. Un identifiant par sommet donnerait le même
 * résultat pour ~100 fois plus d'octets, sur le tampon le plus lourd d'une tuile — et il
 * ne servirait à aucun shader.
 */
export type TileBuildings = {
  /** Début de plage de chaque bâtiment, en SOMMETS. `n + 1` entrées, la dernière = total. */
  vStart: Uint32Array
  /** `feature.id` MVT, `NaN` quand la feature n'en portait pas. */
  featureIds: Float64Array
  /** Hauteurs entrelacées `[height, minHeight, …]`, en mètres. */
  heights: Float32Array
  /** Attributs de `pickFields`, un objet par bâtiment. `null` quand la liste est vide. */
  props: Record<string, unknown>[] | null
}

/** Géométrie d'une tuile, en mètres locaux — prête à devenir des `BufferAttribute`. */
export type ExtrudedTile = {
  /**
   * x = est, y = nord, z = haut, depuis le centre de la tuile.
   *
   * En `Float32Array`, ce sont des MÈTRES. En `Int16Array` (le défaut, cf.
   * `positionPrecision`), ce sont des entiers normalisés : l'attribut est déclaré
   * `normalized`, le GPU rend donc [-1, 1], et c'est `positionScale` que la matrice du
   * mesh applique pour retrouver les mètres. Deux fois moins d'octets, pour une
   * résolution de l'ordre de `positionScale / 32767` — ~4 cm sur une tuile z14.
   */
  positions: Float32Array | Int16Array
  /** Mètres correspondant à 1,0 en position normalisée. Vaut 1 en `float32`. */
  positionScale: number
  indices: Uint32Array
  /** Index dans `palette`, un par sommet. */
  colorIndex: Uint8Array
  /**
   * Facteur d'ombrage par sommet, en 0…255 (255 = couleur pleine). Séparé de la couleur
   * parce que la palette n'est résolue que côté appelant : le worker sait quelle FACE il
   * écrit, pas de quelle teinte elle sera.
   */
  shade: Uint8Array
  palette: PaletteEntry[]
  /** De quoi désigner un bâtiment sous le curseur (cf. `TileBuildings`). */
  buildings: TileBuildings
}

/** Aire signée : positive pour un contour extérieur, négative pour un trou (spec MVT). */
function signedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!
    const b = ring[i]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Nombre lu dans les attributs, ou `fallback` si absent/illisible. */
function num(props: Record<string, string | number | boolean>, key: string, fallback: number): number {
  const v = props[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Borné à `[0, max]` — une hauteur négative n'a pas plus de sens qu'une hauteur absurde. */
function clampTo(v: number, max: number): number {
  return v < 0 ? 0 : v > max ? max : v
}

/**
 * Attributs retenus pour le pick de bâtiment. `undefined` sans `pickFields` — le cas par
 * défaut, où rien n'est ni lu ni transporté.
 */
function pickProps(
  props: Record<string, string | number | boolean>,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  if (fields.length === 0) return undefined
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = props[f]
    if (v !== undefined) out[f] = v
  }
  return out
}

/**
 * Emprises extrudables d'une tuile vectorielle. Les anneaux sont regroupés en polygones
 * par le signe de leur aire : une même *feature* MVT peut porter plusieurs bâtiments, et
 * chacun ses trous.
 *
 * Les emprises marquées `hideField` sont écartées : la donnée dit elle-même qu'elles ne
 * doivent pas être extrudées (halles, verrières…).
 */
export function decodeBuildings(buffer: ArrayBuffer, cfg: BuildingsConfig): DecodedTile {
  const tile = new VectorTile(new PbfReader(new Uint8Array(buffer)))
  const layer = tile.layers[cfg.sourceLayer]
  if (!layer) return { extent: 4096, footprints: [] }

  const footprints: Footprint[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const props = feature.properties
    if (props[cfg.hideField] === true || props[cfg.hideField] === 1) continue
    /**
     * Hauteur BORNÉE. `height=99999` est une faute de saisie courante dans OSM, et la
     * hauteur venait brute : un tel volume gardait sa tuile visible en permanence
     * (englobant démesuré), déséquilibrait son arbre de collision, et arrêtait la caméra
     * sur un bâtiment de cent kilomètres.
     */
    const height = Math.min(num(props, cfg.heightField, cfg.defaultHeight), cfg.maxHeight)
    const minHeight = clampTo(num(props, cfg.minHeightField, 0), cfg.maxHeight)
    // Une emprise plus basse que sa base ne décrit aucun volume : rien à extruder.
    if (height <= minHeight) continue
    const rawColor = props[cfg.colorField]
    const color = typeof rawColor === 'string' && rawColor ? rawColor : undefined
    const featureId = feature.id
    // Extraits UNE fois par feature et non par emprise : plusieurs contours d'une même
    // feature partagent ses attributs, et la boucle en parcourt des milliers.
    const picked = pickProps(props, cfg.pickFields)

    let current: { x: number; y: number }[][] | null = null
    for (const ring of feature.loadGeometry()) {
      // Un anneau de moins de 3 sommets n'a pas de surface (dégénéré côté données).
      if (ring.length < 3) continue
      if (signedArea(ring) > 0) {
        current = [ring]
        // `color` toujours présent (`undefined` sans donnée) : une seule forme d'objet,
        // là où le spread conditionnel en produisait deux — et rendait polymorphes les
        // accès de la boucle d'extrusion, qui parcourt des milliers d'emprises.
        footprints.push({ rings: current, height, minHeight, color, featureId, props: picked })
      } else if (current) {
        current.push(ring)
      }
      // Trou avant tout contour : donnée incohérente, ignorée plutôt que rattachée au
      // bâtiment précédent — qui n'est pas le sien.
    }
  }
  return { extent: layer.extent, footprints }
}

/**
 * Palette bornée à 256 entrées : `colorIndex` tient sur un octet, soit 127 couleurs de
 * données par tuile (une tuile parisienne dense en porte douze). Au-delà, l'emprise
 * retombe sur les couleurs du thème plutôt que de faire grossir le transfert.
 */
const MAX_PALETTE = 256

/** Les deux premières entrées sont fixes : mur du thème, toit du thème. */
const THEME_WALL = 0
const THEME_ROOF = 1

/**
 * `loadGeometry` referme les anneaux (ClosePath recopie le premier point). Ce doublon ne
 * décrit ni une arête de mur ni un sommet de toit : on l'écarte une fois pour toutes.
 */
function openLength(ring: Ring): number {
  const n = ring.length
  const first = ring[0]!
  const last = ring[n - 1]!
  return n > 1 && first.x === last.x && first.y === last.y ? n - 1 : n
}

/**
 * Décode une tuile ET l'extrude, en une passe, dans le repère ENU local de `frame`.
 *
 * Les sommets sortent en **mètres locaux** (±1200 m sur une tuile z14), jamais en ECEF.
 * Deux raisons, l'une de justesse, l'autre de coût :
 *
 * - Une position ECEF vaut ~6,4 × 10⁶ m ; en `Float32` (24 bits de mantisse) sa résolution
 *   tombe à ~0,4 m — les façades tremblaient donc à hauteur de leur propre épaisseur. En
 *   repère local, la résolution est de l'ordre du dixième de millimètre.
 * - La projection sur l'ellipsoïde coûtait quatre appels trigonométriques par sommet et
 *   par hauteur. Ici chaque sommet d'anneau est projeté UNE fois (le mur le réutilise
 *   quatre fois, le toit une), et c'est la matrice du mesh qui pose le tout sur le globe.
 *
 * Aucun `push` sur des tableaux JS : les majorants sont exacts (4 sommets et 6 index par
 * arête de mur, 1 sommet et au plus 3 index par sommet de toit), donc une seule
 * allocation par tampon puis un `subarray` final.
 */
export function extrudeTile(
  buffer: ArrayBuffer,
  cfg: BuildingsConfig,
  frame: TileFrame,
  shading: Shading,
): ExtrudedTile {
  const { extent, footprints } = decodeBuildings(buffer, cfg)

  let ringVerts = 0
  for (const fp of footprints) for (const ring of fp.rings) ringVerts += ring.length
  const positions = new Float32Array(ringVerts * 5 * 3)
  const colorIndex = new Uint8Array(ringVerts * 5)
  const shade = new Uint8Array(ringVerts * 5)
  const indices = new Uint32Array(ringVerts * 9)

  // Un bâtiment = une emprise. `n + 1` pour la sentinelle qui ferme la dernière plage.
  const vStart = new Uint32Array(footprints.length + 1)
  const featureIds = new Float64Array(footprints.length)
  const heights = new Float32Array(footprints.length * 2)
  // `pickFields` vide → `props` reste `null` : rien à remplir, rien à cloner au transfert.
  const pickedProps: Record<string, unknown>[] | null = cfg.pickFields.length === 0 ? null : []
  let building = 0

  // Direction horizontale du soleil, en repère ENU (x = est, y = nord). L'azimut se compte
  // depuis le nord, sens horaire — convention des cartes, pas du cercle trigonométrique.
  const azRad = shading.azimuth * DEG2RAD
  const sunEast = Math.sin(azRad)
  const sunNorth = Math.cos(azRad)
  const shadeSpan = 1 - shading.min

  const palette: PaletteEntry[] = [
    { color: null, roof: false },
    { color: null, roof: true },
  ]
  /** Couleur brute → index de sa face MUR ; le toit est toujours à l'index suivant. */
  const paletteOf = new Map<string, number>()

  /**
   * Sommets d'anneau projetés une fois par emprise, entrelacés `[est, nord, …]` — c'est
   * aussi, tel quel, le format d'entrée d'earcut.
   */
  let coords = new Float64Array(512)
  /** Index de départ de chaque anneau dans `coords`, en SOMMETS (pour les trous d'earcut). */
  const holeStarts: number[] = []

  const n = 2 ** frame.z
  // est = (lng − lng0) × m/°, et lng est AFFINE en x de tuile → une multiplication.
  const eastAt0 = ((frame.x / n) * 360 - 180 - frame.lng0) * frame.metersPerDegLng
  const eastPerUnit = (360 / n / extent) * frame.metersPerDegLng
  // La latitude, elle, ne l'est pas : Mercator inverse, un transcendant par sommet.
  const yAt0 = frame.y / n
  const yPerUnit = 1 / (n * extent)

  let vertex = 0
  let index = 0

  for (const fp of footprints) {
    // La plage du bâtiment s'ouvre AVANT que ses murs ne s'écrivent — `vertex` est encore
    // au bout du bâtiment précédent.
    vStart[building] = vertex
    featureIds[building] = fp.featureId ?? Number.NaN
    heights[building * 2] = fp.height
    heights[building * 2 + 1] = fp.minHeight
    if (pickedProps) pickedProps.push(fp.props ?? {})
    building++

    let wall = THEME_WALL
    let roof = THEME_ROOF
    if (fp.color) {
      const known = paletteOf.get(fp.color)
      if (known !== undefined) {
        wall = known
        roof = known + 1
      } else if (palette.length + 2 <= MAX_PALETTE) {
        wall = palette.length
        roof = wall + 1
        palette.push({ color: fp.color, roof: false }, { color: fp.color, roof: true })
        paletteOf.set(fp.color, wall)
      }
      // Palette pleine : le thème reprend la main, plutôt que d'élargir `colorIndex`.
    }

    // 1) Projeter les sommets de tous les anneaux de l'emprise, une seule fois. Le
    //    résultat entrelacé `[est, nord, …]` est aussi, tel quel, l'entrée d'earcut.
    holeStarts.length = 0
    let flat = 0
    for (const ring of fp.rings) flat += openLength(ring)
    // Croissance géométrique : une suite d'emprises de tailles croissantes réallouait
    // sinon à chaque tour.
    if (flat * 2 > coords.length) coords = new Float64Array(Math.max(flat * 2, coords.length * 2))
    let w = 0
    for (let r = 0; r < fp.rings.length; r++) {
      const ring = fp.rings[r]!
      // earcut repère les trous par leur index de SOMMET de départ.
      if (r > 0) holeStarts.push(w)
      const len = openLength(ring)
      for (let i = 0; i < len; i++) {
        const p = ring[i]!
        coords[w * 2] = eastAt0 + p.x * eastPerUnit
        coords[w * 2 + 1] =
          (Math.atan(Math.sinh(Math.PI * (1 - 2 * (yAt0 + p.y * yPerUnit)))) * RAD2DEG - frame.lat0) *
          frame.metersPerDegLat
        w++
      }
    }

    const base = fp.minHeight
    const top = fp.height

    /**
     * Sens de parcours du CONTOUR en repère ENU, d'où se déduit de quel côté d'une arête
     * se trouve la matière — donc vers où pointe la façade.
     *
     * Mesuré sur le contour et appliqué à TOUS les anneaux : un trou tourne dans l'autre
     * sens, si bien que la même formule y donne d'elle-même la normale tournée vers la
     * cour — ce qui est exactement la face visible d'une façade sur cour.
     */
    const outward = signedAreaXY(coords, openLength(fp.rings[0]!)) > 0 ? 1 : -1

    // 2) Murs : un quad par arête, contour ET trous (une cour intérieure a des façades).
    let ringStart = 0
    for (const ring of fp.rings) {
      const len = openLength(ring)
      for (let i = 0; i < len; i++) {
        const ia = (ringStart + i) * 2
        const ib = (ringStart + ((i + 1) % len)) * 2
        const ax = coords[ia]!
        const ay = coords[ia + 1]!
        const bx = coords[ib]!
        const by = coords[ib + 1]!
        const dx = bx - ax
        const dy = by - ay
        // `Math.hypot` est varargs et anti-débordement : 3 à 10× un `sqrt` pour des mètres
        // locaux (±2 400 m sur une tuile z14), et il est appelé une fois par arête.
        const lenSq = dx * dx + dy * dy
        if (lenSq === 0) continue
        const inv = 1 / Math.sqrt(lenSq)
        // Normale horizontale sortante, puis « demi-Lambert » : le mur le mieux exposé
        // garde sa couleur, le moins exposé descend à `shading.min`. Le remappage en
        // 0,5 + 0,5·d évite un terminateur net, qui n'a pas de sens sans vraie lumière.
        const nx = outward * dy * inv
        const ny = -outward * dx * inv
        const lit = shading.min + shadeSpan * (0.5 + 0.5 * (nx * sunEast + ny * sunNorth))
        const s = Math.round(lit * 255)
        const a0 = vertex
        writeVertex(positions, colorIndex, shade, vertex++, ax, ay, base, wall, s)
        const b0 = vertex
        writeVertex(positions, colorIndex, shade, vertex++, bx, by, base, wall, s)
        const a1 = vertex
        writeVertex(positions, colorIndex, shade, vertex++, ax, ay, top, wall, s)
        const b1 = vertex
        writeVertex(positions, colorIndex, shade, vertex++, bx, by, top, wall, s)
        indices[index++] = a0
        indices[index++] = b0
        indices[index++] = a1
        indices[index++] = b0
        indices[index++] = b1
        indices[index++] = a1
      }
      ringStart += len
    }

    // 3) Toit : triangulation du contour + trous, à plat, dans le même repère. Jamais
    //    ombré — c'est la face la plus exposée, et `buildingRoofColor` la porte déjà.
    const roofBase = vertex
    for (let i = 0; i < ringStart; i++) {
      writeVertex(positions, colorIndex, shade, vertex++, coords[i * 2]!, coords[i * 2 + 1]!, top, roof, 255)
    }
    const faces = earcut(coords.subarray(0, ringStart * 2), holeStarts, 2)
    for (let i = 0; i < faces.length; i++) indices[index++] = roofBase + faces[i]!
  }

  // Sentinelle : elle ferme la dernière plage, et vaut le nombre total de sommets.
  vStart[building] = vertex
  const used = positions.subarray(0, vertex * 3)
  const packed = cfg.positionPrecision === 'int16' ? packPositions(used) : { positions: used, positionScale: 1 }
  return {
    ...packed,
    colorIndex: colorIndex.subarray(0, vertex),
    shade: shade.subarray(0, vertex),
    indices: indices.subarray(0, index),
    palette,
    buildings: { vStart, featureIds, heights, props: pickedProps },
  }
}

/**
 * Quantifie les positions en entiers normalisés sur leur propre étendue.
 *
 * Deux fois moins d'octets que le `Float32Array` d'origine — en mémoire vive comme à
 * l'upload GPU, et c'est de loin le plus gros tampon d'une tuile. La résolution qui reste
 * est `échelle / 32767`, soit ~4 cm sur une tuile z14 : sous la précision de la donnée
 * OSM, et très en dessous du pixel à toute distance où l'on voit un bâtiment.
 *
 * L'échelle est MESURÉE sur la géométrie produite, jamais déduite de la taille théorique
 * d'une tuile : les anneaux MVT débordent de l'emprise (marge du format), et une échelle
 * trop courte replierait les bâtiments du bord.
 */
function packPositions(src: Float32Array): { positions: Int16Array; positionScale: number } {
  let maxAbs = 0
  for (let i = 0; i < src.length; i++) {
    const a = Math.abs(src[i]!)
    if (a > maxAbs) maxAbs = a
  }
  // Tuile plate ou vide : toute échelle convient, `1` évite la division par zéro.
  const positionScale = maxAbs > 0 ? maxAbs : 1
  const out = new Int16Array(src.length)
  const k = INT16_MAX / positionScale
  for (let i = 0; i < src.length; i++) out[i] = Math.round(src[i]! * k)
  return { positions: out, positionScale }
}

/**
 * Borne d'un entier normalisé signé. C'est 32767 et non 32768 : la dénormalisation des
 * `SNORM` divise par 32767, pour que ±1 soit exactement représentable.
 */
const INT16_MAX = 32767

function writeVertex(
  positions: Float32Array,
  colorIndex: Uint8Array,
  shade: Uint8Array,
  at: number,
  east: number,
  north: number,
  up: number,
  color: number,
  lit: number,
): void {
  const o = at * 3
  positions[o] = east
  positions[o + 1] = north
  positions[o + 2] = up
  colorIndex[at] = color
  shade[at] = lit
}

/** Aire signée d'un anneau entrelacé `[x, y, …]` : son signe donne le sens de parcours. */
function signedAreaXY(coords: Float64Array, len: number): number {
  let sum = 0
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const ax = coords[j * 2]!
    const ay = coords[j * 2 + 1]!
    const bx = coords[i * 2]!
    const by = coords[i * 2 + 1]!
    sum += ax * by - bx * ay
  }
  return sum / 2
}

/**
 * Télécharge une tuile et l'extrude. `null` = rien à extruder ici — 404 (mer, zone non
 * couverte) ou tuile sans bâtiment ; dans les deux cas la tuile est « prête », et
 * réessayer ne changerait rien.
 *
 * Vit ici et non chez ses deux appelants (le worker et le repli sans `Worker`) : la
 * POLITIQUE de tuile — quel code vaut « pas de donnée », lequel vaut échec — est
 * exactement la partie où une divergence entre les deux chemins serait silencieuse.
 */
export async function fetchAndExtrude(
  url: string,
  cfg: BuildingsConfig,
  frame: TileFrame,
  shading: Shading,
  signal?: AbortSignal,
): Promise<ExtrudedTile | null> {
  const res = await fetch(url, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`tuile vectorielle ${res.status}`)
  const buffer = await res.arrayBuffer()
  // Dernier point de sortie avant l'extrusion, la seule partie qui ne s'interrompt pas :
  // une fois lancée, elle tient le fil jusqu'au bout.
  if (signal?.aborted) return null
  const out = extrudeTile(buffer, cfg, frame, shading)
  return out.indices.length === 0 ? null : out
}
