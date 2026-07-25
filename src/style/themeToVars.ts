import type { MapTheme } from '../theme/types'

/**
 * Convertit un thème en custom properties `--m3d-*` à poser sur l'élément
 * racine. Les règles CSS injectées et les composants React lisent ces variables,
 * ce qui rend l'apparence entièrement pilotée par le thème.
 */
export function themeToVars(theme: MapTheme): Record<string, string> {
  const c = theme.colors
  return {
    '--m3d-bg': c.background,
    '--m3d-panel': c.ui.panel,
    '--m3d-text': c.ui.text,
    '--m3d-muted': c.ui.muted,
    '--m3d-accent': c.ui.accent,
    '--m3d-error': c.ui.error,
    '--m3d-border': c.ui.border,
    '--m3d-cluster-core': c.cluster.core,
    '--m3d-cluster-satellite': c.cluster.satellite,
    '--m3d-cluster-text': c.cluster.text,
    '--m3d-cluster-ring': c.cluster.ring,
    '--m3d-shadow-sm': theme.shadows.sm,
    '--m3d-shadow-md': theme.shadows.md,
    '--m3d-shadow-lg': theme.shadows.lg,
    '--m3d-radius-sm': `${theme.radii.sm}px`,
    '--m3d-radius-md': `${theme.radii.md}px`,
    '--m3d-radius-lg': `${theme.radii.lg}px`,
    '--m3d-radius-pill': `${theme.radii.pill}px`,
    '--m3d-font': theme.typography.fontFamily,
    '--m3d-size-xs': `${theme.typography.sizes.xs ?? 10.5}px`,
    '--m3d-size-sm': `${theme.typography.sizes.sm ?? 12.5}px`,
    '--m3d-size-md': `${theme.typography.sizes.md ?? 13.5}px`,
    '--m3d-size-lg': `${theme.typography.sizes.lg ?? 16}px`,
  }
}
