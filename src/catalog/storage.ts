/**
 * Accès au stockage local, tolérant à son absence.
 *
 * `localStorage` peut lever à la simple LECTURE de la propriété (navigation privée
 * Safari, cookies tiers bloqués, contexte non-navigateur) : le `try` entoure donc
 * l'accès lui-même, pas seulement l'appel.
 */
const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const readStorage = (key: string): string | null => {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export const writeStorage = (key: string, value: string): void => {
  try {
    storage()?.setItem(key, value)
  } catch {
    // Quota dépassé ou stockage refusé : la session reste utilisable, non persistée.
  }
}

export const clearStorage = (key: string): void => {
  try {
    storage()?.removeItem(key)
  } catch {
    // Idem — l'effacement d'un stockage indisponible est sans objet.
  }
}
