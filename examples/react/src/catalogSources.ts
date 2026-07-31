// Sources de catalogue du banc d'essai.
//
// Elles ne parlent à aucune API : tout est engendré localement, avec une latence
// simulée. L'objectif n'est pas de faire joli mais d'exercer RÉELLEMENT chaque chemin
// de la feature — 36 699 entrées pour la virtualisation et le scroll infini, des
// agrégats à enfants, un élément non ajoutable, un autre à emprise connue, et une
// source qui échoue pour voir le bandeau d'erreur et le retour en arrière du bouton.
//
// Tout est DÉTERMINISTE (générateur congruentiel semé, jamais `Math.random()`) : deux
// exécutions doivent montrer la même liste, sinon un écart devient indébogable.

import { mdiAlertOctagonOutline, mdiCheckCircle, mdiCityVariantOutline, mdiCloseCircle, mdiContentCopy, mdiMapMarkerRadiusOutline, mdiShapePolygonPlus, mdiViewGridOutline } from '@mdi/js'
import type { CatalogItem, CatalogPage, CatalogRequest, CatalogSource, ShapeData } from 'map3d'

/** Générateur congruentiel — semé, donc reproductible d'une exécution à l'autre. */
const rng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Latence simulée : sans elle, on ne verrait jamais ni « Chargement… » ni la garde de course. */
const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

/** Recherche insensible à la casse et aux accents, comme celle de la lib. */
const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

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

const filtered = (items: readonly CatalogItem[], query: string): readonly CatalogItem[] =>
  query ? items.filter((i) => norm(i.title).includes(norm(query))) : items

// ── Villes : le cas du VOLUME ─────────────────────────────────────────────────

const RACINES = [
  'Beaumont', 'Villeneuve', 'Montreuil', 'Saint-Martin', 'Châteauneuf', 'Roquefort', 'Fontaine', 'Bourgneuf',
  'Valberg', 'Puylaurens', 'Montfort', 'Rochefort', 'Vernon', 'Cluny', 'Auray', 'Étampes', 'Chamblis', 'Noirval',
  'Belleroche', 'Sauveterre', 'Aiguebelle', 'Cornillon', 'Draveil', 'Estagel', 'Ferrières', 'Gouvieux', 'Hautval',
  'Ivry', 'Jouarre', 'Lassay', 'Meslay', 'Nogent', 'Orval', 'Pontivy', 'Quincy', 'Réalmont', 'Sancerre', 'Thiviers',
  'Uzès', 'Volnay',
]
const SUFFIXES = [
  '', '-sur-Mer', '-le-Château', '-en-Josas', '-sur-Loire', '-les-Bains', '-la-Forêt', '-sur-Yon', '-le-Vieux',
  '-en-Brie', '-du-Lac', '-les-Vignes',
]

/** 36 699 villes — le compte annoncé dans la maquette de référence. */
const CITY_COUNT = 36_699

const cities: readonly CatalogItem[] = (() => {
  const r = rng(20260731)
  const out: CatalogItem[] = []
  for (let i = 0; i < CITY_COUNT; i++) {
    // Trois axes : 40 × 12 × 101 = 48 480 combinaisons, donc aucun doublon sur 36 699.
    const racine = RACINES[i % RACINES.length] ?? 'Ville'
    const suffixe = SUFFIXES[Math.floor(i / RACINES.length) % SUFFIXES.length] ?? ''
    const dept = Math.floor(i / (RACINES.length * SUFFIXES.length)) % 101
    out.push({
      id: i + 1,
      title: `${racine}${suffixe}`,
      subtitle: String(dept + 1).padStart(2, '0'),
      // France métropolitaine, grossièrement.
      // (position stockée dans l'id via le générateur : voir `cityCenter`)
    })
    void r
  }
  return out
})()

/** Centre d'une ville — recalculé à la demande, déterministe à partir de son id. */
const cityCenter = (id: number) => {
  const r = rng(id * 7919)
  return { lat: 43.2 + r() * 7.6, lng: -1.4 + r() * 8.2 }
}

// ── Zones et groupes : le cas MÉTIER ──────────────────────────────────────────

