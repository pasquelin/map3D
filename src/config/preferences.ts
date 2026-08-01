// Préférences UTILISATEUR — la tranche de réglages qu'un utilisateur final ajuste
// lui-même depuis la carte (qualité 3D, disposition clavier, vitesse, inertie), par
// opposition à la config que l'APPLICATION fige dans la prop `<Map config>`.
//
// C'est un objet SÉMANTIQUE volontairement petit et stable, dérivé en `PartialConfig`
// par une fonction pure : régler « qualité = basse » ne stocke pas dix chemins de config
// mais un seul mot, et réinitialiser revient à effacer un champ. La persistance et la
// couche de merge vivent côté React (`react/preferences/`), qui ne fait que porter et
// appliquer ce que ce module décrit.

import type { NavigateShortcuts, PartialConfig, ShortcutsConfig } from './types'
import { type DeviceCaps, type QualityLevel, detectDeviceCaps, detectQuality, qualityPreset } from './qualityPresets'

/** `'auto'` sonde la machine (cf. `detectQuality`) ; les autres forcent le niveau. */
export type QualityChoice = 'auto' | QualityLevel
export type KeyboardLayout = 'azerty' | 'qwerty'
export type MoveSpeed = 'slow' | 'normal' | 'fast'

/**
 * Actions dont l'utilisateur peut réassigner la touche : déplacement continu + commandes
 * de vue. VOLONTAIREMENT pas les outils de dessin ni l'édition — hors périmètre d'un
 * réglage d'utilisateur final (cf. la doc PREFERENCES).
 */
export type BindableAction = MoveAction | ViewAction
export type MoveDirection = 'forward' | 'backward' | 'left' | 'right'
export type MoveAction = MoveDirection | 'boost'
export type ViewAction = 'north' | 'tilt' | 'globe' | 'zoomIn' | 'zoomOut' | 'fullscreen'

/** Ordre d'affichage des deux groupes rebindables. */
export const MOVE_ACTIONS: readonly MoveAction[] = ['forward', 'backward', 'left', 'right', 'boost']
export const VIEW_ACTIONS: readonly ViewAction[] = ['north', 'tilt', 'globe', 'zoomIn', 'zoomOut', 'fullscreen']

export type Preferences = {
  quality: QualityChoice
  keyboard: KeyboardLayout
  /** Rebinds explicites (écrasent la disposition de base) — touche en minuscules. */
  keys: Partial<Record<BindableAction, string>>
  moveSpeed: MoveSpeed
  /** Inertie des gestes de caméra (`interaction.damping`). */
  damping: boolean
}

/**
 * Défauts qui ne changent RIEN au comportement de la lib : `azerty`/`normal`/`damping`
 * reproduisent `defaultConfig`, et `quality: 'auto'` n'est appliqué que si l'utilisateur
 * a réellement une préférence stockée (cf. le store). Un panneau ouvert sans choix
 * antérieur laisse donc la carte exactement telle que l'application l'a réglée.
 */
export const defaultPreferences: Preferences = {
  quality: 'auto',
  keyboard: 'azerty',
  keys: {},
  moveSpeed: 'normal',
  damping: true,
}

/** Lettres de déplacement par disposition — les flèches restent liées EN PLUS. */
const LAYOUT_LETTERS: Record<KeyboardLayout, Record<MoveDirection, string>> = {
  azerty: { forward: 'z', backward: 's', left: 'q', right: 'd' },
  qwerty: { forward: 'w', backward: 's', left: 'a', right: 'd' },
}

/** Flèche universelle par direction — toujours liée quelle que soit la disposition. */
const ARROWS: Record<MoveDirection, string> = {
  forward: 'arrowup',
  backward: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
}

/** Fraction de hauteur-sol par seconde (`camera.keyPan.speed`). */
const SPEED_VALUES: Record<MoveSpeed, number> = { slow: 0.4, normal: 0.8, fast: 1.5 }

/** Commandes de vue RÉELLEMENT réassignées — une touche `false` couperait la commande. */
function assignedViewKeys(prefs: Preferences): Partial<Record<ViewAction, string>> {
  const out: Partial<Record<ViewAction, string>> = {}
  for (const a of VIEW_ACTIONS) {
    const k = prefs.keys[a]
    if (k) out[a] = k
  }
  return out
}

