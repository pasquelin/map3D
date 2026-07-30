import { defaultTheme } from '../theme/defaultTheme'
import type { MapTheme } from '../theme/types'

/**
 * Convertit un thème en custom properties `--m3d-*` à poser sur l'élément
 * racine. Les règles CSS injectées et les composants React lisent ces variables,
 * ce qui rend l'apparence entièrement pilotée par le thème.
 */
export function themeToVars(theme: MapTheme): Record<string, string> {
  const c = theme.colors
  const vars: Record<string, string> = {
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
    // Mode piéton. Replis sur les couleurs d'état de l'interface : un thème écrit avant
    // l'ajout du bloc reste valide, et son curseur reste lisible.
    '--m3d-pedestrian-valid': c.pedestrian?.placeValid ?? c.ui.accent,
    '--m3d-pedestrian-blocked': c.pedestrian?.placeBlocked ?? c.ui.error,
    '--m3d-pedestrian-reticle': c.pedestrian?.reticle ?? c.ui.text,
    '--m3d-shadow-sm': theme.shadows.sm,
    '--m3d-shadow-md': theme.shadows.md,
    '--m3d-shadow-lg': theme.shadows.lg,
    '--m3d-radius-sm': `${theme.radii.sm}px`,
    '--m3d-radius-md': `${theme.radii.md}px`,
    '--m3d-radius-lg': `${theme.radii.lg}px`,
    '--m3d-radius-pill': `${theme.radii.pill}px`,
    '--m3d-font': theme.typography.fontFamily,
    // Replis pris sur `defaultTheme` et non réécrits en littéral : les quatre
    // valeurs étaient dupliquées ici, libres de diverger de leur propre défaut.
    '--m3d-size-xs': `${theme.typography.sizes.xs ?? defaultTheme.typography.sizes.xs}px`,
    '--m3d-size-sm': `${theme.typography.sizes.sm ?? defaultTheme.typography.sizes.sm}px`,
    '--m3d-size-md': `${theme.typography.sizes.md ?? defaultTheme.typography.sizes.md}px`,
    '--m3d-size-lg': `${theme.typography.sizes.lg ?? defaultTheme.typography.sizes.lg}px`,
    // Géométrie des surfaces flottantes : publiée pour que la feuille de styles et
    // les hooks de placement partagent le même nombre (cf. `panelGeometry`).
    '--m3d-gap': `${theme.spacing.gap}px`,
    '--m3d-bar-inset': `${theme.spacing.barInset}px`,
    // Attendue par 7 règles d'animation de `injectStyles` (menus, flyouts, panneaux)
    // qui repliaient toutes sur 200ms faute d'émetteur.
    '--m3d-menu-dur': `${theme.animations.menuOpen.duration}ms`,
    '--m3d-lens-panel-w': `${theme.sizing.lensPanelW}px`,
    '--m3d-selection-panel-w': `${theme.sizing.selectionPanelW}px`,
    '--m3d-templates-panel-w': `${theme.sizing.templatesPanelW}px`,
    '--m3d-templates-panel-maxh': `${theme.sizing.panelMaxHeight.templates}px`,
    // Épaisseur d'anneau d'un marker. La feuille de styles écrivait `2.5px` pour
    // l'avatar quand le thème annonçait `3` : deux valeurs pour le même trait, dont
    // une seule surchargeable — et c'était la morte.
    '--m3d-marker-ring-w': `${theme.markers.ringWidth}px`,
    // `typography.weights` n'avait AUCUN consommateur : les dix-neuf graisses de la
    // feuille de styles étaient écrites en dur, donc la clé mentait.
    '--m3d-weight-medium': String(theme.typography.weights.medium ?? defaultTheme.typography.weights.medium),
    '--m3d-weight-semibold': String(theme.typography.weights.semibold ?? defaultTheme.typography.weights.semibold),
    '--m3d-weight-bold': String(theme.typography.weights.bold ?? defaultTheme.typography.weights.bold),
    // Mode sombre du fond de carte : les tuiles Google n'ont pas de variante sombre,
    // les assombrir côté rendu est le seul moyen d'accorder la carte à une UI sombre.
    '--m3d-tiles-filter': tilesFilterCss(theme),
  }
  // Optionnelles (thème antérieur valide) : les règles CSS ont leur repli.
  if (c.attention?.sonar) vars['--m3d-sonar-color'] = c.attention.sonar
  if (c.attention?.target) vars['--m3d-target-color'] = c.attention.target
  if (c.marquee) {
    vars['--m3d-marquee-fill'] = c.marquee.fill
    vars['--m3d-marquee-stroke'] = c.marquee.stroke
    vars['--m3d-marquee-under'] = c.marquee.under
  }
  return vars
}

/**
 * Chaîne `filter` CSS correspondant à `theme.tiles.filter`, ou `'none'`.
 *
 * Séparée de `themeToVars` parce qu'elle se compose : chaque fonction n'est émise
 * que si le thème la déclare, et l'ordre suit celui d'une correction d'image
 * (luminosité → saturation → contraste → inversion → teinte).
 */
export function tilesFilterCss(theme: MapTheme): string {
  const f = theme.tiles?.filter
  if (!f) return 'none'
  const parts: string[] = []
  if (f.brightness !== undefined) parts.push(`brightness(${f.brightness})`)
  if (f.saturation !== undefined) parts.push(`saturate(${f.saturation})`)
  if (f.contrast !== undefined) parts.push(`contrast(${f.contrast})`)
  if (f.invert !== undefined) parts.push(`invert(${f.invert})`)
  if (f.hueRotate !== undefined) parts.push(`hue-rotate(${f.hueRotate}deg)`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}
