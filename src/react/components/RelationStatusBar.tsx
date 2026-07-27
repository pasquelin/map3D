import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatLabel } from '../../labels/mergeLabels'
import { makeDistanceFormatter, makeLinkLabelFormatter } from '../../labels/measure'
import type { RelationSnapshot } from '../../relations/core/engine'
import type { MapPoint, TravelMode } from '../../relations/core/types'
import { useLabels } from '../context'
import { useRelations } from '../hooks/useRelations'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useNudgeInside } from './panelFit'
import { useDismiss } from './useDismiss'
import { RemoveButton } from './RemoveButton'

export type RelationStatusBarProps = {
  /** Nom lisible d'un point — l'application seule sait le produire (défaut : son id). */
  nameOf?: (point: MapPoint) => string
}

const MODES: readonly TravelMode[] = ['DRIVE', 'WALK', 'BICYCLE', 'TWO_WHEELER', 'TRANSIT']

/** Segments pilotables de la barre. */
type Segment = 'mode' | 'family'
/** Quel segment porte un menu ouvert ? Un seul à la fois. */
type OpenSegment = Segment | null

/**
 * Barres d'état des relations actives : **une par relation**, ancrée au socle de son
 * marker source. Elles ne se contentent pas d'informer — chaque segment est le point
 * d'entrée pour changer ce qu'il décrit (mode de transport, famille de tags), et la
 * croix efface la relation.
 *
 * Ancrées plutôt que flottantes : une barre posée dans un coin de l'écran oblige à
 * faire l'aller-retour entre le marker qu'on regarde et la commande qui le pilote, et
 * ne dit pas DE QUELLE relation elle parle quand plusieurs sont ouvertes. Ici la
 * commande est à l'endroit exact où le regard se trouve déjà.
 */
export function RelationStatusBar({ nameOf }: RelationStatusBarProps) {
  const { snapshots, hubHosts } = useRelations()
  return (
    <>
      {snapshots.map((snapshot) => {
        const host = hubHosts.get(snapshot.source.id)
        // Le socle n'est pas encore monté (première frame après l'ouverture) : la
        // barre apparaîtra au rendu suivant, avec son ancre.
        if (!host) return null
        return createPortal(
          <RelationBar snapshot={snapshot} nameOf={nameOf} />,
          host,
          snapshot.source.id,
        )
      })}
    </>
  )
}

type BarProps = {
  snapshot: RelationSnapshot
  nameOf?: (point: MapPoint) => string
}

