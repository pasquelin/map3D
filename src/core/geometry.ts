import * as THREE from 'three'

export type Pt = { x: number; z: number }

/**
 * Tous les sommets sont-ils exploitables ? Garde-fou OBLIGATOIRE avant toute
 * construction de géométrie, pour une raison contre-intuitive : les tests de
 * dégénérescence de ce module s'écrivent `if (len < 1e-6) continue`, et une
 * comparaison avec NaN est TOUJOURS fausse. Un seul NaN en entrée traverse donc
 * chacune de ces gardes et atterrit dans l'attribut `position`.
 *
 * La sanction est disproportionnée : `computeBoundingSphere()` échoue sur toute
 * géométrie contenant un NaN, et il est appelé à CHAQUE frame — bruit console
 * permanent. Jusqu'à ce que `MapEngine` restreigne `controls.setScene` au seul
 * tileset, la sanction allait plus loin encore : les contrôles raycastaient la scène
 * entière, `annotations` compris, et une seule forme corrompue faussait le picking de
 * caméra pour tout le reste. Ce garde-fou reste nécessaire indépendamment.
 *
 * On REJETTE plutôt qu'on ne filtre : retirer les sommets fautifs déformerait la
 * forme en silence. `null` est déjà le contrat de retour de ces fonctions, géré par
 * tous les appelants — seul l'objet concerné disparaît.
 */
const allFinite = (points: readonly Pt[]): boolean =>
  points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))

/**
 * Origines déjà signalées : le rejet doit laisser UNE trace, pas un flux. Les
 * constructions de géométrie tournent par frame — un avertissement non dédupliqué
 * remplacerait le bruit qu'on vient de supprimer.
 */
const warned = new Set<string>()

/** Destination des avertissements — remplaçable par l'hôte (cf. `setGeometryWarner`). */
let warn: ((message: string) => void) | null = (message) => console.warn(message)

/**
 * Redirige (ou coupe) les avertissements de géométrie. `null` = silence complet.
 *
 * Une bibliothèque n'a pas à écrire d'autorité dans la console de l'application qui
 * l'héberge : celle-ci peut vouloir router le signal vers son propre journal, ou n'en
 * rien faire en production. Le défaut reste `console.warn` — un garde-fou muet
 * transformerait la cause en symptôme (« ça ne s'affiche pas »).
 */
export function setGeometryWarner(fn: ((message: string) => void) | null): void {
  warn = fn
}

/**
 * Signale une fois par origine qu'une géométrie a été écartée. Sans ce signal, le
 * garde-fou est parfaitement silencieux : une couche qui produit des coordonnées
 * invalides « perd » simplement ses formes, sans rien pour orienter le diagnostic —
 * le symptôme devient « ça ne s'affiche pas », plus difficile à relier à sa cause
 * que l'erreur `computeBoundingSphere` d'origine.
 */
function rejected(where: string): null {
  if (!warned.has(where)) {
    warned.add(where)
    warn?.(
      `[map3d] ${where}: géométrie ignorée — coordonnée ou épaisseur non finie (NaN/Infinity). ` +
        'Vérifiez les points et largeurs fournis par la couche appelante ; ce message ne sera plus répété.',
    )
  }
  return null
}

/**
 * Ruban plat (plan Y=0) d'épaisseur `width` (unités monde) : un quad par
 * segment plus un disque à chaque sommet pour des joints arrondis. `closed`
 * referme le tracé. Reproduit la construction validée du prototype.
 */
