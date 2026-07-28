/** Conventions partagées des raccourcis clavier des barres (MapControls, DrawLayer, TagFilterControl). */

import type { EditShortcut } from '../../config/types'

/**
 * true si l'événement vient d'un champ de saisie : les raccourcis à lettre seule ne
 * doivent jamais voler la frappe.
 *
 * Ré-exporté depuis le cœur, qui en a besoin sans dépendre de la couche React (le
 * déplacement au clavier vit dans le moteur). Une seule implémentation.
 */
export { inTextInput, plainKey } from '../../core/NavKeys'

/** Plateforme Mac (⌘ au lieu de Ctrl) — unique point de détection. */
export const isMac = /Mac|iP(hone|ad|od)/.test(navigator.userAgent)

/**
 * Écriture affichable d'un raccourci à modificateur (`⌘Z`, `Ctrl+⇧Z`).
 *
 * Les libellés de la barre et du panneau Réglages composaient ces chaînes à la main
 * (`` `${modKey}Z` ``) : ils annonçaient donc les touches d'origine quoi qu'ait réglé
 * l'application — une aide en ligne qui ment est pire que pas d'aide du tout.
 */
export const formatEdit = (
  spec: EditShortcut,
  modKey: { mac: string; other: string },
  shiftGlyph: string,
): string | undefined => {
  if (!spec) return undefined
  const prefix = spec.mod === 'ctrl' && !isMac ? modKey.other : modKeyOf(modKey)
  return `${prefix}${spec.shift ? shiftGlyph : ''}${spec.key.toUpperCase()}`
}

/**
 * L'événement déclenche-t-il ce raccourci à modificateur ?
 *
 * Ces commandes (annuler, rétablir, tout sélectionner, dupliquer) étaient une suite
 * de `else if` écrits à la main dans le gestionnaire de `<DrawLayer>` : les touches y
 * étaient inatteignables, alors que `⌘A` et `⌘D` sont précisément celles qui entrent
 * en conflit avec les raccourcis de l'application hôte.
 *
 * `shift` non déclaré signifie « indifférent », sauf pour distinguer deux raccourcis
 * de même touche : c'est l'appelant qui teste le plus spécifique en premier.
 */
export const matchesEdit = (e: KeyboardEvent, spec: EditShortcut): boolean => {
  if (!spec) return false
  if (e.key.toLowerCase() !== spec.key.toLowerCase()) return false
  const mod = spec.mod ?? 'mod'
  const modOk = mod === 'mod' ? e.ctrlKey || e.metaKey : mod === 'ctrl' ? e.ctrlKey : e.metaKey
  if (!modOk) return false
  return spec.shift === undefined ? true : e.shiftKey === spec.shift
}

/**
 * Préfixe du modificateur d'action selon la plateforme : `⌘Z` / `Ctrl+Z`.
 *
 * Les deux formes viennent des labels (`labels.modKey`) : elles sont AFFICHÉES, donc
 * elles relèvent de la traduction — « Ctrl+ » ne s'écrit pas partout ainsi. Requis et
 * non optionnel : un repli en dur redupliquerait `defaultLabels.modKey`.
 */
export const modKeyOf = (mod: { mac: string; other: string }): string => (isMac ? mod.mac : mod.other)
