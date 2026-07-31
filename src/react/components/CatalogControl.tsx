import { mdiArrowLeft, mdiMagnify, mdiShapeOutline } from '@mdi/js'
import { useMemo, useRef, useState } from 'react'
import type { CatalogSource } from '../../catalog/types'
import { useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogSources } from '../hooks/useCatalogSources'
import { CatalogList } from './CatalogList'
import { Dropdown, useToggleShortcut } from './Dropdown'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

export type CatalogControlProps = {
  /** Côté de la barre hôte : le panneau s'ouvre du côté opposé. */
  position?: 'left' | 'right'
  /** id du `<Tooltip>` partagé de la barre hôte. */
  tipId?: string
  /** Touche (lettre seule) qui ouvre/ferme le panneau. `false` = aucun raccourci. */
  shortcut?: string | false
  /** Rendu SANS sa propre carte `.m3d-controls-group` — pour cohabiter avec « Couches ». */
  grouped?: boolean
}

/**
 * Bouton « Catalogue » : parcourt des référentiels distants (zones, villes,
 * départements…) et pose leurs géométries sur la carte.
 *
 * Même châssis que « Couches » : `Dropdown` porte l'ancrage, le clamp de hauteur, le
 * dismiss et l'exclusivité (un seul panneau ouvert à la fois). Le contenu n'est monté
 * qu'OUVERT — panneau fermé, aucune requête n'est émise vers l'API de l'hôte.
 *
 * Sans source déclarée, le composant ne rend rien : un bouton qui n'ouvrirait qu'une
 * liste vide est pire qu'un bouton absent.
 */
export function CatalogControl({ position = 'right', tipId, shortcut, grouped }: CatalogControlProps) {
  const labels = useLabels()
  const { theme } = useMapContext()
  const catalog = useCatalog()
  const sources = useCatalogSources()
  const toggleRef = useRef<() => void>(() => {})

  useToggleShortcut(sources.length > 0 ? shortcut : false, toggleRef)

  const tip = useTip(tipId ?? '')
  const shown = catalog.selection.length

  if (sources.length === 0) return null

  return (
    <Dropdown
      icon={mdiShapeOutline}
      label={labels.catalog.button}
      tip={tipId ? tip : undefined}
      shortcut={shortcut}
      position={position}
      maxHeight={theme.sizing.panelMaxHeight.catalog}
      buttonClassName="m3d-catbtn"
      panelClassName="m3d-catpanel"
      className="m3d-catalog"
      grouped={grouped}
      active={shown > 0}
      badge={shown > 0 ? <span className="m3d-tag-badge">{shown}</span> : undefined}
      toggleRef={toggleRef}
    >
      {() => <CatalogPanel sources={sources} />}
    </Dropdown>
  )
}

/**
 * Contenu du panneau — deux vues successives : le choix du type, puis sa liste.
 *
 * Une seule source déclarée ⇒ on ouvre DIRECTEMENT sa liste et le retour disparaît :
 * un sous-menu à une entrée est un clic qui n'apprend rien (même règle que le bouton
 * « Mesures », qui n'ouvre son flyout qu'à partir de deux outils).
 */
function CatalogPanel({ sources }: { sources: readonly CatalogSource[] }) {
  const labels = useLabels()
  const only = sources.length === 1 ? (sources[0] ?? null) : null
  const [typeId, setTypeId] = useState<string | null>(only?.id ?? null)
  const [query, setQuery] = useState('')

  const selected = typeId === null ? null : (sources.find((s) => s.id === typeId) ?? null)

  // Familles dans l'ordre de PREMIÈRE apparition : l'hôte décide de l'ordre en
  // inscrivant ses sources, un tri alphabétique le lui reprendrait.
  const families = useMemo(() => {
    const out = new Map<string, CatalogSource[]>()
    for (const s of sources) {
      const key = s.family ?? ''
      const list = out.get(key)
      if (list) list.push(s)
      else out.set(key, [s])
    }
    return [...out.entries()]
  }, [sources])

  if (!selected) {
    return (
      <div className="m3d-cattypes">
        {families.map(([family, list]) => (
          <div key={family} className="m3d-catfamily">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                className="m3d-cattype"
                onClick={() => {
                  setTypeId(s.id)
                  setQuery('')
                }}
              >
                <UiIcon path={s.icon} />
                <span className="m3d-cattype-label">{s.label}</span>
                {s.total !== undefined && <span className="m3d-cattype-total">{s.total.toLocaleString()}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="m3d-cathead">
        {!only && (
          <button
            type="button"
            className="m3d-catback"
            aria-label={labels.catalog.back}
            onClick={() => setTypeId(null)}
          >
            <UiIcon path={mdiArrowLeft} />
          </button>
        )}
        <UiIcon path={selected.icon} />
        <span className="m3d-cathead-title">{selected.label}</span>
      </div>

      <div className="m3d-tagsearch">
        <UiIcon path={mdiMagnify} />
        <input
          autoFocus
          value={query}
          placeholder={labels.catalog.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <CatalogList source={selected} query={query} />
    </>
  )
}
