import { mdiFilterRemoveOutline, mdiLayersOutline, mdiMagnify } from '@mdi/js'
import Icon from '@mdi/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { tagColor } from '../../core/TagFilter'
import { useMapContext } from '../context'
import { useTags, useTagSelection } from '../hooks/useTags'
import { plainKey } from './shortcuts'
import { ICON_SIZE, tipProps, withShortcut } from './tooltip'

export type TagFilterControlProps = {
  /** Côté de la barre hôte : le panneau s'ouvre du côté opposé. */
  position?: 'left' | 'right'
  /** id du `<Tooltip>` partagé de la barre hôte (MapControls). */
  tipId?: string
  /** Touche (lettre seule) qui ouvre/ferme le panneau — affichée dans le tooltip. `false` = aucun raccourci. */
  shortcut?: string | false
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
export function TagFilterControl({ position = 'right', tipId, shortcut }: TagFilterControlProps) {
  const tags = useTagSelection()
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
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = tags.selected.size
  const label = 'Couches — filtrer par tag'

  return (
    <div className="m3d-controls-group m3d-tags" ref={rootRef}>
      <button
        className={`m3d-btn m3d-tagbtn${active > 0 ? ' m3d-on' : ''}`}
        {...(tipId ? tipProps(tipId, label, shortcut) : { 'aria-label': withShortcut(label, shortcut) })}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon path={mdiLayersOutline} size={ICON_SIZE} />
        {active > 0 && <span className="m3d-tag-badge">{active}</span>}
      </button>
      {open && <TagPanel position={position} />}
    </div>
  )
}

/** Contenu du panneau — monté uniquement ouvert (seul abonné au registre des tags). */
function TagPanel({ position }: { position: 'left' | 'right' }) {
  const { theme } = useMapContext()
  const tags = useTags()
  const [query, setQuery] = useState('')

  // Fusion+tri seulement quand registre ou sélection changent — pas à chaque
  // frappe dans la recherche. (La sélection compte : un tag fantôme sélectionné
  // est listé à 0 et doit disparaître dès qu'on le décoche.)
  const entries = useMemo(
    () => tags.all(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tags.registryVersion, tags.selectionVersion],
  )
  const q = query.trim().toLowerCase()
  const shown = q ? entries.filter((e) => e.tag.toLowerCase().includes(q)) : entries
  const active = tags.selected.size

  return (
    <div className={`m3d-panel m3d-tagpanel m3d-${position}`}>
      <div className="m3d-tagsearch">
        <Icon path={mdiMagnify} size={0.6} />
        <input
          autoFocus
          value={query}
          placeholder="Rechercher un tag…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="m3d-taglist">
        {shown.map(({ tag, count }) => (
          <label key={tag} className="m3d-tagrow">
            <input type="checkbox" checked={tags.selected.has(tag)} onChange={() => tags.toggle(tag)} />
            <span className="m3d-tagdot" style={{ background: theme.colors.tags?.[tag] ?? tagColor(tag) }} />
            <span className="m3d-taglabel">{tag}</span>
            <span className="m3d-tagcount">{count}</span>
          </label>
        ))}
        {shown.length === 0 && (
          <div className="m3d-tagempty">
            {entries.length === 0 ? 'Aucun tag sur la carte' : 'Aucun tag ne correspond'}
          </div>
        )}
      </div>
      <button className="m3d-tagclear" onClick={() => tags.clear()} disabled={active === 0}>
        <Icon path={mdiFilterRemoveOutline} size={0.6} />
        Tout afficher
      </button>
    </div>
  )
}