function RelationBar({ snapshot, nameOf }: BarProps) {
  const labels = useLabels()
  const { rules, setMode, clear, untrace, run, routeColor, familyColor } = useRelations()
  const { source, rule, links } = snapshot
  /**
   * Lien dont l'itinéraire est affiché. Sa présence change ce que la barre DÉCRIT :
   * tant qu'aucun n'est tracé elle parle d'une sélection (une famille de cibles, une
   * étendue) ; dès qu'un itinéraire est à l'écran, elle parle de CE trajet. Continuer
   * d'afficher le sélecteur de famille et le nombre de cibles proposerait alors de
   * refaire un choix déjà fait.
   */
  const traced = snapshot.tracedLinkId
    ? (snapshot.links.find((l) => l.id === snapshot.tracedLinkId) ?? null)
    : null
  const [open, setOpen] = useState<OpenSegment>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // `captureEscape` est indispensable ici : `RelationLayer` écoute Échap au niveau
  // window pour effacer les relations. Sans capture, refermer un menu de segment
  // effacerait la relation entière et ferait disparaître la barre.
  useDismiss(barRef, open !== null, () => setOpen(null), { wheel: true, captureEscape: true })
  // Anti-collision : la barre bascule de l'autre côté du socle quand le bord du
  // conteneur est trop proche, et se rabat verticalement s'il le faut. Le hook suit
  // aussi le socle par frame — la carte bouge sous la barre en permanence.
  const [flipped, setFit] = useNudgeInside(true)
  const distance = useMemo(() => makeDistanceFormatter(labels.measure), [labels])
  const formatLink = useMemo(() => makeLinkLabelFormatter(labels), [labels])

  const modeItems = useMemo(
    (): MenuItem[] =>
      MODES.map((mode) => ({
        label: labels.relations.modes[mode],
        ...(rule.mode === mode ? { icon: '✓' } : {}),
        onSelect: () => setMode(source.id, mode),
      })),
    [labels, rule.mode, setMode, source.id],
  )

  // Bascule de famille : la sélection courante est conservée, seule la cible change.
  const familyItems = useMemo(
    (): MenuItem[] =>
      rules.map((r) => ({
        label: r.label,
        // Couleur de la FAMILLE, comme les pastilles du menu du marker — pas celle du
        // trait : ces entrées distinguent des familles entre elles.
        swatch: familyColor(r),
        ...(r.id === rule.id ? { icon: '✓' } : {}),
        onSelect: () => run(source, { ...r, mode: rule.mode, selection: rule.selection }),
      })),
    [rules, rule, run, source, familyColor],
  )

  const nameFor = (p: MapPoint): string => (nameOf ? nameOf(p) : p.id)
  const name = nameFor(source)
  // Le gabarit de titre est le même dans les deux états : ce qui change n'est pas la
  // forme (« source → destination ») mais ce que désigne la destination — une famille
  // de cibles, ou la cible retenue.
  const title = formatLabel(labels.relations.statusRelation, {
    source: name,
    targets: traced ? nameFor(traced.to) : rule.label,
  })
  // Étendue de la sélection, ou mesures du trajet choisi — même emplacement, car les
  // deux répondent à « de quoi parle-t-on, et jusqu'où ». Le formateur d'étiquette de
  // lien est celui des tracés sur la carte : les mêmes chiffres s'y lisent pareil.
  const scope = traced
    ? formatLink(traced.distanceMeters, traced.durationSeconds, traced.status === 'unavailable')
    : rule.selection.mode === 'fastest'
      ? formatLabel(labels.relations.fastest, { count: rule.selection.count ?? links.length })
      : formatLabel(labels.relations.radius, {
          radius: distance(rule.selection.radiusMeters ?? rule.selection.maxMeters),
        })

  /**
   * Segment cliquable : bouton et menu sont FRÈRES, jamais imbriqués.
   *
   * Un `<div role="menuitem" tabindex="0">` placé dans un `<button>` est du contenu
   * interactif dans un contrôle interactif — donc du HTML invalide, mais surtout : le
   * nom accessible d'un bouton se calcule depuis son contenu textuel. Menu ouvert, le
   * bouton « Agents » s'annoncerait « Agents Agents Les plus rapides Les 3 plus… » aux
   * lecteurs d'écran. Le wrapper porte le positionnement, le bouton reste nu.
   */
  const segment = (segId: Segment, text: string, items: MenuItem[]) => {
    const menuId = `m3d-relbar-${source.id}-${segId}`
    return (
      <span className="m3d-relbar-segwrap">
        <button
          type="button"
          className="m3d-relbar-seg"
          aria-haspopup="menu"
          aria-expanded={open === segId}
          aria-controls={open === segId ? menuId : undefined}
          onClick={() => setOpen((c) => (c === segId ? null : segId))}
        >
          {text}
        </button>
        {open === segId && (
          <span className="m3d-relbar-menu" id={menuId}>
            <ContextMenu items={items} onClose={() => setOpen(null)} />
          </span>
        )}
      </span>
    )
  }

  return (
    <div
      ref={(el) => {
        barRef.current = el
        setFit(el)
      }}
      className={`m3d-relbar${flipped ? ' m3d-flip' : ''}`}
    >
      {/* La pastille porte la couleur de ce qui est RÉELLEMENT à l'écran : celle de la
          famille tant qu'on voit ses liens, celle de l'itinéraire dès qu'il est tracé.
          Sinon elle continue d'annoncer une famille alors que le tracé, lui, a changé
          de couleur — et rien ne relie plus la barre à ce qu'elle décrit. */}
      <span className="m3d-relbar-swatch" style={{ background: traced ? routeColor : familyColor(rule) }} />
      {/* Région live restreinte au TEXTE d'état : la poser sur toute la barre faisait
          réannoncer les boutons et le menu ouvert à chaque changement de relation. */}
      <span className="m3d-relbar-text" role="status">
        {title}
      </span>

      {/* Le choix de la famille disparaît une fois l'itinéraire tracé : la cible est
          arrêtée. Le mode de transport, lui, reste — c'est le même trajet autrement. */}
      {!traced && segment('family', rule.label, familyItems)}
      {segment('mode', labels.relations.modes[rule.mode], modeItems)}

      <span className="m3d-relbar-scope">{scope}</span>

      {/* Ferme ce qu'on REGARDE, par paliers : l'itinéraire d'abord, la relation
          ensuite — exactement ce que fait déjà Échap, et le seul moyen de revenir aux
          cibles depuis un tracé maintenant que celui-ci ne porte plus de croix.
          Même bouton que partout ailleurs dans la lib : fermer doit se présenter
          pareil où qu'on le fasse. */}
      <RemoveButton
        label={traced ? labels.relations.removeRoute : labels.relations.clear}
        onRemove={() => (traced ? untrace(traced.id) : clear(source.id))}
      />
    </div>
  )
}
