import { StrictMode, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { mdiBugOutline, mdiCropFree, mdiCubeOutline, mdiHandBackRightOffOutline, mdiMagnifyExpand, mdiMagnifyMinusOutline, mdiMapMarkerRadiusOutline } from '@mdi/js'
import Icon from '@mdi/react'
import {
  type ClusterInfo,
  ContextMenu,
  type DrawnShape,
  type InteractiveMode,
  Map,
  type MapHandle,
  type MapTheme,
  type MarkerColor,
  type MarkerData,
  type MenuItem,
  type RelationRule,
  type ShapeData,
  ToolButton,
  boundsOfMarkers,
  boundsOfShapes,
  createGoogleRoutesProvider,
  defaultTheme,
  markersLayer,
  mergeTheme,
  shapesLayer,
  useDrawing,
  useDrawSettings,
} from 'map3d'

const ENV = (import.meta as { env?: { VITE_CESIUM_ION_TOKEN?: string; VITE_GOOGLE_MAPS_KEY?: string } }).env
const CESIUM = ENV?.VITE_CESIUM_ION_TOKEN
const GOOGLE_MAPS_KEY = ENV?.VITE_GOOGLE_MAPS_KEY

/* ══════════════════ DATA — juste des lat/lng réels (Paris) ══════════════════ */

// Couleurs par type — déclarées AVANT `ALERTS`, qui les lit dès l'évaluation du
// module (un `.map()` immédiat) : plus bas, ce serait une TDZ au chargement.
const TYPE_COLORS: Record<string, string> = {
  'alert-critical': '#4d0218',
  'alert-high': '#ef4444',
  'alert-medium': '#f59e0b',
  'alert-low': '#3b82f6',
  'agent-available': '#22c55e',
  'agent-enroute': '#06b6d4',
  'agent-onsite': '#8b5cf6',
}

const PARIS = { lat: 48.8566, lng: 2.3522 }
// Point de contrôle précision (marqueur + centre initial).
const TEST_POINT = { lat: 49.095441, lng: 1.378192 }
type Severity = 'critical' | 'high' | 'medium' | 'low'
type Alert = { id: number; severity: Severity; title: string }
type Agent = {
  id: string
  name: string
  phone: string
  status: 'available' | 'enroute' | 'onsite'
  position: { lat: number; lng: number }
}

// Alertes = points réels de Paris, un lat/lng par alerte. Rien de calculé.
// `tags` (filtre « Couches ») dérivés de la sévérité : ['alert', <sévérité>].
// Démo des flags d'attention — toutes les combinaisons :
//   #1 `urgent` (viseur rouge), #5 `new` (sonar, éteint au clic),
//   #6 les deux flags → le viseur PRIME (le sonar n'apparaît pas).
const ALERTS = (
  [
    {
      id: 99,
      type: 'alert-critical',
      position: TEST_POINT,
      data: { id: 99, severity: 'critical', title: 'Point de contrôle précision' },
    },
    {
      id: 1,
      type: 'alert-critical',
      urgent: true,
      position: { lat: 48.8606, lng: 2.3376 },
      data: { id: 1, severity: 'critical', title: 'Intrusion — Louvre' },
    },
    {
      id: 2,
      type: 'alert-high',
      position: { lat: 48.853, lng: 2.3499 },
      data: { id: 2, severity: 'high', title: 'Malaise — Notre-Dame' },
    },
    {
      id: 3,
      type: 'alert-medium',
      position: { lat: 48.8584, lng: 2.2945 },
      data: { id: 3, severity: 'medium', title: 'Colis suspect — Tour Eiffel' },
    },
    {
      id: 4,
      type: 'alert-low',
      position: { lat: 48.8738, lng: 2.295 },
      data: { id: 4, severity: 'low', title: 'Tapage — Arc de Triomphe' },
    },
    {
      id: 5,
      type: 'alert-high',
      new: true,
      position: { lat: 48.8809, lng: 2.3553 },
      data: { id: 5, severity: 'high', title: 'Vol — Gare du Nord' },
    },
    {
      id: 6,
      type: 'alert-critical',
      new: true,
      urgent: true,
      position: { lat: 48.8532, lng: 2.369 },
      data: { id: 6, severity: 'critical', title: 'Bagarre — Bastille' },
    },
    {
      id: 7,
      type: 'alert-medium',
      position: { lat: 48.8867, lng: 2.3431 },
      data: { id: 7, severity: 'medium', title: 'Accident — Montmartre' },
    },
    {
      id: 8,
      type: 'alert-low',
      position: { lat: 48.8462, lng: 2.3464 },
      data: { id: 8, severity: 'low', title: 'Signalement — Panthéon' },
    },
    {
      id: 9,
      type: 'alert-high',
      position: { lat: 48.8615, lng: 2.3934 },
      data: { id: 9, severity: 'high', title: 'Malaise — Père-Lachaise' },
    },
    {
      id: 10,
      type: 'alert-medium',
      position: { lat: 48.8616, lng: 2.287 },
      data: { id: 10, severity: 'medium', title: 'Colis — Trocadéro' },
    },
    // Même position EXACTE que #2 (Notre-Dame) : cluster inséparable quel que soit
    // le zoom — cas de test du comportement « cluster au zoom max ».
    {
      id: 11,
      type: 'alert-low',
      position: { lat: 48.853, lng: 2.3499 },
      data: { id: 11, severity: 'low', title: 'Second signalement — Notre-Dame' },
    },
  ] satisfies MarkerData<Alert>[]
).map((a) => ({ ...a, tags: ['alert', a.data.severity], selectedColor: TYPE_COLORS[a.type] }))

// Avatars de démo (clé `avatar` GÉRÉE par la lib : pastille photo cerclée
// couleur du type, prioritaire sur `icon`) — 2 agents avec photo, 2 sans
// (repli sprite) pour comparer les deux rendus.
const AGENT_AVATARS: Record<string, string> = {
  'agent-0': 'https://i.pravatar.cc/80?img=12',
  'agent-2': 'https://i.pravatar.cc/80?img=32',
}

// Tags d'un agent (['user', <activité>]) — constantes hissées : le flux temps réel
// n'alloue pas de tableau par agent et par tick.
const AGENT_TAGS: Record<Agent['status'], string[]> = {
  available: ['user', 'standby'],
  enroute: ['user', 'move'],
  onsite: ['user', 'onsite'],
}

/* ══════════════════ RELATIONS — le SEUL endroit où vit le métier ══════════════════
   Le moteur de relations ne connaît que des tags, des couleurs et des libellés :
   « alerte », « agent » et « user » n'apparaissent que dans cette configuration,
   jamais dans la lib. */
const RELATION_RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',
    from: { any: ['alert'] },
    // Un agent déjà sur place n'est pas un renfort mobilisable.
    to: { any: ['user'], none: ['onsite'] },
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
  {
    id: 'agent-to-alerts',
    label: 'Alertes',
    from: { any: ['user'] },
    to: { any: ['alert'] },
    // `color` volontairement omis : démontre la couleur par défaut de
    // `<RelationLayer defaultColor>`.
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
  {
    id: 'agent-to-agents',
    label: 'Autres agents',
    from: { any: ['user'] },
    // La source est toujours exclue de ses propres cibles par `selectTargets`.
    to: { any: ['user'] },
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
  {
    id: 'agent-to-critical',
    label: 'Alertes critiques',
    from: { any: ['user'] },
    to: { all: ['alert', 'critical'] },
    mode: 'DRIVE',
    selection: { mode: 'radius', radiusMeters: 3000, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
]

// Agents = points réels de Paris. Le « temps réel » ne fait qu'ajouter un delta
// de position (déplacement), il ne calcule pas la donnée initiale.
function createAgentStream() {
  const agents: Agent[] = [
    {
      id: 'agent-0',
      name: 'Sam MacCloud',
      phone: '+33 6 09 82 88 04',
      status: 'available',
      position: { lat: 48.8566, lng: 2.3522 },
    },
    {
      id: 'agent-1',
      name: 'Agent Alban',
      phone: '+33 6 28 13 16 22',
      status: 'enroute',
      position: { lat: 48.8698, lng: 2.3079 },
    },
    {
      id: 'agent-2',
      name: 'Léa Fontaine',
      phone: '+33 6 77 41 09 88',
      status: 'onsite',
      position: { lat: 48.8443, lng: 2.3743 },
    },
    {
      id: 'agent-3',
      name: 'Karim Belhadj',
      phone: '+33 6 12 55 34 21',
      status: 'available',
      position: { lat: 48.8809, lng: 2.36 },
    },
  ]
  const heading = [0.4, 1.9, 3.2, 5.1]
  const listeners = new Set<(a: Agent[]) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  return {
    current: () => agents.map((a) => ({ ...a })),
    subscribe(cb: (a: Agent[]) => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start() {
      timer ??= setInterval(() => {
        agents.forEach((a, i) => {
          heading[i]! += 0.15
          a.position = {
            lat: a.position.lat + Math.cos(heading[i]!) * 0.00015,
            lng: a.position.lng + Math.sin(heading[i]!) * 0.00015,
          }
        })
        listeners.forEach((cb) => cb(agents.map((a) => ({ ...a, position: { ...a.position } }))))
      }, 300)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}

/* ══════════════════ THÈME DE DÉMO (dark statique) ══════════════════ */

const mk = (hex: string): MarkerColor => ({ base: hex, accent: hex, contrast: '#ffffff' })

// Couleurs des tags = couleurs des TYPES correspondants (mêmes pastilles que les
// markers dans le panneau « Couches » → lecture immédiate). Déclarées dans le
// thème (`colors.tags`) ; les tags sans correspondance (dessins : draw, rect…)
// gardent la palette hashée de la lib.
const TAG_COLORS: Record<string, string> = {
  alert: TYPE_COLORS['alert-high']!,
  critical: TYPE_COLORS['alert-critical']!,
  high: TYPE_COLORS['alert-high']!,
  medium: TYPE_COLORS['alert-medium']!,
  low: TYPE_COLORS['alert-low']!,
  user: TYPE_COLORS['agent-available']!,
  standby: TYPE_COLORS['agent-available']!,
  move: TYPE_COLORS['agent-enroute']!,
  onsite: TYPE_COLORS['agent-onsite']!,
}

const ZONE_STROKE = '#2E7CF6'
// Hissée : la même liste alimente l'affichage et la démo de cadrage (`boundsOfShapes`).
const DEMO_SHAPES: ShapeData[] = [{ kind: 'circle', center: PARIS, radiusMeters: 6000, color: ZONE_STROKE, fillOpacity: 0.1 }]

// Zone VOLUMÉTRIQUE (`extrudeHeight`) : le pendant de l'ancien `Map3D` de
// l'Operator, qui extrudait ses zones à 200 m au-dessus du sol. À comparer avec le
// cercle drapé ci-dessus en inclinant la vue — et à surveiller au pan : la base du
// volume doit rester rigoureusement collée au sol, sans glisser.
// La hauteur est portée PAR ZONE (`extrudeHeight`) : deux volumes voisins peuvent
// avoir des hauteurs différentes, et elle se règle à chaud (slider du panneau).
const demoVolumes = (height: number): ShapeData[] => [
  {
    kind: 'polygon',
    points: [
      { lat: 48.8625, lng: 2.3345 },
      { lat: 48.8625, lng: 2.3425 },
      { lat: 48.8575, lng: 2.3425 },
      { lat: 48.8575, lng: 2.3345 },
    ],
    color: '#f59e0b',
    fillOpacity: 0.18,
    extrudeHeight: height,
  },
  // Second volume, hauteur DIFFÉRENTE (moitié) : la hauteur est bien un réglage
  // de la zone, pas de la couche.
  {
    kind: 'circle',
    center: { lat: 48.8655, lng: 2.3255 },
    radiusMeters: 220,
    color: '#22c55e',
    fillOpacity: 0.18,
    extrudeHeight: Math.round(height / 2),
  },
]

// Action de démo du menu déroulant d'une ligne, PARTAGÉE par la loupe et le panneau
// de sélection (même `MarkerList`). Hissée hors du composant : identité stable, donc
// pas de re-render de la liste à chaque render du parent.
const theme: MapTheme = mergeTheme(defaultTheme, {
  colorScheme: 'dark',
  colors: {
    background: '#0d1415',
    ui: { accent: '#2E7CF6' },
    marker: {
      'alert-critical': mk(TYPE_COLORS['alert-critical']!),
      'alert-high': mk(TYPE_COLORS['alert-high']!),
      'alert-medium': mk(TYPE_COLORS['alert-medium']!),
      'alert-low': mk(TYPE_COLORS['alert-low']!),
      'agent-available': mk(TYPE_COLORS['agent-available']!),
      'agent-enroute': mk(TYPE_COLORS['agent-enroute']!),
      'agent-onsite': mk(TYPE_COLORS['agent-onsite']!),
    },
    zone: { fill: ZONE_STROKE, stroke: ZONE_STROKE },
    tags: TAG_COLORS,
  },
  markers: { size: 44, ringWidth: 3, gradient: true, gloss: true },
  clustering: { radius: 60 },
  clusters: { maxSatellites: 4, arcSpan: (279 * Math.PI) / 180 },
  animations: {
    enabled: true,
    halo: { duration: 2600, easing: 'cubic-bezier(.2,.6,.35,1)', maxScale: 2.1 },
    pulse: { duration: 2000, easing: 'ease-out', scale: 1.16 },
    markerEnter: { duration: 460, easing: 'cubic-bezier(.32,1.5,.5,1)', stagger: 30 },
    flyDuration: 1.0,
  },
})

/* ══════════════════ APP ══════════════════ */

/* ── Icônes SVG (rasterisées sur les sprites WebGL, 100% collées à la carte) ── */
// Pastille circulaire centrée (ancrage = centre) : ombre + anneau blanc + disque + symbole.
const badge = (color: string, inner: string): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
  '<circle cx="40" cy="41.5" r="29" fill="rgba(0,0,0,0.30)"/>' +
  '<circle cx="40" cy="40" r="29" fill="#ffffff"/>' +
  `<circle cx="40" cy="40" r="24" fill="${color}"/>` +
  inner +
  '</svg>'
const glyph = (s: string): string =>
  `<text x="40" y="41" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="30" fill="#ffffff">${s}</text>`
const SHIELD = '<path d="M40 26l12 4.2v7.6c0 7.4-5.2 12.6-12 14.6-6.8-2-12-7.2-12-14.6v-7.6z" fill="#ffffff"/>'
const DOT = '<circle cx="40" cy="40" r="7.5" fill="#ffffff"/>'
const AGENT_INNER: Record<string, string> = { 'agent-available': SHIELD, 'agent-enroute': SHIELD, 'agent-onsite': DOT }





/**
 * Sonde de debug : loggue chaque action du dessin pour visualiser ce que
 * recevrait une API consommatrice, et expose l'API sur `window.drawApi`
 * (ex. `drawApi.unlock([...])`, `drawApi.selectAll()`).
 */
function DrawDebug() {
  const api = useDrawing()
  const settings = useDrawSettings()
  useEffect(() => console.log('[draw] tool', api.tool, api.tool === 'select' ? `(mode ${api.selectMode})` : ''), [api.tool, api.selectMode])
  useEffect(() => console.log('[draw] history', { canUndo: api.canUndo, canRedo: api.canRedo }), [api.canUndo, api.canRedo])
  const styleJson = JSON.stringify(api.currentStyle)
  useEffect(() => console.log('[draw] style courant', JSON.parse(styleJson)), [styleJson])
  useEffect(() => console.log('[draw] settings modifiés (v%d)', settings.version), [settings.version])
  useEffect(() => {
    ;(window as unknown as { drawApi: typeof api }).drawApi = api
    // Vérification du round-trip d'identité, à lancer depuis la console une fois
    // des formes dessinées : `checkRoundTrip()` doit rapporter 0 id/meta perdus.
    ;(window as unknown as { checkRoundTrip: () => void }).checkRoundTrip = () => {
      const before = api.getShapes()
      const fc = api.toGeoJSON()
      api.fromGeoJSON(fc)
      const after = api.getShapes()
      const lost = before.filter((b: DrawnShape) => {
        const a = after.find((x: DrawnShape) => x.id === b.id)
        return !a || JSON.stringify(a.meta) !== JSON.stringify(b.meta)
      })
      console.log(`[draw] round-trip : ${before.length} formes → ${after.length}, ${lost.length} identité(s)/meta perdue(s)`, lost)
    }
  })
  return null
}


export function App() {
  // Poignée de la carte : les callbacks `onShape*` sont déclarés AU-DESSUS de la
  // carte et ont pourtant besoin du CRUD par identité. Une `ref` suffit — plus de
  // composant enfant à écrire pour aller chercher un hook.
  const map = useRef<MapHandle>(null)
  // Cycle true → 'view' (caméra figée, markers vivants) → false (inerte).
  const [interactive, setInteractive] = useState<InteractiveMode>(true)
  // Hauteur d'extrusion, réglable à chaud (cf. le slider du panneau de démo).
  const [volumeHeight, setVolumeHeight] = useState(200)
  const volumes = useMemo(() => demoVolumes(volumeHeight), [volumeHeight])
  const cycleInteractive = () => setInteractive((m) => (m === true ? 'view' : m === 'view' ? false : true))
  // Banc de test : un seul bouton dans la barre, le reste en sous-menu — plutôt que
  // six icônes que rien ne relie. L'état courant se lit dans les `hint`.
  const [demoOpen, setDemoOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<string>()
  const [followed, setFollowed] = useState<string>()
  // Favoris épinglés : ids en localStorage (la lib ne persiste rien — composant contrôlé).
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('m3d-demo-favs') ?? '[]')
    } catch {
      return []
    }
  })
  const [pinnedForeign, setPinnedForeign] = useState<
    Array<{
      id: string | number
      position?: { lat: number; lng: number }
      type?: string
      label?: string
      icon?: string
      color?: string
    }>
  >([])
  const savePins = (ids: string[]) => {
    setPinnedIds(ids)
    localStorage.setItem('m3d-demo-favs', JSON.stringify(ids))
  }
  const streamRef = useRef(createAgentStream())

  useEffect(() => {
    const s = streamRef.current
    setAgents(s.current())
    const off = s.subscribe(setAgents)
    s.start()
    return () => {
      off()
      s.stop()
    }
  }, [])

  // `selectedColor` : l'anneau de sélection porte le STATUT de l'agent au lieu d'une
  // teinte fixe — c'est ce que fait `useAgentMarkers` côté Operator.
  const agentMarkers: MarkerData<Agent>[] = agents.map((a) => ({
    id: a.id,
    type: `agent-${a.status}`,
    tags: AGENT_TAGS[a.status],
    avatar: AGENT_AVATARS[a.id],
    position: a.position,
    selectedColor: TYPE_COLORS[`agent-${a.status}`],
    data: a,
  }))

  // Fournisseur de routage : la clé reste côté client (cette lib n'a pas de backend).
  // Sans clé, les appels échouent et les étiquettes affichent « Temps indisponible » —
  // jamais une distance à vol d'oiseau déguisée en temps de trajet.
  const routesProvider = useMemo(() => createGoogleRoutesProvider({ apiKey: GOOGLE_MAPS_KEY ?? '', region: 'fr' }), [])

  const alertMenu = (m: MarkerData<Alert>): MenuItem[] => [
    { icon: '↗', label: 'Ouvrir la fiche', onSelect: () => console.info('fiche', m.data.id) },
    {
      icon: '⇢',
      label: 'Assigner un agent',
      children: agents.map((a) => ({ label: a.name, onSelect: () => console.info('assign', a.id) })),
    },
    { icon: '⚑', label: 'Signaler', children: [{ label: 'N’existe plus' }, { label: 'Mauvaise position' }] },
  ]

  // Alertes + agents dans un SEUL layer → clusterisés ensemble (comme la référence).
  type AnyData = Alert | Agent
  // Point éditable « pose ta position » : SEUL marker repositionnable du jeu — le
  // drapeau vit sur la donnée, pas sur la couche (cf. `MarkerData.repositionable`).
  const [pinPosition, setPinPosition] = useState({ lat: 48.8656, lng: 2.3212 })
  const pinMarker: MarkerData<AnyData> = {
    id: 'pin-editable',
    type: 'alert-medium',
    tags: ['pin'],
    selectedColor: TYPE_COLORS['alert-medium'],
    position: pinPosition,
    repositionable: true,
    // Priorité d'affichage : le point qu'on est en train de poser ne doit pas passer
    // sous un marker voisin. La sélection et le menu ouvert restent au-dessus.
    zIndex: 10,
    data: { id: -1, severity: 'medium', title: 'Position à définir (déplaçable)' },
  }
  const allMarkers: MarkerData<AnyData>[] = [...ALERTS, ...agentMarkers, pinMarker]
  // Couleur d'un type = EXACTEMENT celle que le thème met dans `colors.marker`
  // → marqueurs (sprites) et parts de cluster partagent la même source.
  const typeColor = (t: string): string => TYPE_COLORS[t] ?? '#64748b'
  const iconInner = (t: string): string => (t.startsWith('agent') ? (AGENT_INNER[t] ?? SHIELD) : glyph(t === 'alert-low' ? 'i' : '!'))
  const iconFor = (m: MarkerData<AnyData>): string => badge(typeColor(m.type), iconInner(m.type))
  // L'icône ne dépend que du TYPE : on encode le SVG une fois par type et on le
  // réutilise — sinon chaque tick du flux temps réel ré-encode toutes les pastilles.
  const iconUriCache = useRef<Record<string, string>>({})
  const iconDataUri = (m: MarkerData<AnyData>): string => {
    let uri = iconUriCache.current[m.type]
    if (uri === undefined) {
      uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconFor(m))}`
      iconUriCache.current[m.type] = uri
    }
    return uri
  }
  // Titre métier d'un marker — source UNIQUE, partagée par les éléments épinglés,
  // la loupe et le panneau de sélection (`MarkerList` commun, où pastille/avatar et
  // sous-titre de type sont automatiques).
  const markerLabel = (m: MarkerData): string => (m.type.startsWith('agent') ? (m.data as Agent).name : (m.data as Alert).title)
  // Résolu DANS L'ORDRE de `pinnedIds`, en retombant sur ce que le dépôt a livré
  // pour ce que nos données ne connaissent pas (un symbole posé sur la carte). Les
  // concaténer après les markers les collerait en fin de liste, et `onReorder`
  // n'aurait alors aucun effet visible sur eux. La dock reste contrôlée.
  const pinnedAll = pinnedIds
    .map((id) => {
      const m = allMarkers.find((x) => String(x.id) === id)
      if (!m) return pinnedForeign.find((p) => String(p.id) === id)
      return {
        id: m.id,
        position: m.position,
        type: m.type,
        label: markerLabel(m),
        avatar: m.avatar,
        icon: iconDataUri(m),
        data: m,
      }
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
  // Icône + libellé par type pour les satellites du cluster (survol = label).
  const CLUSTER_LABEL: Record<string, string> = {
    'alert-critical': 'Critique',
    'alert-high': 'Élevée',
    'alert-medium': 'Moyenne',
    'alert-low': 'Info',
    'agent-available': 'Agent disponible',
    'agent-enroute': 'Agent en route',
    'agent-onsite': 'Agent sur place',
  }
  const CLUSTER_LABEL_PLURAL: Record<string, string> = {
    'alert-critical': 'Critiques',
    'alert-high': 'Élevées',
    'alert-medium': 'Moyennes',
    'alert-low': 'Infos',
    'agent-available': 'Agents disponibles',
    'agent-enroute': 'Agents en route',
    'agent-onsite': 'Agents sur place',
  }
  const clusterTypeLabel = (t: string): string => CLUSTER_LABEL[t] ?? t
  const clusterTypeIcon = (t: string): ReactNode => {
    if (t === 'agent-onsite') return <circle cx={12} cy={12} r={4} fill="currentColor" />
    if (t.startsWith('agent')) return <path d="M12 4.2l7 2.45v4.3c0 4.2-2.95 7.15-7 8.35-4.05-1.2-7-4.15-7-8.35V6.65z" fill="currentColor" />
    return (
      <text x={12} y={12.5} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={800} fill="currentColor">
        {t === 'alert-low' ? 'i' : '!'}
      </text>
    )
  }
  // Le clic = ACTIONS (menu contextuel) — l'information vit dans l'infobulle au survol.
  const agentMenu = (m: MarkerData<Agent>): MenuItem[] => [
    {
      icon: '◎',
      label: followed === m.data.id ? 'Ne plus suivre' : 'Suivre',
      onSelect: () => setFollowed((cur) => (cur === m.data.id ? undefined : m.data.id)),
    },
    { icon: '✆', label: `Appeler ${m.data.phone}`, onSelect: () => console.info('call', m.data.phone) },
    { icon: '↗', label: 'Ouvrir la fiche', onSelect: () => console.info('fiche agent', m.data.id) },
  ]
  const menuFor = (m: MarkerData<AnyData>): MenuItem[] => (m.type.startsWith('alert') ? alertMenu(m as MarkerData<Alert>) : agentMenu(m as MarkerData<Agent>))
  // Infobulle au survol — démontre toutes les possibilités : title seul (alertes
  // basses), title + content riche (agents : avatar, tél, statut coloré),
  // et `null` = pas d'infobulle (point de contrôle #99).
  const STATUS_LABEL: Record<Agent['status'], string> = {
    available: 'Disponible',
    enroute: 'En route',
    onsite: 'Sur site',
  }
  const tipFor = (m: MarkerData<AnyData>) => {
    if (m.data.id === 99) return null
    if (m.type.startsWith('agent')) {
      const a = m.data as Agent
      return {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                flex: 'none',
                background: typeColor(m.type),
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9.5,
                fontWeight: 800,
              }}
            >
              {a.name
                .split(' ')
                .map((p) => p[0])
                .join('')}
            </span>
            {a.name}
          </span>
        ),
        // Contenu = LISTE (une info par ligne, classe m3d-markertip-row de la lib).
        content: (
          <>
            <div className="m3d-markertip-row">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor(m.type), flex: 'none' }} />
              <span>{STATUS_LABEL[a.status]}</span>
            </div>
            <div className="m3d-markertip-row">
              <span>{a.phone}</span>
            </div>
            <div className="m3d-markertip-row">
              <span>{CLUSTER_LABEL[m.type]}</span>
            </div>
          </>
        ),
      }
    }
    const al = m.data as Alert
    // Sévérité basse : title seul. Sinon title + liste (sévérité, urgence, état).
    if (al.severity === 'low') return { title: al.title }
    return {
      title: al.title,
      content: (
        <>
          <div className="m3d-markertip-row">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor(m.type), flex: 'none' }} />
            <span>{CLUSTER_LABEL[m.type]}</span>
          </div>
          {m.urgent && (
            <div className="m3d-markertip-row">
              <span>Intervention immédiate</span>
            </div>
          )}
          {m.new && (
            <div className="m3d-markertip-row">
              <span>Non traitée</span>
            </div>
          )}
        </>
      ),
    }
  }
  // Infobulle de CLUSTER : liste le contenu réel (feuilles fournies par la lib).
  const memberLabel = (m: MarkerData<AnyData>): string => (m.type.startsWith('agent') ? (m.data as Agent).name : (m.data as Alert).title)
  const clusterTipFor = (c: ClusterInfo, members: MarkerData<AnyData>[], segmentType?: string) => {
    const n = segmentType ? (c.counts[segmentType] ?? members.length) : c.total
    const label = segmentType ? ((n > 1 ? CLUSTER_LABEL_PLURAL[segmentType] : CLUSTER_LABEL[segmentType]) ?? segmentType) : n > 1 ? 'éléments' : 'élément'
    return {
      title: `${n} ${label}`,
      content: (
        <>
          {members.slice(0, 6).map((m) => (
            <div key={String(m.id)} className="m3d-markertip-row">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor(m.type), flex: 'none' }} />
              <span>{memberLabel(m)}</span>
            </div>
          ))}
          {members.length > 6 && (
            <div className="m3d-markertip-row">
              <span>+{members.length - 6} autres</span>
            </div>
          )}
        </>
      ),
    }
  }

  // Chaque entrée passe par `map.current` : aucune n'a besoin d'un hook, donc aucune
  // n'a besoin de vivre dans un composant. C'est tout l'intérêt de la poignée — ce
  // JSX est déclaré ici et rendu dans la barre, où un hook local serait hors sujet.
  const demoItems: MenuItem[] = [
    {
      icon: <Icon path={mdiMagnifyExpand} size={0.7} />,
      label: 'Cadrer alertes',
      // `minAltitude` sous le défaut « recherche de lieu » (350 m) : un groupe de
      // markers resserré resterait sinon cadré trop haut.
      onSelect: () => {
        const b = boundsOfMarkers(ALERTS)
        if (b) map.current?.camera.fitBounds(b, { padding: 60, minAltitude: 120 })
      },
    },
    {
      icon: <Icon path={mdiCropFree} size={0.7} />,
      label: 'Cadrer zone',
      hint: 'G',
      // Padding asymétrique : le contenu se centre dans la zone RESTÉE visible.
      onSelect: () => {
        const b = boundsOfShapes(DEMO_SHAPES)
        if (b) map.current?.camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
      },
    },
    {
      icon: <Icon path={mdiMapMarkerRadiusOutline} size={0.7} />,
      label: 'Recentrer',
      onSelect: () => map.current?.camera.panTo(TEST_POINT),
    },
    {
      icon: <Icon path={mdiMagnifyMinusOutline} size={0.7} />,
      label: 'Zoom 12',
      onSelect: () => map.current?.camera.setZoom(12),
    },
    { separator: true },
    {
      icon: <Icon path={mdiHandBackRightOffOutline} size={0.7} />,
      label: 'Interactivité',
      hint: String(interactive),
      // Cycle true → 'view' → false. `interactive` fige la CARTE, pas cette barre :
      // le menu reste utilisable pour revenir en arrière.
      onSelect: cycleInteractive,
    },
    {
      icon: <Icon path={mdiCubeOutline} size={0.7} />,
      label: 'Volumes',
      hint: `${volumeHeight} m`,
      // `extrudeHeight` est une propriété de LA ZONE : le cercle vert reste à la
      // moitié de cette valeur — deux zones, deux hauteurs.
      children: [0, 100, 200, 400].map((h) => ({ label: `${h} m`, onSelect: () => setVolumeHeight(h) })),
    },
  ]

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Map
        ref={map}
        theme={theme}
        colorScheme="dark"
        googleMapsApiKey={GOOGLE_MAPS_KEY || undefined}
        cesiumIonToken={CESIUM || undefined}
        center={PARIS}
        zoom={14}
        interactive={interactive}
        // Le cas d'usage type : gater un cadrage sur la disponibilité de la carte.
        // Avant `ready`, `fitBounds` viserait l'ellipsoïde nu — pas le sol réel.
        onReady={(engine) => console.log('[map] ready — altitude sol connue, cadrage fiable', engine.getView().zoom)}
        fallbackGlobe
        mapMode="3d"
        // ── Interface : tout se déclare ici. `<Map>` monte les surfaces dans le bon
        // ordre d'imbrication (loupe > dessin > barre > relations > couches), un
        // savoir qui appartient à la lib et non à l'application.
        toolbar={{
          // La loupe se règle DANS la barre, là où son bouton apparaît. Sans cette
          // clé elle marche quand même avec le rendu par défaut ; `lens: false` la
          // retirerait. La liste (MarkerList) est partagée avec le panneau de
          // sélection, et « Cibler » est natif : `actions` ne fait qu'y ajouter.
          lens: {
            getId: (m) => m.id,
            markerTypeLabel: clusterTypeLabel,
            renderItem: markerLabel,
            // Pas d'`actions` : l'inventaire hérite de `markerMenu` ci-dessous, donc
            // le bouton « … » d'une ligne offre EXACTEMENT le menu du marker sur la
            // carte — sous-menus et « Distance autour › » compris.
          },
          // Outils de CETTE démo : ils prennent le langage visuel des outils natifs
          // au lieu de flotter dans un coin de la carte.
          extraTools: (
            <div style={{ position: 'relative' }}>
              <ToolButton
                icon={mdiBugOutline}
                label="Banc de test (cadrage, interactivité, volumes)"
                active={demoOpen}
                onClick={() => setDemoOpen((v) => !v)}
              />
              {demoOpen && (
                <ContextMenu
                  items={demoItems}
                  onClose={() => setDemoOpen(false)}
                  // Ancré au bouton plutôt qu'au curseur (le défaut du menu contextuel).
                  style={{ position: 'absolute', left: '100%', top: 0, marginLeft: 6 }}
                />
              )}
            </div>
          ),
        }}
        // `target` fournie = bouton « revenir à la cible » ; omise = pas de bouton.
        // `onlyWhenOutOfView` : il n'apparaît qu'une fois la cible sortie de l'écran.
        controls={{
          position: 'right',
          target: { position: TEST_POINT, label: 'Revenir au point de contrôle', onlyWhenOutOfView: true },
        }}
        // `search` seul = Google Places via la clé de `googleMapsApiKey`. Un objet
        // permettrait d'injecter un autre fournisseur.
        search
        // Favoris : long-press sur un marker → glisser dans la barre du bas. Clic sur
        // une pastille = vol caméra + sélection. × ou glisser-hors = retrait.
        // SANS cette prop, plus aucune zone n'accepte un marker : les markers cessent
        // d'être saisissables, au lieu d'offrir un geste qui n'aboutirait nulle part.
        dock={{
          items: pinnedAll,
          size: 88,
          onPin: (p) => {
            savePins([...new Set([...pinnedIds, String(p.id)])])
            if (allMarkers.some((m) => String(m.id) === String(p.id))) return
            // La couche symboles embarque son SVG et son libellé dans la donnée :
            // la pastille affiche donc le vrai pictogramme, pas une initiale.
            const m = p.data as MarkerData<{ svg?: string; label?: string; category?: string; color?: string }> | undefined
            const svg = m?.data?.svg
            setPinnedForeign((prev) =>
              prev.some((x) => String(x.id) === String(p.id))
                ? prev
                : [
                    ...prev,
                    {
                      id: p.id,
                      position: m?.position,
                      // La pastille prend la couleur de la CATÉGORIE du symbole : le
                      // type du marker ('symbol') n'en dirait rien.
                      type: m?.data?.category ?? m?.type ?? 'symbol',
                      color: m?.data?.color,
                      label: m?.data?.label ?? String(p.id),
                      icon: svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined,
                    },
                  ],
            )
          },
          onUnpin: (id) => savePins(pinnedIds.filter((x) => x !== String(id))),
          // Glisser une pastille entre deux autres réordonne les favoris.
          onReorder: (ids) => savePins(ids.map(String)),
          onPinClick: (item) => setSelected(String(item.id)),
          tooltip: (item) => (item.data ? tipFor(item.data) : null),
        }}
        // Moteur de relations : la lib le monte AUTOUR des couches de markers, ce qui
        // fait arriver « Distance autour › » dans leur menu (2ᵉ argument de `menu`).
        // Ce n'est pas une couche — il ne rend rien de lui-même.
        relations={{
          rules: RELATION_RULES,
          provider: routesProvider,
          // La barre d'état est montée avec le moteur ; on ne fournit que de quoi
          // nommer un point, ce que la lib ne peut pas deviner.
          statusBar: {
            nameOf: (p) => {
              const m = allMarkers.find((x) => String(x.id) === p.id)
              return m ? markerLabel(m) : p.id
            },
          },
        }}
        draw={{
          // Zone verrouillée de démo désactivée : elle affichait un rectangle rouge
          // permanent qu'on pouvait confondre avec la zone de la loupe. Remettre
          // `value: LOCKED_ZONE` pour retrouver la démo de forme verrouillée.
          onChange: (g) => console.log('[draw] change — GeoJSON complet (ce que reçoit l’API) :', g),
          onSelectionChange: (ids, markerIds) => console.log('[draw] selection', ids, markerIds),
          // Démo du CRUD par identité : à la création, un « backend » simulé renvoie
          // un uuid qu'on rattache à la forme via `meta`, en `silent` pour ne pas
          // relancer un cycle d'events.
          onShapeAdd: (s) => {
            console.log('[draw] + forme', s.id, s.kind, s.points.length, 'pts')
            const uuid = `zone-${s.id}`
            map.current?.drawing?.updateShape(s.id, { meta: { uuid, title: `Zone ${s.kind}` } }, { silent: true })
            console.log('[draw]   uuid rattaché :', map.current?.drawing?.getShape(s.id)?.meta)
          },
          onShapeUpdate: (s) => console.log('[draw] ~ forme', s.id, s.meta),
          onShapeDelete: (s) => console.log('[draw] − forme', s.id, s.meta),
          onShapeEdit: (s) => console.log('[draw] ✎ double-clic → ouvrir la fiche de', s.meta ?? s.id),
          // Contraintes métier : toute forme doit tenir dans le cercle de démo et ne
          // pas dépasser 10 km². Le périmètre lui-même est affiché par la couche de
          // formes — `limits` ne sert qu'à contraindre, pas à dessiner.
          constraints: { limits: DEMO_SHAPES, maxAreaM2: 10_000_000 },
          onReject: (reason, s) => console.warn(reason === 'outOfLimits' ? `[draw] refusé : le ${s.kind} sort de la zone autorisée` : `[draw] refusé : le ${s.kind} dépasse 10 km²`),
          // Vignettes de sélection : montées d'office par la lib, on ne fournit que
          // les libellés métier (titre d'un marker, nom d'un type).
          selectionBadges: {
            markerTypeLabel: clusterTypeLabel,
            renderMarker: markerLabel,
            // Comme la loupe : le menu commun suffit.
          },
        }}
        // ── Menu d'un marker, déclaré UNE fois pour les trois surfaces qui en
        // proposent un : le marker sur la carte, l'inventaire de la loupe et le
        // panneau de sélection. Les deux listings y ajoutent « Cibler » d'eux-mêmes.
        // Le second argument porte les entrées du moteur de relations.
        markerMenu={(m, relations) => {
          const rel = relations?.menuFor(m) ?? []
          const own = menuFor(m as MarkerData<AnyData>)
          return rel.length === 0 ? own : [...own, { separator: true }, ...rel]
        }}
        // ── Couches de données, dans l'ordre de rendu. Les fabriques `shapesLayer` /
        // `markersLayer<T>` rendent le typage sur VOS données, que le tableau
        // hétérogène ne peut pas porter seul.
        layers={[
          // `limits` (contraintes du dessin) ne prend que DEMO_SHAPES : le volume est
          // là pour l'œil, il n'autorise aucune zone.
          shapesLayer({ shapes: [...DEMO_SHAPES, ...volumes] }),
          markersLayer<AnyData>({
            points: allMarkers,
            getId: (m) => m.id,
            // `maxZoom`/`spiderfyZoom` surchargent le thème POUR CETTE COUCHE.
            cluster: { enabled: true, radius: 60, maxZoom: 18 },
            selectedId: selected,
            followId: followed,
            // TOUT marker est sélectionnable : le dock sélectionne déjà n'importe quel
            // type au clic (`onPinClick`), restreindre ici aux agents donnait deux
            // comportements pour un même marker selon qu'on le clique sur la carte ou
            // dans les favoris. Une AFFECTATION, jamais un `return` prématuré : sortir
            // sans rien écrire laisserait l'anneau sur le marker précédent.
            // Le clic sélectionne ; le suivi caméra reste au menu « Suivre ».
            onSelect: (m) => setSelected(m ? String(m.id) : undefined),
            // `size` n'est PAS passé : la couche prend `theme.markers.size`, seule
            // source de la taille. L'anneau en dérive — la pastille visible de nos
            // sprites ne couvre que 58/80 du gabarit (r=29 dans un viewBox 80).
            selectionRing: Math.round(theme.markers.size * (58 / 80)) + 2,
            icon: iconFor,
            // Tous les markers sont saisissables au long-press (dépôt dans le dock).
            // `pin-editable` porte en plus `repositionable` sur SA donnée : les deux
            // gestes y cohabitent, la saisie partant de l'ICÔNE et le
            // repositionnement du POINT AU SOL.
            draggable: true,
            onReposition: (m, latLng) => {
              console.log('[marker] reposition', m.id, latLng)
              setPinPosition(latLng)
            },
            clusterTypeIcon: clusterTypeIcon,
            clusterTypeLabel: clusterTypeLabel,
            // L'entrée de relation se GREFFE sur le menu existant, elle ne le remplace pas.
            tooltip: tipFor,
            clusterTooltip: clusterTipFor,
          }),
        ]}
        >
        {/* Seul enfant restant : le mouchard de CETTE démo, qui journalise l'état du
        dessin dans la console. Il consomme `useDrawing()` pour être RÉACTIF (un
        rendu par changement d'outil ou d'historique), ce qu'une `ref` ne fait pas.
        Rien de la lib n'a plus à être assemblé ici. */}
        <DrawDebug />
      </Map>
    </div>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
