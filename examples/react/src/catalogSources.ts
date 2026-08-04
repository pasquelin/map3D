// Sources de catalogue du banc d'essai.
//
// Elles ne parlent à aucune API : tout est engendré localement, avec une latence
// simulée. L'objectif n'est pas de faire joli mais d'exercer RÉELLEMENT chaque chemin
// de la feature — 36 699 entrées pour la virtualisation et le scroll infini, des
// agrégats à enfants, une ligne inerte, une autre à emprise connue, et une
// source qui échoue pour voir le bandeau d'erreur et le retour en arrière du bouton.
//
// Tout est DÉTERMINISTE (générateur congruentiel semé, jamais `Math.random()`) : deux
// exécutions doivent montrer la même liste, sinon un écart devient indébogable.

import {
  mdiAlertOctagonOutline,
  mdiCityVariantOutline,
  mdiContentCopy,
  mdiHeartPulse,
  mdiMapMarkerRadiusOutline,
  mdiShapePolygonPlus,
  mdiVectorPolygon,
  mdiViewGridOutline,
} from '@mdi/js'
import { boundsContains, createTitleCache, normalizeSearch } from '@pasquelin/map3d'
import type {
  Bounds,
  CatalogBrowseSource,
  CatalogItem,
  CatalogPage,
  CatalogRequest,
  CatalogSource,
  CatalogToggleSource,
  MarkerData,
  ShapeData,
} from '@pasquelin/map3d'

import { DEFIBS } from './data/defibs'
import { DEMO_DRAW_ZONES } from './data/shapes'
import { vogel } from './data/geo'
import { seedToMarker } from './data/toMarkers'
import type { Defib } from './data/types'

/** Générateur congruentiel — semé, donc reproductible d'une exécution à l'autre. */
const rng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Latence simulée : sans elle, on ne verrait jamais ni « Chargement… » ni la garde de course. */
const delay = <T>(value: T, ms = 120): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms))

/**
 * Pagine un tableau déjà filtré. Le curseur est le DÉCALAGE : une vraie API rendrait
 * plutôt un jeton opaque, mais le contrat de la lib ne suppose rien de sa forme.
 */
function page(items: readonly CatalogItem[], req: CatalogRequest): CatalogPage {
  const start = req.cursor ? Number(req.cursor) : 0
  const slice = items.slice(start, start + req.limit)
  const next = start + slice.length
  return { items: slice, total: items.length, nextCursor: next < items.length ? String(next) : undefined }
}

/**
 * Titres normalisés, mémoïsés PAR ÉLÉMENT (`WeakMap`) — helper de la lib, pas une copie.
 *
 * C'était le vrai coût du filtre : le besoin était bien hissé hors du prédicat, mais
 * `normalizeSearch(i.title)` y restait, soit un `normalize('NFD')` + deux regex + un
 * `toLowerCase` sur chacun des 36 699 titres À CHAQUE page demandée — ~36 ms de thread
 * principal injectés pendant le défilement, au moment précis où la sentinelle réclame
 * la page suivante. Normalisé une fois, un titre ne l'est plus jamais.
 */
const normalizedTitle = createTitleCache<CatalogItem>((i) => i.title)

/**
 * `normalizeSearch` de la lib, et non une copie : c'est elle qui produit le `query`
 * reçu ici (cf. `CatalogRequest.query`), donc comparer avec une autre normalisation
 * ferait diverger l'exemple du contrat qu'il est censé démontrer.
 */
const filtered = (items: readonly CatalogItem[], query: string): readonly CatalogItem[] => {
  if (!query) return items
  const needle = normalizeSearch(query)
  return items.filter((i) => normalizedTitle(i).includes(needle))
}

// ── Villes : le cas du VOLUME ─────────────────────────────────────────────────

