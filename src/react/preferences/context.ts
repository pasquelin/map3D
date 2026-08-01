import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Preferences } from '../../config/preferences'
import { defaultPreferences } from '../../config/preferences'
import type { PreferencesStore } from './preferencesStore'

/**
 * Store des préférences utilisateur, fourni par `<MapProvider>`. `null` hors d'une carte :
 * le panneau de préférences s'efface alors de lui-même (il n'a personne à qui écrire).
 */
export const PreferencesContext = createContext<PreferencesStore | null>(null)

/**
 * Préférences courantes (réactives) + de quoi les changer.
 *
 * `prefs` est toujours complet (défauts si rien n'est stocké). `hasStored` distingue
 * « l'utilisateur n'a jamais réglé » de « il a explicitement choisi les défauts » — le
 * panneau s'en sert pour n'allumer aucun preset tant que rien n'a été touché.
 *
 * Hors `<MapProvider>`, `store` est `null` : l'appelant doit alors ne rien rendre.
 */
export function usePreferences(): { prefs: Preferences; hasStored: boolean; store: PreferencesStore | null } {
  const store = useContext(PreferencesContext)
  const stored = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : nullSnapshot,
    nullSnapshot,
  )
  return { prefs: stored ?? defaultPreferences, hasStored: stored !== null, store }
}

const noopSubscribe = (): (() => void) => () => {}
const nullSnapshot = (): Preferences | null => null
