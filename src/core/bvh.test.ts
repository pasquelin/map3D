import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { attachBVH, bvhBytes, detachBVH, makeUnraycastable } from './bvh'

/** Un cube : de quoi bâtir un arbre, sans dépendre d'une vraie tuile. */
function cube(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1)
}

describe('attachBVH', () => {
  it('pose l’arbre sur la géométrie et le raycast accéléré sur l’instance', () => {
    const mesh = new THREE.Mesh(cube())
    const before = mesh.raycast
    attachBVH(mesh)
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
    const geo = new THREE.BufferGeometry()
    const p = new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0])
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3, true))
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1))
    const mesh = new THREE.Mesh(geo)
    attachBVH(mesh)

    const ray = new THREE.Raycaster(new THREE.Vector3(0.2, 0.2, 1), new THREE.Vector3(0, 0, -1))
    const hits: THREE.Intersection[] = []
    mesh.raycast(ray, hits)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.point.z).toBeCloseTo(0, 5)
  })

  it('mesure la mémoire VIVE de l’arbre — invisible de `geometry.dispose()`', () => {
    const mesh = new THREE.Mesh(cube())
    expect(bvhBytes(mesh)).toBe(0)
    attachBVH(mesh)
    // ⚠️ Lit `_roots` / `_indirectBuffer`, deux champs internes de three-mesh-bvh : ce test
    // est là pour que leur disparition se voie à la montée de version, et non le jour où
    // le budget mémoire compterait zéro sans rien dire.
    expect(bvhBytes(mesh)).toBeGreaterThan(0)
  })

  it('detachBVH rend la géométrie à un état libérable', () => {
    const mesh = new THREE.Mesh(cube())
    attachBVH(mesh)
    detachBVH(mesh)
    expect(mesh.geometry.boundsTree).toBeUndefined()
    expect(bvhBytes(mesh)).toBe(0)
  })
})

describe('makeUnraycastable', () => {
  it('retire le mesh du chemin des rayons sans le retirer du rendu', () => {
    const mesh = new THREE.Mesh(cube())
    makeUnraycastable(mesh)
    const hits: THREE.Intersection[] = []
    mesh.raycast(new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1)), hits)
    expect(hits).toHaveLength(0)
    expect(mesh.visible).toBe(true)
  })
})