export function ribbon(points: readonly Pt[], width: number, closed: boolean): THREE.BufferGeometry | null {
  // `width` est aussi vérifié : il vaut `style.width * metersPerPixel`, donc il est
  // NaN dès que la caméra est dégénérée — et `half = width / 2` contaminerait alors
  // TOUTES les positions, sommets finis compris.
  if (points.length < 2 || !Number.isFinite(width) || !allFinite(points)) return rejected('ribbon')
  const pos: number[] = []
  const idx: number[] = []
  const half = width / 2
  let v = 0
  const list = closed ? [...points, points[0]!] : points
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!
    const b = list[i + 1]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const nx = (-dz / len) * half
    const nz = (dx / len) * half
    pos.push(a.x + nx, 0, a.z + nz, a.x - nx, 0, a.z - nz, b.x + nx, 0, b.z + nz, b.x - nx, 0, b.z - nz)
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    v += 4
  }
  const seg = 8
  for (const p of list) {
    const c = v
    pos.push(p.x, 0, p.z)
    v++
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(p.x + Math.cos(a) * half, 0, p.z + Math.sin(a) * half)
      v++
      if (s > 0) idx.push(c, c + s, c + s + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/**
 * Découpe une polyligne en tronçons « tiret » selon un motif tiret/espace (mètres
 * locaux). Un tiret peut traverser un sommet (le motif est continu le long du tracé).
 */
export function dashPattern(points: readonly Pt[], dash: number, gap: number, closed: boolean): Pt[][] {
  // Tests écrits en positif (`!(dash > 0)` et non `dash <= 0`) : la forme négative
  // laisserait passer NaN, et le motif ne progresserait alors jamais.
  if (points.length < 2 || !(dash > 0) || !(gap >= 0) || !allFinite(points)) {
    if (points.length >= 2) rejected('dashPattern')
    return []
  }
  const list = closed ? [...points, points[0]!] : points
  const dashes: Pt[][] = []
  let inDash = true
  let remain = dash
  let cur: Pt[] = [list[0]!]
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!
    const b = list[i + 1]!
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 1e-9) continue
    const ux = (b.x - a.x) / len
    const uz = (b.z - a.z) / len
    let t = 0
    while (t < len - 1e-9) {
      const step = Math.min(remain, len - t)
      t += step
      remain -= step
      const p = { x: a.x + ux * t, z: a.z + uz * t }
      if (remain <= 1e-9) {
        if (inDash) {
          cur.push(p)
          if (cur.length >= 2) dashes.push(cur)
          cur = []
        } else {
          cur = [p]
        }
        inDash = !inDash
        remain = inDash ? dash : gap
      } else if (inDash && t >= len - 1e-9) {
        // Fin de segment en plein tiret : le sommet prolonge le tiret courant.
        cur.push(p)
      }
    }
  }
  if (inDash && cur.length >= 2) dashes.push(cur)
  return dashes
}

/** Rubans plats (quads, caps plats) pour un ensemble de polylignes — géométrie unique. */
export function strokePolylines(polylines: readonly (readonly Pt[])[], width: number): THREE.BufferGeometry | null {
  if (!Number.isFinite(width) || !polylines.every(allFinite)) return rejected('strokePolylines')
  const pos: number[] = []
  const idx: number[] = []
  const half = width / 2
  let v = 0
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!
      const b = line[i + 1]!
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1e-9) continue
      const nx = (-dz / len) * half
      const nz = (dx / len) * half
      pos.push(a.x + nx, 0, a.z + nz, a.x - nx, 0, a.z - nz, b.x + nx, 0, b.z + nz, b.x - nx, 0, b.z - nz)
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
      v += 4
    }
  }
  if (pos.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/** Ruban pointillé : motif tiret/espace le long du tracé (unités monde). */
export function dashedRibbon(
  points: readonly Pt[],
  width: number,
  dash: number,
  gap: number,
  closed: boolean,
): THREE.BufferGeometry | null {
  return strokePolylines(dashPattern(points, dash, gap, closed), width)
}

/** Butées perpendiculaires aux extrémités d'un tracé (style cote d'architecte ⊢––⊣). */
export function endTicks(points: readonly Pt[], length: number): Pt[][] {
  if (points.length < 2) return []
  const half = length / 2
  const tick = (p: Pt, q: Pt, at: Pt): Pt[] | null => {
    const dx = q.x - p.x
    const dz = q.z - p.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-9) return null
    const nx = (-dz / len) * half
    const nz = (dx / len) * half
    return [
      { x: at.x + nx, z: at.z + nz },
      { x: at.x - nx, z: at.z - nz },
    ]
  }
  const out: Pt[][] = []
  const first = tick(points[0]!, points[1]!, points[0]!)
  const last = tick(points[points.length - 2]!, points[points.length - 1]!, points[points.length - 1]!)
  if (first) out.push(first)
  if (last) out.push(last)
  return out
}

/**
 * 2 points diagonaux → 4 coins d'un rectangle axis-aligned. L'ORDRE des coins
 * (p0 → p1 = largeur, p0 → p3 = hauteur) est un invariant partagé par le rendu
 * et l'édition (base orientée du resize) — unique point de vérité.
 */
