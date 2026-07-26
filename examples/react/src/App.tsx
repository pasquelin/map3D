import { StrictMode, type ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  type ClusterInfo,
  DrawLayer,
  Toolbar,
  LensLayer,
  LensToolButton,
  Map,
  MapControls,
  MapProvider,
  MarkerLayer,
  type MapTheme,
  type MarkerColor,
  type MarkerData,
  type MenuItem,
  PinnedDock,
  SearchBox,
  SelectionBadges,
  ShapeLayer,
  defaultTheme,
  mergeTheme,
  useDrawing,
  useDrawSettings,
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
// Démo des flags d'attention — toutes les combinaisons :
//   #1 `urgent` (viseur rouge), #5 `new` (sonar, éteint au clic),
//   #6 les deux flags → le viseur PRIME (le sonar n'apparaît pas).
const ALERTS = ([
  { id: 99, type: 'alert-critical', position: TEST_POINT, data: { id: 99, severity: 'critical', title: 'Point de contrôle précision' } },
  { id: 1, type: 'alert-critical', urgent: true, position: { lat: 48.8606, lng: 2.3376 }, data: { id: 1, severity: 'critical', title: 'Intrusion — Louvre' } },
  { id: 2, type: 'alert-high', position: { lat: 48.853, lng: 2.3499 }, data: { id: 2, severity: 'high', title: 'Malaise — Notre-Dame' } },
  { id: 3, type: 'alert-medium', position: { lat: 48.8584, lng: 2.2945 }, data: { id: 3, severity: 'medium', title: 'Colis suspect — Tour Eiffel' } },
  { id: 4, type: 'alert-low', position: { lat: 48.8738, lng: 2.295 }, data: { id: 4, severity: 'low', title: 'Tapage — Arc de Triomphe' } },
  { id: 5, type: 'alert-high', new: true, position: { lat: 48.8809, lng: 2.3553 }, data: { id: 5, severity: 'high', title: 'Vol — Gare du Nord' } },
  { id: 6, type: 'alert-critical', new: true, urgent: true, position: { lat: 48.8532, lng: 2.369 }, data: { id: 6, severity: 'critical', title: 'Bagarre — Bastille' } },
  { id: 7, type: 'alert-medium', position: { lat: 48.8867, lng: 2.3431 }, data: { id: 7, severity: 'medium', title: 'Accident — Montmartre' } },
  { id: 8, type: 'alert-low', position: { lat: 48.8462, lng: 2.3464 }, data: { id: 8, severity: 'low', title: 'Signalement — Panthéon' } },
  { id: 9, type: 'alert-high', position: { lat: 48.8615, lng: 2.3934 }, data: { id: 9, severity: 'high', title: 'Malaise — Père-Lachaise' } },
  { id: 10, type: 'alert-medium', position: { lat: 48.8616, lng: 2.287 }, data: { id: 10, severity: 'medium', title: 'Colis — Trocadéro' } },
  // Même position EXACTE que #2 (Notre-Dame) : cluster inséparable quel que soit
  // le zoom — cas de test du comportement « cluster au zoom max ».
  { id: 11, type: 'alert-low', position: { lat: 48.853, lng: 2.3499 }, data: { id: 11, severity: 'low', title: 'Second signalement — Notre-Dame' } },
] satisfies MarkerData<Alert>[]).map((a) => ({ ...a, tags: ['alert', a.data.severity] }))

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

function MapDemo() {
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

  const agentMarkers: MarkerData<Agent>[] = agents.map((a) => ({ id: a.id, type: `agent-${a.status}`, tags: AGENT_TAGS[a.status], avatar: AGENT_AVATARS[a.id], position: a.position, data: a }))

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
  // Éléments épinglés : résolus depuis les ids stockés + les données courantes.
  const pinnedLabel = (m: MarkerData<AnyData>): string =>
    m.type.startsWith('agent') ? (m.data as Agent).name : (m.data as Alert).title
  // Titre d'une ligne de marker (nom métier), PARTAGÉ par la loupe et le panneau de
  // sélection (MarkerList commun). Pastille/avatar + sous-titre (type) sont automatiques.
  const renderMarkerRow = (m: MarkerData): ReactNode =>
    m.type.startsWith('agent') ? (m.data as Agent).name : (m.data as Alert).title
  const pinnedItems = pinnedIds
    .map((id) => allMarkers.find((m) => String(m.id) === id))
    .filter((m): m is MarkerData<AnyData> => !!m)
    .map((m) => ({ id: m.id, position: m.position, type: m.type, label: pinnedLabel(m), avatar: m.avatar, icon: iconDataUri(m), data: m }))
  // Icône + libellé par type pour les satellites du cluster (survol = label).
  const CLUSTER_LABEL: Record<string, string> = {
    'alert-critical': 'Critique', 'alert-high': 'Élevée', 'alert-medium': 'Moyenne', 'alert-low': 'Info',
    'agent-available': 'Agent disponible', 'agent-enroute': 'Agent en route', 'agent-onsite': 'Agent sur place',
  }
  const CLUSTER_LABEL_PLURAL: Record<string, string> = {
    'alert-critical': 'Critiques', 'alert-high': 'Élevées', 'alert-medium': 'Moyennes', 'alert-low': 'Infos',
    'agent-available': 'Agents disponibles', 'agent-enroute': 'Agents en route', 'agent-onsite': 'Agents sur place',
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
  const menuFor = (m: MarkerData<AnyData>): MenuItem[] =>
    m.type.startsWith('alert') ? alertMenu(m as MarkerData<Alert>) : agentMenu(m as MarkerData<Agent>)
  // Infobulle au survol — démontre toutes les possibilités : title seul (alertes
  // basses), title + content riche (agents : avatar, tél, statut coloré),
  // et `null` = pas d'infobulle (point de contrôle #99).
  const STATUS_LABEL: Record<Agent['status'], string> = { available: 'Disponible', enroute: 'En route', onsite: 'Sur site' }
  const tipFor = (m: MarkerData<AnyData>) => {
    if (m.data.id === 99) return null
    if (m.type.startsWith('agent')) {
      const a = m.data as Agent
      return {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 20, height: 20, borderRadius: '50%', flex: 'none',
                background: typeColor(m.type), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9.5, fontWeight: 800,
              }}
            >
              {a.name.split(' ').map((p) => p[0]).join('')}
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
            <div className="m3d-markertip-row"><span>{a.phone}</span></div>
            <div className="m3d-markertip-row"><span>{CLUSTER_LABEL[m.type]}</span></div>
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
          {m.urgent && <div className="m3d-markertip-row"><span>Intervention immédiate</span></div>}
          {m.new && <div className="m3d-markertip-row"><span>Non traitée</span></div>}
        </>
      ),
    }
  }
  // Infobulle de CLUSTER : liste le contenu réel (feuilles fournies par la lib).
  const memberLabel = (m: MarkerData<AnyData>): string =>
    m.type.startsWith('agent') ? (m.data as Agent).name : (m.data as Alert).title
  const clusterTipFor = (c: ClusterInfo, members: MarkerData<AnyData>[], segmentType?: string) => {
    const n = segmentType ? (c.counts[segmentType] ?? members.length) : c.total
    const label = segmentType
      ? (n > 1 ? CLUSTER_LABEL_PLURAL[segmentType] : CLUSTER_LABEL[segmentType]) ?? segmentType
      : n > 1 ? 'éléments' : 'élément'
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
            <div className="m3d-markertip-row"><span>+{members.length - 6} autres</span></div>
          )}
        </>
      ),
    }
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
          // Clic = sélection ; le suivi caméra passe par le menu « Suivre ».
          setSelected(String(m.id))
        }}
        size={44}
        // Pastille visible = 58/80 du sprite (r=29 dans un viewBox 80) → anneau collé.
        selectionRing={Math.round(44 * (58 / 80)) + 2}
        icon={iconFor}
        draggable
        clusterTypeIcon={clusterTypeIcon}
        clusterTypeLabel={clusterTypeLabel}
        menu={menuFor}
        tooltip={tipFor}
        clusterTooltip={clusterTipFor}
      />

      {/* Favoris : long-press sur un marker → glisser dans la barre du bas.
          Clic sur une pastille = vol caméra + sélection. × ou glisser-hors = retrait. */}
      <PinnedDock<MarkerData<AnyData>>
        items={pinnedItems}
        size={88}
        onPin={(p) => savePins([...new Set([...pinnedIds, String(p.id)])])}
        onUnpin={(id) => savePins(pinnedIds.filter((x) => x !== String(id)))}
        onPinClick={(item) => setSelected(String(item.id))}
        tooltip={(item) => tipFor(item.data!)}
      />

      <DrawLayer
        // Zone verrouillée de démo désactivée : elle affichait un rectangle rouge
        // permanent qu'on pouvait confondre avec la zone de la loupe. Remettre
        // `value={LOCKED_ZONE}` pour retrouver la démo de forme verrouillée.
        onChange={(g) => console.log('[draw] change — GeoJSON complet (ce que reçoit l’API) :', g)}
        onSelectionChange={(ids, markerIds) => console.log('[draw] selection', ids, markerIds)}
      >
        {/* Loupe : trace une zone → liste TOUS les markers dedans (clusters inclus).
            La liste (MarkerList) est partagée avec le panneau de sélection.
            « Cibler » est natif ; l'action « Ouvrir la fiche » démontre le dropdown. */}
        <LensLayer<AnyData>
          getId={(m) => m.id}
          markerTypeLabel={clusterTypeLabel}
          renderItem={renderMarkerRow}
          actions={[{ id: 'sheet', label: 'Ouvrir la fiche', run: (m) => console.info('fiche', m.id) }]}
        >
          <Toolbar extraTools={<LensToolButton />} />
          {/* Badges de sélection : formes groupées + markers en liste (MarkerList partagée). */}
          <SelectionBadges
            markerTypeLabel={clusterTypeLabel}
            renderMarker={renderMarkerRow}
            markerActions={[{ id: 'sheet', label: 'Ouvrir la fiche', run: (m) => console.info('fiche', m.id) }]}
          />
          <DrawDebug />
        </LensLayer>
      </DrawLayer>

      {/* Le groupe « fond de carte » (3D / plan / trafic) est fourni par la barre
          elle-même, et masqué si aucune clé Google n'est configurée. */}
      <MapControls position="right" />
      {/* Sans prop `search` : Google Places via la clé de <Map googleMapsApiKey>. */}
      <SearchBox />
    </Map>
  )
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
