import * as THREE from 'three'

export type Pt = { x: number; z: number }

/**
 * Ruban plat (plan Y=0) d'épaisseur `width` (unités monde) : un quad par
 * segment plus un disque à chaque sommet pour des joints arrondis. `closed`
 * referme le tracé. Reproduit la construction validée du prototype.
 */
export function ribbon(points: readonly Pt[], width: number, closed: boolean): THREE.BufferGeometry | null {
  if (points.length < 2) return null
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

/** Remplissage plein d'un polygone (plaqué Y=0). */
export function fillGeo(points: readonly Pt[]): THREE.BufferGeometry | null {
  if (points.length < 3) return null
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
  if (points.length < 2) return null
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
  const out: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    out.push({ x: center.x + Math.cos(a) * radius, z: center.z + Math.sin(a) * radius })
  }
  return out
}
