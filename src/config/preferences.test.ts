import { describe, expect, it } from 'vitest'
import { defaultConfig } from './defaultConfig'
import { mergeConfig } from './mergeConfig'
import type { DeviceCaps } from './qualityPresets'
import {
  type Preferences,
  defaultPreferences,
  effectiveKeys,
  keyConflict,
  preferencesToPartialConfig,
} from './preferences'

const caps: DeviceCaps = { cores: 8, memory: 8, dpr: 1 }
const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, ...over })

describe('preferencesToPartialConfig', () => {
  it('AZERTY lie ZQSD + flèches, QWERTY lie WASD + flèches', () => {
    const az = preferencesToPartialConfig(prefs({ keyboard: 'azerty' }), caps)
    expect(az.interaction?.shortcuts?.navigate?.forward).toEqual(['arrowup', 'z'])
    expect(az.interaction?.shortcuts?.navigate?.left).toEqual(['arrowleft', 'q'])
    const qw = preferencesToPartialConfig(prefs({ keyboard: 'qwerty' }), caps)
    expect(qw.interaction?.shortcuts?.navigate?.forward).toEqual(['arrowup', 'w'])
    expect(qw.interaction?.shortcuts?.navigate?.left).toEqual(['arrowleft', 'a'])
  })

  it('un rebind de direction écrase la lettre de disposition, la flèche reste', () => {
    const p = preferencesToPartialConfig(prefs({ keys: { forward: 'e' } }), caps)
    expect(p.interaction?.shortcuts?.navigate?.forward).toEqual(['arrowup', 'e'])
  })

  it("n'écrit une commande de vue QUE si elle est réassignée", () => {
    expect(preferencesToPartialConfig(prefs(), caps).interaction?.shortcuts?.controls).toEqual({})
    const p = preferencesToPartialConfig(prefs({ keys: { north: 'o' } }), caps)
    expect(p.interaction?.shortcuts?.controls).toEqual({ north: 'o' })
  })

  it('mappe la vitesse et laisse la config complète cohérente', () => {
    const merged = mergeConfig(defaultConfig, preferencesToPartialConfig(prefs({ moveSpeed: 'fast', damping: false }), caps))
    expect(merged.camera.keyPan.speed).toBe(1.5)
    expect(merged.interaction.damping).toBe(false)
    // La navigation reste complète après merge (boost inclus).
    expect(merged.interaction.shortcuts.navigate.boost).toEqual(['shift'])
  })
})

describe('keyConflict', () => {
  // Keymap EFFECTIF : défauts de la lib + préférences appliquées, comme en vrai.
  const shortcutsOf = (p: Preferences) =>
    mergeConfig(defaultConfig, preferencesToPartialConfig(p, caps)).interaction.shortcuts

  it('détecte une touche prise par une autre action du panneau', () => {
    // En AZERTY, `d` est « droite » : l'affecter à « avancer » entre en conflit.
    expect(keyConflict(shortcutsOf(prefs()), 'forward', 'd')).toBe('right')
  })
  it('détecte une touche prise par une commande HORS panneau (le vrai piège)', () => {
    // `b` bascule le fond de carte (`controls.basemap`) : réassigner « Nord » dessus doit être vu.
    expect(keyConflict(shortcutsOf(prefs()), 'north', 'b')).toBe('basemap')
    // `Espace` = pan de la carte, câblé hors config mais réservé.
    expect(keyConflict(shortcutsOf(prefs()), 'forward', ' ')).toBe('pan')
  })
  it('rend null quand la touche est réellement libre', () => {
    // `o` n'est utilisé par aucune commande des défauts.
    expect(keyConflict(shortcutsOf(prefs()), 'forward', 'o')).toBeNull()
  })
  it('ne se signale pas en conflit avec sa propre liaison courante', () => {
    const p = prefs({ keys: { north: 'o' } })
    expect(keyConflict(shortcutsOf(p), 'north', 'o')).toBeNull()
  })
})

describe('effectiveKeys', () => {
  it('reflète la disposition et les rebinds', () => {
    const e = effectiveKeys(prefs({ keyboard: 'qwerty', keys: { boost: 'control' } }))
    expect(e.forward).toBe('w')
    expect(e.boost).toBe('control')
  })
})