export function diagonalToCorners(a: Pt, b: Pt): Pt[] {
  return [a, { x: b.x, z: a.z }, b, { x: a.x, z: b.z }]
}

/**
 * Arrondit les coins d'un polygone fermé (fillet en Bézier quadratique, contrôle au
 * coin). `radius` en unités monde, borné à la moitié de la plus courte arête adjacente.
 */
export function filletPolygon(corners: readonly Pt[], radius: number, segments = 6): Pt[] {
  if (corners.length < 3 || radius <= 0) return [...corners]
  const out: Pt[] = []
  const n = corners.length
  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n]!
    const cur = corners[i]!
    const next = corners[(i + 1) % n]!
    const l1 = Math.hypot(prev.x - cur.x, prev.z - cur.z)
    const l2 = Math.hypot(next.x - cur.x, next.z - cur.z)
    if (l1 < 1e-9 || l2 < 1e-9) {
      out.push(cur)
      continue
    }
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const p1 = { x: cur.x + ((prev.x - cur.x) / l1) * r, z: cur.z + ((prev.z - cur.z) / l1) * r }
    const p2 = { x: cur.x + ((next.x - cur.x) / l2) * r, z: cur.z + ((next.z - cur.z) / l2) * r }
    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      const u = 1 - t
      out.push({
        x: u * u * p1.x + 2 * u * t * cur.x + t * t * p2.x,
        z: u * u * p1.z + 2 * u * t * cur.z + t * t * p2.z,
      })
    }
  }
  return out
}

/** Remplissage plein d'un polygone (plaqué Y=0). */
export function fillGeo(points: readonly Pt[]): THREE.BufferGeometry | null {
  if (points.length < 3 || !allFinite(points)) return points.length < 3 ? null : rejected('fillGeo')
  const shape = new THREE.Shape()
  shape.moveTo(points[0]!.x, points[0]!.z)
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]!.x, points[i]!.z)
  shape.closePath()
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(Math.PI / 2)
  return g
}

/** Tête de flèche triangulaire au dernier segment. */
export function arrowHead(points: readonly Pt[], width: number): THREE.BufferGeometry | null {
  if (points.length < 2 || !Number.isFinite(width) || !allFinite(points)) {
    return points.length < 2 ? null : rejected('arrowHead')
  }
  const a = points[points.length - 2]!
  const b = points[points.length - 1]!
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return null
  const ux = dx / len
  const uz = dz / len
  const hw = width * 2.2
  const hl = width * 3.4
  const px = -uz
  const pz = ux
  const pos = [
    b.x, 0, b.z,
    b.x - ux * hl + px * hw, 0, b.z - uz * hl + pz * hw,
    b.x - ux * hl - px * hw, 0, b.z - uz * hl - pz * hw,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

/**
 * Matériau plat plaqué au sol (trait comme remplissage). `depthTest:false` →
 * l'annotation se dessine PAR-DESSUS les tuiles 3D (bâtiments), sinon une forme
 * au sol est occluse par le relief et devient invisible.
 */
function flatMaterial(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  })
}

/** Matériau de trait plaqué au sol. */
export function strokeMaterial(color: THREE.ColorRepresentation, opacity = 0.95): THREE.MeshBasicMaterial {
  return flatMaterial(color, opacity)
}

/** Matériau de remplissage plaqué au sol. */
export function fillMaterial(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
  return flatMaterial(color, opacity)
}

/** Libère géométries + matériaux d'un objet Three et de toute sa descendance. */
export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) (mesh.material as THREE.Material).dispose()
  })
}

/** Vide un groupe : dispose et détache chacun de ses enfants. */
export function clearGroup(group: THREE.Object3D): void {
  for (const child of [...group.children]) {
    disposeObject3D(child)
    group.remove(child)
  }
}

/** Convertit un cercle centre+rayon en polygone. */
export function circlePoints(center: Pt, radius: number, segments = 48): Pt[] {
  // Coupé à la source : sinon chaque sommet naît NaN et le rejet n'aurait lieu
  // qu'en aval, une fois `segments` points inutiles construits.
  if (!Number.isFinite(radius) || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
    rejected('circlePoints')
    return []
  }
  const out: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    out.push({ x: center.x + Math.cos(a) * radius, z: center.z + Math.sin(a) * radius })
  }
  return out
}
