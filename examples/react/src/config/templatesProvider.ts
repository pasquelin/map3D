import { MapMath, statsOf, type Template, type TemplateProvider, type TemplateView } from 'map3d'

/* ══════════════════ PROVIDER DE TEMPLATES — DÉMO IN-MEMORY ══════════════════
   Simule un backend REST sans serveur : la liste distante prime sur le localStorage,
   et un template « partagé par un autre utilisateur » arrive en lecture seule. Ça
   prouve le contrat (l'API prend la main) dans `pnpm dev:example`, sans dépendance.
   Une vraie app remplacerait ceci par `createHttpTemplateProvider({ baseUrl })`. */

/**
 * Vue mémorisée d'un secteur — ce qui fait qu'un template ROUVRE son cadrage au lieu de
 * poser ses formes n'importe où. Les deux templates de démo en ont une différente : de
 * quoi voir la carte voler de l'un à l'autre, et l'inclinaison changer avec.
 */
const demoView = (lat: number, lng: number, altitude: number, tiltDeg: number): TemplateView => ({
  lat,
  lng,
  altitude,
  heading: 0, // plein nord : le secteur est au-dessus du point de vue
  tilt: tiltDeg * MapMath.DEG2RAD,
  mapMode: '3d',
  traffic: false,
})

/** Petit polygone + symbole autour de Paris, pour peupler la vignette d'aperçu. */
const demoDraw = (dx: number, view: TemplateView) => {
  const draw = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        id: `demo-poly-${dx}`,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [2.34 + dx, 48.855],
              [2.36 + dx, 48.855],
              [2.36 + dx, 48.865],
              [2.34 + dx, 48.865],
              [2.34 + dx, 48.855],
            ],
          ],
        },
        properties: { kind: 'polygon' as const, color: '#4f8cff', fillColor: '#4f8cff', width: 2, fillOpacity: 0.3 },
      },
      {
        type: 'Feature' as const,
        id: `demo-sym-${dx}`,
        geometry: { type: 'Point' as const, coordinates: [2.35 + dx, 48.86] },
        properties: {
          kind: 'symbol' as const,
          color: '#e5484d',
          width: 2,
          fillOpacity: 0,
          symbol: { key: 'sfgpuci', variant: 'friendly' },
        },
      },
    ],
  }
  return { content: { draw, view }, stats: statsOf(draw) }
}

const seed = (): Map<string, Template> => {
  const now = Date.now()
  // Secteur A vu du dessus ; le plan d'équipe vu en oblique depuis le sud — deux
  // cadrages qu'un clic sur l'une ou l'autre ligne doit reproduire tels quels.
  const a = demoDraw(0, demoView(48.86, 2.35, 1500, 0))
  const b = demoDraw(0.05, demoView(48.848, 2.4, 900, 55))
  return new Map<string, Template>([
    ['srv-reco', { id: 'srv-reco', name: 'Repérage secteur A', origin: 'api', createdAt: now, updatedAt: now, ...a }],
    [
      'srv-shared',
      {
        id: 'srv-shared',
        name: 'Plan tactique (équipe)',
        origin: 'api',
        readOnly: true, // publié par un autre utilisateur : non modifiable ici
        author: 'C. Martin',
        createdAt: now,
        updatedAt: now,
        ...b,
      },
    ],
  ])
}

/** Provider de démo : latence simulée, `readOnly` respecté (refus de modifier un partagé). */
export function createDemoTemplateProvider(): TemplateProvider {
  const store = seed()
  const wait = <T>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), 180))

  return {
    async list() {
      return wait([...store.values()])
    },
    async save(template) {
      const saved: Template = { ...template, origin: 'api', updatedAt: Date.now() }
      store.set(saved.id, saved)
      return wait(saved)
    },
    async update(id, patch) {
      const current = store.get(id)
      if (!current) throw new Error(`template ${id} inconnu`)
      if (current.readOnly) throw new Error('template en lecture seule')
      const next: Template = { ...current, ...patch, id, origin: 'api', updatedAt: Date.now() }
      store.set(id, next)
      return wait(next)
    },
    async remove(id) {
      const current = store.get(id)
      if (current?.readOnly) throw new Error('template en lecture seule')
      store.delete(id)
      await wait(undefined)
    },
  }
}
