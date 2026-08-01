import { mdiInformationOutline, mdiMagnify } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeSearch } from '../../search/match'
import { symbolText } from '../../labels/mergeLabels'
import type { SymbolEntry } from '../../symbols/types'
import { useConfig, useLabels, useMapContext, useTheme } from '../context'
import { useDraggable } from '../hooks/useDraggable'
import { useDrawing } from '../hooks/useDrawing'
import { TOOL_ICONS } from './drawControls'
import { Dropdown } from './Dropdown'
import { useTip } from './tooltip'
import { TIP_ID } from './Toolbar'

/** Type de charge d'un drag venant de la palette (consommé par la zone carte). */
export const SYMBOL_DRAG_TYPE = 'm3d-symbol'

/**
 * Outil **Symboles** de la barre de dessin : le bouton se comporte comme les autres
 * outils (icône, libellé, raccourci, état actif) et ouvre une palette où les entrées
 * du catalogue sont rangées par catégorie, avec recherche et choix d'affiliation.
 *
 * Aucune configuration : le catalogue, le renderer et l'affiliation viennent de
 * `useDrawing().symbols` (fournis par `<DrawLayer>`), et **tous les textes** de
 * `labels.symbols` — donc traduisibles via `<MapProvider labels>`.
 *
 * Une vignette se **glisse sur la carte** : le dépôt crée une forme `kind: 'symbol'`,
 * éditable comme un rectangle (déplacement, rotation, poignées).
 */
export function SymbolPaletteButton({ position = 'left' }: { position?: 'left' | 'right' }) {
  const labels = useLabels()
  const { symbols, shortcuts } = useDrawing()
  const tip = useTip(TIP_ID)
  const theme = useTheme()
  const { engine } = useMapContext()

  // L'ouverture est PUBLIÉE (la barre éteint la main, la symbologie se charge) depuis un
  // EFFET, jamais pendant le clic : `Dropdown` s'en charge via `onOpenChange`.
  const publish = symbols.setPaletteOpen
  const onOpenChange = useCallback(
    (open: boolean) => {
      publish(open)
      // Ouvrir la palette quitte le pick de bâtiment : deux boutons allumés à la fois, et
      // la barre ne dirait plus quel outil tient le clic. Les outils de tracé, eux,
      // passent par `setDrawing`, qui s'en charge côté moteur.
      if (open) engine.setBuildingPickMode(false)
    },
    [publish, engine],
  )
  // Une barre démontée (vue quittée, outil masqué) laisserait sinon la carte croire la
  // palette encore ouverte.
  useEffect(() => () => publish(false), [publish])

  if (!symbols.enabled) return null

  return (
    <Dropdown
      icon={TOOL_ICONS.symbol}
      label={labels.tools.symbol}
      tip={tip}
      shortcut={shortcuts.symbol}
      position={position}
      maxHeight={theme.sizing.panelMaxHeight.symbols}
      panelClassName="m3d-sympanel"
      className="m3d-sympalette"
      grouped
      // Compte des symboles posés, comme les boutons Couches/Catalogue/Templates — absent à
      // zéro (rien à annoncer).
      badge={symbols.count > 0 ? <span className="m3d-tag-badge">{symbols.count}</span> : undefined}
      onOpenChange={onOpenChange}
    >
      {() => <SymbolPanel />}
    </Dropdown>
  )
}

