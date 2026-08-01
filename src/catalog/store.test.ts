import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShapeData } from '../layers/ShapeLayer'
import { CatalogStore } from './store'

// `persistDebounceMs: 0` : les tests vérifient CE qui est écrit, pas quand. L'amortie
// a sa propre série plus bas, avec des faux timers.
const KEYS = { selection: 'test:catalog', settings: 'test:catalog-settings', persistDebounceMs: 0 }

const shape = (id: string): ShapeData => ({ kind: 'circle', id, center: { lat: 48, lng: 2 }, radiusMeters: 100 })

const fresh = (): CatalogStore => {
  const s = new CatalogStore()
  s.configure(KEYS)
  return s
}

beforeEach(() => {
  localStorage.clear()
})

describe('cycle d’un élément', () => {
  it('marque sélectionné et en attente avant que la géométrie arrive', () => {
    const s = fresh()
    s.markSelected('zones:1')
    expect(s.isShown('zones:1')).toBe(true)
    expect(s.isPending('zones:1')).toBe(true)
    expect(s.shapes()).toEqual([])
  })

  it('la géométrie reçue lève l’attente et alimente les formes', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a'), shape('b')])
    expect(s.isPending('zones:1')).toBe(false)
    expect(s.shapes()).toHaveLength(2)
  })

  it('un échec sort l’élément de la sélection et laisse une erreur — jamais de zone fantôme', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.remove('zones:1', true)
    expect(s.isShown('zones:1')).toBe(false)
    expect(s.hasError('zones:1')).toBe(true)
    expect(s.shapes()).toEqual([])
  })

  it('un retrait volontaire ne laisse pas d’erreur', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    s.remove('zones:1')
    expect(s.hasError('zones:1')).toBe(false)
    expect(s.shapes()).toEqual([])
  })

  it('re-sélectionner après un échec efface l’erreur', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.remove('zones:1', true)
    s.markSelected('zones:1')
    expect(s.hasError('zones:1')).toBe(false)
  })

  it('un agrégat apporte plusieurs formes et les retire ensemble', () => {
    const s = fresh()
    s.markSelected('groups:g1')
    s.setGeometry('groups:g1', [shape('a'), shape('b'), shape('c')])
    expect(s.shapes()).toHaveLength(3)
    s.remove('groups:g1')
    expect(s.shapes()).toEqual([])
  })
})

describe('restauration vs geste explicite', () => {
  it('ne propose à la restauration QUE ce qui vient du stockage', () => {
    const a = fresh()
    a.markSelected('zones:1')

    const b = fresh()
    expect(b.pendingRestores()).toEqual(['zones:1'])
    // Coché à la main dans CETTE session : son chargement est déjà en vol, avec le
    // cadrage du clic. Le laisser à la restauration ferait lancer un second chargement,
    // qui annulerait le premier — la zone apparaissait, la caméra ne bougeait pas.
    b.markSelected('zones:2')
    expect(b.pendingRestores()).toEqual(['zones:1'])
  })

  it('retire une clé prise en charge, et une seule fois', () => {
    const a = fresh()
    a.markSelected('zones:1')
    const b = fresh()
    b.claimRestore('zones:1')
    expect(b.pendingRestores()).toEqual([])
  })

  it('ne propose rien quand la persistance est coupée', () => {
    const a = fresh()
    a.markSelected('zones:1')
    a.setSettings({ persist: false })
    expect(fresh().pendingRestores()).toEqual([])
  })
})

describe('géométries partagées entre deux entrées', () => {
  it('ne peint qu’une fois une forme portée par deux entrées', () => {
    const s = fresh()
    // Le groupe apporte z1 ; la source « Zones » apporte la MÊME z1. Peintes deux fois,
    // les deux se superposent : remplissage cumulé, contour plus épais.
    s.markSelected('groups:g1')
    s.setGeometry('groups:g1', [shape('z1'), shape('z3')])
    s.markSelected('zones:z1')
    s.setGeometry('zones:z1', [shape('z1')])
    expect(s.shapes().map((x) => x.id)).toEqual(['z1', 'z3'])
  })

  it('la forme survit au retrait de l’une des deux entrées', () => {
    const s = fresh()
    s.markSelected('groups:g1')
    s.setGeometry('groups:g1', [shape('z1')])
    s.markSelected('zones:z1')
    s.setGeometry('zones:z1', [shape('z1')])
    s.remove('groups:g1')
    expect(s.shapes().map((x) => x.id)).toEqual(['z1'])
  })

  it('garde toutes les formes ANONYMES — rien ne permet de les confondre', () => {
    const s = fresh()
    const anon = { kind: 'circle', center: { lat: 48, lng: 2 }, radiusMeters: 100 } as const
    s.markSelected('a:1')
    s.setGeometry('a:1', [anon, anon])
    expect(s.shapes()).toHaveLength(2)
  })
})

