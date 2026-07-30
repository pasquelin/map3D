import { mdiFilterRemoveOutline, mdiLayersOutline, mdiMagnify } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { useMemo, useRef, useState } from 'react'
import { normalizeSearch } from '../../search/match'
import { useLabels, useMapContext } from '../context'
import { useTags, useTagSelection } from '../hooks/useTags'
import { Dropdown, useToggleShortcut } from './Dropdown'
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
  /**
   * Rendu SANS sa propre carte `.m3d-controls-group` — pour cohabiter avec un autre
   * contrôle (ex. « Templates ») dans un groupe partagé de la barre. Défaut : `false`
   * (le bouton porte sa carte, usage autonome).
   */
  grouped?: boolean
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
export function TagFilterControl({ position = 'right', tipId, shortcut, tagLabel, grouped }: TagFilterControlProps) {
  const tags = useTagSelection()
  const labels = useLabels()
  const { theme } = useMapContext()
  const toggleRef = useRef<() => void>(() => {})

  // Raccourci d'ouverture/fermeture du panneau (lettre seule, hors champ de saisie).
  useToggleShortcut(shortcut, toggleRef)

  const active = tags.selected.size
  // Hook appelé inconditionnellement (règles des hooks) ; c'est le PASSAGE du tip
  // au bouton qui est conditionné par la présence d'une barre hôte.
  const tip = useTip(tipId ?? '')

  return (
    // `tipId` absent (bouton monté hors d'une barre hôte) : `ToolButton` retombe sur
    // l'aria-label seul — le nom accessible reste porté.
    <Dropdown
      icon={mdiLayersOutline}
      label={labels.tags.button}
      tip={tipId ? tip : undefined}
      shortcut={shortcut}
      position={position}
      maxHeight={theme.sizing.panelMaxHeight.tags}
      buttonClassName="m3d-tagbtn"
      panelClassName="m3d-tagpanel"
      className="m3d-tags"
      grouped={grouped}
      active={active > 0}
      badge={active > 0 ? <span className="m3d-tag-badge">{active}</span> : undefined}
      toggleRef={toggleRef}
    >
      {() => <TagPanel tagLabel={tagLabel} />}
    </Dropdown>
  )
}

/**
 * Contenu du panneau — monté uniquement ouvert (seul abonné au registre des tags).
 *
 * Ancrage, côté et clamp de hauteur appartiennent à `<Dropdown>` : le bouton « Couches »
 * est bas dans la barre, et sans clamp un panneau bien rempli déborde sous le conteneur.
 */
function TagPanel({ tagLabel }: { tagLabel?: (tag: string) => string }) {
  const labelOf = (tag: string) => tagLabel?.(tag) ?? tag
  const { theme } = useMapContext()
  const tags = useTags()
  const labels = useLabels()
  const [query, setQuery] = useState('')

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
    ? entries.filter((e) => normalizeSearch(labelOf(e.tag)).includes(q) || normalizeSearch(e.tag).includes(q))
    : entries
  const active = tags.selected.size

  return (
    <>
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
          <div className="m3d-tagempty">{entries.length === 0 ? labels.tags.empty : labels.tags.noMatch}</div>
        )}
      </div>
      <button type="button" className="m3d-tagclear" onClick={() => tags.clear()} disabled={active === 0}>
        <UiIcon path={mdiFilterRemoveOutline} />
        {labels.tags.showAll}
      </button>
    </>
  )
}