/** Contenu du panneau — monté uniquement ouvert (aucun rendu de vignette fermé). */
function SymbolPanel() {
  const labels = useLabels()
  const previewSize = useConfig().interaction.symbols.previewSizePx
  const { symbols } = useDrawing()
  const [query, setQuery] = useState('')

  // `normalizeSearch` et non un `toLowerCase` : « etat-major » doit trouver
  // « État-major », comme la recherche de la carte.
  const q = normalizeSearch(query)
  // Les entrées multi-points sont listées mais non saisissables (leur mode de pose
  // n'existe pas encore) : les masquer ferait croire à un catalogue incomplet.
  const groups = useMemo(() => {
    const matching = q
      ? symbols.catalog.entries.filter((e) => {
          // Sur les textes TRADUITS : chercher « hospital » dans une UI anglaise ne
          // doit pas échouer parce que le catalogue dit « hôpital ».
          const t = symbolText(labels, e)
          return (
            normalizeSearch(t.label).includes(q) ||
            (t.description !== undefined && normalizeSearch(t.description).includes(q)) ||
            e.keywords?.some((k) => normalizeSearch(k).includes(q))
          )
        })
      : symbols.catalog.entries
    const byCategory = new Map<string, SymbolEntry[]>()
    for (const entry of matching) {
      const list = byCategory.get(entry.category)
      if (list) list.push(entry)
      else byCategory.set(entry.category, [entry])
    }
    return [...byCategory]
    // `labels` : le filtre porte sur les textes TRADUITS (`symbolText`) — l'omettre
    // laissait une recherche en cours filtrer sur la langue précédente.
  }, [symbols.catalog, q, labels])

  const total = groups.reduce((n, [, list]) => n + list.length, 0)

  /**
   * Vignettes du catalogue, calculées en une passe. Chaque item consommait le
   * contexte de dessin et appelait le renderer à chaque rendu : l'objet de contexte
   * changeant à chaque frame d'un tracé en cours, une palette ouverte pendant un
   * dessin recalculait ses ~90 vignettes 60 fois par seconde.
   */
  const vignettes = useMemo(() => {
    const out = new Map<string, string>()
    for (const entry of symbols.catalog.entries) {
      const svg = symbols.render(entry.key, { size: previewSize })?.svg
      if (svg) out.set(entry.key, svg)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.catalog, symbols.affiliation, symbols.ready, previewSize])

  /**
   * Textes résolus une fois par jeu de libellés. `symbolText` renvoie un objet neuf
   * à chaque appel : passé en prop au vol, il faisait échouer la comparaison de
   * `memo(PaletteItem)` pour TOUS les items à chaque rendu du panneau — même porte
   * que celle refermée juste au-dessus pour les vignettes.
   */
  const textes = useMemo(() => {
    const out = new Map<string, ReturnType<typeof symbolText>>()
    for (const entry of symbols.catalog.entries) out.set(entry.key, symbolText(labels, entry))
    return out
  }, [symbols.catalog, labels])
  // Variantes DÉCLARÉES PAR LE CATALOGUE (un catalogue sans variantes n'affiche pas
  // de sélecteur) ; leurs libellés viennent des labels, donc traduisibles.
  const variantColors = symbols.catalog.variantColors
  const affiliations = variantColors ? Object.keys(variantColors) : []

  return (
    <>
      <div className="m3d-tagsearch">
        <UiIcon path={mdiMagnify} />
        <input
          autoFocus
          value={query}
          placeholder={labels.symbols.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {affiliations.length > 1 && (
        <div className="m3d-symvariants" role="group" aria-label={labels.symbols.affiliation}>
          {affiliations.map((value) => {
            const couleur = variantColors?.[value]
            const actif = value === symbols.affiliation
            return (
              <button
                key={value}
                type="button"
                className={`m3d-symvariant${actif ? ' m3d-on' : ''}`}
                onClick={() => symbols.setAffiliation(value)}
                aria-pressed={actif}
                // Le bouton actif porte la couleur de SON affiliation, pas l'accent
                // générique de l'UI : c'est cette couleur qui identifie l'affiliation
                // sur la carte, l'écho doit être immédiat.
                style={
                  actif && couleur
                    ? { background: couleur, borderColor: couleur, color: lisibleSur(couleur) }
                    : undefined
                }
              >
                <span className="m3d-tagdot" style={{ background: couleur ?? 'currentColor' }} />
                {labels.symbols.affiliations[value]}
              </button>
            )
          })}
        </div>
      )}

      <div className="m3d-symhint">
        <UiIcon path={mdiInformationOutline} />
        <span>{labels.symbols.dragHint}</span>
      </div>

      <div className="m3d-symgroups">
        {groups.map(([category, entries]) => (
          <section key={category} className="m3d-symgroup">
            <h4 className="m3d-symgroup-title">
              {labels.symbols.categories[category] ?? category}
              <span className="m3d-tagcount">{entries.length}</span>
            </h4>
            <div className="m3d-symgrid">
              {entries.map((entry) => (
                <PaletteItem
                  key={entry.key}
                  entry={entry}
                  svg={vignettes.get(entry.key)}
                  hint={labels.symbols.multiPointHint}
                  text={textes.get(entry.key)!}
                />
              ))}
            </div>
          </section>
        ))}
        {total === 0 && <div className="m3d-tagempty">{labels.symbols.noMatch}</div>}
      </div>
    </>
  )
}

/**
 * Vignette saisissable. `longPressMs: 0` : une palette n'a pas de clic à préserver,
 * la prise doit être immédiate — contrairement à une forme de la carte, dont le clic
 * sélectionne et qui exige donc un appui maintenu.
 */
const PaletteItem = memo(function PaletteItem({
  entry,
  svg,
  hint,
  text,
}: {
  entry: SymbolEntry
  /** Textes résolus (traduction de la locale, ou ceux du catalogue). */
  text: { label: string; description?: string }
  svg?: string
  hint: string
}) {
  const disabled = entry.multiPoint === true
  const previewSize = useConfig().interaction.symbols.previewSizePx

  const drag = useDraggable({
    payload: { type: SYMBOL_DRAG_TYPE, id: entry.key, data: { key: entry.key } },
    longPressMs: 0,
    disabled,
    ghost: svg ? <SymbolGlyph svg={svg} size={previewSize + 6} /> : undefined,
    ghostClassName: 'm3d-symghost',
  })

  return (
    <div
      onPointerDown={disabled ? undefined : drag.onPointerDown}
      // `drag.className` porte `touch-action:none` : l'omettre laisserait le geste de
      // saisie partir en scroll du panneau sur écran tactile, rendant les vignettes
      // impossibles à glisser. Composé explicitement — un spread serait écrasé par
      // le `className` qui suit.
      className={[disabled ? 'm3d-symitem m3d-disabled' : 'm3d-symitem', disabled ? '' : drag.className]
        .filter(Boolean)
        .join(' ')}
      title={disabled ? `${text.label} — ${hint}` : (text.description ?? text.label)}
      aria-label={text.label}
      aria-disabled={disabled || undefined}
      style={{ width: previewSize + 10, height: previewSize + 10 }}
    >
      {svg ? (
        <SymbolGlyph svg={svg} size={previewSize} />
      ) : (
        <span className="m3d-symskeleton" style={{ width: previewSize, height: previewSize }} />
      )}
    </div>
  )
})

/**
 * Rend le markup SVG du provider. `dangerouslySetInnerHTML` est ici le seul chemin :
 * le SVG vient du renderer injecté (code de l'application, pas d'une saisie
 * utilisateur), exactement comme `MarkerLayer` consomme sa prop `icon`.
 */
function SymbolGlyph({ svg, size }: { svg: string; size: number }) {
  return (
    <span className="m3d-symglyph" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
  )
}

/**
 * Noir ou blanc selon la luminance du fond : le jaune de l'affiliation « inconnu »
 * rendrait un libellé blanc illisible.
 */
function lisibleSur(hex: string): string {
  const v = hex.replace('#', '')
  const n =
    v.length === 3
      ? v
          .split('')
          .map((c) => c + c)
          .join('')
      : v
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  // Luminance perçue (pondération ITU-R BT.601, suffisante pour un choix binaire).
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? '#101828' : '#ffffff'
}
