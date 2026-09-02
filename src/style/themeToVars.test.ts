import { describe, expect, it } from 'vitest'
import { defaultTheme } from '../theme/defaultTheme'
import type { MapTheme } from '../theme/types'
import { themeToVars } from './themeToVars'

// `theme.animations.{pulse,halo,bob,markerEnter,clusterEnter,menuOpen}` étaient typés et
// documentés, mais seule `--m3d-menu-dur` était émise : la feuille de styles lisait
// `--m3d-enter-dur`, `--m3d-pulse-scale`, `--m3d-bob-amp`… et retombait toujours sur
// ses replis. Chaque clé doit désormais avoir sa variable, valeur du thème comprise.
describe('themeToVars — animations', () => {
  const vars = themeToVars(defaultTheme)
  const a = defaultTheme.animations

  it('publie durée, easing et amplitude de chaque animation de marker', () => {
    if (a.pulse === false || a.halo === false || a.bob === false) throw new Error('défauts inattendus')
    expect(vars['--m3d-pulse-dur']).toBe(`${a.pulse.duration}ms`)
    expect(vars['--m3d-pulse-ease']).toBe(a.pulse.easing)
    expect(vars['--m3d-pulse-scale']).toBe(String(a.pulse.scale))
    expect(vars['--m3d-halo-dur']).toBe(`${a.halo.duration}ms`)
    expect(vars['--m3d-halo-ease']).toBe(a.halo.easing)
    expect(vars['--m3d-halo-scale']).toBe(String(a.halo.maxScale))
    expect(vars['--m3d-bob-dur']).toBe(`${a.bob.duration}ms`)
    expect(vars['--m3d-bob-amp']).toBe(`${a.bob.amplitude}px`)
  })

  it('publie les entrées de marker et de cluster, décalage compris', () => {
    expect(vars['--m3d-enter-dur']).toBe(`${a.markerEnter.duration}ms`)
    expect(vars['--m3d-enter-ease']).toBe(a.markerEnter.easing)
    expect(vars['--m3d-enter-stagger']).toBe(`${a.markerEnter.stagger}ms`)
    expect(vars['--m3d-cluster-enter-dur']).toBe(`${a.clusterEnter.duration}ms`)
    expect(vars['--m3d-cluster-enter-ease']).toBe(a.clusterEnter.easing)
    expect(vars['--m3d-cluster-enter-stagger']).toBe(`${a.clusterEnter.stagger}ms`)
  })

  it("publie l'ouverture des menus, easing compris", () => {
    expect(vars['--m3d-menu-dur']).toBe(`${a.menuOpen.duration}ms`)
    expect(vars['--m3d-menu-ease']).toBe(a.menuOpen.easing)
  })

  it('une animation coupée (`false`) publie une durée nulle', () => {
    const theme: MapTheme = { ...defaultTheme, animations: { ...a, pulse: false, halo: false, bob: false } }
    const cut = themeToVars(theme)
    expect(cut['--m3d-pulse-dur']).toBe('0ms')
    expect(cut['--m3d-halo-dur']).toBe('0ms')
    expect(cut['--m3d-bob-dur']).toBe('0ms')
  })

  it('les valeurs du thème sont celles que le CSS prenait en repli', () => {
    // Zéro régression visuelle : émettre les variables ne doit rien changer à l'écran.
    expect(vars['--m3d-enter-dur']).toBe('460ms')
    expect(vars['--m3d-enter-ease']).toBe('cubic-bezier(.32,1.5,.5,1)')
    expect(vars['--m3d-pulse-scale']).toBe('1.16')
    expect(vars['--m3d-bob-amp']).toBe('4px')
    expect(vars['--m3d-halo-scale']).toBe('2.1')
    expect(vars['--m3d-menu-dur']).toBe('200ms')
    expect(vars['--m3d-menu-ease']).toBe('cubic-bezier(.32,1.3,.5,1)')
  })
})
