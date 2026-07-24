import { StrictMode, type ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  type DrawTool,
  DrawLayer,
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
  defaultTheme,
  mergeTheme,
  useDrawing,
} from 'map3d'

const ENV = (import.meta as { env?: { VITE_CESIUM_ION_TOKEN?: string } }).env
const CESIUM = ENV?.VITE_CESIUM_ION_TOKEN

/* ══════════════════ DATA — juste des lat/lng réels (Paris) ══════════════════ */

const PARIS = { lat: 48.8566, lng: 2.3522 }
type Severity = 'critical' | 'high' | 'medium' | 'low'
type Alert = { id: number; severity: Severity; title: string }
type Agent = { id: string; name: string; phone: string; status: 'available' | 'enroute' | 'onsite'; position: { lat: number; lng: number } }

// Alertes = points réels de Paris, un lat/lng par alerte. Rien de calculé.
const ALERTS: MarkerData<Alert>[] = [
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
]

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

// Icônes SVG (mêmes tracés que la référence globe-tools-v2.html).
const Svg = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)
const TOOL_ICON: Record<string, ReactNode> = {
  pan: (
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  line: (
    <>
      <path d="M4 20L20 4" />
      <circle cx="4" cy="20" r="2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  polygon: <path d="M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z" />,
  rect: <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />,
  circle: <circle cx="12" cy="12" r="8.5" />,
  freehand: <path d="M3 17c3-6 5.5 4 8.5-1.5S17 6 21 8" />,
  arrow: <path d="M4 20L19 5M19 5h-7M19 5v7" />,
  measure: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="1.5" />
      <path d="M7 8v3M12 8v4M17 8v3" />
    </>
  ),
  erase: <path d="M4 20h16M13.5 4.5l6 6-8 8H6l-2-2z" />,
  undo: <path d="M3 8h11a5.5 5.5 0 0 1 0 11H8M3 8l4-4M3 8l4 4" />,
  clear: <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v7M14 10v7" />,
}

function DrawToolbar() {
  const { tool, setTool, undo, clear } = useDrawing()
  const drawTools: Array<[DrawTool, string]> = [
    ['line', 'Ligne'], ['polygon', 'Polygone'], ['rect', 'Rectangle'], ['circle', 'Cercle'],
    ['freehand', 'Main levée'], ['arrow', 'Flèche'], ['measure', 'Mesurer'],
  ]
  const btn = { width: 40, height: 40 } as const
  const Sep = () => <div style={{ height: 1, background: 'var(--m3d-border)', margin: '4px 7px' }} />
  return (
    <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 2, padding: 6, background: 'var(--m3d-panel)', border: '1px solid var(--m3d-border)', borderRadius: 14, backdropFilter: 'blur(20px)' }}>
      <button title="Naviguer" className={`m3d-btn${tool === null ? ' m3d-on' : ''}`} style={btn} onClick={() => setTool(null)}>
        <Svg d={TOOL_ICON.pan} />
      </button>
      <Sep />
      {drawTools.map(([t, label]) => (
        <button key={t} title={label} className={`m3d-btn${tool === t ? ' m3d-on' : ''}`} style={btn} onClick={() => setTool(tool === t ? null : t)}>
          <Svg d={TOOL_ICON[t]} />
        </button>
      ))}
      <Sep />
      <button title="Effacer" className={`m3d-btn${tool === 'erase' ? ' m3d-on' : ''}`} style={btn} onClick={() => setTool(tool === 'erase' ? null : 'erase')}>
        <Svg d={TOOL_ICON.erase} />
      </button>
      <button className="m3d-btn" title="Annuler" style={btn} onClick={undo}>
        <Svg d={TOOL_ICON.undo} />
      </button>
      <button className="m3d-btn" title="Tout effacer" style={btn} onClick={clear}>
        <Svg d={TOOL_ICON.clear} />
      </button>
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

  const agentMarkers: MarkerData<Agent>[] = agents.map((a) => ({ id: a.id, type: `agent-${a.status}`, position: a.position, data: a }))

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

      <DrawLayer onChange={(g) => console.info('[map3d] GeoJSON', g.features.length, 'features')}>
        <DrawToolbar />
      </DrawLayer>

      <MapControls position="right" />
      <SearchBox onSelect={() => {}} search={(q) => Promise.resolve(PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())))} />
    </Map>
  )
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
