import { mdiInformationOutline, mdiMagnify } from '@mdi/js'
import Icon from '@mdi/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { SymbolEntry } from '../../symbols/types'
import { useLabels } from '../context'
import { useDraggable } from '../hooks/useDraggable'
import { useDrawing } from '../hooks/useDrawing'
import { TOOL_ICONS } from './drawControls'
import { useAnchoredPanel } from './panelFit'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { TIP_ID } from './Toolbar'
import { useDismiss } from './useDismiss'

/** Type de charge d'un drag venant de la palette (consommé par la zone carte). */
export const SYMBOL_DRAG_TYPE = 'm3d-symbol'

/** Hauteur maximale souhaitée du panneau quand le conteneur le permet (px). */
const PANEL_MAX_HEIGHT = 420
/** Taille (px) des vignettes de la grille. */
const PREVIEW_SIZE = 34

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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const tip = useTip(TIP_ID)

  useDismiss(rootRef, open, () => setOpen(false))

  // L'ouverture est PUBLIÉE (la barre éteint la main, la symbologie se charge), et
  // publiée depuis un EFFET : `open` reste l'état local qui commande l'affichage.
  // Le relire depuis le contexte refermait le panneau — l'aller-retour ajoutait un
  // rendu, et `useDismiss` s'armait à temps pour prendre le clic d'ouverture pour
  // un clic extérieur.
  const publish = symbols.setPaletteOpen
  useEffect(() => {
    publish(open)
    // Une barre démontée (vue quittée, outil masqué) laisserait sinon la carte
    // croire la palette encore ouverte.
    return () => publish(false)
  }, [open, publish])

  if (!symbols.enabled) return null

  return (
    <div className="m3d-sympalette" ref={rootRef}>
      <ToolButton
        icon={TOOL_ICONS.symbol}
        label={labels.tools.symbol}
        tip={tip}
        shortcut={shortcuts.symbol}
        active={open}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && <SymbolPanel position={position} />}
    </div>
  )
}

/** Contenu du panneau — monté uniquement ouvert (aucun rendu de vignette fermé). */
function SymbolPanel({ position }: { position: 'left' | 'right' }) {
  const labels = useLabels()
  const { symbols } = useDrawing()
  const [query, setQuery] = useState('')
  const [side, setPanel] = useAnchoredPanel(position, { maxHeight: PANEL_MAX_HEIGHT })

  const q = query.trim().toLowerCase()
  // Les entrées multi-points sont listées mais non saisissables (leur mode de pose
  // n'existe pas encore) : les masquer ferait croire à un catalogue incomplet.
  const groups = useMemo(() => {
    const matching = q
      ? symbols.catalog.entries.filter(
          (e) =>
            e.label.toLowerCase().includes(q) ||
            e.description?.toLowerCase().includes(q) ||
            e.keywords?.some((k) => k.toLowerCase().includes(q)),
        )
      : symbols.catalog.entries
    const byCategory = new Map<string, SymbolEntry[]>()
    for (const entry of matching) {
      const list = byCategory.get(entry.category)
      if (list) list.push(entry)
      else byCategory.set(entry.category, [entry])
    }
    return [...byCategory]
  }, [symbols.catalog, q])

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
      const svg = symbols.render(entry.key, { size: PREVIEW_SIZE })?.svg
      if (svg) out.set(entry.key, svg)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.catalog, symbols.affiliation, symbols.ready])
  // Variantes DÉCLARÉES PAR LE CATALOGUE (un catalogue sans variantes n'affiche pas
  // de sélecteur) ; leurs libellés viennent des labels, donc traduisibles.
  const variantColors = symbols.catalog.variantColors
  const affiliations = variantColors ? Object.keys(variantColors) : []

  return (
    <div ref={setPanel} className={`m3d-panel m3d-sympanel m3d-${side}`}>
      <div className="m3d-tagsearch">
        <Icon path={mdiMagnify} size={0.6} />
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
                className={`m3d-symvariant${actif ? ' m3d-on' : ''}`}
                onClick={() => symbols.setAffiliation(value)}
                aria-pressed={actif}
                // Le bouton actif porte la couleur de SON affiliation, pas l'accent
                // générique de l'UI : c'est cette couleur qui identifie l'affiliation
                // sur la carte, l'écho doit être immédiat.
                style={actif && couleur ? { background: couleur, borderColor: couleur, color: lisibleSur(couleur) } : undefined}
              >
                <span className="m3d-tagdot" style={{ background: couleur ?? 'currentColor' }} />
                {labels.symbols.affiliations[value]}
              </button>
            )
          })}
        </div>
      )}

      <div className="m3d-symhint">
        <Icon path={mdiInformationOutline} size={0.5} />
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
                <PaletteItem key={entry.key} entry={entry} svg={vignettes.get(entry.key)} hint={labels.symbols.multiPointHint} />
              ))}
            </div>
          </section>
        ))}
        {total === 0 && <div className="m3d-tagempty">{labels.symbols.noMatch}</div>}
      </div>
    </div>
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
}: {
  entry: SymbolEntry
  svg?: string
  hint: string
}) {
  const disabled = entry.multiPoint === true

  const drag = useDraggable({
    payload: { type: SYMBOL_DRAG_TYPE, id: entry.key, data: { key: entry.key } },
    longPressMs: 0,
    disabled,
    ghost: svg ? <SymbolGlyph svg={svg} size={PREVIEW_SIZE + 6} /> : undefined,
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
      title={disabled ? `${entry.label} — ${hint}` : (entry.description ?? entry.label)}
      aria-label={entry.label}
      aria-disabled={disabled || undefined}
      style={{ width: PREVIEW_SIZE + 10, height: PREVIEW_SIZE + 10 }}
    >
      {svg ? (
        <SymbolGlyph svg={svg} size={PREVIEW_SIZE} />
      ) : (
        <span className="m3d-symskeleton" style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }} />
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
    <span
      className="m3d-symglyph"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/**
 * Noir ou blanc selon la luminance du fond : le jaune de l'affiliation « inconnu »
 * rendrait un libellé blanc illisible.
 */
function lisibleSur(hex: string): string {
  const v = hex.replace('#', '')
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  // Luminance perçue (pondération ITU-R BT.601, suffisante pour un choix binaire).
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? '#101828' : '#ffffff'
}
