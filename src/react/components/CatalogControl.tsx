import { mdiMagnify, mdiMapSearchOutline } from '@mdi/js'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  isBrowseSource,
  isToggleSource,
  type CatalogBrowseSource,
  type CatalogSource,
  type CatalogToggleSource,
} from '../../catalog/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useConfig, useLabels, useMapContext } from '../context'
import { useCatalogActiveCount, useCatalogSourceCount, useCatalogToggle } from '../hooks/useCatalog'
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
  // Le COMPTE et non l'API entière : le bouton n'affiche qu'un badge, il n'a pas à se
  // re-rendre à chaque géométrie qui arrive pour réécrire le même chiffre.
  const shown = useCatalogActiveCount()
  const sources = useCatalogSources()
  const toggleRef = useRef<() => void>(() => {})

  useToggleShortcut(sources.length > 0 ? shortcut : false, toggleRef)

  const tip = useTip(tipId ?? '')

  if (sources.length === 0) return null

  return (
    <Dropdown
      // Une carte + une loupe : PARCOURIR un référentiel géographique. Ses deux voisins
      // de groupe disent autre chose — les calques (mdiLayersOutline) et la sauvegarde
      // (mdiContentSaveOutline) — donc les trois restent distinguables d'un coup d'œil.
      icon={mdiMapSearchOutline}
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
  const showFamilyHeaders = useConfig().catalog.familyHeaders
  const [openId, setOpenId] = useState<string | null>(null)
  /** Ligne ouverte : c'est elle qui ANCRE le second panneau, comme un bouton ancre le sien. */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [query, setQuery] = useState('')

  // `Intl.NumberFormat` alimenté par les LABELS, et non `toLocaleString()` qui suit le
  // navigateur : c'est l'interface qui décide de son séparateur de milliers, comme pour
  // les distances et les coordonnées.
  const formatTotal = useMemo(() => {
    const locale = labels.catalog.numberLocale === 'auto' ? undefined : labels.catalog.numberLocale
    return new Intl.NumberFormat(locale)
  }, [labels.catalog.numberLocale])

  // La source ouverte a pu être retirée (plugin démonté), ou remplacée par une source à
  // bascule qui n'a rien à lister : le panneau se referme plutôt que d'afficher une liste
  // orpheline.
  const opened = useMemo<CatalogBrowseSource | null>(() => {
    if (openId === null) return null
    const s = sources.find((x) => x.id === openId)
    return s && isBrowseSource(s) ? s : null
  }, [openId, sources])

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

  const open = (s: CatalogBrowseSource, el: HTMLElement | null) => {
    setAnchor(el)
    setQuery('')
    setOpenId(s.id)
  }

  /**
   * Total du JEU DE RÉFÉRENCE — la même donnée dans les deux régimes.
   *
   * ⚠️ Jamais un nombre d'éléments chargés : cf. `CatalogToggleSource`.
   */
  const total = (s: CatalogSource) =>
    s.total !== undefined ? <span className="m3d-cattype-total">{formatTotal.format(s.total)}</span> : null

  return (
    <>
      <div className="m3d-cattypes">
        {families.map(([family, list]) => (
          // `role="group"` + `aria-label` dépendent de la DONNÉE (`family`), jamais du
          // réglage d'affichage : le filet regroupe visuellement même sans en-tête, et
          // conditionner la sémantique au titre ferait perdre au lecteur d'écran une
          // structure que l'œil, lui, garde. Une famille sans nom n'est pas un groupe
          // nommé — ni `role`, ni titre, plutôt qu'un intitulé que la lib aurait inventé.
          //
          // Le titre visible est `aria-hidden` : le nom est déjà porté par le groupe, et
          // sans cela « Territoires » serait annoncé deux fois.
          <div
            key={family}
            className="m3d-catfamily"
            role={family ? 'group' : undefined}
            aria-label={family || undefined}
          >
            {family && showFamilyHeaders && (
              <h3 className="m3d-catfamily-title" aria-hidden="true">
                {family}
              </h3>
            )}
            {list.map((s) =>
              isToggleSource(s) ? (
                <ToggleTypeRow key={s.id} source={s} total={total(s)} />
              ) : (
                <div key={s.id} className="m3d-cattype-row">
                  <button
                    type="button"
                    className={`m3d-cattype${s.id === openId ? ' m3d-on' : ''}`}
                    aria-expanded={s.id === openId}
                    onClick={(e) => open(s, e.currentTarget.parentElement)}
                  >
                    <UiIcon path={s.icon} />
                    <span className="m3d-cattype-label">{s.label}</span>
                    <ShownCount id={s.id} />
                    {total(s)}
                  </button>
                </div>
              ),
            )}
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
          <div className="m3d-tagsearch">
            <UiIcon path={mdiMagnify} />
            <input
              autoFocus
              value={query}
              placeholder={labels.catalog.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <CatalogList source={opened} query={query} tipId={tipId} side={position} />
        </DropdownSurface>
      )}
    </>
  )
}

/**
 * Ce qu'une source a d'affiché, dans le menu des types — muet à zéro.
 *
 * Composant et non un rendu inline : l'abonnement est SCALAIRE (cf.
 * `useCatalogSourceCount`), donc une ligne dont le compte ne bouge pas ne se re-rend pas
 * quand une autre source change.
 *
 * Réservé aux sources de PARCOURS. Une bascule n'affiche jamais de compte d'éléments : ce
 * qu'elle charge dépasse structurellement ce qui est visible (cf. `CatalogToggleSource`),
 * et un chiffre posé là se lirait « tant d'affichés » — son état allumé, lui, se voit.
 */
function ShownCount({ id }: { id: string }) {
  const labels = useLabels()
  const shown = useCatalogSourceCount(id)
  if (shown === 0) return null
  return (
    <span className="m3d-catcount" aria-label={formatLabel(labels.catalog.sourceShown, { count: shown })}>
      {shown}
    </span>
  )
}

/**
 * La ligne d'un jeu à BASCULE : un interrupteur, et rien de plus.
 *
 * Ni chevron ni sous-panneau — il n'y a pas de liste derrière. Le clic sur le nom fait la
 * même chose que la case, **sans cadrer** : sur un jeu piloté par la vue, c'est la vue qui
 * décide du contenu, la cadrer sur son propre contenu n'aurait aucun sens (cf.
 * `CatalogApi.toggleSource`).
 *
 * L'indicateur de chargement dit qu'une requête est en vol — un fait vérifiable. Il n'y a
 * volontairement AUCUN compteur d'éléments chargés à côté : cf. `CatalogToggleSource`.
 *
 * Les libellés sont ceux des lignes d'éléments (`catalog.add`/`remove`), avec le nom de la
 * source en `{label}` : « Afficher Défibrillateurs sur la carte » se lit aussi bien pour
 * un jeu que pour une zone, et n'oblige aucun hôte à retraduire son bundle.
 *
 * Elle s'abonne SEULE à son état (`useCatalogToggle`) : le panneau qui la porte n'a donc
 * pas à se re-rendre — ni à re-rendre la liste virtualisée — à chaque mutation du store.
 */
function ToggleTypeRow({ source, total }: { source: CatalogToggleSource; total: ReactNode }) {
  const labels = useLabels()
  const { on, loading, toggle: flip } = useCatalogToggle(source.id)
  const name = formatLabel(on ? labels.catalog.remove : labels.catalog.add, { label: source.label })

  return (
    <div className="m3d-cattype-row">
      <div className={`m3d-cattype m3d-cattoggle${on ? ' m3d-on' : ''}`}>
        <input type="checkbox" className="m3d-catcheck" aria-label={name} checked={on} onChange={flip} />
        {/* Le nom est un bouton à part : deux contrôles focusables côte à côte, jamais
            imbriqués (même règle que `CatalogRow`). */}
        <button type="button" className="m3d-cattype-main" aria-pressed={on} onClick={flip}>
          <UiIcon path={source.icon} />
          <span className="m3d-cattype-label">{source.label}</span>
        </button>
        {/* `role="status"` : sans rôle, un `aria-label` sur un span vide n'est annoncé par
            presque aucun lecteur d'écran — le libellé existait sans jamais être lu. */}
        {loading && <span className="m3d-cattype-busy" role="status" aria-label={labels.catalog.loading} />}
        {total}
      </div>
    </div>
  )
}
