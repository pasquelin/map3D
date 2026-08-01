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
//
// ⚠️ Il est atteint DEPUIS LE WORKER (cf. `buildingsWorker`) : trois n'y est importé qu'en
// symboles nommés, et les seuls types passent par `import type`. Un `import * as THREE` de
// valeurs y tirerait le moteur entier dans le blob.

import { BufferAttribute, BufferGeometry } from 'three'
import type * as THREE from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'

/**
 * Arbre réduit à des tampons — ce qui traverse `postMessage`.
 *
 * `index` est volontairement ABSENT de ce que produit `packTileBVH` : avec `indirect`,
 * l'index de la géométrie n'est pas réordonné, donc `MeshBVH.serialize` y remettrait le
 * tampon d'indices de la tuile, DÉJÀ transféré par ailleurs. Le lister deux fois fait
 * échouer `postMessage` à l'exécution, et rien dans le typage ne l'empêche (même piège que
 * `transferablesOf`).
 *
 * `version` est reconduit tel quel : sans lui, `MeshBVH.deserialize` croit lire un format
 * d'avant la v1, avertit en console et « répare » des racines qui n'ont rien de cassé.
 */
export type PackedBVH = {
  version: number
  roots: ArrayBuffer[]
  indirectBuffer: Uint32Array | Uint16Array | null
}

/**
 * Construit l'arbre d'une tuile et le réduit à des tampons — **hors du thread principal**.
 *
 * C'est le poste que ce découpage existe pour déplacer. Mesuré sur trois tuiles z14
 * parisiennes (~130 000 triangles chacune) : ~41 ms de construction, contre 0,05 ms pour
 * la repose côté main thread (`attachPackedBVH`), soit un facteur ~800. Tant qu'il était
 * payé au montage, il valait à lui seul 97 % du coût d'une tuile, et `mountPerFrame: 1`
 * ne pouvait qu'étaler le gel, jamais le supprimer.
 *
 * `positions` en `Int16Array` = attribut NORMALISÉ : three-mesh-bvh bascule alors sur
 * `getX/getY/getZ`, qui dénormalisent. Sans ce drapeau, l'arbre décrirait une géométrie
 * fantôme et le picking comme la garde caméra viseraient à côté.
 */
export function packTileBVH(positions: Float32Array | Int16Array, indices: Uint32Array): PackedBVH {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3, positions instanceof Int16Array))
  geometry.setIndex(new BufferAttribute(indices, 1))
  // `cloneBuffers: false` : les tampons sont cédés au thread principal juste après, et
  // l'arbre qui les portait est abandonné ici. Les cloner doublerait la mémoire de pointe
  // du worker pour recopier ce que personne ne relira.
  // ⚠️ Le type publié par three-mesh-bvh (`SerializedBVH`) est en retard sur son
  // implémentation : celle-ci écrit un champ `version` que la déclaration ignore. On le
  // relit donc au travers d'une forme locale, plutôt que de le perdre — cf. `PackedBVH`.
  const packed = MeshBVH.serialize(new MeshBVH(geometry, BUILD_OPTIONS), { cloneBuffers: false }) as unknown as {
    version: number
    roots: ArrayBuffer[]
    indirectBuffer: Uint32Array | Uint16Array | null
  }
  return { version: packed.version, roots: packed.roots, indirectBuffer: packed.indirectBuffer }
}

/** Tampons cédés avec le paquet — plusieurs centaines de kilooctets sans recopie. */
export function packedBVHTransferables(packed: PackedBVH): Transferable[] {
  const out: Transferable[] = [...packed.roots]
  if (packed.indirectBuffer) out.push(packed.indirectBuffer.buffer as ArrayBuffer)
  return out
}

/**
 * Pose un arbre DÉJÀ construit, et le raycast accéléré qui va avec.
 *
 * `setIndex: false` : la géométrie porte déjà l'index de la tuile, et `indirect` ne le
 * réordonne pas — le laisser à `true` ferait recopier un tampon d'indices sur lui-même.
 *
 * Posé **par instance**, jamais en monkey-patch de `THREE.Mesh.prototype` : une lib n'a
 * pas à changer le comportement des meshes de l'application hôte. `acceleratedRaycast`
 * retombe d'elle-même sur le raycast d'origine si la géométrie n'a pas d'arbre.
 *
 * Effet de bord voulu : `firstHitOnly` (posé par `Projection` sur ses trois raycasters)
 * ne devient effectif qu'ici — c'est un drapeau three-mesh-bvh, que le raycast de Three
 * ignore. Les rayons de la carte s'arrêtent donc au premier triangle touché.
 */
export function attachPackedBVH(mesh: THREE.Mesh, packed: PackedBVH): void {
  // `index: null` assumé : `setIndex: false` ne le lit pas, et le type publié l'exige.
  const data = { ...packed, index: null } as unknown as Parameters<typeof MeshBVH.deserialize>[0]
  mesh.geometry.boundsTree = MeshBVH.deserialize(data, mesh.geometry, { setIndex: false })
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
 * | construction | force brute  | avec l'arbre    |
 * |--------------|--------------|-----------------|
 * | ~41 ms       | 5,7 ms/rayon | ~0,004 ms/rayon |
 *
 * La construction est le prix à payer UNE FOIS par tuile, hors boucle de frame ; la
 * requête, elle, est payée trois fois par frame. On accepte donc un arbre un peu moins
 * fin pour le construire plus vite :
 *
 * - `indirect` ne réordonne pas l'index de la géométrie (construction plus rapide, et les
 *   tampons produits par le worker restent tels quels).
 * - `targetLeafSize` à 96 plutôt que 10 : moitié moins de temps de construction, pour une
 *   requête qui reste plusieurs centaines de fois plus rapide que la force brute. Mesuré :
 *   le monter à 512 ne rend que ~10 % du temps de construction — le coût est dans le tri,
 *   pas dans la finesse, et c'est bien pourquoi ce poste devait CHANGER DE THREAD plutôt
 *   que d'être réglé plus finement.
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