describe('notification', () => {
  it('prévient les abonnés et change de jeton à chaque mutation', () => {
    const s = fresh()
    const cb = vi.fn()
    s.onChanged(cb)
    const before = s.snapshot()
    s.markSelected('zones:1')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(s.snapshot()).not.toBe(before)
  })

  it('ne notifie pas pour un clear sans objet', () => {
    const s = fresh()
    const cb = vi.fn()
    s.onChanged(cb)
    s.clear()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('purge d’une source disparue', () => {
  it('retire ses clés ET ses formes, sans toucher aux autres', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    s.markSelected('cities:9')
    s.setGeometry('cities:9', [shape('b')])
    s.purge(new Set(['zones']))
    expect(s.selection()).toEqual(['zones:1'])
    expect(s.shapes()).toHaveLength(1)
  })

  it('ne notifie pas quand toutes les sources sont connues', () => {
    const s = fresh()
    s.markSelected('zones:1')
    const cb = vi.fn()
    s.onChanged(cb)
    s.purge(new Set(['zones']))
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('persistance', () => {
  it('relit la sélection au démarrage suivant', () => {
    const a = fresh()
    a.markSelected('zones:1')
    expect(fresh().selection()).toEqual(['zones:1'])
  })

  it('ne persiste rien quand la persistance est coupée, et efface ce qui l’était', () => {
    const a = fresh()
    a.markSelected('zones:1')
    a.setSettings({ persist: false })
    expect(localStorage.getItem(KEYS.selection)).toBeNull()

    const b = new CatalogStore()
    b.configure(KEYS)
    expect(b.selection()).toEqual([])
    // Le RÉGLAGE, lui, survit — c'est bien la sélection seule qui a été effacée.
    expect(b.getSettings().persist).toBe(false)
  })

  it('repart des défauts sur une charge corrompue', () => {
    localStorage.setItem(KEYS.selection, 'pas du json')
    localStorage.setItem(KEYS.settings, '{{{')
    const s = fresh()
    expect(s.selection()).toEqual([])
    expect(s.getSettings()).toEqual({ persist: true, fitOnAdd: true })
  })

  it('les géométries ne sont JAMAIS persistées — seules les clés le sont', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    expect(localStorage.getItem(KEYS.selection)).not.toContain('radiusMeters')
  })
})

describe('gestes de LOT — une écriture, une notification', () => {
  it('markSelectedMany n’écrit le stockage QU’UNE fois pour tout le lot', () => {
    const s = fresh()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    s.markSelectedMany(['zones:1', 'zones:2', 'zones:3'])
    // C'est tout l'objet du lot : `localStorage.setItem` est synchrone, une écriture par
    // enfant gelait le thread principal autant de fois que l'agrégat comptait d'enfants.
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(s.selection()).toEqual(['zones:1', 'zones:2', 'zones:3'])
    setItem.mockRestore()
  })

  it('markSelectedMany ne rend QUE les clés réellement ajoutées', () => {
    const s = fresh()
    s.markSelected('zones:1')
    // `zones:1` est déjà là : l'appelant ne doit pas relancer son chargement.
    expect(s.markSelectedMany(['zones:1', 'zones:2'])).toEqual(['zones:2'])
  })

  it('markSelectedMany ne notifie pas quand rien n’a été ajouté', () => {
    const s = fresh()
    s.markSelected('zones:1')
    const seen = vi.fn()
    s.onChanged(seen)
    s.markSelectedMany(['zones:1'])
    expect(seen).not.toHaveBeenCalled()
  })

  it('setGeometryMany ne notifie qu’une fois et lève l’attente de chacun', () => {
    const s = fresh()
    s.markSelectedMany(['zones:1', 'zones:2'])
    const seen = vi.fn()
    s.onChanged(seen)
    s.setGeometryMany([
      ['zones:1', [shape('a')]],
      ['zones:2', [shape('b')]],
    ])
    expect(seen).toHaveBeenCalledTimes(1)
    expect(s.isPending('zones:1')).toBe(false)
    expect(s.isPending('zones:2')).toBe(false)
    expect(s.shapes().map((sh) => sh.id)).toEqual(['a', 'b'])
  })

  it('removeMany peut marquer tout un lot en échec', () => {
    const s = fresh()
    s.markSelectedMany(['zones:1', 'zones:2'])
    s.removeMany(['zones:1', 'zones:2'], true)
    expect(s.hasError('zones:1')).toBe(true)
    expect(s.hasError('zones:2')).toBe(true)
    expect(s.selection()).toEqual([])
  })
})

describe('purge d’une source disparue', () => {
  it('nettoie AUSSI l’attente et l’échec, pas seulement la sélection', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.remove('zones:2', true)
    s.markSelected('zones:2')
    // Sans ce nettoyage, un plugin démonté puis remonté retrouvait ses lignes en
    // chargement (case désactivée) ou en erreur (pastille rouge) sans rien en vol.
    expect(s.purge(new Set(['autre']))).toBe(true)
    expect(s.isPending('zones:1')).toBe(false)
    expect(s.hasError('zones:1')).toBe(false)
    expect(s.isPending('zones:2')).toBe(false)
    expect(s.hasError('zones:2')).toBe(false)
    expect(s.hasPendingRestores()).toBe(false)
  })

  it('rend false quand rien n’a bougé — l’appelant ne repeint pas pour rien', () => {
    const s = fresh()
    s.markSelected('zones:1')
    expect(s.purge(new Set(['zones']))).toBe(false)
  })
})

describe('persistance amortie', () => {
  const DEBOUNCE = { ...KEYS, persistDebounceMs: 250 }

  it('n’écrit qu’une fois pour une rafale, et la charge est la dernière', () => {
    vi.useFakeTimers()
    const s = new CatalogStore()
    s.configure(DEBOUNCE)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    s.markSelected('zones:1')
    s.markSelected('zones:2')
    s.markSelected('zones:3')
    expect(setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEYS.selection)).toContain('zones:3')
    setItem.mockRestore()
    vi.useRealTimers()
  })

  it('flushPersist écrit tout de suite — la page peut disparaître pendant le délai', () => {
    vi.useFakeTimers()
    const s = new CatalogStore()
    s.configure(DEBOUNCE)
    s.markSelected('zones:1')
    expect(localStorage.getItem(KEYS.selection)).toBeNull()
    s.flushPersist()
    expect(localStorage.getItem(KEYS.selection)).toContain('zones:1')
    vi.useRealTimers()
  })

  it('couper la persistance abandonne l’écriture en attente au lieu de la laisser revenir', () => {
    vi.useFakeTimers()
    const s = new CatalogStore()
    s.configure(DEBOUNCE)
    s.markSelected('zones:1')
    s.setSettings({ persist: false })
    // Sans l'abandon, le timer réécrivait la sélection juste après son effacement.
    vi.advanceTimersByTime(250)
    expect(localStorage.getItem(KEYS.selection)).toBeNull()
    vi.useRealTimers()
  })
})

describe('titres restitués à la restauration', () => {
  it('persiste le titre d’une clé et le rend à un nouveau store restauré', () => {
    const a = fresh()
    a.markSelected('zones:1', 'Ma zone')
    // Nouveau store, même clé de stockage : la restauration relit clés ET titres.
    const b = fresh()
    expect(b.isShown('zones:1')).toBe(true)
    expect(b.titleOf('zones:1')).toBe('Ma zone')
  })

  it('un lot persiste le titre de chacun de ses éléments', () => {
    const a = fresh()
    a.markSelectedMany(
      ['g:1', 'g:2'],
      new Map([
        ['g:1', 'Un'],
        ['g:2', 'Deux'],
      ]),
    )
    const b = fresh()
    expect(b.titleOf('g:1')).toBe('Un')
    expect(b.titleOf('g:2')).toBe('Deux')
  })

  it('un titre retiré ne survit pas à la restauration', () => {
    const a = fresh()
    a.markSelected('zones:1', 'Éphémère')
    a.remove('zones:1')
    const b = fresh()
    expect(b.titleOf('zones:1')).toBeUndefined()
  })
})
