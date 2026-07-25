import { StrictMode, type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DrawLayer,
  DrawToolbar,
  type GeoJSONFeatureCollection,
  Map,
  MapControls,
  MapProvider,
  MarkerLayer,
  type MapTheme,
  type MarkerColor,
  type MarkerData,
  type MenuItem,
  SearchBox,
  type SearchResult,
  ShapeLayer,
  type MapMode,
  defaultTheme,
  mergeTheme,
  useDrawing,
  useDrawSettings,
  useMap,
} from 'map3d'

const ENV = (import.meta as { env?: { VITE_CESIUM_ION_TOKEN?: string; VITE_GOOGLE_MAPS_KEY?: string } }).env
const CESIUM = ENV?.VITE_CESIUM_ION_TOKEN
const GOOGLE_MAPS_KEY = ENV?.VITE_GOOGLE_MAPS_KEY

/* ══════════════════ DATA — juste des lat/lng réels (Paris) ══════════════════ */

const PARIS = { lat: 48.8566, lng: 2.3522 }
// Point de contrôle précision (marqueur + centre initial).
const TEST_POINT = { lat: 49.095441, lng: 1.378192 }
type Severity = 'critical' | 'high' | 'medium' | 'low'
type Alert = { id: number; severity: Severity; title: string }
type Agent = { id: string; name: string; phone: string; status: 'available' | 'enroute' | 'onsite'; position: { lat: number; lng: number } }

// Alertes = points réels de Paris, un lat/lng par alerte. Rien de calculé.
// `tags` (filtre « Couches ») dérivés de la sévérité : ['alert', <sévérité>].
const ALERTS = ([
  { id: 99, type: 'alert-critical', position: TEST_POINT, data: { id: 99, severity: 'critical', title: 'Point de contrôle précision' } },
  { id: 1, type: 'alert-critical', position: { lat: 48.8606, lng: 2.3376 }, data: { id: 1, severity: 'critical', title: 'Intrusion — Louvre' } },
  { id: 2, type: 'alert-high', position: { lat: 48.853, lng: 2.3499 }, data: { id: 2, severity: 'high', title: 'Malaise — Notre-Dame' } },
  { id: 3, type: 'alert-medium', position: { lat: 48.8584, lng: 2.2945 }, data: { id: 3, severity: 'medium', title: 'Colis suspect — Tour Eiffel' } },
  { id: 4, type: 'alert-low', position: { lat: 48.8738, lng: 2.295 }, data: { id: 4, severity: 'low', title: 'Tapage — Arc de Triomphe' } },
  { id: 5, type: 'alert-high', position: { lat: 48.8809, lng: 2.3553 }, data: { id: 5, severity: 'high', title: 'Vol — Gare du Nord' } },
  { id: 6, type: 'alert-critical', position: { lat: 48.8532, lng: 2.369 }, data: { id: 6, severity: 'critical', title: 'Bagarre — Bastille' } },
  { id: 7, type: 'alert-medium', position: { lat: 48.8867, lng: 2.3431 }, data: { id: 7, severity: 'medium', title: 'Accident — Montmartre' } },
  { id: 8, type: 'alert-low', position: { lat: 48.8462, lng: 2.3464 }, data: { id: 8, severity: 'low', title: 'Signalement — Panthéon' } },
  { id: 9, type: 'alert-high', position: { lat: 48.8615, lng: 2.3934 }, data: { id: 9, severity: 'high', title: 'Malaise — Père-Lachaise' } },
  { id: 10, type: 'alert-medium', position: { lat: 48.8616, lng: 2.287 }, data: { id: 10, severity: 'medium', title: 'Colis — Trocadéro' } },
] satisfies MarkerData<Alert>[]).map((a) => ({ ...a, tags: ['alert', a.data.severity] }))

// Tags d'un agent (['user', <activité>]) — constantes hissées : le flux temps réel
// n'alloue pas de tableau par agent et par tick.
const AGENT_TAGS: Record<Agent['status'], string[]> = {
  available: ['user', 'standby'],
  enroute: ['user', 'move'],
  onsite: ['user', 'onsite'],
}