const RACINES = [
  'Beaumont',
  'Villeneuve',
  'Montreuil',
  'Saint-Martin',
  'Châteauneuf',
  'Roquefort',
  'Fontaine',
  'Bourgneuf',
  'Valberg',
  'Puylaurens',
  'Montfort',
  'Rochefort',
  'Vernon',
  'Cluny',
  'Auray',
  'Étampes',
  'Chamblis',
  'Noirval',
  'Belleroche',
  'Sauveterre',
  'Aiguebelle',
  'Cornillon',
  'Draveil',
  'Estagel',
  'Ferrières',
  'Gouvieux',
  'Hautval',
  'Ivry',
  'Jouarre',
  'Lassay',
  'Meslay',
  'Nogent',
  'Orval',
  'Pontivy',
  'Quincy',
  'Réalmont',
  'Sancerre',
  'Thiviers',
  'Uzès',
  'Volnay',
]
const SUFFIXES = [
  '',
  '-sur-Mer',
  '-le-Château',
  '-en-Josas',
  '-sur-Loire',
  '-les-Bains',
  '-la-Forêt',
  '-sur-Yon',
  '-le-Vieux',
  '-en-Brie',
  '-du-Lac',
  '-les-Vignes',
]

/** 36 699 villes — le compte annoncé dans la maquette de référence. */
const CITY_COUNT = 36_699

const cities: readonly CatalogItem[] = (() => {
  const out: CatalogItem[] = []
  for (let i = 0; i < CITY_COUNT; i++) {
    // Trois axes : 40 × 12 × 101 = 48 480 combinaisons, donc aucun doublon sur 36 699.
    const racine = RACINES[i % RACINES.length] ?? 'Ville'
    const suffixe = SUFFIXES[Math.floor(i / RACINES.length) % SUFFIXES.length] ?? ''
    const dept = Math.floor(i / (RACINES.length * SUFFIXES.length)) % 101
    out.push({
      id: i + 1,
      // Le département est DANS le titre : c'est lui qui rend les 36 699 noms uniques,
      // et une ligne de catalogue n'a qu'une ligne de texte (hauteur constante).
      title: `${racine}${suffixe} (${String(dept + 1).padStart(2, '0')})`,
      // France métropolitaine, grossièrement.
      // (position stockée dans l'id via le générateur : voir `cityCenter`)
    })
  }
  return out
})()

/** Centre d'une ville — recalculé à la demande, déterministe à partir de son id. */
const cityCenter = (id: number) => {
  const r = rng(id * 7919)
  return { lat: 43.2 + r() * 7.6, lng: -1.4 + r() * 8.2 }
}

// ── Zones et groupes : le cas MÉTIER ──────────────────────────────────────────

const GROUPS: readonly CatalogItem[] = [
  {
    id: 'g1',
    title: 'Paris La Défense',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [{ text: '3', label: '3 zones' }],
  },
  {
    id: 'g2',
    title: 'Groupe de Zones Nord',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [{ text: '1', label: '1 zone' }],
  },
  {
    id: 'g3',
    title: 'Confluence',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [{ text: '2', label: '2 zones' }],
  },
  // Groupes vides : inactifs côté métier, donc lignes inertes — rien à cadrer, rien à
  // afficher. Le badge de compte disparaît avec eux : « 0 » n'apprend rien de plus.
  { id: 'g4', title: 'Groupe de Zones Sud', icon: mdiViewGridOutline, disabled: true },
  { id: 'g5', title: 'Gpe Colombes', icon: mdiViewGridOutline, disabled: true },
]

/** Quelles zones composent quel groupe — c'est ce qui rend `geometry` multiple. */
const GROUP_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  g1: ['z1', 'z3', 'z10'],
  g2: ['z5'],
  g3: ['z2', 'z7'],
}

const zoneById = (id: string): CatalogItem | undefined => ZONES.find((z) => z.id === id)

/** Teintes distinctes : trois zones d'un même groupe doivent se DISTINGUER à l'écran. */
// Tuple NON VIDE : c'est ce qui rend `ZONE_COLORS[0]` sûr comme repli sous
// `noUncheckedIndexedAccess`, sans recopier la première teinte ailleurs.
const ZONE_COLORS: readonly [string, ...string[]] = ['#38bdf8', '#f59e0b', '#a78bfa', '#4ade80', '#f472b6', '#facc15']

const seedOf = (id: string): number => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0

/**
 * Teinte d'une zone, dérivée de son seul identifiant.
 *
 * Exposée pour que la LIGNE et la FORME la partagent : la pastille du catalogue doit
 * porter la couleur qu'aura la zone sur la carte, sinon la liste ne dit pas laquelle on
 * s'apprête à afficher. C'est à la source de le garantir — la lib se contente de rendre
 * `CatalogItem.color`.
 */
