import { describe, expect, it } from 'vitest'

import { EXAMPLE_CATALOG_SOURCES } from './catalogSources'

/* Garde-fou du banc d'essai, comme `configLabels.test.ts`.

   Le simple IMPORT vaut déjà test : ces sources se construisent au chargement du module,
   et une déclaration lue avant la ligne qui la crée (zone morte temporelle d'un `const`)
   ne se voit ni au typecheck, ni au build — seulement à l'ouverture de la page. */

const req = { query: '', limit: 50, signal: new AbortController().signal }

describe('sources de catalogue de l’exemple', () => {
  it('se construisent, et déclarent toutes le minimum', () => {
    expect(EXAMPLE_CATALOG_SOURCES.length).toBeGreaterThan(0)
    for (const s of EXAMPLE_CATALOG_SOURCES) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.icon).toBeTruthy()
    }
  })

  it('donnent des identifiants de source uniques', () => {
    const ids = EXAMPLE_CATALOG_SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('teintent chaque zone de la couleur de sa forme', async () => {
    // La pastille de la ligne doit annoncer ce qu'on va voir sur la carte : sans cette
    // égalité, la liste ne dit pas laquelle des zones on s'apprête à afficher.
    const zones = EXAMPLE_CATALOG_SOURCES.find((s) => s.id === 'zones')
    expect(zones).toBeDefined()
    const { items } = await zones!.list(req)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const [shape] = await zones!.geometry(item.id, req.signal)
      expect(item.color).toBe(shape?.color)
    }
  })

  it('rendent une géométrie pour les ENFANTS d’un groupe, pas seulement pour ses racines', async () => {
    // Le piège du contrat : un enfant déplié est demandé à la source de son PARENT.
    // Ne pas y répondre donne une case qui n'affiche rien, sans la moindre erreur.
    const groups = EXAMPLE_CATALOG_SOURCES.find((s) => s.id === 'zone-groups')
    expect(groups).toBeDefined()
    const parent = (await groups!.list(req)).items.find((i) => i.hasChildren)
    expect(parent).toBeDefined()

    const kids = await groups!.children!(parent!.id, req)
    expect(kids.items.length).toBeGreaterThan(0)
    for (const kid of kids.items) {
      expect(await groups!.geometry(kid.id, req.signal)).not.toHaveLength(0)
    }
  })

  it('rendent AUTANT de formes que le groupe annonce d’enfants', async () => {
    const groups = EXAMPLE_CATALOG_SOURCES.find((s) => s.id === 'zone-groups')!
    const parent = (await groups.list(req)).items.find((i) => i.hasChildren)!
    const kids = await groups.children!(parent.id, req)
    expect(await groups.geometry(parent.id, req.signal)).toHaveLength(kids.items.length)
  })

  it('paginent sans jamais rendre deux fois le même élément', async () => {
    const cities = EXAMPLE_CATALOG_SOURCES.find((s) => s.id === 'cities')!
    const first = await cities.list({ ...req, limit: 10 })
    const second = await cities.list({ ...req, limit: 10, cursor: first.nextCursor })
    expect(first.items).toHaveLength(10)
    expect(first.nextCursor).toBeDefined()
    const ids = [...first.items, ...second.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('annoncent un total cohérent avec ce qu’elles paginent', async () => {
    const cities = EXAMPLE_CATALOG_SOURCES.find((s) => s.id === 'cities')!
    expect((await cities.list({ ...req, limit: 1 })).total).toBe(cities.total)
  })
})
