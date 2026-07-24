import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { defaultTheme } from '../theme/defaultTheme'
import { mergeTheme } from '../theme/mergeTheme'
import type { MapTheme, ThemeInput } from '../theme/types'
import { ThemeContext } from './context'

export type MapProviderProps = {
  /** Thème unique, couple { light, dark }, ou rien (thème neutre par défaut). */
  theme?: ThemeInput
  /** 'auto' suit `prefers-color-scheme` (et se met à jour en direct). */
  colorScheme?: 'dark' | 'light' | 'auto'
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

/** Racine de thème. Résout clair/sombre et `prefers-reduced-motion`. */
export function MapProvider({ theme = defaultTheme, colorScheme = 'auto', children }: MapProviderProps) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', true, colorScheme === 'auto')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)

  const resolved = useMemo<MapTheme>(() => {
    const scheme = colorScheme === 'auto' ? (prefersDark ? 'dark' : 'light') : colorScheme
    const base = isPair(theme) ? theme[scheme] : theme
    return mergeTheme(base, undefined, { prefersReducedMotion })
  }, [theme, colorScheme, prefersDark, prefersReducedMotion])

  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>
}