const zoneColor = (id: string): string => ZONE_COLORS[seedOf(id) % ZONE_COLORS.length] ?? ZONE_COLORS[0]

/**
 * Cercle drapé déterministe, entièrement dérivé de l'identifiant.
 *
 * Position, rayon ET teinte viennent du seul `id` : une même zone apportée par la
 * source « Zones » et par le groupe qui la contient doit être la MÊME forme, sinon la
 * déduplication du store garderait arbitrairement l'une des deux apparences.
 */
const zoneShape = (id: string, title: string): ShapeData => {
  const r = rng(seedOf(id) * 104729)
  return {
    kind: 'circle',
    id,
    title,
    center: { lat: 48.82 + r() * 0.14, lng: 2.2 + r() * 0.22 },
    radiusMeters: 400 + Math.floor(r() * 1100),
    color: zoneColor(id),
    fillOpacity: 0.22,
  }
}

/** Une zone du référentiel, teintée comme le sera sa forme. */
const zone = (id: string, title: string, extra?: Partial<CatalogItem>): CatalogItem => ({
  id,
  title,
  color: zoneColor(id),
  ...extra,
})

/* Un statut métier ne se rend PAS en pastille : un élément inactif est une ligne
   `disabled`, ce qui se voit sans rien ajouter à la largeur — et évite une colonne de
   coches vertes qui ne dit rien de plus que « tout va bien ».

   ⚠️ Les zones sont déclarées DÉJÀ GROUPÉES, secteur par secteur : la lib ouvre une
   section au changement de `group`, elle ne trie pas (cf. `flattenCatalog`). C'est ce qui
   la rend compatible avec la pagination — mais c'est à la source de servir ses éléments
   dans l'ordre, sinon le même intitulé réapparaît plus bas. `z2` n'a délibérément aucun
   `group` : une source peut n'en grouper qu'une partie, et le reste sort sans section. */
const ZONES: readonly CatalogItem[] = [
  zone('z2', 'Zone_Démo_Confluence', { disabled: true }),

  zone('z4', 'SDF Ext SO', {
    group: 'Stade de France',
    // Emprise connue : le clic sur le nom cadre SANS aucune requête préalable.
    bounds: { north: 48.9, south: 48.86, east: 2.26, west: 2.2 },
  }),
  zone('z5', 'SDF - Ext NE', { group: 'Stade de France' }),
  zone('z6', 'SDF Approche Est', { group: 'Stade de France' }),

  zone('z10', 'Parvis de la Défense', { group: 'La Défense' }),
  zone('z7', 'Centre Westfield', { group: 'La Défense' }),
  zone('z3', 'Leroy Merlin Nanterre', { group: 'La Défense' }),

  zone('z8', 'Périmètre Gare du Nord', { group: 'Paris Nord-Est' }),
  zone('z9', 'Secteur La Villette', { group: 'Paris Nord-Est' }),

  zone('z1', 'Lycée La Martinière Monplaisir', { group: 'Lyon' }),
]

// ── Les quatre sources ────────────────────────────────────────────────────────

const zonesSource: CatalogSource = {
  id: 'zones',
  label: 'Zones',
  icon: mdiShapePolygonPlus,
  family: 'Mes zones',
  total: ZONES.length,
  list: (req) => delay(page(filtered(ZONES, req.query), req)),
  geometry: (id) => delay([zoneShape(String(id), zoneById(String(id))?.title ?? String(id))]),
  /**
   * La voie POINTS d'une source de parcours : cocher une zone pose son contour ET son
   * point de commandement, du même geste. Les deux repartent ensemble au décochage, et le
   * cadrage du clic sur le nom porte sur leur union.
   *
   * Le point entre dans le regroupement, le filtre « Couches » (via `tags`) et la
   * recherche (via `title`) comme n'importe quel marker — d'où l'espace de noms propre
   * (`pc-…`), pour ne rien emprunter à la scène de démo.
   */
  markers: (id) => {
    const key = String(id)
    const found = zoneById(key)
    if (!found) return delay([])
    const shape = zoneShape(key, found.title)
    return delay([
      seedToMarker(
        'zone-pc',
        shape.kind === 'circle' ? shape.center : { lat: 48.86, lng: 2.34 },
        { id: `pc-${key}`, title: `PC — ${found.title}` },
        ['zone-pc', 'catalog'],
      ),
    ])
  },
  actions: [
    {
      id: 'copy',
      icon: mdiContentCopy,
      label: 'Copier l’identifiant',
      run: (item) => {
        void navigator.clipboard?.writeText(String(item.id))
        console.log('[catalogue] identifiant copié :', item.id)
      },
    },
  ],
}

