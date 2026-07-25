// Accès localStorage best-effort (stockage privé/plein, SSR) — unique implémentation
// des try/catch de persistance (position caméra, historique de recherche, réglages).

export const readStoredJSON = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export const writeStoredJSON = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort */
  }
}

export const removeStoredKey = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}
