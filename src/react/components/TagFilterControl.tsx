import { mdiFilterRemoveOutline, mdiLayersOutline, mdiMagnify } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeSearch } from '../../search/match'
import { useLabels, useMapContext } from '../context'
import { useTags, useTagSelection } from '../hooks/useTags'
import { useAnchoredPanel } from './panelFit'
import { plainKey } from './shortcuts'
import { ToolButton } from './ToolButton'
import { useDismiss } from './useDismiss'
import { useTip } from './tooltip'
import { tagColorOf } from '../../theme/colors'

export type TagFilterControlProps = {
  /** Côté de la barre hôte : le panneau s'ouvre du côté opposé. */
  position?: 'left' | 'right'
  /** id du `<Tooltip>` partagé de la barre hôte (MapControls). */
  tipId?: string
  /** Touche (lettre seule) qui ouvre/ferme le panneau — affichée dans le tooltip. `false` = aucun raccourci. */
  shortcut?: string | false
  /** Libellé lisible d'un tag dans le panneau (défaut : le tag brut). */
  tagLabel?: (tag: string) => string
}

/**
 * Bouton « Couches » : filtre les éléments de la carte (markers, dessins) par tag.
 * Le panneau liste les tags réellement présents (registre de `engine.tags`) avec
 * recherche, checkbox, pastille couleur (`theme.colors.tags`, sinon palette
 * hashée) et compteur. Un badge sur le bouton indique le nombre de tags actifs.
 * La sélection est persistée (localStorage) par `TagFilter`.
 *
 * Le bouton ne suit que la sélection ; le panneau (abonné au registre) n'est
 * monté qu'ouvert — panneau fermé, les évolutions de compteurs des flux temps
 * réel ne re-rendent rien.
 */
export function TagFilterControl({ position = 'right', tipId, shortcut, tagLabel }: TagFilterControlProps) {
  const tags = useTagSelection()
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Raccourci d'ouverture/fermeture du panneau (lettre seule, hors champ de saisie).
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (plainKey(e) !== shortcut) return
      // Sans preventDefault, la lettre du raccourci serait insérée dans le champ
      // de recherche que l'ouverture vient de focaliser (autoFocus synchrone).
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  // Fermeture au clic hors panneau ou Échap.
  useDismiss(rootRef, open, () => setOpen(false))

  const active = tags.selected.size
  const label = labels.tags.button
  // Hook appelé inconditionnellement (règles des hooks) ; c'est le PASSAGE du tip
  // au bouton qui est conditionné par la présence d'une barre hôte.
  const tip = useTip(tipId ?? '')

  return (
    <div className="m3d-controls-group m3d-tags" ref={rootRef}>
      {/* `tipId` absent (bouton monté hors d'une barre hôte) : `ToolButton` retombe
          sur l'aria-label seul — le nom accessible reste porté. */}
      <ToolButton
        icon={mdiLayersOutline}
        label={label}
        tip={tipId ? tip : undefined}
        shortcut={shortcut}
        active={active > 0}
        className="m3d-tagbtn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {active > 0 && <span className="m3d-tag-badge">{active}</span>}
      </ToolButton>
      {open && <TagPanel position={position} tagLabel={tagLabel} />}
    </div>
  )
}

/** Contenu du panneau — monté uniquement ouvert (seul abonné au registre des tags). */
function TagPanel({ position, tagLabel }: { position: 'left' | 'right'; tagLabel?: (tag: string) => string }) {
  const labelOf = (tag: string) => tagLabel?.(tag) ?? tag
  const { theme } = useMapContext()
  const tags = useTags()
  const labels = useLabels()
  const [query, setQuery] = useState('')
  // Le bouton « Couches » est bas dans la barre : sans clamp, un panneau bien
  // rempli déborde sous le conteneur et sa moitié basse (liste + « Tout
  // afficher ») devient inatteignable.
  const [side, setPanel] = useAnchoredPanel(position, { maxHeight: theme.sizing.panelMaxHeight.tags })

  // Fusion+tri seulement quand registre ou sélection changent — pas à chaque
  // frappe dans la recherche. (La sélection compte : un tag fantôme sélectionné
  // est listé à 0 et doit disparaître dès qu'on le décoche.)
  const entries = useMemo(
    () => tags.all(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tags.registryVersion, tags.selectionVersion],
  )
  // `normalizeSearch` et non un `toLowerCase` : un tag « Réseau » doit se trouver en
  // tapant « reseau », comme partout ailleurs dans la carte.
  const q = normalizeSearch(query)
  const shown = q
    ? entries.filter(
        (e) => normalizeSearch(labelOf(e.tag)).includes(q) || normalizeSearch(e.tag).includes(q),
      )
    : entries
  const active = tags.selected.size

  return (
    <div ref={setPanel} className={`m3d-panel m3d-tagpanel m3d-${side}`}>
      <div className="m3d-tagsearch">
        <UiIcon path={mdiMagnify} />
        <input
          autoFocus
          value={query}
          placeholder={labels.tags.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="m3d-taglist">
        {shown.map(({ tag, count }) => (
          <label key={tag} className="m3d-tagrow">
            <input type="checkbox" checked={tags.selected.has(tag)} onChange={() => tags.toggle(tag)} />
            <span className="m3d-tagdot" style={{ background: tagColorOf(theme, tag) }} />
            <span className="m3d-taglabel">{labelOf(tag)}</span>
            <span className="m3d-tagcount">{count}</span>
          </label>
        ))}
        {shown.length === 0 && (
          <div className="m3d-tagempty">
            {entries.length === 0 ? labels.tags.empty : labels.tags.noMatch}
          </div>
        )}
      </div>
      <button className="m3d-tagclear" onClick={() => tags.clear()} disabled={active === 0}>
        <UiIcon path={mdiFilterRemoveOutline} />
        {labels.tags.showAll}
      </button>
    </div>
  )
}
