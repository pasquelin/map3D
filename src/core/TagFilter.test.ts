// `setSelection` existe pour restituer un filtre mémorisé (vue de template). Ce qui se teste
// n'est pas « la sélection change » mais les deux garde-fous : une sélection identique ne doit
// rien réémettre (chaque émission refiltre TOUTES les couches), et un tag restitué qui n'existe
// plus sur la carte doit rester décochable — sans quoi une vue rechargée enfermerait
// l'utilisateur devant une carte vide.

import { describe, expect, it } from 'vitest'
import { TagFilter } from './TagFilter'

/** `null` : pas de persistance, le test ne juge que la sélection. */
const filter = (): TagFilter => new TagFilter(null)

describe('TagFilter.setSelection', () => {
  it('remplace toute la sélection en une émission', () => {
    const f = filter()
    let emits = 0
    f.onSelection(() => emits++)
    f.setSelection(['agent', 'alerte', 'zone'])
    expect([...f.selected]).toEqual(['agent', 'alerte', 'zone'])
    expect(emits).toBe(1)
  })

  it('n’émet pas pour une sélection identique, quel que soit l’ordre', () => {
    const f = filter()
    f.setSelection(['agent', 'alerte'])
    let emits = 0
    f.onSelection(() => emits++)
    f.setSelection(['alerte', 'agent'])
    expect(emits).toBe(0)
  })

  it('émet quand la sélection change de contenu à taille égale', () => {
    const f = filter()
    f.setSelection(['agent', 'alerte'])
    let emits = 0
    f.onSelection(() => emits++)
    f.setSelection(['agent', 'zone'])
    expect(emits).toBe(1)
    expect([...f.selected]).toEqual(['agent', 'zone'])
  })

  it('vide la sélection sur une liste vide', () => {
    const f = filter()
    f.setSelection(['agent'])
    f.setSelection([])
    expect(f.isActive).toBe(false)
  })

  /**
   * Le garde-fou du cas « vue prise ailleurs » : les tags restitués mais absents de la carte
   * filtrent, donc ils DOIVENT apparaître dans le panneau (à compte 0) pour être décochables.
   * C'est déjà la règle d'`all()` pour la sélection persistée — `setSelection` en hérite.
   */
  it('laisse décochables les tags absents de la carte', () => {
    const f = filter()
    f.report('markers', new Map([['agent', 12]]))
    f.setSelection(['agent', 'tag-d-une-autre-carte'])
    expect(f.all()).toEqual([
      { tag: 'agent', count: 12 },
      { tag: 'tag-d-une-autre-carte', count: 0 },
    ])
  })
})