// ── Zones dessinées : le régime INDEX (`checkable: false`) ────────────────────
//
// Ces zones-là ne sont PAS posées par le catalogue : l'exemple les monte lui-même dans la
// couche de dessin (`DEMO_DRAW_ZONES`, cf. `App.tsx`), seule couche où elles restent
// déplaçables et éditables. Le catalogue ne sert donc qu'à les retrouver et à les cadrer —
// une case y mentirait : on la coche, l'état visuel change, la carte est identique. Et si
// elle posait vraiment, la même zone serait peinte deux fois, par deux couches.
//
// Les deux éléments exercent les DEUX chemins de cadrage : le premier annonce son
// `bounds` (aucune requête), le second laisse la lib appeler `geometry` pour le calculer.

/** Emprise d'un anneau de points — les zones de dessin n'en publient pas. */
const ringBounds = (points: readonly { lat: number; lng: number }[]): Bounds | undefined => {
  const first = points[0]
  if (!first) return undefined
  let north = first.lat
  let south = first.lat
  let east = first.lng
  let west = first.lng
  for (const p of points) {
    north = Math.max(north, p.lat)
    south = Math.min(south, p.lat)
    east = Math.max(east, p.lng)
    west = Math.min(west, p.lng)
  }
  return { north, south, east, west }
}

/** Les mêmes anneaux que la couche de dessin, en `ShapeData` — pour le seul cadrage. */
const drawnShape = (index: number): ShapeData[] => {
  const zone = DEMO_DRAW_ZONES[index]
  if (!zone || zone.kind !== 'polygon') return []
  return [{ kind: 'polygon', id: `drawn-${index}`, title: zone.title, points: zone.points, closed: true }]
}

const DRAWN_ZONES: readonly CatalogItem[] = DEMO_DRAW_ZONES.map((z, i) => ({
  id: `drawn-${i}`,
  title: z.title ?? `Zone ${i + 1}`,
  color: z.style?.color,
  // Une seule annonce son emprise : l'autre oblige la lib à passer par `geometry`, et
  // c'est ce chemin-là qu'on veut voir vivre aussi.
  bounds: i === 0 && z.kind === 'polygon' ? ringBounds(z.points) : undefined,
}))

const drawnZonesSource: CatalogBrowseSource = {
  id: 'drawn-zones',
  label: 'Zones dessinées',
  icon: mdiVectorPolygon,
  family: 'Mes zones',
  total: DRAWN_ZONES.length,
  // ⚠️ Le drapeau de la démonstration : pas de case, pas de sélection, le nom CADRE.
  checkable: false,
  list: (req) => delay(page(filtered(DRAWN_ZONES, req.query), req)),
  // Requise par le contrat, et RÉELLE : c'est le chemin de cadrage des éléments qui
  // n'annoncent pas leur emprise. Rendre `[]` ici ferait mentir la méthode.
  geometry: (id) => delay(drawnShape(Number(String(id).replace('drawn-', '')))),
  actions: [
    {
      id: 'copy',
      icon: mdiContentCopy,
      label: 'Copier l’identifiant',
      run: (item) => console.log('[catalogue] zone dessinée :', item.id),
    },
  ],
}

