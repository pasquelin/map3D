/**
 * Déclenche le téléchargement d'un `Blob` sous `filename` via un `<a download>` éphémère.
 * Point unique partagé (export de template ET capture d'image) — deux précautions
 * cross-navigateur y sont centralisées :
 *
 * - **`<a>` attaché au document** avant le clic : Firefox ignore le clic sur un ancrage
 *   détaché du DOM (rien ne se télécharge, sans erreur).
 * - **révocation DIFFÉRÉE** de l'URL objet : le navigateur lit l'URL de façon asynchrone
 *   APRÈS le clic ; la révoquer dans la foulée annule le téléchargement en silence. On la
 *   libère au tick suivant, une fois le transfert amorcé (sans fuiter l'URL).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url))
}
