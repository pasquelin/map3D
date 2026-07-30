import {
  mdiChevronDown,
  mdiClose,
  mdiDotsHorizontal,
  mdiHistory,
  mdiMagnify,
  mdiMapMarkerOutline,
  mdiTrashCanOutline,
} from '@mdi/js'
import { UiIcon } from './UiIcon'
import { type ReactNode, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../../core/storage'
import { formatLabel } from '../../labels/mergeLabels'
import { normalizeSearch } from '../../search/match'
import { PLACE_GROUP } from '../../search/registry'
import type { SearchEntry } from '../../search/types'
import { createGooglePlacesSearch } from '../../search/googlePlaces'
import type { SearchResult } from '../../shared'
import { useConfig, useLabels, useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useFitHeight, useMergedRefs, useNudgeInside } from './panelFit'
import { Swatch } from './Swatch'
import { useDismiss } from './useDismiss'

export type { SearchResult } from '../../shared'
export type { SearchEntry } from '../../search/types'

export type SearchBoxProps = {
  /** Notifié au choix d'un résultat (la caméra s'y rend déjà d'elle-même). */
  onSelect?: (entry: SearchEntry) => void
  /**
   * Géocodeur de la rubrique « Lieux ». Défaut : Google Places avec la clé de
   * `<Map googleMapsApiKey>` ; `false` retire la rubrique.
   *
   * Ne concerne QUE les lieux : les rubriques carte (markers, zones, dessins,
   * symboles) viennent des couches elles-mêmes via `engine.search` et n'ont rien à
   * déclarer ici.
   */
  search?: false | ((query: string, signal?: AbortSignal) => Promise<SearchResult[]>)
  /** Défaut : `labels.search.placeholder`. */
  placeholder?: string
  /** Altitude caméra (m) de repli quand le résultat n'a pas d'emprise. */
  flyAltitude?: number
  /** Clé localStorage de l'historique — `null` pour le désactiver. */
  historyStorageKey?: string | null
  /** Nombre max d'entrées d'historique. */
  historySize?: number
  /** Résultats affichés par rubrique (défaut 6) — l'en-tête annonce le total réel. */
  limitPerGroup?: number
  /** Sélecteur de portée collé au champ (défaut `true`). `false` = toutes rubriques. */
  scope?: boolean
  /**
   * Ordre des rubriques CARTE (`['marker:agent', 'marker:alert']`) ; celles qui n'y
   * figurent pas suivent par ordre alphabétique. « Lieux » est hors classement : il
   * ouvre toujours la liste, chercher une ville étant le geste de cadrage le plus
   * courant.
   */
  groupOrder?: string[]
  /**
   * Longueur minimale de la saisie avant d'interroger quoi que ce soit (défaut 2).
   *
   * À abaisser à 1 pour un jeu de données dont les libellés sont courts (codes,
   * numéros de tournée) ; à relever pour épargner un fournisseur facturé à l'appel.
   */
  minQuery?: number
  /**
   * Anti-rebond de la frappe, en ms (défaut 250). Chaque saisie déclenche un appel au
   * fournisseur de lieux : le relever réduit directement la facture.
   */
  debounceMs?: number
}

/** Idem pour le menu de portée, plus court (une ligne par rubrique). */
const SCOPE_MAX_HEIGHT = 280

/** Entrée d'historique : le strict nécessaire pour re-trouver, ou à défaut y voler. */
type HistoryItem = { group: string; id: string; title: string; lat: number; lng: number }

/** Section prête à rendre : rubrique nommée, ses lignes, et son total AVANT troncature. */
type Section = { id: string; label: string; total: number; entries: SearchEntry[] }

const isHistoryItem = (v: unknown): v is HistoryItem => {
  const h = v as HistoryItem | null
  return (
    !!h &&
    typeof h === 'object' &&
    typeof h.group === 'string' &&
    typeof h.id === 'string' &&
    typeof h.title === 'string' &&
    typeof h.lat === 'number' &&
    typeof h.lng === 'number'
  )
}

function loadHistory(key: string): HistoryItem[] {
  const raw = readStoredJSON(key)
  return Array.isArray(raw) ? raw.filter(isHistoryItem) : []
}

/**
 * Recherche **unifiée** : les éléments de la carte (markers, zones, dessins,
 * symboles) et le géocodage de lieux, dans une même liste rubriquée.
 *
 * Les rubriques carte viennent des couches via `engine.search` — aucune
 * configuration : une couche qui donne un `title` à ses markers les rend
 * trouvables. Elles héritent aussi du filtre « Couches », si bien qu'on ne peut
 * jamais atterrir sur un élément masqué.
 *
 * Débouncée, annulable, navigable au clavier (↑ ↓ traversent les rubriques, Entrée,
 * Échap), avec historique des choix en localStorage. Choisir un élément de la carte
 * s'y rend ET le sélectionne, comme un clic ; son bouton « … » offre le menu du
 * marker, ce qui permet d'agir sans quitter la liste.
 */
export function SearchBox({
  onSelect,
  search,
  placeholder,
  flyAltitude: flyAltitudeProp,
  historyStorageKey: historyStorageKeyProp,
  historySize: historySizeProp,
  limitPerGroup: limitPerGroupProp,
  scope = true,
  groupOrder,
  minQuery: minQueryProp,
  debounceMs: debounceMsProp,
}: SearchBoxProps) {
  const { engine, overlay, theme } = useMapContext()
  const labels = useLabels()
  // Contexte et non `engine.config` : au render, le moteur porte encore les réglages
  // de la frame précédente (cf. `useConfig`).
  const config = useConfig()
  const root = overlay.parentElement

  // Les sept réglages de la boîte prennent leur défaut dans la config plutôt que
  // dans des littéraux : `debounceMs` décide du nombre d'appels Places facturés, et
  // `historyStorageKey` doit pouvoir être distinguée quand deux cartes partagent un
  // origin — comme les deux autres clés de stockage, désormais au même endroit.
  const searchCfg = config.data.search
  const flyAltitude = flyAltitudeProp ?? searchCfg.flyAltitude
  const historyStorageKey = historyStorageKeyProp ?? config.data.storageKeys.searchHistory
  const historySize = historySizeProp ?? searchCfg.historySize
  const limitPerGroup = limitPerGroupProp ?? searchCfg.limitPerGroup
  const minQuery = minQueryProp ?? searchCfg.minQuery
  const debounceMs = debounceMsProp ?? searchCfg.debounceMs

  const places = useMemo(() => {
    if (search === false) return undefined
    if (search) return search
    // La config du moteur est transmise au provider par défaut : sans elle, régler
    // `providers.places` (endpoint, FieldMask, langue, timeout) resterait sans effet
    // dès lors qu'on laisse la lib fabriquer le géocodeur — c'est-à-dire presque
    // toujours. Un `search` fourni par l'hôte reste seul maître du sien.
    return engine.googleMapsApiKey
      ? createGooglePlacesSearch({ apiKey: engine.googleMapsApiKey, config: config.providers.places })
      : undefined
  }, [search, engine, config.providers.places])

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scopeGroup, setScopeGroup] = useState<string | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const optionId = (i: number) => `${listId}-o${i}`
  const [rowMenu, setRowMenu] = useState<{ key: string; left: number; top: number } | null>(null)
  /** null = aucune réponse aboutie du géocodeur pour la requête courante. */
  const [placeEntries, setPlaceEntries] = useState<SearchEntry[] | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => (historyStorageKey ? loadHistory(historyStorageKey) : []))
  /** Bump à chaque changement d'inventaire d'une couche (ajout, retrait, filtre tags). */
  const [itemsRev, bumpItems] = useReducer((x: number) => x + 1, 0)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scopeRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [, setNudge] = useNudgeInside()
  const setMenuEl = useMergedRefs(setNudge, (el) => {
    menuRef.current = el as HTMLDivElement | null
  })
  const closeRowMenu = useCallback(() => setRowMenu(null), [])

  useDismiss(rootRef, open, () => setOpen(false))
  useDismiss(scopeRef, scopeOpen, () => setScopeOpen(false))
  useDismiss(menuRef, rowMenu !== null, closeRowMenu, { wheel: true, captureEscape: true })
  const setResultsPanel = useFitHeight('dropdown', theme.sizing.panelMaxHeight.search)
  // Le menu de portée est un déroulant comme un autre : sur une carte courte, la place
  // restante sous le champ est sa vraie borne — pas un plafond figé dans le CSS.
  const setScopePanel = useFitHeight('dropdown', SCOPE_MAX_HEIGHT)

  useEffect(() => engine.search.onItemsChanged(bumpItems), [engine])

  const q = query.trim()
  /** Sous la longueur minimale, le champ ne cherche pas : il propose l'historique. */
  const showingHistory = q.length < minQuery

  // Débounce de la SAISIE, pas des résultats : la liste précédente reste affichée
  // pendant la frappe (pas de clignotement), et les deux sources — balayage local et
  // géocodeur — repartent du même instant.
  useEffect(() => {
    if (showingHistory) {
      setDebounced('')
      return
    }
    const timer = setTimeout(() => setDebounced(q), debounceMs)
    return () => clearTimeout(timer)
  }, [q, showingHistory, debounceMs])

  // Balayage local : synchrone, donc jamais de résultat périmé à arbitrer. Le centre
  // de la vue est lu à l'instant du calcul (et non suivi en état) — sans quoi chaque
  // frame de caméra re-rendrait la boîte.
  const local = useMemo(() => {
    if (!debounced) return { entries: [], totals: new Map<string, number>() }
    const cam = engine.camera.getState()
    return engine.search.query(normalizeSearch(debounced), {
      group: scopeGroup ?? undefined,
      limit: limitPerGroup,
      origin: { lat: cam.lat, lng: cam.lng },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, scopeGroup, limitPerGroup, engine, itemsRev])

  // Géocodeur lu par REF, jamais mis en dépendance : un hôte qui écrit
  // `search={{ search: (q, s) => geocode(q, s) }}` en flèche inline change son
  // identité à chaque rendu, et le moindre survol de ligne partirait en requête
  // réseau. Seule la requête débouncée déclenche un appel.
  const placesRef = useRef(places)
  placesRef.current = places

  // À part des rubriques carte parce qu'il est lent et faillible : son échec retire la
  // rubrique « Lieux » et laisse les autres intactes — l'inverse du comportement
  // d'avant, où un `catch` vidait toute la liste.
  useEffect(() => {
    const geocode = placesRef.current
    if (!geocode || !debounced || (scopeGroup !== null && scopeGroup !== PLACE_GROUP)) {
      setPlaceEntries(null)
      return
    }
    const ctl = new AbortController()
    void (async () => {
      try {
        const found = await geocode(debounced, ctl.signal)
        if (ctl.signal.aborted) return
        setPlaceEntries(
          found.map((p, i) => ({
            group: PLACE_GROUP,
            id: `${p.name}-${i}`,
            title: p.name,
            subtitle: p.description,
            position: { lat: p.lat, lng: p.lng },
            bounds: p.bounds,
          })),
        )
      } catch {
        if (!ctl.signal.aborted) setPlaceEntries(null)
      }
    })()
    return () => ctl.abort()
  }, [debounced, scopeGroup])

  // Rang d'une rubrique, partagé par le sélecteur et la liste : les deux doivent
  // présenter les rubriques dans le MÊME ordre, sinon le sélecteur ne se lit plus
  // comme un sommaire de ce qu'on a sous les yeux.
  const rankGroup = useCallback(
    (id: string): number => {
      if (id === PLACE_GROUP) return Number.MIN_SAFE_INTEGER
      const at = groupOrder?.indexOf(id) ?? -1
      return at >= 0 ? at : Number.MAX_SAFE_INTEGER
    },
    [groupOrder],
  )

  // Rubriques de la carte, pour le sélecteur de portée. « Lieux » s'y ajoute dès
  // qu'un géocodeur est en place : on doit pouvoir restreindre à lui seul.
  const scopeGroups = useMemo(() => {
    const all = engine.search.groups()
    // « Lieux » n'a pas de couleur d'élément : rien de lui n'est sur la carte avant
    // qu'on l'ait cherché. Sa pastille reprend donc la teinte d'accent.
    if (places) {
      all.push({ id: PLACE_GROUP, label: labels.search.groups.place, color: theme.colors.ui.accent, count: 0 })
    }
    return all.sort((a, b) => rankGroup(a.id) - rankGroup(b.id) || a.label.localeCompare(b.label))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, places, itemsRev, labels, theme, rankGroup])

  // Index plutôt que `find` : les rubriques sont relues par section, par ligne
  // d'historique et deux fois par comparaison de tri.
  const groupById = useMemo(() => new Map(scopeGroups.map((g) => [g.id, g])), [scopeGroups])
  const groupLabelOf = useCallback((id: string) => groupById.get(id)?.label ?? id, [groupById])

  // Une rubrique disparaît quand son dernier élément quitte la carte (dernière alerte
  // critique clôturée). Rester dessus afficherait son id brut sur le bouton et dans le
  // message vide, sur une portée que le menu ne propose même plus : on revient à Tout.
  // Ajusté PENDANT le render, pas dans un effet : en effet, la portée périmée était
  // peinte une frame avant d'être corrigée — le bouton montrait l'id brut de la rubrique
  // disparue, et le message vide la nommait. React ré-exécute le composant sans rien
  // afficher entre les deux, donc l'état intermédiaire n'atteint jamais l'écran.
  // (Dériver la portée à la place demanderait de réordonner le composant : `scopeGroups`
  // se calcule à partir de résultats déjà filtrés par `scopeGroup`.)
  if (scopeGroup !== null && !groupById.has(scopeGroup)) setScopeGroup(null)

  // Regroupement + ordre. « Lieux » OUVRE la liste : chercher une ville est le geste
  // de cadrage le plus courant, et c'est aussi la rubrique la plus stable — les
  // rubriques carte, elles, changent de taille au fil des données.
  const sections = useMemo<Section[]>(() => {
    const byGroup = new Map<string, SearchEntry[]>()
    for (const e of local.entries) {
      const bucket = byGroup.get(e.group)
      if (bucket) bucket.push(e)
      else byGroup.set(e.group, [e])
    }
    if (placeEntries?.length) byGroup.set(PLACE_GROUP, placeEntries.slice(0, limitPerGroup))

    return [...byGroup]
      .sort(([a], [b]) => rankGroup(a) - rankGroup(b) || groupLabelOf(a).localeCompare(groupLabelOf(b)))
      .map(([id, entries]) => ({
        id,
        label: groupLabelOf(id),
        total: id === PLACE_GROUP ? (placeEntries?.length ?? 0) : (local.totals.get(id) ?? entries.length),
        entries,
      }))
  }, [local, placeEntries, limitPerGroup, rankGroup, groupLabelOf])

  /** Index à PLAT : les flèches traversent les rubriques sans buter sur les en-têtes. */
  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections])
  /** Rang à plat d'une entrée, par identité — évite un compteur muté pendant le rendu. */
  const indexOfEntry = useMemo(() => new Map(flat.map((e, i) => [e, i])), [flat])
  const itemCount = showingHistory ? history.length : flat.length
  /** La frappe s'est posée : le débounce a rattrapé la saisie courante. */
  const settled = debounced === q
  /** Résultats de la frappe PRÉCÉDENTE, gardés à l'écran pour éviter le clignotement. */
  const hasStale = local.entries.length > 0 || placeEntries !== null
  // Exclusion mutuelle avec le sélecteur : les deux panneaux s'ouvrent au même
  // endroit, sous le champ — empilés, aucun des deux n'est lisible.
  const showPanel = open && !scopeOpen && (showingHistory ? history.length > 0 : settled || hasStale)

  const goTo = useCallback(
    (position: { lat: number; lng: number }, bounds?: SearchEntry['bounds']) => {
      // Une emprise se CADRE (une zone, une ville se regardent en entier) ; un point
      // seul se survole à l'altitude de repli.
      if (bounds) engine.camera.fitBounds(bounds, { padding: searchCfg.fitPadding })
      else engine.camera.flyTo({ ...position, altitude: flyAltitude })
    },
    // `fitPadding` vient du même `searchCfg` que `flyAltitude` : le second était suivi,
    // pas le premier — le cadrage restait sur la marge du montage.
    [engine, flyAltitude, searchCfg.fitPadding],
  )

  const remember = useCallback(
    (item: HistoryItem) => {
      if (!historyStorageKey) return
      const next = [item, ...history.filter((h) => !(h.group === item.group && h.id === item.id))].slice(0, historySize)
      setHistory(next)
      writeStoredJSON(historyStorageKey, next)
    },
    [history, historySize, historyStorageKey],
  )

  const closeAfterChoice = () => {
    setQuery('')
    setDebounced('')
    setPlaceEntries(null)
    setOpen(false)
    setRowMenu(null)
  }

  /**
   * Entrée à jour pour un élément de la carte, re-cherchée par son titre dans sa
   * rubrique. Une entrée affichée est un INSTANTANÉ : entre son calcul et le clic, un
   * agent a pu se déplacer, ou disparaître du jeu de données. Utilisé aussi bien par
   * une ligne de résultat que par une ligne d'historique — même geste, même fraîcheur.
   */
  const resolveFresh = useCallback(
    (group: string, id: string, title: string): SearchEntry | undefined =>
      engine.search
        .query(normalizeSearch(title), { group, limit: searchCfg.resolveLimit })
        .entries.find((e) => String(e.id) === id),
    [engine, searchCfg.resolveLimit],
  )

  const choose = (e: SearchEntry) => {
    // Un lieu n'existe pas sur la carte : rien à re-résoudre, son point est figé.
    const fresh = e.select ? (resolveFresh(e.group, String(e.id), e.title) ?? e) : e
    onSelect?.(fresh)
    // `select` AVANT le déplacement : la sélection est l'état, le vol n'en est que la
    // conséquence visible. Pour un marker, c'est le `onSelect` de sa couche — le
    // chemin exact d'un clic sur la carte.
    fresh.select?.()
    goTo(fresh.position, fresh.bounds)
    remember({
      group: fresh.group,
      id: String(fresh.id),
      title: fresh.title,
      lat: fresh.position.lat,
      lng: fresh.position.lng,
    })
    closeAfterChoice()
  }

  // Un élément mémorisé a pu disparaître depuis : à défaut de le retrouver, on
  // retombe sur la position mémorisée, qui vaut mieux que rien. L'hôte est notifié
  // dans les DEUX cas — sinon un choix depuis l'historique passerait inaperçu chez
  // lui dès que l'élément n'est plus sur la carte.
  const chooseFromHistory = (h: HistoryItem) => {
    const again = resolveFresh(h.group, h.id, h.title)
    if (again) {
      choose(again)
      return
    }
    const stale: SearchEntry = { group: h.group, id: h.id, title: h.title, position: { lat: h.lat, lng: h.lng } }
    onSelect?.(stale)
    goTo(stale.position)
    remember(h)
    closeAfterChoice()
  }

  const clearHistory = () => {
    setHistory([])
    setOpen(false)
    if (historyStorageKey) removeStoredKey(historyStorageKey)
  }

  const activate = (index: number) => {
    if (showingHistory) {
      const h = history[index]
      if (h) chooseFromHistory(h)
      return
    }
    const e = flat[index]
    if (e) choose(e)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!showPanel || itemCount === 0) return
      event.preventDefault()
      setHighlight((h) => (h + (event.key === 'ArrowDown' ? 1 : itemCount - 1)) % itemCount)
    } else if (event.key === 'Enter') {
      if (!showPanel || itemCount === 0) return
      event.preventDefault()
      activate(highlight < itemCount ? highlight : 0)
    } else if (event.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const openRowMenu = (key: string, btn: HTMLElement) => {
    const rr = root?.getBoundingClientRect()
    if (!rr) return
    const r = btn.getBoundingClientRect()
    const width = 180
    const left = Math.min(r.right - rr.left - width, rr.width - width - 8)
    setRowMenu({ key, left: Math.max(8, left), top: r.bottom - rr.top + 2 })
  }

  const scopeName = scopeGroup === null ? labels.search.scopeAll : groupLabelOf(scopeGroup)
  // Pas de pastille sur « Tout » : elle ne représenterait aucune couleur en
  // particulier, et une teinte neutre se lirait comme une rubrique de plus.
  const scopeColor = scopeGroup === null ? null : groupById.get(scopeGroup)?.color
  const emptyMessage =
    scopeGroup === null ? labels.search.noResults : formatLabel(labels.search.noResultsInGroup, { group: scopeName })

  return (
    <div className="m3d-search" ref={rootRef}>
      <div className="m3d-search-box">
        <UiIcon path={mdiMagnify} className="m3d-search-icon" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? labels.search.placeholder}
          aria-label={labels.search.inputLabel}
          // Câblage combobox COMPLET. `aria-expanded` seul était inerte : un `input` a le
          // rôle `textbox`, qui ne le supporte pas — la boîte s'ouvrait sans que rien ne
          // soit annoncé. Et les lignes portaient `role="option"` sans `listbox` parent ni
          // moyen d'être désignées : les flèches déplaçaient une surbrillance que seul un
          // œil voyait. `aria-activedescendant` est ce qui la rend audible, sans jamais
          // sortir le focus du champ (une option ne se tabule pas dans ce motif).
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showPanel}
          aria-activedescendant={showPanel ? optionId(highlight) : undefined}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="m3d-search-clear"
            aria-label={labels.search.clearInput}
            onClick={() => {
              setQuery('')
              setDebounced('')
              setPlaceEntries(null)
              inputRef.current?.focus()
            }}
          >
            <UiIcon path={mdiClose} />
          </button>
        )}
        {/* En DERNIER : on saisit un nom, puis on restreint. La loupe et le champ
            gardent le bord gauche, là où l'œil commence à lire. */}
        {scope && (
          <div className="m3d-search-scope" ref={scopeRef}>
            <button
              type="button"
              className="m3d-search-scopebtn"
              aria-haspopup="listbox"
              aria-expanded={scopeOpen}
              aria-label={labels.search.scopeLabel}
              onClick={() => {
                setScopeOpen((v) => !v)
                setRowMenu(null)
              }}
            >
              {scopeColor && <i className="m3d-search-scopedot" style={{ background: scopeColor }} />}
              <span>{scopeName}</span>
              <UiIcon path={mdiChevronDown} />
            </button>
            {scopeOpen && (
              <div ref={setScopePanel} className="m3d-search-scopemenu m3d-panel" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={scopeGroup === null}
                  className={`m3d-search-scopeitem${scopeGroup === null ? ' m3d-active' : ''}`}
                  onClick={() => {
                    setScopeGroup(null)
                    setScopeOpen(false)
                    inputRef.current?.focus()
                  }}
                >
                  {labels.search.scopeAll}
                </button>
                {scopeGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="option"
                    aria-selected={scopeGroup === g.id}
                    className={`m3d-search-scopeitem${scopeGroup === g.id ? ' m3d-active' : ''}`}
                    onClick={() => {
                      setScopeGroup(g.id)
                      setScopeOpen(false)
                      inputRef.current?.focus()
                    }}
                  >
                    <span className="m3d-search-scopename">
                      <i className="m3d-search-scopedot" style={{ background: g.color ?? 'currentColor' }} />
                      {g.label}
                    </span>
                    {g.count > 0 && <small>{g.count}</small>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showPanel && (
        <div ref={setResultsPanel} className="m3d-search-results m3d-panel" id={listId} role="listbox">
          {showingHistory ? (
            <>
              <div className="m3d-settings-subtitle m3d-search-subtitle">{labels.search.historyTitle}</div>
              {history.map((h, i) => (
                <SearchRow
                  key={`${h.group}-${h.id}`}
                  id={optionId(i)}
                  leading={<UiIcon path={mdiHistory} className="m3d-search-icon" />}
                  title={h.title}
                  subtitle={groupLabelOf(h.group)}
                  active={i === highlight}
                  onHover={() => setHighlight(i)}
                  onSelect={() => chooseFromHistory(h)}
                />
              ))}
              <button type="button" className="m3d-tagclear" onClick={clearHistory}>
                <UiIcon path={mdiTrashCanOutline} />
                {labels.search.clearHistory}
              </button>
            </>
          ) : sections.length === 0 ? (
            <div className="m3d-search-empty">{emptyMessage}</div>
          ) : (
            sections.map((section) => (
              <div key={section.id} role="group" aria-label={section.label}>
                <div className="m3d-search-group">
                  <span>{section.label}</span>
                  <small>{section.total}</small>
                </div>
                {section.entries.map((e) => {
                  const index = indexOfEntry.get(e) ?? 0
                  const key = `${e.group}-${e.id}`
                  return (
                    <SearchRow
                      key={key}
                      id={optionId(index)}
                      leading={
                        e.avatar || e.icon || e.color ? (
                          <Swatch avatar={e.avatar} icon={e.icon} color={e.color ?? 'currentColor'} />
                        ) : (
                          <UiIcon path={mdiMapMarkerOutline} className="m3d-search-icon" />
                        )
                      }
                      title={e.title}
                      titleColor={e.titleColor}
                      subtitle={e.subtitle}
                      active={index === highlight}
                      onHover={() => setHighlight(index)}
                      onSelect={() => choose(e)}
                      trailing={
                        e.menu && (
                          <>
                            <button
                              type="button"
                              className="m3d-mlact"
                              aria-haspopup="menu"
                              aria-label={formatLabel(labels.markerList.actions, { label: e.title })}
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation()
                                if (rowMenu?.key === key) closeRowMenu()
                                else openRowMenu(key, ev.currentTarget)
                              }}
                            >
                              <UiIcon path={mdiDotsHorizontal} />
                            </button>
                            {rowMenu?.key === key &&
                              root &&
                              createPortal(
                                // Le menu est PORTALÉ hors de `.m3d-search`, donc hors du
                                // `rootRef` que surveille `useDismiss` : sans arrêter le
                                // `pointerdown` ici, cliquer une entrée refermait le panneau
                                // et démontait le menu AVANT que le `click` n'arrive —
                                // l'action n'était jamais exécutée. `ContextMenu` n'arrête
                                // que `click` et `keydown`.
                                <div onPointerDown={(ev) => ev.stopPropagation()}>
                                  <ContextMenu
                                    items={menuItemsFor(e, closeAfterChoice)}
                                    onClose={closeRowMenu}
                                    className="m3d-mlmenu"
                                    style={{ left: rowMenu.left, top: rowMenu.top }}
                                    panelRef={setMenuEl}
                                  />
                                </div>,
                                root,
                              )}
                          </>
                        )
                      }
                    />
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

type SearchRowProps = {
  /** Identifiant de l'option — cible d'`aria-activedescendant` sur le champ. */
  id: string
  /** Repère visuel : pastille/avatar/icône d'un résultat, horloge d'un historique. */
  leading: ReactNode
  title: string
  titleColor?: string
  subtitle?: string
  /** Surbrillance clavier — même état visuel que le survol. */
  active: boolean
  onHover: () => void
  onSelect: () => void
  /** Bouton « … » et son menu en portail, quand la ligne en offre un. */
  trailing?: ReactNode
}

/**
 * Une ligne de résultat. Historique et rubriques passent par ICI, sans exception :
 * les deux rendus étaient deux copies de la même structure, qui divergeaient au
 * premier ajustement (un padding, un `aria`, un état de surbrillance).
 */
function SearchRow({ id, leading, title, titleColor, subtitle, active, onHover, onSelect, trailing }: SearchRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={`m3d-search-item${active ? ' m3d-active' : ''}`}
      onPointerEnter={onHover}
      onClick={onSelect}
    >
      {leading}
      <div className="m3d-search-text">
        <b style={titleColor ? { color: titleColor } : undefined}>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {trailing}
    </div>
  )
}

/**
 * Menu d'une ligne : celui du marker, tel quel. Chaque action referme la recherche —
 * on vient de partir faire autre chose, laisser la liste ouverte par-dessus n'aurait
 * pas de sens.
 */
function menuItemsFor(entry: SearchEntry, onDone: () => void): MenuItem[] {
  const items = entry.menu?.() ?? []
  return items.map((item) =>
    'separator' in item && item.separator
      ? item
      : {
          ...item,
          onSelect: () => {
            item.onSelect?.()
            onDone()
          },
        },
  )
}
