// Raycast accéléré des surfaces reconstruites localement (bâtiments extrudés).
//
// Le groupe du `TilesRenderer` sait déjà répondre vite : son `raycast()` descend par la
// hiérarchie de volumes englobants des tuiles. Une surface qu'on construit soi-même n'a
// rien de tel — Three teste alors CHAQUE triangle et collecte TOUS les hits avant de les
// trier. Une tuile de bâtiments dense pèse ~131 000 triangles, et la carte en raycaste
// plusieurs par frame (garde caméra de `GlobeControls`, suivi d'altitude, drapage des
// formes) : c'est ce qui rendait le volume interne inutilisable.
//
// Ce module remet les deux fournisseurs à égalité — même coût de rayon, donc même
// comportement de caméra et de drapage, quelle que soit la provenance du volume.

import * as THREE from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'

/**
 * Rend `mesh` raycastable en temps logarithmique.
 *
 * Posé **par instance**, jamais en monkey-patch de `THREE.Mesh.prototype` : une lib n'a
 * pas à changer le comportement des meshes de l'application hôte. `acceleratedRaycast`
 * retombe d'elle-même sur le raycast d'origine si la géométrie n'a pas d'arbre.
 *
 * Effet de bord voulu : `firstHitOnly` (posé par `Projection` sur ses trois raycasters)
 * ne devient effectif qu'ici — c'est un drapeau three-mesh-bvh, que le raycast de Three
 * ignore. Les rayons de la carte s'arrêtent donc au premier triangle touché.
 */
export function attachBVH(mesh: THREE.Mesh): void {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, BUILD_OPTIONS)
  mesh.raycast = acceleratedRaycast
}

/**
 * Octets retenus par l'arbre d'un mesh — mémoire VIVE, invisible du GPU et donc de tout
 * budget qui ne compterait que les tampons envoyés à la carte. C'est la matière du
 * plafond `maxBytes` des caches de tuiles.
 *
 * Les nœuds vivent dans un ou plusieurs `ArrayBuffer` (`_roots`), le tampon d'indirection
 * dans un `Uint32Array` — l'un et l'autre sont ignorés par `geometry.dispose()`.
 */
export function bvhBytes(mesh: THREE.Mesh): number {
  const tree = mesh.geometry.boundsTree as unknown as
    { _roots?: ArrayBuffer[]; _indirectBuffer?: Uint32Array } | undefined
  if (!tree) return 0
  const roots = tree._roots?.reduce((sum, b) => sum + b.byteLength, 0) ?? 0
  return roots + (tree._indirectBuffer?.byteLength ?? 0)
}

/**
 * Réglages de construction, calibrés sur une tuile z14 dense (~131 000 triangles) :
 *
 * | construction | force brute | avec l'arbre |
 * |--------------|-------------|--------------|
 * | ~20 ms       | 5,7 ms/rayon | ~0,015 ms/rayon |
 *
 * La construction est le prix à payer UNE FOIS par tuile, hors boucle de frame ; la
 * requête, elle, est payée trois fois par frame. On accepte donc un arbre un peu moins
 * fin pour le construire deux fois plus vite :
 *
 * - `indirect` ne réordonne pas l'index de la géométrie (construction plus rapide, et les
 *   tampons produits par le worker restent tels quels).
 * - `targetLeafSize` à 96 plutôt que 10 : moitié moins de temps de construction, pour une
 *   requête qui reste plusieurs centaines de fois plus rapide que la force brute.
 */
const BUILD_OPTIONS = { indirect: true, targetLeafSize: 96 } as const

/**
 * Retire l'arbre avant de libérer la géométrie. `BufferGeometry.dispose()` ne connaît que
 * les ressources GPU : l'arbre est un `ArrayBuffer` côté CPU, que rien ne lâcherait.
 */
export function detachBVH(mesh: THREE.Mesh): void {
  mesh.geometry.boundsTree = undefined
}

/**
 * Marque un mesh comme **jamais** touché par un rayon.
 *
 * Pour une surface de repli dont le volume englobant est énorme (la sphère « océan »
 * couvre la Terre entière) : sa boîte est traversée par tous les rayons, donc ses
 * triangles sont tous testés à chaque lancer, pour un résultat que le repli ellipsoïde
 * de `GlobeControls` et de `Projection` donne déjà — analytiquement, et gratuitement.
 */
export function makeUnraycastable(mesh: THREE.Mesh): void {
  mesh.raycast = () => {}
}
