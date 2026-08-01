import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { attachPackedBVH, bvhBytes, detachBVH, makeUnraycastable, packedBVHTransferables, packTileBVH } from './bvh'

/** Un triangle indexé : de quoi bâtir un arbre, sans dépendre d'une vraie tuile. */
function triangle(positions: Float32Array | Int16Array): {
  positions: Float32Array | Int16Array
  indices: Uint32Array
} {
  return { positions, indices: new Uint32Array([0, 1, 2]) }
}

/** Monte un mesh à partir des mêmes tampons que ceux confiés à `packTileBVH`. */
function meshOf(positions: Float32Array | Int16Array, indices: Uint32Array): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3, positions instanceof Int16Array))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return new THREE.Mesh(geo)
}

describe('packTileBVH / attachPackedBVH', () => {
  it('pose l’arbre sur la géométrie et le raycast accéléré sur l’instance', () => {
    const { positions, indices } = triangle(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    const mesh = meshOf(positions, indices)
    const before = mesh.raycast
    attachPackedBVH(mesh, packTileBVH(positions, indices))
    expect(mesh.geometry.boundsTree).toBeDefined()
    // Par INSTANCE : une lib n'a pas à changer le comportement des meshes de l'hôte, donc
    // jamais de monkey-patch de `THREE.Mesh.prototype`.
    expect(mesh.raycast).not.toBe(before)
    expect(THREE.Mesh.prototype.raycast).toBe(before)
  })

  it('accepte un attribut de position NORMALISÉ (positions int16 des bâtiments)', () => {
    // three-mesh-bvh bascule alors sur `getX/getY/getZ`, qui dénormalisent : c'est ce qui
    // rend l'arbre juste malgré la quantification. Sans ce support, le picking et la garde
    // caméra viseraient une géométrie fantôme.
    const { positions, indices } = triangle(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0]))
    const mesh = meshOf(positions, indices)
    attachPackedBVH(mesh, packTileBVH(positions, indices))

    const ray = new THREE.Raycaster(new THREE.Vector3(0.2, 0.2, 1), new THREE.Vector3(0, 0, -1))
    const hits: THREE.Intersection[] = []
    mesh.raycast(ray, hits)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.point.z).toBeCloseTo(0, 5)
  })

  it('rend le MÊME verdict de rayon qu’un arbre construit sur place', () => {
    // C'est l'invariant de toute la migration : déplacer la construction dans le worker ne
    // doit rien changer à ce que touchent le picking, la garde caméra et le drapage.
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 10, 0, 0, 0, 10, 0])
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5])
    const packed = meshOf(positions, indices)
    attachPackedBVH(packed, packTileBVH(positions, indices))
    const direct = meshOf(positions, indices)
    direct.geometry.boundsTree = undefined

    for (const [x, y] of [
      [1, 1],
      [7, 7],
      [5, 5],
      [-3, 2],
    ] as const) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1))
      const a: THREE.Intersection[] = []
      const b: THREE.Intersection[] = []
      packed.raycast(ray, a)
      direct.raycast(ray, b)
      expect(a.length).toBe(b.length)
      if (a[0] && b[0]) expect(a[0].point.toArray()).toEqual(b[0].point.toArray())
    }
  })

  it('n’expose PAS l’index de la tuile parmi les tampons cédés', () => {
    // Le lister ferait échouer `postMessage` : il est déjà cédé avec la géométrie. Rien
    // dans le typage ne l'empêche — d'où ce test.
    const { positions, indices } = triangle(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    const packed = packTileBVH(positions, indices)
    const transfer = packedBVHTransferables(packed)
    expect(transfer).not.toContain(indices.buffer)
    expect(new Set(transfer).size).toBe(transfer.length)
    expect(transfer.length).toBeGreaterThan(0)
  })

  it('mesure la mémoire VIVE de l’arbre — invisible de `geometry.dispose()`', () => {
    const { positions, indices } = triangle(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    const mesh = meshOf(positions, indices)
    expect(bvhBytes(mesh)).toBe(0)
    attachPackedBVH(mesh, packTileBVH(positions, indices))
    // ⚠️ Lit `_roots` / `_indirectBuffer`, deux champs internes de three-mesh-bvh : ce test
    // est là pour que leur disparition se voie à la montée de version, et non le jour où
    // le budget mémoire compterait zéro sans rien dire.
    expect(bvhBytes(mesh)).toBeGreaterThan(0)
  })

  it('detachBVH rend la géométrie à un état libérable', () => {
    const { positions, indices } = triangle(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    const mesh = meshOf(positions, indices)
    attachPackedBVH(mesh, packTileBVH(positions, indices))
    detachBVH(mesh)
    expect(mesh.geometry.boundsTree).toBeUndefined()
    expect(bvhBytes(mesh)).toBe(0)
  })
})

describe('makeUnraycastable', () => {
  it('retire le mesh du chemin des rayons sans le retirer du rendu', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    makeUnraycastable(mesh)
    const hits: THREE.Intersection[] = []
    mesh.raycast(new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1)), hits)
    expect(hits).toHaveLength(0)
    expect(mesh.visible).toBe(true)
  })
})