const groupsSource: CatalogSource = {
  id: 'zone-groups',
  label: 'Groupes de zones',
  icon: mdiViewGridOutline,
  family: 'Mes zones',
  total: GROUPS.length,
  list: (req) => delay(page(filtered(GROUPS, req.query), req)),
  /**
   * UN élément, PLUSIEURS formes : c'est tout ce qui distingue un agrégat, côté lib.
   *
   * ⚠️ Répond AUSSI pour les enfants (`z…`), et pas seulement pour les groupes (`g…`) :
   * un enfant déplié appartient à la même source que son parent, c'est donc cette
   * méthode qu'on appellera pour lui. N'indexer que les groupes rendait un tableau vide
   * sur chaque enfant — un bouton `+` qui n'affichait rien, sans la moindre erreur.
   */
  geometry: (id) => {
    const members = GROUP_MEMBERS[String(id)]
    if (members) return delay(members.map((m) => zoneShape(m, zoneById(m)?.title ?? m)))
    const found = zoneById(String(id))
    return delay(found ? [zoneShape(String(id), found.title)] : [])
  },
  children: (id, req) => {
    const members = GROUP_MEMBERS[String(id)] ?? []
    const items = members.map((m) => zoneById(m)).filter((z): z is CatalogItem => z !== undefined)
    return delay(page(items, req))
  },
}

const citiesSource: CatalogSource = {
  id: 'cities',
  label: 'Villes',
  icon: mdiCityVariantOutline,
  family: 'Territoires',
  total: CITY_COUNT,
  list: (req) => delay(page(filtered(cities, req.query), req)),
  geometry: (id) => {
    const n = Number(id)
    const c = cityCenter(n)
    const item = cities[n - 1]
    return delay([
      { kind: 'circle', id: `city-${n}`, title: item?.title, center: c, radiusMeters: 3200, fillOpacity: 0.16 },
    ])
  },
}

