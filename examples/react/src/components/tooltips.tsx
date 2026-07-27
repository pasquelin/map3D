import type { ClusterInfo, MarkerData } from 'map3d'
import type { CSSProperties, ReactNode } from 'react'

import { typeColor } from '../config/colors'
import { STATUS_LABEL, clusterTypeLabel, markerLabel } from '../config/labels'
import { CONTROL_POINT_ID } from '../data/alerts'
import { type Agent, type Alert, type AnyData, isAgentMarker, isDefibMarker } from '../data/types'

/** Ce qu'attend `tooltip` / `clusterTooltip` : titre et contenu, tous deux optionnels. */
type TipContent = { title?: ReactNode; content?: ReactNode }

/** Nombre de membres listés dans l'infobulle d'un cluster avant le « +N autres ». */
const CLUSTER_TIP_MAX = 6

const dotStyle = (color: string): CSSProperties => ({ width: 7, height: 7, borderRadius: '50%', background: color, flex: 'none' })

/** Une info par ligne (classe `m3d-markertip-row` de la lib), pastille optionnelle. */
function TipRow({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <div className="m3d-markertip-row">
      {color && <span style={dotStyle(color)} />}
      <span>{children}</span>
    </div>
  )
}

/** Initiales sur pastille colorée — le titre d'un agent. */
function AgentTitle({ agent, color }: { agent: Agent; color: string }) {
  const initials = agent.name
    .split(' ')
    .map((p) => p[0])
    .join('')
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          flex: 'none',
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9.5,
          fontWeight: 800,
        }}
      >
        {initials}
      </span>
      {agent.name}
    </span>
  )
}

/**
 * Infobulle au survol — démontre toutes les possibilités : titre seul (alertes
 * basses), titre + contenu riche (agents : avatar, tél, statut coloré), et `null` =
 * pas d'infobulle (le point de contrôle).
 */
export const markerTip = (m: MarkerData<AnyData>): TipContent | null => {
  if (m.data.id === CONTROL_POINT_ID) return null
  const color = typeColor(m.type)

  if (isAgentMarker(m)) {
    const a = m.data
    return {
      title: <AgentTitle agent={a} color={color} />,
      content: (
        <>
          <TipRow color={color}>{STATUS_LABEL[a.status]}</TipRow>
          <TipRow>{a.phone}</TipRow>
        </>
      ),
    }
  }

  // Décor : ce qu'on veut savoir d'un défibrillateur tient en deux lignes — où il
  // est, et s'il est accessible sans passer une porte.
  if (isDefibMarker(m)) {
    const d = m.data
    return {
      title: d.title,
      content: (
        <>
          <TipRow color={color}>{d.access === 'public' ? 'Accès libre' : 'À l’intérieur'}</TipRow>
          <TipRow>{d.address}</TipRow>
        </>
      ),
    }
  }

  const al = m.data as Alert
  // Sévérité basse : titre + adresse. Sinon on ajoute sévérité, urgence et état.
  if (al.severity === 'low') return { title: al.title, content: <TipRow>{al.address}</TipRow> }
  return {
    title: al.title,
    content: (
      <>
        <TipRow color={color}>{clusterTypeLabel(m.type)}</TipRow>
        <TipRow>{al.address}</TipRow>
        {m.urgent && <TipRow>Intervention immédiate</TipRow>}
        {m.new && <TipRow>Non traitée</TipRow>}
      </>
    ),
  }
}

/**
 * Infobulle de CLUSTER : liste le contenu réel (feuilles fournies par la lib).
 *
 * `members` est en `MarkerData` NU, sans donnée typée : une pastille agrège ce qui se
 * superpose à l'écran, donc potentiellement des markers de plusieurs couches — ici les
 * alertes/agents de l'app ET les symboles posés dans la couche de dessin. Rien ne
 * garantit un `data` commun ; on ne lit donc que ce que porte tout marker.
 */
export const clusterTip = (c: ClusterInfo, members: MarkerData[], segmentType?: string): TipContent => {
  const n = segmentType ? (c.counts[segmentType] ?? members.length) : c.total
  const label = segmentType ? clusterTypeLabel(segmentType, n) : n > 1 ? 'éléments' : 'élément'
  return {
    title: `${n} ${label}`,
    content: (
      <>
        {members.slice(0, CLUSTER_TIP_MAX).map((m) => (
          <TipRow key={String(m.id)} color={typeColor(m.type)}>
            {markerLabel(m)}
          </TipRow>
        ))}
        {members.length > CLUSTER_TIP_MAX && <TipRow>+{members.length - CLUSTER_TIP_MAX} autres</TipRow>}
      </>
    ),
  }
}
