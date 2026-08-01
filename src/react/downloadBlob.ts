/**
 * Déclenche le téléchargement d'un `Blob` sous `filename` via un `<a download>` éphémère.
 * `revokeObjectURL` immédiat (le clic a déjà lancé le téléchargement) évite la fuite de
 * l'URL objet — le piège à ne pas oublier, d'où ce point unique (export de template ET
 * capture d'image le partagent).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
