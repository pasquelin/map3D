import { describe, expect, it } from 'vitest'
import { RaceGuard } from './race'

describe('RaceGuard', () => {
  it('rend des jetons strictement croissants', () => {
    const g = new RaceGuard()
    expect(g.next()).toBeLessThan(g.next())
  })

  it('seul le dernier jeton émis est courant', () => {
    const g = new RaceGuard()
    const vieux = g.next()
    const neuf = g.next()
    expect(g.isCurrent(vieux)).toBe(false)
    expect(g.isCurrent(neuf)).toBe(true)
  })

  it('une réponse périmée reste périmée même arrivée en dernier', async () => {
    const g = new RaceGuard()
    const lente = g.next()
    const rapide = g.next()
    await Promise.resolve()
    expect(g.isCurrent(rapide)).toBe(true)
    expect(g.isCurrent(lente)).toBe(false)
  })

  it('cancel() périme TOUT — y compris le dernier jeton émis', () => {
    const g = new RaceGuard()
    const t = g.next()
    g.cancel()
    expect(g.isCurrent(t)).toBe(false)
  })

  it('après cancel(), un nouveau jeton redevient courant', () => {
    const g = new RaceGuard()
    g.next()
    g.cancel()
    expect(g.isCurrent(g.next())).toBe(true)
  })

  it('le jeton 0 n’est jamais courant — une valeur non initialisée ne passe pas', () => {
    const g = new RaceGuard()
    g.next()
    expect(g.isCurrent(0)).toBe(false)
  })
})