// Agents = points réels de Paris. Le « temps réel » ne fait qu'ajouter un delta
// de position (déplacement), il ne calcule pas la donnée initiale.
function createAgentStream() {
  const agents: Agent[] = [
    { id: 'agent-0', name: 'Sam MacCloud', phone: '+33 6 09 82 88 04', status: 'available', position: { lat: 48.8566, lng: 2.3522 } },
    { id: 'agent-1', name: 'Agent Alban', phone: '+33 6 28 13 16 22', status: 'enroute', position: { lat: 48.8698, lng: 2.3079 } },
    { id: 'agent-2', name: 'Léa Fontaine', phone: '+33 6 77 41 09 88', status: 'onsite', position: { lat: 48.8443, lng: 2.3743 } },
    { id: 'agent-3', name: 'Karim Belhadj', phone: '+33 6 12 55 34 21', status: 'available', position: { lat: 48.8809, lng: 2.36 } },
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
          a.position = { lat: a.position.lat + Math.cos(heading[i]!) * 0.00015, lng: a.position.lng + Math.sin(heading[i]!) * 0.00015 }
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

// Couleur par type — source unique pour le thème (sprites) et les parts de cluster.
const TYPE_COLORS: Record<string, string> = {
  'alert-critical': '#4d0218',
  'alert-high': '#ef4444',
  'alert-medium': '#f59e0b',
  'alert-low': '#3b82f6',
  'agent-available': '#22c55e',
  'agent-enroute': '#06b6d4',
  'agent-onsite': '#8b5cf6',
}

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
const PLACES: SearchResult[] = [
  { name: 'Tour Eiffel', description: 'Paris 7e', lat: 48.8584, lng: 2.2945 },
  { name: 'La Défense', description: 'Hauts-de-Seine', lat: 48.8918, lng: 2.2385 },
  { name: 'New York', description: 'USA', lat: 40.7128, lng: -74.006 },
]

// TEMP: panneau de test des fonds 2D Google (à retirer après validation).
function BasemapTestPanel() {
  const engine = useMap()
  // Accès console au moteur pour vérifier la précision (pick/projection) en live.
  useEffect(() => {
    ;(window as unknown as { m3d?: unknown }).m3d = engine
  }, [engine])
  const [mode, setMode] = useState<MapMode>('3d')
  const [traffic, setTraffic] = useState(false)
  const pick = (m: MapMode) => {
    setMode(m)
    engine.setMapMode(m)
    // Le trafic n'existe qu'en 2D : on le coupe en repassant en 3D.
    if (m === '3d' && traffic) {
      setTraffic(false)
      engine.setTrafficVisible(false)
    }
  }
  const toggleTraffic = () => {
    const v = !traffic
    setTraffic(v)
    engine.setTrafficVisible(v)
  }
  const btn = (active: boolean): CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--m3d-border)',
    background: active ? 'var(--m3d-accent)' : 'var(--m3d-panel)',
    color: active ? '#fff' : 'var(--m3d-text)',
    cursor: 'pointer',
    fontSize: 13,
  })
  return (
    <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: 6, padding: 6, background: 'var(--m3d-panel)', border: '1px solid var(--m3d-border)', borderRadius: 12, backdropFilter: 'blur(20px)' }}>
      <button style={btn(mode === '3d')} onClick={() => pick('3d')}>3D</button>
      <button style={btn(mode === 'plan')} onClick={() => pick('plan')}>Plan</button>
      {mode !== '3d' && (
        <button style={btn(traffic)} onClick={toggleTraffic}>Trafic</button>
      )}
    </div>
  )
}

