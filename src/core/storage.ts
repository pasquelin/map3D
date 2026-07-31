// Accès localStorage best-effort (stockage privé/plein, SSR) — unique implémentation
// des try/catch de persistance (position caméra, historique de recherche, réglages,
// catalogue).
//
// ⚠️ `localStorage` peut lever à la simple LECTURE DE LA PROPRIÉTÉ, avant tout appel :
// navigation privée Safari, cookies tiers bloqués, contexte non-navigateur. Le `try`
// entoure donc l'accès lui-même — un `try` posé autour du seul `getItem` laisserait
// passer un `ReferenceError` en SSR.

const store = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const readStoredJSON = (key: string): unknown => {
  try {
    const raw = store()?.getItem(key)
    return raw == null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export const writeStoredJSON = (key: string, value: unknown): void => {
  try {
    store()?.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort */
  }
}

export const removeStoredKey = (key: string): void => {
  try {
    store()?.removeItem(key)
  } catch {
    /* best-effort */
  }
}