/** Source volontairement défaillante : le seul moyen de VOIR le chemin d'erreur. */
const flakySource: CatalogSource = {
  id: 'flaky',
  label: 'Source instable',
  icon: mdiAlertOctagonOutline,
  family: 'Diagnostic',
  total: 6,
  list: (req) => {
    // Une page sur trois échoue — assez pour rencontrer le bandeau sans rendre la
    // source inutilisable, et « Réessayer » finit toujours par passer.
    const start = req.cursor ? Number(req.cursor) : 0
    if (start % 3 === 1) return delay(null).then(() => Promise.reject(new Error('panne simulée')))
    const items: CatalogItem[] = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i + 1}`,
      title: i === 2 ? 'Élément dont la géométrie échoue' : `Élément instable ${i + 1}`,
      icon: mdiMapMarkerRadiusOutline,
    }))
    return delay(page(filtered(items, req.query), req))
  },
  // Cet élément-là échoue TOUJOURS : c'est lui qui montre le bouton revenir en arrière
  // et le badge d'erreur, sans zone fantôme laissée dans la sélection.
  geometry: (id) =>
    String(id) === 'f3'
      ? delay(null).then(() => Promise.reject(new Error('géométrie indisponible')))
      : delay([zoneShape(String(id), `Instable ${String(id)}`)]),
}

// ── Défibrillateurs : le cas de la BASCULE ────────────────────────────────────

/* Un référentiel qu'on ne PARCOURT pas : personne ne cochera six cent trente cases. On
   l'allume d'un interrupteur, et c'est la vue qui décide de ce qui est chargé.

   ⚠️ Ces points ont leur PROPRE espace d'identifiants (`dae-c…`) et ne réutilisent pas
   ceux de `DEFIBS`, que la scène de démo pose déjà dans sa propre couche : deux markers
   de même `id` dans deux couches, c'est une entrée de recherche pour deux points et un
   regroupement qui compte deux fois le même. Ils en reprennent en revanche la
   GÉOGRAPHIE — chaque relevé réel sert d'ancre à sa grappe.

   Ils ne portent pas `static` non plus : leur seuil de visibilité, c'est le gate de la
   source (`minZoom`), pas celui du décor. Deux seuils sur les mêmes points auraient
   donné une bascule allumée qui n'affiche rien, sans rien pour l'expliquer. */

/** Points par ancre — ~630 au total, assez pour que le cadre visible tranche vraiment. */
const DEFIBS_PER_ANCHOR = 18

/** Espacement de la spirale (m) : une grappe de quartier, pas un tas sur un point. */
const DEFIB_SPACING_M = 130

/**
 * Sous quel zoom la source ne charge RIEN.
 *
 * 💰 C'est le levier direct sur le volume : dézoomé sur la région, un référentiel de ce
 * genre n'a aucun sens à l'écran et coûterait un aller-retour réseau par déplacement.
 */
const DEFIBS_MIN_ZOOM = 12

/**
 * Construits à la PREMIÈRE demande, pas au chargement du module.
 *
 * Un jeu à bascule éteint ne doit rien coûter — c'est la promesse de la feature. Six cents
 * markers fabriqués au démarrage pour un interrupteur que personne n'a touché l'auraient
 * démentie dans l'exemple même censé la démontrer.
 */
let defibCache: MarkerData<Defib>[] | null = null

const defibMarkers = (): MarkerData<Defib>[] => {
  if (defibCache) return defibCache
  // Semé, donc reproductible — comme les autres sources de ce fichier.
  const rand = rng(0x0dae0)
  const out: MarkerData<Defib>[] = []
  let n = 0
  for (const anchor of DEFIBS) {
    const secteur = anchor.data.title.replace(/^DAE — /, '')
    for (let i = 0; i < DEFIBS_PER_ANCHOR; i++) {
      n++
      out.push(
        seedToMarker(
          'defib',
          vogel(anchor.position, i, DEFIB_SPACING_M),
          {
            id: `dae-c${String(n).padStart(4, '0')}`,
            title: `DAE ${String(n).padStart(4, '0')} — ${secteur}`,
            address: `Secteur ${secteur}`,
            access: rand() < 0.62 ? 'public' : 'intérieur',
            city: anchor.data.city,
          },
          // `catalog` est un tag à part : il donne au filtre « Couches » de quoi isoler
          // ce que le catalogue a posé de ce que la scène de démo peint elle-même.
          ['defib', 'catalog', anchor.data.city],
        ),
      )
    }
  }
  defibCache = out
  return out
}

/** Total du jeu de référence — sans construire les points, qui ne le sont qu'à la demande. */
const DEFIBS_TOTAL = DEFIBS.length * DEFIBS_PER_ANCHOR

const defibsSource: CatalogToggleSource = {
  id: 'defibs',
  kind: 'toggle',
  label: 'Défibrillateurs',
  icon: mdiHeartPulse,
  family: 'Territoires',
  // Le volume du JEU DE RÉFÉRENCE — stable, vérifiable, et sans rapport avec la vue.
  total: DEFIBS_TOTAL,
  source: {
    minZoom: DEFIBS_MIN_ZOOM,
    /*
     * `boundsContains` de la lib, et non une comparaison maison : c'est elle qui gère le
     * franchissement de l'antiméridien, et ce fichier est le modèle que copiera un hôte.
     *
     * Le cadre reçu est celui du moteur, VOLONTAIREMENT élargi (`performance.boundsMargin`) :
     * cette source rend donc PLUS de points qu'il n'y en a à l'écran, et c'est ce qui évite
     * qu'ils surgissent au moindre déplacement. Aucune interface ne doit présenter ce volume
     * comme « ce qui est affiché ».
     *
     * Latence simulée plus longue que celle des listes : c'est elle qui rend visible
     * l'indicateur de chargement de la ligne.
     */
    load: (viewport) =>
      delay(
        defibMarkers().filter((m) => boundsContains(viewport.bounds, m.position)),
        260,
      ),
  },
  markerLayer: { cluster: { enabled: true } },
}

/**
 * La MÊME `DataSource` que la bascule ci-dessus, exposée pour la couche viewport HÔTE de
 * l'exemple (`<MarkerLayer source onLoadingChange>`).
 *
 * Une source de données n'appartient pas au catalogue : c'est le contrat viewport de la
 * lib. La partager prouve qu'une application peut brancher la sienne sur une couche
 * qu'elle monte elle-même, exactement comme le catalogue le fait en interne.
 */
export const hostViewportSource = defibsSource.source

/** Les sources du banc d'essai, dans l'ordre où elles apparaissent au sous-menu. */
export const EXAMPLE_CATALOG_SOURCES: readonly CatalogSource[] = [
  groupsSource,
  zonesSource,
  drawnZonesSource,
  citiesSource,
  defibsSource,
  flakySource,
]
