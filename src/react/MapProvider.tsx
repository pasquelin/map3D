import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { defaultConfig } from '../config/defaultConfig'
import { mergeConfig } from '../config/mergeConfig'
import { preferencesToPartialConfig } from '../config/preferences'
import { detectDeviceCaps } from '../config/qualityPresets'
import type { PartialConfig } from '../config/types'
import { defaultLabels } from '../labels/defaultLabels'
import { mergeLabels } from '../labels/mergeLabels'
import type { PartialLabels } from '../labels/types'
import { defaultTheme } from '../theme/defaultTheme'
import { mergeTheme } from '../theme/mergeTheme'
import type { MapTheme, ThemeInput } from '../theme/types'
import { ConfigContext, LabelsContext, ThemeContext } from './context'
import { useMergedByContent } from './hooks/useMergedByContent'
import { PreferencesContext } from './preferences/context'
import { createPreferencesStore } from './preferences/preferencesStore'

export type MapProviderProps = {
  /** Thème unique, couple { light, dark }, ou rien (thème neutre par défaut). */
  theme?: ThemeInput
  /** 'auto' suit `prefers-color-scheme` (et se met à jour en direct). */
  colorScheme?: 'dark' | 'light' | 'auto'
  /** Overrides de libellés (traduction) — merge profond sur `defaultLabels`, voir LABELS.md. */
  labels?: PartialLabels
  /** Overrides de réglages — merge profond sur `defaultConfig`, cf. `MapConfig`. */
  config?: PartialConfig
  /** Sous-arbre qui reçoit thème, libellés et config. */
  children: ReactNode
}

function isPair(t: ThemeInput): t is { light: MapTheme; dark: MapTheme } {
  return (t as { light?: unknown }).light !== undefined
}

/** Suit une media query en direct (SSR-safe). Inerte tant que `enabled` est faux. */
function useMediaQuery(query: string, fallback: boolean, enabled = true): boolean {
  const [matches, setMatches] = useState(fallback)
  useEffect(() => {
    if (!enabled || typeof matchMedia === 'undefined') return
    const mq = matchMedia(query)
    setMatches(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query, enabled])
  return matches
}

/** Racine de thème, libellés et réglages. Résout clair/sombre et `prefers-reduced-motion`. */
export function MapProvider({
  theme = defaultTheme,
  colorScheme = 'auto',
  labels,
  config,
  children,
}: MapProviderProps) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', true, colorScheme === 'auto')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)

  // Cache par contenu comme les labels et la config : `spacing`/`sizing` ont fait des
  // hooks de placement (menus, flyouts, dock, barres) des abonnés au thème, là où ils
  // lisaient des constantes de module. Un `theme={{…}}` inline re-rendrait sinon
  // toute la couche flottante à chaque render de l'application hôte.
  const scheme = colorScheme === 'auto' ? (prefersDark ? 'dark' : 'light') : colorScheme
  const base = isPair(theme) ? theme[scheme] : theme
  // `prefersReducedMotion` fait partie de la clé : c'est une entrée du merge, pas
  // un réglage extérieur — l'omettre figerait le thème sur la préférence initiale.
  // L'enveloppe est mémoïsée pour que le court-circuit d'identité de
  // `useMergedByContent` couvre le cas courant (hôte sans `theme`).
  const themeInput = useMemo(() => ({ base, prefersReducedMotion }), [base, prefersReducedMotion])
  const resolved = useMergedByContent(themeInput, (input) =>
    mergeTheme(input.base, undefined, { prefersReducedMotion: input.prefersReducedMotion }),
  )

  const resolvedLabels = useMergedByContent(labels, (l) => mergeLabels(defaultLabels, l))
  // Config de l'APPLICATION, mise en cache par contenu (un `config={{…}}` inline ne
  // re-merge donc pas à chaque render de l'hôte).
  const hostConfig = useMergedByContent(config, (c) => mergeConfig(defaultConfig, c))

  // Store des préférences UTILISATEUR, persisté sous la clé résolue (l'hôte peut la
  // changer par `data.storageKeys.preferences`). Recréé UNIQUEMENT si cette clé change —
  // dépendre de `hostConfig` entier rouvrirait le localStorage (`read`) et rebrancherait
  // tous les abonnés dès que l'application touche n'importe quel autre champ de config.
  const prefKey = hostConfig.data.storageKeys.preferences
  const store = useMemo(() => createPreferencesStore(prefKey), [prefKey])
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get)
  // Sondage matériel figé pour la vie du provider : `pixelRatio` d'« Auto » n'a pas à
  // suivre un branchement d'écran à chaud, et le geste reste déterministe.
  const caps = useMemo(() => detectDeviceCaps(), [])

  // ── 3ᵉ COUCHE DE MERGE ──────────────────────────────────────────────────────────
  // defaultConfig < config (application) < préférences (utilisateur). L'utilisateur
  // gagne — c'est tout l'objet. Rien tant qu'aucune préférence n'est stockée : la carte
  // reste exactement ce que l'application a réglé. Le changement est poussé au moteur à
  // chaud par l'effet `config` de `<Map>` — aucun accès impératif ici.
  const resolvedConfig = useMemo(
    () => (prefs ? mergeConfig(hostConfig, preferencesToPartialConfig(prefs, caps)) : hostConfig),
    [hostConfig, prefs, caps],
  )

  return (
    <ThemeContext.Provider value={resolved}>
      <LabelsContext.Provider value={resolvedLabels}>
        <ConfigContext.Provider value={resolvedConfig}>
          <PreferencesContext.Provider value={store}>{children}</PreferencesContext.Provider>
        </ConfigContext.Provider>
      </LabelsContext.Provider>
    </ThemeContext.Provider>
  )
}