function MapDemo() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<string>()
  const [followed, setFollowed] = useState<string>()
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

  const agentMarkers: MarkerData<Agent>[] = agents.map((a) => ({ id: a.id, type: `agent-${a.status}`, tags: AGENT_TAGS[a.status], position: a.position, data: a }))

  const alertMenu = (m: MarkerData<Alert>): MenuItem[] => [
    { icon: '↗', label: 'Ouvrir la fiche', onSelect: () => console.info('fiche', m.data.id) },
    { icon: '⇢', label: 'Assigner un agent', children: agents.map((a) => ({ label: a.name, onSelect: () => console.info('assign', a.id) })) },
    { icon: '⚑', label: 'Signaler', children: [{ label: 'N’existe plus' }, { label: 'Mauvaise position' }] },
  ]

  // Alertes + agents dans un SEUL layer → clusterisés ensemble (comme la référence).
  type AnyData = Alert | Agent
  const allMarkers: MarkerData<AnyData>[] = [...ALERTS, ...agentMarkers]
  // Couleur d'un type = EXACTEMENT celle que le thème met dans `colors.marker`
  // → marqueurs (sprites) et parts de cluster partagent la même source.
  const typeColor = (t: string): string => TYPE_COLORS[t] ?? '#64748b'
  const iconInner = (t: string): string =>
    t.startsWith('agent') ? (AGENT_INNER[t] ?? SHIELD) : glyph(t === 'alert-low' ? 'i' : '!')
  const iconFor = (m: MarkerData<AnyData>): string => badge(typeColor(m.type), iconInner(m.type))
  // Icône + libellé par type pour les satellites du cluster (survol = label).
  const CLUSTER_LABEL: Record<string, string> = {
    'alert-critical': 'Critique', 'alert-high': 'Élevée', 'alert-medium': 'Moyenne', 'alert-low': 'Info',
    'agent-available': 'Agent disponible', 'agent-enroute': 'Agent en route', 'agent-onsite': 'Agent sur place',
  }
  const clusterTypeLabel = (t: string): string => CLUSTER_LABEL[t] ?? t
  const clusterTypeIcon = (t: string): ReactNode => {
    if (t === 'agent-onsite') return <circle cx={12} cy={12} r={4} fill="currentColor" />
    if (t.startsWith('agent'))
      return <path d="M12 4.2l7 2.45v4.3c0 4.2-2.95 7.15-7 8.35-4.05-1.2-7-4.15-7-8.35V6.65z" fill="currentColor" />
    return (
      <text x={12} y={12.5} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={800} fill="currentColor">
        {t === 'alert-low' ? 'i' : '!'}
      </text>
    )
  }
  const menuFor = (m: MarkerData<AnyData>): MenuItem[] =>
    m.type.startsWith('alert') ? alertMenu(m as MarkerData<Alert>) : []
  const popupFor = (m: MarkerData<AnyData>) => {
    if (m.type.startsWith('agent')) {
      const a = m.data as Agent
      return (
        <div>
          <strong>{a.name}</strong>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{a.phone}</div>
        </div>
      )
    }
    const al = m.data as Alert
    return (
      <div>
        <strong>{al.title}</strong>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Sévérité : {al.severity}</div>
      </div>
    )
  }

  return (
    <Map
      googleMapsApiKey={GOOGLE_MAPS_KEY || undefined}
      cesiumIonToken={CESIUM || undefined}
      center={PARIS}
      zoom={14}
      fallbackGlobe
    >
      <ShapeLayer shapes={[{ kind: 'circle', center: PARIS, radiusMeters: 6000, color: ZONE_STROKE, fillOpacity: 0.1 }]} />

      <MarkerLayer<AnyData>
        points={allMarkers}
        getId={(m) => m.id}
        cluster={{ enabled: true, radius: 60 }}
        selectedId={selected}
        followId={followed}
        onSelect={(m) => {
          if (!m.type.startsWith('agent')) return
          setSelected(String(m.id))
          setFollowed((cur) => (cur === m.id ? undefined : String(m.id)))
        }}
        size={44}
        icon={iconFor}
        clusterTypeIcon={clusterTypeIcon}
        clusterTypeLabel={clusterTypeLabel}
        menu={menuFor}
        renderPopup={popupFor}
      />

      <DrawLayer
        value={LOCKED_ZONE}
        onChange={(g) => console.log('[draw] change — GeoJSON complet (ce que reçoit l’API) :', g)}
        onSelectionChange={(ids) => console.log('[draw] selection', ids)}
      >
        <DrawToolbar />
        <DrawDebug />
      </DrawLayer>

      <MapControls position="right" />
      <BasemapTestPanel />
      <SearchBox onSelect={() => {}} search={(q) => Promise.resolve(PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())))} />
    </Map>
  )
}

/**
 * Zone imposée « par l'API » : `locked` → ni sélection, ni édition, ni gomme, ni
 * « Tout effacer ». Clic dessus = flash cadenas. Pour la déverrouiller depuis la
 * console : `drawApi.unlock(['draw-0'])` (les ids sont dans les logs de sélection).
 */
const LOCKED_ZONE: GeoJSONFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.335, 48.868],
            [2.352, 48.868],
            [2.352, 48.876],
            [2.335, 48.876],
            [2.335, 48.868],
          ],
        ],
      },
      properties: {
        kind: 'polygon',
        color: '#d11a01',
        width: 4,
        fillOpacity: 0.12,
        stroke: 'dashed',
        locked: true,
        tags: ['draw', 'zone-interdite'],
      },
    },
  ],
}

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
  })
  return null
}

export function App() {
  return (
    <MapProvider theme={theme} colorScheme="dark">
      <div style={{ width: '100%', height: '100%' }}>
        <MapDemo />
      </div>
    </MapProvider>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>)
