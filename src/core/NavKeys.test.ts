import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import { navAxis } from './NavKeys'

const keys = defaultConfig.interaction.shortcuts.navigate
const held = (...k: string[]) => new Set(k)

describe('navAxis — table de vérité du déplacement au clavier', () => {
  it('rend un axe nul quand rien n’est maintenu', () => {
    expect(navAxis(held(), keys)).toEqual({ forward: 0, right: 0, boost: false })
  })

  it('accepte les deux familles de touches pour la même direction', () => {
    // Les flèches marchent partout ; ZQSD suit la disposition AZERTY.
    expect(navAxis(held('arrowup'), keys).forward).toBe(1)
    expect(navAxis(held('z'), keys).forward).toBe(1)
    expect(navAxis(held('arrowright'), keys).right).toBe(1)
    expect(navAxis(held('d'), keys).right).toBe(1)
  })

  it('compose les diagonales', () => {
    const a = navAxis(held('arrowup', 'arrowright'), keys)
    expect(a).toMatchObject({ forward: 1, right: 1 })
  })

  /**
   * Deux touches opposées s'annulent, plutôt que de faire gagner la dernière pressée :
   * il n'y a alors aucun ordre d'appui à retenir, et relâcher une seule des deux redonne
   * exactement la direction restante.
   */
  it('annule deux directions opposées', () => {
    expect(navAxis(held('arrowup', 'arrowdown'), keys)).toMatchObject({ forward: 0 })
    expect(navAxis(held('q', 'd'), keys)).toMatchObject({ right: 0 })
  })

  it('ne signale l’accélération que si une direction est demandée', () => {
    expect(navAxis(held('shift'), keys).boost).toBe(false)
    expect(navAxis(held('shift', 'arrowup'), keys).boost).toBe(true)
  })

  it('ignore une touche qui n’est liée à rien', () => {
    expect(navAxis(held('x', 'k'), keys)).toMatchObject({ forward: 0, right: 0 })
  })

  it('suit des liaisons remappées — QWERTY, par exemple', () => {
    const wasd = { ...keys, forward: ['w'], backward: ['s'], left: ['a'], right: ['d'] }
    expect(navAxis(held('w'), wasd).forward).toBe(1)
    expect(navAxis(held('a'), wasd).right).toBe(-1)
    // Et les anciennes liaisons ne répondent plus.
    expect(navAxis(held('z'), wasd).forward).toBe(0)
  })

  it('n’entre en collision avec aucun raccourci d’outil de dessin', () => {
    const draw = Object.values(defaultConfig.interaction.shortcuts.draw).filter(
      (k): k is string => typeof k === 'string',
    )
    const nav = [...keys.forward, ...keys.backward, ...keys.left, ...keys.right]
    expect(nav.filter((k) => draw.includes(k))).toEqual([])
  })
})