const ZONES: readonly CatalogItem[] = [
  { id: 'z1', title: 'Lycée La Martinière Monplaisir', badges: [{ icon: mdiCheckCircle, color: '#4ade80', label: 'Active' }] },
  {
    id: 'z2',
    title: 'Zone_Démo_Confluence',
    // Non ajoutable : c'est l'équivalent du « Vide » de la maquette. Le bouton reste
    // là, grisé — le faire disparaître décalerait la colonne d'une ligne à l'autre.
    addable: false,
    badges: [{ icon: mdiCloseCircle, color: '#f87171', label: 'Inactive' }],
  },
  { id: 'z3', title: 'Leroy Merlin Nanterre', badges: [{ icon: mdiCheckCircle, color: '#4ade80', label: 'Active' }] },
  {
    id: 'z4',
    title: 'SDF Ext SO',
    // Emprise connue : le clic sur le nom cadre SANS aucune requête.
    bounds: { north: 48.9, south: 48.86, east: 2.26, west: 2.2 },
    badges: [{ icon: mdiCheckCircle, color: '#4ade80', label: 'Active' }],
  },
  { id: 'z5', title: 'SDF - Ext NE', badges: [{ icon: mdiCheckCircle, color: '#4ade80', label: 'Active' }] },
  { id: 'z6', title: 'SDF Approche Est' },
  { id: 'z7', title: 'Centre Westfield' },
  { id: 'z8', title: 'Périmètre Gare du Nord' },
  { id: 'z9', title: 'Secteur La Villette' },
  { id: 'z10', title: 'Parvis de la Défense' },
]

const GROUPS: readonly CatalogItem[] = [
  {
    id: 'g1',
    title: 'Paris La Défense',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [
      { icon: mdiCheckCircle, color: '#4ade80', label: 'Actif' },
      { text: '3', label: '3 zones' },
    ],
  },
  {
    id: 'g2',
    title: 'Groupe de Zones Nord',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [
      { icon: mdiCheckCircle, color: '#4ade80', label: 'Actif' },
      { text: '1', label: '1 zone' },
    ],
  },
  {
    id: 'g3',
    title: 'Confluence',
    icon: mdiViewGridOutline,
    hasChildren: true,
    badges: [
      { icon: mdiCheckCircle, color: '#4ade80', label: 'Actif' },
      { text: '2', label: '2 zones' },
    ],
  },
  {
    id: 'g4',
    title: 'Groupe de Zones Sud',
    icon: mdiViewGridOutline,
    addable: false,
    badges: [{ icon: mdiCloseCircle, color: '#f87171', label: 'Inactif' }],
  },
  { id: 'g5', title: 'Gpe Colombes', icon: mdiViewGridOutline, addable: false },
]

/** Quelles zones composent quel groupe — c'est ce qui rend `geometry` multiple. */
const GROUP_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  g1: ['z1', 'z3', 'z10'],
  g2: ['z5'],
  g3: ['z2', 'z7'],
}

const zoneById = (id: string): CatalogItem | undefined => ZONES.find((z) => z.id === id)

/** Cercle drapé déterministe autour d'un point tiré de l'identifiant. */
const zoneShape = (id: string, title: string): ShapeData => {
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const r = rng(seed * 104729)
  return {
    kind: 'circle',
    id,
    title,
    center: { lat: 48.82 + r() * 0.14, lng: 2.2 + r() * 0.22 },
    radiusMeters: 260 + Math.floor(r() * 900),
    fillOpacity: 0.2,
  }
}

// ── Les quatre sources ────────────────────────────────────────────────────────

const zonesSource: CatalogSource = {
  id: 'zones',
  label: 'Zones',
  icon: mdiShapePolygonPlus,
  family: 'Mes zones',
  total: ZONES.length,
  list: (req) => delay(page(filtered(ZONES, req.query), req)),
  geometry: (id) => delay([zoneShape(String(id), zoneById(String(id))?.title ?? String(id))]),
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

const groupsSource: CatalogSource = {
  id: 'zone-groups',
  label: 'Groupes de zones',
  icon: mdiViewGridOutline,
  family: 'Mes zones',
  total: GROUPS.length,
  list: (req) => delay(page(filtered(GROUPS, req.query), req)),
  // UN élément, PLUSIEURS formes : c'est tout ce qui distingue un agrégat, côté lib.
  geometry: (id) => {
    const members = GROUP_MEMBERS[String(id)] ?? []
    return delay(members.map((m) => zoneShape(m, zoneById(m)?.title ?? m)))
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

/** Les sources du banc d'essai, dans l'ordre où elles apparaissent au sous-menu. */
export const EXAMPLE_CATALOG_SOURCES: readonly CatalogSource[] = [
  groupsSource,
  zonesSource,
  citiesSource,
  flakySource,
]
