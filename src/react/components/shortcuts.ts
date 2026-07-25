/** Conventions partagées des raccourcis clavier des barres (MapControls, DrawLayer, TagFilterControl). */

/**
 * true si l'événement vient d'un champ de saisie (input, textarea, contenteditable) :
 * les raccourcis à lettre seule ne doivent jamais voler la frappe.
 */
export const inTextInput = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/**
 * Touche « nue » d'un raccourci : la key en minuscules, ou null si l'événement
 * ne doit pas déclencher de raccourci (modificateur enfoncé — ⌘/Ctrl/Alt
 * appartiennent au navigateur et aux actions d'édition — ou champ de saisie).
 * Unique implémentation de la garde : tous les listeners passent par ici.
 */
export const plainKey = (e: KeyboardEvent): string | null =>
  e.metaKey || e.ctrlKey || e.altKey || inTextInput(e) ? null : e.key.toLowerCase()

/** Plateforme Mac (⌘ au lieu de Ctrl) — unique point de détection. */
export const isMac = /Mac|iP(hone|ad|od)/.test(navigator.userAgent)

/** Préfixe du modificateur d'action selon la plateforme : `⌘Z` / `Ctrl+Z`. */
export const modKey = isMac ? '⌘' : 'Ctrl+'
