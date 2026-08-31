import { describe, expect, it } from 'vitest'
import { groupCheck, NO_GROUP_CHECK } from './groups'

const shownIn =
  (...keys: string[]) =>
  (k: string) =>
    keys.includes(k)

describe('état d’un agrégat', () => {
  it('aucun enfant affiché ⇒ off', () => {
    expect(groupCheck(['z:1', 'z:2'], shownIn())).toEqual({ state: 'off', shown: 0, total: 2 })
  })

  it('tous affichés ⇒ on', () => {
    expect(groupCheck(['z:1', 'z:2'], shownIn('z:1', 'z:2'))).toEqual({ state: 'on', shown: 2, total: 2 })
  })

  it('une partie ⇒ mixed, avec le compte', () => {
    expect(groupCheck(['z:1', 'z:2', 'z:3'], shownIn('z:2'))).toEqual({ state: 'mixed', shown: 1, total: 3 })
  })

  it('appartenance inconnue ⇒ off, et la MÊME référence (aucune allocation par ligne)', () => {
    expect(groupCheck([], shownIn('z:1'))).toBe(NO_GROUP_CHECK)
  })
})
