import { isToggleSource, type CatalogBrowseSource, type CatalogToggleSource } from '@pasquelin/map3d'
import { describe, expect, it } from 'vitest'

import { EXAMPLE_CATALOG_SOURCES } from './catalogSources'
import { DEFIBS } from './data/defibs'

/* Garde-fou du banc d'essai, comme `configLabels.test.ts`.

   Le simple IMPORT vaut déjà test : ces sources se construisent au chargement du module,
   et une déclaration lue avant la ligne qui la crée (zone morte temporelle d'un `const`)
   ne se voit ni au typecheck, ni au build — seulement à l'ouverture de la page. */

const req = { query: '', limit: 50, signal: new AbortController().signal }

/** Récupère une source de PARCOURS par son id — et échoue franchement si elle a changé de régime. */
const browse = (id: string): CatalogBrowseSource => {
  const s = EXAMPLE_CATALOG_SOURCES.find((x) => x.id === id)
  if (!s || isToggleSource(s)) throw new Error(`source de parcours « ${id} » introuvable`)
  return s
}

const toggle = (id: string): CatalogToggleSource => {
  const s = EXAMPLE_CATALOG_SOURCES.find((x) => x.id === id)
  if (!s || !isToggleSource(s)) throw new Error(`source à bascule « ${id} » introuvable`)
  return s
}

/** Cadre de vue de test — le contrat de `DataSource` ne demande rien d'autre. */
const viewport = (zoom: number, bounds = { north: 48.9, south: 48.8, east: 2.4, west: 2.28 }) => ({
  bounds,
  center: { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 },
  zoom,
})

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
    const zones = browse('zones')
    const { items } = await zones.list(req)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const [shape] = await zones.geometry(item.id, req.signal)
      expect(item.color).toBe(shape?.color)
    }
  })

  it('rendent une géométrie pour les ENFANTS d’un groupe, pas seulement pour ses racines', async () => {
    // Le piège du contrat : un enfant déplié est demandé à la source de son PARENT.
    // Ne pas y répondre donne une case qui n'affiche rien, sans la moindre erreur.
    const groups = browse('zone-groups')
    const parent = (await groups.list(req)).items.find((i) => i.hasChildren)
    expect(parent).toBeDefined()

    const kids = await groups.children!(parent!.id, req)
    expect(kids.items.length).toBeGreaterThan(0)
    for (const kid of kids.items) {
      expect(await groups.geometry(kid.id, req.signal)).not.toHaveLength(0)
    }
  })

  it('rendent AUTANT de formes que le groupe annonce d’enfants', async () => {
    const groups = browse('zone-groups')
    const parent = (await groups.list(req)).items.find((i) => i.hasChildren)!
    const kids = await groups.children!(parent.id, req)
    expect(await groups.geometry(parent.id, req.signal)).toHaveLength(kids.items.length)
  })

  it('paginent sans jamais rendre deux fois le même élément', async () => {
    const cities = browse('cities')
    const first = await cities.list({ ...req, limit: 10 })
    const second = await cities.list({ ...req, limit: 10, cursor: first.nextCursor })
    expect(first.items).toHaveLength(10)
    expect(first.nextCursor).toBeDefined()
    const ids = [...first.items, ...second.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('annoncent un total cohérent avec ce qu’elles paginent', async () => {
    const cities = browse('cities')
    expect((await cities.list({ ...req, limit: 1 })).total).toBe(cities.total)
  })
})

describe('source à bascule « Défibrillateurs »', () => {
  it('ne charge QUE ce que le cadre demandé contient', async () => {
    const defibs = toggle('defibs')
    const paris = await defibs.source.load(viewport(14), req.signal)
    expect(paris.length).toBeGreaterThan(0)
    for (const m of paris) {
      expect(m.position.lat).toBeGreaterThanOrEqual(48.8)
      expect(m.position.lat).toBeLessThanOrEqual(48.9)
    }
    // Un cadre sur Nice ne doit rien rendre de parisien — c'est la VUE qui décide.
    const nice = await defibs.source.load(
      viewport(14, { north: 43.72, south: 43.67, east: 7.3, west: 7.2 }),
      req.signal,
    )
    expect(nice.length).toBeGreaterThan(0)
    expect(nice.some((m) => paris.includes(m))).toBe(false)
  })

  it('déclare un gate de zoom — 💰 le levier direct sur le volume', () => {
    // Le gate lui-même est appliqué par `ViewportController`, pas par la source : elle
    // n'a qu'à l'annoncer (cf. `src/data/ViewportController.test.ts`).
    expect(defibsMinZoom()).toBeGreaterThan(0)
  })

  it('annonce le volume du JEU DE RÉFÉRENCE, pas celui d’une vue', async () => {
    const defibs = toggle('defibs')
    const loaded = await defibs.source.load(viewport(14), req.signal)
    // `total` est stable et vérifiable ; le nombre chargé dépend du cadre, et l'un ne
    // doit jamais être présenté pour l'autre (cf. CATALOG.md § 4, `boundsMargin`).
    expect(defibs.total).toBeGreaterThan(loaded.length)
  })

  it('étiquette ses points pour le filtre « Couches » et la recherche', async () => {
    const defibs = toggle('defibs')
    const [first] = await defibs.source.load(viewport(14), req.signal)
    expect(first?.title).toBeTruthy()
    expect(first?.tags).toContain('catalog')
    expect(first?.type).toBe('defib')
  })

  it('est DÉTERMINISTE : deux chargements du même cadre rendent la même chose', async () => {
    const defibs = toggle('defibs')
    const a = await defibs.source.load(viewport(14), req.signal)
    const b = await defibs.source.load(viewport(14), req.signal)
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id))
  })

  it('n’emprunte AUCUN identifiant à la scène de démo — sinon deux markers pour un point', async () => {
    const defibs = toggle('defibs')
    const loaded = await defibs.source.load(viewport(14), req.signal)
    const scene = new Set(DEFIBS.map((m) => m.id))
    for (const m of loaded) expect(scene.has(m.id)).toBe(false)
  })
})

const defibsMinZoom = () => toggle('defibs').source.minZoom ?? 0
