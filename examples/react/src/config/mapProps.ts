import type { InteractiveMode, MapMode } from 'map3d'

/* ══════════════════ PROPS DE `<Map>` HORS `MapConfig` ══════════════════
   Le clair/sombre, le fond, l'interactivité ne sont pas des réglages de `MapConfig` :
   ce sont des props. Elles ont donc leur propre état, et leur propre onglet.

   Ce module est séparé du composant du panneau pour une raison bête mais réelle : un
   fichier qui exporte À LA FOIS un composant React et des valeurs casse le Fast
   Refresh de Vite (« export is incompatible »), et toute édition du panneau rechargeait
   la page — donc la carte, donc les tuiles. */

export type MapPropsSettings = {
  /**
   * `'auto'` suit `prefers-color-scheme`. LE réglage clair/sombre — il n'est pas dans
   * `MapConfig`.
   *
   * ⚠️ Il n'agit QUE si `theme` est un couple `{ light, dark }` : `MapProvider` s'en
   * sert pour choisir dedans (`base = isPair(theme) ? theme[scheme] : theme`). Avec un
   * thème unique, la prop ne fait rien — cf. `config/theme.ts`, qui déclare le couple.
   *
   * Le fond du canvas fait exception : il est lu à la construction du moteur
   * (`Map.tsx`, `background: theme.colors.background`) et ne suit pas la bascule à
   * chaud. Il n'apparaît que là où aucune tuile n'est chargée — « Recharger la carte »
   * le remet d'aplomb.
   */
  colorScheme: 'auto' | 'dark' | 'light'
  /** ❄ Fond au démarrage. Le bouton « fonds » de la carte bascule à chaud, cette prop non. */
  mapMode: MapMode
  /** Encodé en chaîne : Tweakpane liste des scalaires, pas un `true | 'view' | false`. */
  interactive: 'true' | 'view' | 'false'
  /** ❄ Globe uni de repli quand aucune tuile n'est disponible. */
  fallbackGlobe: boolean
  /** ❄ Vol d'introduction au montage. */
  intro: boolean
  /** ❄ Erreur d'écran cible (qualité/charge). Défaut de `3d-tiles-renderer` : 16. */
  errorTarget: number
}

export const defaultMapProps: MapPropsSettings = {
  colorScheme: 'dark',
  // '3d' : le banc démarre sur le volume, seul mode où se jugent les tuiles 3D, le pick de
  // bâtiment et le mode piéton. Le fond plat reste à un clic (bouton « Plan » de la barre).
  mapMode: '3d',
  interactive: 'true',
  fallbackGlobe: true,
  intro: true,
  errorTarget: 16,
}

/** `<Map interactive>` accepte `true | 'view' | false` ; le panneau n'a que du texte. */
export const toInteractiveMode = (value: MapPropsSettings['interactive']): InteractiveMode =>
  value === 'view' ? 'view' : value === 'false' ? false : true
