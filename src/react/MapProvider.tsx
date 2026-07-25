import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { defaultLabels } from '../labels/defaultLabels'
import { mergeLabels } from '../labels/mergeLabels'
import type { MapLabels, PartialLabels } from '../labels/types'
import { defaultTheme } from '../theme/defaultTheme'
import { mergeTheme } from '../theme/mergeTheme'
import type { MapTheme, ThemeInput } from '../theme/types'
import { LabelsContext, ThemeContext } from './context'

export type MapProviderProps = {
  /** Thème unique, couple { light, dark }, ou rien (thème neutre par défaut). */
  theme?: ThemeInput
  /** 'auto' suit `prefers-color-scheme` (et se met à jour en direct). */
  colorScheme?: 'dark' | 'light' | 'auto'
  /** Overrides de libellés (traduction) — merge profond sur `defaultLabels`, voir LABELS.md. */
  labels?: PartialLabels
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

/** Racine de thème + libellés. Résout clair/sombre et `prefers-reduced-motion`. */
export function MapProvider({ theme = defaultTheme, colorScheme = 'auto', labels, children }: MapProviderProps) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', true, colorScheme === 'auto')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)

  const resolved = useMemo<MapTheme>(() => {
    const scheme = colorScheme === 'auto' ? (prefersDark ? 'dark' : 'light') : colorScheme
    const base = isPair(theme) ? theme[scheme] : theme
    return mergeTheme(base, undefined, { prefersReducedMotion })
  }, [theme, colorScheme, prefersDark, prefersReducedMotion])

  // Identité STABLE des labels résolus : un littéral `labels={{...}}` inline (le
  // pattern documenté) recrée l'objet à chaque render du parent — sans ce cache
  // par contenu, le contexte invaliderait toute l'UI de la carte à chaque tick.
  // Les labels sont un petit arbre de strings : la sérialisation est bornée.
  const labelsCache = useRef<{ json: string; merged: MapLabels } | null>(null)
  const resolvedLabels = useMemo(() => {
    const json = JSON.stringify(labels ?? null)
    const cached = labelsCache.current
    if (cached && cached.json === json) return cached.merged
    const merged = mergeLabels(defaultLabels, labels)
    labelsCache.current = { json, merged }
    return merged
  }, [labels])

  return (
    <ThemeContext.Provider value={resolved}>
      <LabelsContext.Provider value={resolvedLabels}>{children}</LabelsContext.Provider>
    </ThemeContext.Provider>
  )
}
