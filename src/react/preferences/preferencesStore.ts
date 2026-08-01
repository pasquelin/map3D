import type { Preferences } from '../../config/preferences'
import { defaultPreferences } from '../../config/preferences'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../../core/storage'

/**
 * Store réactif des préférences utilisateur, persisté en localStorage.
 *
 * `null` = AUCUNE préférence stockée : la carte suit alors la config de l'application,
 * intacte — ouvrir le panneau ne change rien tant que l'utilisateur n'a rien choisi.
 * Le premier réglage écrit un objet complet (défauts + son choix), relu au rechargement.
 *
 * Modelé pour `useSyncExternalStore` : `get()` ne change d'identité qu'à l'écriture, donc
 * un abonné ne se re-rend que sur un vrai changement.
 */
export type PreferencesStore = {
  /** Préférences stockées, ou `null` si l'utilisateur n'a jamais réglé (snapshot stable). */
  get: () => Preferences | null
  /**
   * Modifie et persiste ; crée l'entrée au besoin. `keys` est REMPLACÉ quand il est
   * fourni (jamais fusionné) : l'appelant passe la table complète qu'il veut — c'est ce
   * qui permet de réinitialiser les touches en écrivant `{ keys: {} }`.
   */
  set: (patch: Partial<Preferences>) => void
  /** Efface toutes les préférences : retour au comportement défini par l'application. */
  reset: () => void
  subscribe: (fn: () => void) => () => void
}

export function createPreferencesStore(key: string): PreferencesStore {
  const listeners = new Set<() => void>()
  let value: Preferences | null = read()

  function read(): Preferences | null {
    // `core/storage` est l'unique implémentation des try/catch de persistance (il couvre
    // l'accès à `localStorage` qui lève en navigation privée, pas seulement l'appel).
    const raw = readStoredJSON(key)
    if (!raw || typeof raw !== 'object') return null
    const parsed = raw as Partial<Preferences>
    // Complété par les défauts : un format plus ancien à qui il manque un champ reste
    // valide au lieu de tout perdre.
    return { ...defaultPreferences, ...parsed, keys: { ...parsed.keys } }
  }

  function write(next: Preferences | null): void {
    value = next
    if (next) writeStoredJSON(key, next)
    else removeStoredKey(key)
    for (const fn of listeners) fn()
  }

  return {
    get: () => value,
    set(patch) {
      const base = value ?? defaultPreferences
      write({ ...base, ...patch, keys: patch.keys ?? base.keys })
    },
    reset: () => write(null),
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}
