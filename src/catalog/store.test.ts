import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkerData } from '../data/types'
import type { ShapeData } from '../layers/ShapeLayer'
import { CatalogStore } from './store'

// `persistDebounceMs: 0` : les tests vérifient CE qui est écrit, pas quand. L'amortie
// a sa propre série plus bas, avec des faux timers.
const KEYS = { selection: 'test:catalog', settings: 'test:catalog-settings', persistDebounceMs: 0 }

const shape = (id: string): ShapeData => ({ kind: 'circle', id, center: { lat: 48, lng: 2 }, radiusMeters: 100 })

/**
 * Pose des formes sur une clé — raccourci de TEST.
 *
 * Le store n'écrit plus que par `setContentMany` : un second chemin d'écriture gardé
 * vivant pour les seuls tests aurait court-circuité la comptabilité des points.
 */
const setShapes = (s: CatalogStore, key: string, shapes: ShapeData[]) =>
  s.setContentMany([[key, { shapes, markers: [] }]])

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
    setShapes(s, 'zones:1', [shape('a'), shape('b')])
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
    setShapes(s, 'zones:1', [shape('a')])
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
    setShapes(s, 'groups:g1', [shape('a'), shape('b'), shape('c')])
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
    setShapes(s, 'groups:g1', [shape('z1'), shape('z3')])
    s.markSelected('zones:z1')
    setShapes(s, 'zones:z1', [shape('z1')])
    expect(s.shapes().map((x) => x.id)).toEqual(['z1', 'z3'])
  })

  it('la forme survit au retrait de l’une des deux entrées', () => {
    const s = fresh()
    s.markSelected('groups:g1')
    setShapes(s, 'groups:g1', [shape('z1')])
    s.markSelected('zones:z1')
    setShapes(s, 'zones:z1', [shape('z1')])
    s.remove('groups:g1')
    expect(s.shapes().map((x) => x.id)).toEqual(['z1'])
  })

  it('garde toutes les formes ANONYMES — rien ne permet de les confondre', () => {
    const s = fresh()
    const anon = { kind: 'circle', center: { lat: 48, lng: 2 }, radiusMeters: 100 } as const
    s.markSelected('a:1')
    setShapes(s, 'a:1', [anon, anon])
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
    setShapes(s, 'zones:1', [shape('a')])
    s.markSelected('cities:9')
    setShapes(s, 'cities:9', [shape('b')])
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
    setShapes(s, 'zones:1', [shape('a')])
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

  it('setContentMany ne notifie qu’une fois et lève l’attente de chacun', () => {
    const s = fresh()
    s.markSelectedMany(['zones:1', 'zones:2'])
    const seen = vi.fn()
    s.onChanged(seen)
    s.setContentMany([
      ['zones:1', { shapes: [shape('a')], markers: [] }],
      ['zones:2', { shapes: [shape('b')], markers: [] }],
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

describe('sources à bascule', () => {
  it('s’allume et s’éteint sans jamais toucher à la sélection', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    expect(s.isSourceOn('defibs')).toBe(true)
    // Le point de la feature : une bascule n'est pas un élément. Rien dans la sélection,
    // rien dans les formes — donc rien que le cadrage pourrait viser.
    expect(s.selection()).toEqual([])
    expect(s.shapes()).toEqual([])
    expect(s.markers()).toEqual([])
    s.setSourceOn('defibs', false)
    expect(s.isSourceOn('defibs')).toBe(false)
  })

  it('n’entre pas en collision avec l’élément de MÊME identifiant', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    s.markSelected('zones:defibs')
    expect(s.isSourceOn('defibs')).toBe(true)
    expect(s.isShown('zones:defibs')).toBe(true)
    // Retirer l'élément ne doit pas éteindre le jeu, et réciproquement.
    s.remove('zones:defibs')
    expect(s.isSourceOn('defibs')).toBe(true)
    s.setSourceOn('defibs', false)
    expect(s.isSourceOn('defibs')).toBe(false)
  })

  it('ne notifie pas pour une bascule déjà dans l’état demandé', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    const seen = vi.fn()
    s.onChanged(seen)
    s.setSourceOn('defibs', true)
    expect(seen).not.toHaveBeenCalled()
  })

  it('le compte actif somme éléments cochés ET jeux allumés — le badge du bouton', () => {
    const s = fresh()
    expect(s.activeCount()).toBe(0)
    s.markSelected('zones:1')
    expect(s.activeCount()).toBe(1)
    s.setSourceOn('defibs', true)
    expect(s.activeCount()).toBe(2)
  })

  it('« Tout retirer » éteint aussi les jeux', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    s.clear()
    expect(s.isSourceOn('defibs')).toBe(false)
    expect(s.activeCount()).toBe(0)
  })

  it('un clear sans objet ne notifie pas, même avec une bascule éteinte', () => {
    const s = fresh()
    const seen = vi.fn()
    s.onChanged(seen)
    s.clear()
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('chargement d’une bascule', () => {
  it('signale un fetch en vol, puis son retour', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    expect(s.isSourceLoading('defibs')).toBe(false)
    s.setSourceLoading('defibs', true)
    expect(s.isSourceLoading('defibs')).toBe(true)
    s.setSourceLoading('defibs', false)
    expect(s.isSourceLoading('defibs')).toBe(false)
  })

  it('un jeu ÉTEINT n’est jamais en chargement, quoi qu’il reste dans la table', () => {
    const s = fresh()
    s.setSourceLoading('defibs', true)
    // La garde est à la LECTURE : elle tient l'invariant même si un chemin d'extinction
    // oubliait de nettoyer — sans quoi la ligne resterait en chargement pour toujours.
    expect(s.isSourceLoading('defibs')).toBe(false)
  })

  it('éteindre le jeu retombe le chargement — sa couche démontée ne le fera plus', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    s.setSourceLoading('defibs', true)
    s.setSourceOn('defibs', false)
    expect(s.isSourceLoading('defibs')).toBe(false)
  })

  it('le chargement n’est JAMAIS persisté — c’est un état de la seconde qui passe', () => {
    const a = fresh()
    a.setSourceOn('defibs', true)
    a.setSourceLoading('defibs', true)
    const b = fresh()
    expect(b.isSourceOn('defibs')).toBe(true)
    expect(b.isSourceLoading('defibs')).toBe(false)
  })
})

describe('persistance des bascules', () => {
  it('relit les jeux allumés au démarrage suivant', () => {
    const a = fresh()
    a.setSourceOn('defibs', true)
    a.setSourceOn('bornes', true)
    a.setSourceOn('bornes', false)
    const b = fresh()
    expect(b.isSourceOn('defibs')).toBe(true)
    expect(b.isSourceOn('bornes')).toBe(false)
  })

  it('ne persiste rien quand la persistance est coupée', () => {
    const a = fresh()
    a.setSettings({ persist: false })
    a.setSourceOn('defibs', true)
    const b = fresh()
    expect(b.isSourceOn('defibs')).toBe(false)
  })

  it('la charge porte les bascules à côté des clés, sans les mélanger', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setSourceOn('defibs', true)
    const raw = JSON.parse(localStorage.getItem(KEYS.selection) ?? '{}') as { keys: string[]; sources: string[] }
    expect(raw.keys).toEqual(['zones:1'])
    expect(raw.sources).toEqual(['defibs'])
  })
})

describe('purge d’une source à bascule disparue', () => {
  it('éteint le jeu dont la source n’est plus inscrite', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    expect(s.purge(new Set(['zones']))).toBe(true)
    expect(s.isSourceOn('defibs')).toBe(false)
  })

  it('éteint la bascule MÊME quand aucune clé d’élément ne bouge', () => {
    const s = fresh()
    // Aucune sélection : c'est précisément le cas où un test fusionné avec celui des clés
    // aurait rendu `false` et laissé le jeu allumé, sans plus aucune ligne pour l'éteindre.
    s.setSourceOn('defibs', true)
    const seen = vi.fn()
    s.onChanged(seen)
    expect(s.purge(new Set())).toBe(true)
    expect(s.isSourceOn('defibs')).toBe(false)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('ne touche pas aux jeux dont la source est toujours là', () => {
    const s = fresh()
    s.setSourceOn('defibs', true)
    expect(s.purge(new Set(['defibs']))).toBe(false)
    expect(s.isSourceOn('defibs')).toBe(true)
  })

  it('une bascule inconnue au chargement est ignorée en silence', () => {
    const a = fresh()
    a.setSourceOn('parti', true)
    const b = fresh()
    // Elle est relue, puis écartée à la première purge — comme une clé orpheline.
    expect(b.isSourceOn('parti')).toBe(true)
    b.purge(new Set(['zones']))
    expect(b.isSourceOn('parti')).toBe(false)
  })
})

describe('points posés par un élément', () => {
  const marker = (id: string): MarkerData => ({ id, position: { lat: 48, lng: 2 }, type: 'poi', data: null })

  it('pose formes et points du même geste, et les retire ensemble', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setContentMany([['zones:1', { shapes: [shape('a')], markers: [marker('m1'), marker('m2')] }]])
    expect(s.shapes()).toHaveLength(1)
    expect(s.markers()).toHaveLength(2)
    s.remove('zones:1')
    expect(s.shapes()).toEqual([])
    expect(s.markers()).toEqual([])
  })

  it('dédouble les points portés par deux entrées, comme les formes', () => {
    const s = fresh()
    s.markSelectedMany(['a:1', 'a:2'])
    s.setContentMany([
      ['a:1', { shapes: [], markers: [marker('partage')] }],
      ['a:2', { shapes: [], markers: [marker('partage')] }],
    ])
    expect(s.markers()).toHaveLength(1)
    // Et le point survit au retrait de l'une des deux entrées.
    s.remove('a:1')
    expect(s.markers()).toHaveLength(1)
  })

  it('les points ne sont JAMAIS persistés — ils sont redemandés à la source', () => {
    const a = fresh()
    a.markSelected('zones:1')
    a.setContentMany([['zones:1', { shapes: [], markers: [marker('m1')] }]])
    const b = fresh()
    expect(b.isShown('zones:1')).toBe(true)
    expect(b.markers()).toEqual([])
  })

  it('rend la MÊME référence tant qu’aucun élément n’a de point', () => {
    const s = fresh()
    const before = s.markers()
    s.markSelected('zones:1')
    setShapes(s, 'zones:1', [shape('a')])
    // Une nouvelle référence ici aurait re-rendu la couche marker à chaque géométrie qui arrive.
    expect(s.markers()).toBe(before)
  })

  it('une purge emporte les points de la source disparue', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setContentMany([['zones:1', { shapes: [], markers: [marker('m1')] }]])
    s.purge(new Set(['autre']))
    expect(s.markers()).toEqual([])
  })
})

describe('agrégats — l’appartenance vit dans le store, pas dans la liste', () => {
  it('retient de quoi un agrégat est fait, et en dérive l’état de sa case', () => {
    const s = fresh()
    s.rememberGroup('zg:g1', ['zg:z1', 'zg:z2', 'zg:z3'])
    expect(s.groupState('zg:g1')).toEqual({ state: 'off', shown: 0, total: 3 })
    s.markSelectedMany(['zg:z1', 'zg:z2'])
    expect(s.groupState('zg:g1')).toEqual({ state: 'mixed', shown: 2, total: 3 })
    s.markSelected('zg:z3')
    expect(s.groupState('zg:g1')).toEqual({ state: 'on', shown: 3, total: 3 })
  })

  it('un agrégat inconnu n’a pas d’état à afficher', () => {
    const s = fresh()
    expect(s.groupState('zg:g9')).toEqual({ state: 'off', shown: 0, total: 0 })
    expect(s.groupChildren('zg:g9')).toBeUndefined()
  })

  it('SORT l’agrégat de la sélection s’il y était — la session héritée du bug se répare', () => {
    const s = fresh()
    // Ce qu'une session enregistrée avant la règle contient : le groupe ET ses enfants.
    s.markSelectedMany(['zg:g1', 'zg:z1', 'zg:z2'])
    setShapes(s, 'zg:g1', [shape('z1'), shape('z2')])
    expect(s.selection()).toHaveLength(3)
    expect(s.rememberGroup('zg:g1', ['zg:z1', 'zg:z2'])).toBe(true)
    expect(s.isShown('zg:g1')).toBe(false)
    // Les enfants, eux, restent : c'est EUX que la carte doit peindre.
    expect(s.selection()).toEqual(['zg:z1', 'zg:z2'])
    expect(s.groupState('zg:g1')).toEqual({ state: 'on', shown: 2, total: 2 })
  })

  it('ne notifie pas quand rien ne change — l’appartenance est réapprise à chaque dépliage', () => {
    const s = fresh()
    s.rememberGroup('zg:g1', ['zg:z1'])
    const seen = vi.fn()
    s.onChanged(seen)
    expect(s.rememberGroup('zg:g1', ['zg:z1'])).toBe(false)
    expect(seen).not.toHaveBeenCalled()
  })

  it('persiste l’appartenance : rouvrir le panneau ne redemande rien à la source', () => {
    const a = fresh()
    a.rememberGroup('zg:g1', ['zg:z1', 'zg:z2'])
    a.markSelected('zg:z1')
    const b = fresh()
    expect(b.groupChildren('zg:g1')).toEqual(['zg:z1', 'zg:z2'])
    expect(b.groupState('zg:g1')).toEqual({ state: 'mixed', shown: 1, total: 2 })
  })

  it('à la relecture, une clé d’agrégat héritée est écartée de la sélection', () => {
    const a = fresh()
    a.rememberGroup('zg:g1', ['zg:z1', 'zg:z2'])
    // Écrite à la main : c'est l'état qu'une version antérieure laissait dans le stockage.
    localStorage.setItem(
      KEYS.selection,
      JSON.stringify({
        v: 2,
        keys: ['zg:g1', 'zg:z1', 'zg:z2'],
        titles: {},
        sources: [],
        groups: { 'zg:g1': ['zg:z1', 'zg:z2'] },
      }),
    )
    const b = fresh()
    expect(b.selection()).toEqual(['zg:z1', 'zg:z2'])
    expect(b.isShown('zg:g1')).toBe(false)
  })

  it('une source disparue emporte l’appartenance de ses agrégats', () => {
    const s = fresh()
    s.rememberGroup('zg:g1', ['zg:z1'])
    s.rememberGroup('autre:g1', ['autre:z1'])
    s.purge(new Set(['autre']))
    expect(s.groupChildren('zg:g1')).toBeUndefined()
    expect(s.groupChildren('autre:g1')).toEqual(['autre:z1'])
  })
})

describe('ce qu’une source a d’affiché — le compte du menu des types', () => {
  it('compte par source, et retombe à zéro quand tout est retiré', () => {
    const s = fresh()
    s.markSelectedMany(['zg:z1', 'zg:z2', 'villes:7'])
    expect(s.shownCountOf('zg')).toBe(2)
    expect(s.shownCountOf('villes')).toBe(1)
    expect(s.shownCountOf('inconnue')).toBe(0)
    s.removeMany(['zg:z1', 'zg:z2'])
    expect(s.shownCountOf('zg')).toBe(0)
  })

  it('suit la mutation suivante — la table dérivée n’est jamais servie périmée', () => {
    const s = fresh()
    s.markSelected('zg:z1')
    expect(s.shownCountOf('zg')).toBe(1)
    s.markSelected('zg:z2')
    expect(s.shownCountOf('zg')).toBe(2)
    s.clear()
    expect(s.shownCountOf('zg')).toBe(0)
  })
})
