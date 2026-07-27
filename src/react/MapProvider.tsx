import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { defaultConfig } from '../config/defaultConfig'
import { mergeConfig } from '../config/mergeConfig'
import type { PartialConfig } from '../config/types'
import { defaultLabels } from '../labels/defaultLabels'
import { mergeLabels } from '../labels/mergeLabels'
import type { PartialLabels } from '../labels/types'
import { defaultTheme } from '../theme/defaultTheme'
import { mergeTheme } from '../theme/mergeTheme'
import type { MapTheme, ThemeInput } from '../theme/types'
import { ConfigContext, LabelsContext, ThemeContext } from './context'
import { useMergedByContent } from './hooks/useMergedByContent'

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
  const resolvedConfig = useMergedByContent(config, (c) => mergeConfig(defaultConfig, c))

  return (
    <ThemeContext.Provider value={resolved}>
      <LabelsContext.Provider value={resolvedLabels}>
        <ConfigContext.Provider value={resolvedConfig}>{children}</ConfigContext.Provider>
      </LabelsContext.Provider>
    </ThemeContext.Provider>
  )
}
