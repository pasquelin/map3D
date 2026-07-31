import { mdiChevronRight, mdiMagnify, mdiShapeOutline } from '@mdi/js'
import { useMemo, useRef, useState } from 'react'
import type { CatalogSource } from '../../catalog/types'
import { useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogSources } from '../hooks/useCatalogSources'
import { CatalogList } from './CatalogList'
import { Dropdown, DropdownSurface, useToggleShortcut } from './Dropdown'
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
      {() => <CatalogPanel sources={sources} position={position} tipId={tipId ?? ''} />}
    </Dropdown>
  )
}

/**
 * Le panneau ne contient QUE le menu des types. La liste du type ouvert s'affiche dans
 * un **second panneau accolé**, du côté opposé à la barre et aligné sur la ligne du
 * type — exactement le sous-panneau latéral des réglages d'outils
 * (`DrawSettingsPanel`), dont c'est le châssis (`DropdownSurface` + ancre sur la ligne).
 *
 * Deux surfaces plutôt qu'une pile : la liste peut occuper toute la hauteur disponible
 * sans que le menu la lui dispute, et le menu reste lisible en entier — empilés, chacun
 * rognait l'autre.
 */
function CatalogPanel({
  sources,
  position,
  tipId,
}: {
  sources: readonly CatalogSource[]
  position: 'left' | 'right'
  tipId: string
}) {
  const labels = useLabels()
  const { theme } = useMapContext()
  const tip = useTip(tipId)
  const [openId, setOpenId] = useState<string | null>(null)
  /** Ligne ouverte : c'est elle qui ANCRE le second panneau, comme un bouton ancre le sien. */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [query, setQuery] = useState('')

  // La source ouverte a pu être retirée (plugin démonté) : le panneau se referme plutôt
  // que d'afficher une liste orpheline.
  const opened = openId === null ? null : (sources.find((s) => s.id === openId) ?? null)

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

  const open = (s: CatalogSource, el: HTMLElement | null) => {
    setAnchor(el)
    setQuery('')
    setOpenId(s.id)
  }

  return (
    <>
      <div className="m3d-cattypes">
        {families.map(([family, list]) => (
          <div key={family} className="m3d-catfamily">
            {list.map((s) => (
              <div key={s.id} className="m3d-cattype-row">
                <button
                  type="button"
                  className={`m3d-cattype${s.id === openId ? ' m3d-on' : ''}`}
                  {...tip(s.label)}
                  aria-expanded={s.id === openId}
                  onClick={(e) => open(s, e.currentTarget.parentElement)}
                >
                  <UiIcon path={s.icon} />
                  <span className="m3d-cattype-label">{s.label}</span>
                  {s.total !== undefined && <span className="m3d-cattype-total">{s.total.toLocaleString()}</span>}
                  {/* Le chevron pointe VERS le panneau qui s'ouvrira, donc à l'opposé de la barre. */}
                  <UiIcon path={mdiChevronRight} rotate={position === 'right' ? 180 : 0} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {opened && (
        <DropdownSurface
          anchor={anchor}
          position={position}
          maxHeight={theme.sizing.panelMaxHeight.catalog}
          panelClassName="m3d-catsub"
        >
          <div className="m3d-cathead">
            <UiIcon path={opened.icon} />
            <span className="m3d-cathead-title">{opened.label}</span>
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
          <CatalogList source={opened} query={query} tipId={tipId} />
        </DropdownSurface>
      )}
    </>
  )
}