/**
 * Liaisons de déplacement continu : les flèches (universelles) préfixent la touche
 * effective de chaque direction. Dérivé de `effectiveKeys` — une seule source pour la
 * résolution disposition + rebind, jamais recopiée.
 */
function navigateFrom(prefs: Preferences): NavigateShortcuts {
  const eff = effectiveKeys(prefs)
  return {
    forward: [ARROWS.forward, eff.forward!],
    backward: [ARROWS.backward, eff.backward!],
    left: [ARROWS.left, eff.left!],
    right: [ARROWS.right, eff.right!],
    boost: [eff.boost!],
  }
}

/**
 * `PartialConfig` dérivé des préférences — la forme exacte qu'attend `<Map config>`.
 *
 * Seules les commandes de vue RÉELLEMENT réassignées sont écrites : sans rebind, on
 * laisse le défaut de la lib (une touche `false` couperait la commande au lieu de la
 * laisser à sa valeur d'origine).
 */
export function preferencesToPartialConfig(prefs: Preferences, caps: DeviceCaps = detectDeviceCaps()): PartialConfig {
  const level = prefs.quality === 'auto' ? detectQuality(caps) : prefs.quality
  return {
    ...qualityPreset(level, caps),
    camera: { keyPan: { speed: SPEED_VALUES[prefs.moveSpeed] } },
    interaction: {
      damping: prefs.damping,
      shortcuts: { navigate: navigateFrom(prefs), controls: assignedViewKeys(prefs) },
    },
  }
}

/**
 * Table effective action → touche (déplacement lettres + boost + vue réassignée). Base
 * de la détection de conflit et de l'affichage des touches courantes dans le panneau.
 */
export function effectiveKeys(prefs: Preferences): Partial<Record<BindableAction, string>> {
  const letters = LAYOUT_LETTERS[prefs.keyboard]
  return {
    forward: prefs.keys.forward ?? letters.forward,
    backward: prefs.keys.backward ?? letters.backward,
    left: prefs.keys.left ?? letters.left,
    right: prefs.keys.right ?? letters.right,
    boost: prefs.keys.boost ?? 'shift',
    ...assignedViewKeys(prefs),
  }
}

/**
 * Toutes les touches « nues » (sans modificateur) déjà revendiquées par la config de
 * raccourcis, chacune associée à l'identifiant de sa commande. Un rebind s'y compare pour
 * REFUSER une touche déjà prise — par N'IMPORTE quelle commande, pas seulement les actions
 * du panneau : réassigner « Nord » sur `b` doit voir que `b` bascule déjà le fond de carte.
 *
 * Ignore volontairement les raccourcis à MODIFICATEUR (`edit.undo` = ⌘Z…) : une touche nue
 * ne les déclenche pas, ils n'entrent donc jamais en collision avec un rebind. Première
 * commande gagnante quand deux se partagent déjà une touche dans les défauts (c'est un
 * état de la lib, pas quelque chose que le rebind doive arbitrer).
 */
export function claimedKeys(sc: ShortcutsConfig): Map<string, string> {
  const m = new Map<string, string>()
  const add = (k: string | false, owner: string): void => {
    if (k && !m.has(k.toLowerCase())) m.set(k.toLowerCase(), owner)
  }
  for (const d of ['forward', 'backward', 'left', 'right'] as const) for (const k of sc.navigate[d]) add(k, d)
  for (const k of sc.navigate.boost) add(k, 'boost')
  for (const [name, k] of Object.entries(sc.controls)) add(k, name)
  for (const [name, k] of Object.entries(sc.draw)) add(k, name)
  add(sc.lens.toggle, 'lens')
  add(sc.pedestrian.immersion, 'immersion')
  for (const k of sc.edit.delete) add(k, 'delete')
  add(sc.edit.closePolygon, 'closePolygon')
  // Le pan à l'Espace est câblé dans le moteur (hors config) : le réserver quand même.
  add(' ', 'pan')
  return m
}

/**
 * L'identifiant de la commande qui utilise DÉJÀ `key` (hors `self`), ou `null` si la
 * touche est libre. `sc` est le keymap EFFECTIF (défauts + config appli + préférences),
 * donc la comparaison exclut la liaison courante de `self` elle-même.
 */
export function keyConflict(sc: ShortcutsConfig, self: BindableAction, key: string): string | null {
  const owner = claimedKeys(sc).get(key.toLowerCase())
  return owner && owner !== self ? owner : null
}
