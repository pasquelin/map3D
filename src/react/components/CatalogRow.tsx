import { mdiAlertCircleOutline, mdiChevronRight } from '@mdi/js'
import { memo, useEffect, useRef } from 'react'
import type { CatalogNode } from '../../catalog/flatten'
import type { CatalogAction, CatalogId, CatalogSource } from '../../catalog/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useConfig, useLabels, useMapContext } from '../context'
import type { CatalogApi } from '../hooks/useCatalog'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

/** Sources déjà averties d'un débordement d'actions — un avertissement par source, pas par render. */
const warned = new Set<string>()

/**
 * Actions rendues en ligne, plafonnées.
 *
 * Au-delà du plafond, c'est le NOM qui disparaît — déjà tronqué par construction. On
 * tronque donc la liste d'actions, mais en le DISANT : une action silencieusement
 * absente est un bug qu'on ne trouve qu'en production.
 *
 * Pas de garde `import.meta.env.DEV` : la lib est publiée en ESM **et** en CJS, où
 * `import.meta` n'existe pas. Un avertissement unique par source ne pollue rien.
 */
function inlineActions(source: CatalogSource, max: number): readonly CatalogAction[] {
  const all = source.actions ?? []
  if (all.length <= max) return all
  if (!warned.has(source.id)) {
    warned.add(source.id)
    console.warn(
      `[map3d] catalogue « ${source.id} » : ${all.length} actions déclarées, ${max} rendues ` +
        `(config.catalog.maxInlineActions). Les suivantes sont ignorées.`,
    )
  }
  return all.slice(0, max)
}

export type CatalogRowProps = {
  node: CatalogNode
  source: CatalogSource
  catalog: CatalogApi
  expanded: boolean
  onToggleExpand: (id: CatalogId) => void
  /**
   * État de la case. `'mixed'` n'existe que pour un agrégat dont une PARTIE des enfants
   * est affichée — c'est l'état natif `indeterminate`, pas une troisième valeur métier.
   */
  checkState: 'on' | 'off' | 'mixed'
  /** Coche ou décoche : pour un agrégat, cela porte sur tous ses enfants. */
  onCheck: (next: boolean) => void
  /** id du `<Tooltip>` de la barre hôte — les infobulles de la lib, pas des `title` natifs. */
  tipId: string
}

/**
 * Une ligne : chevron, case « sur la carte », pastille, nom, badges, actions.
 *
 * **Le nom bascule ET cadre** : c'est le geste principal, celui qu'on fait en
 * parcourant une liste — on veut voir l'élément sur la carte, et l'y laisser. La case à
 * cocher, elle, bascule sans forcer le déplacement de caméra (elle suit le réglage
 * « cadrer à l'ajout »), pour ajouter plusieurs éléments sans que la vue saute.
 *
 * La ligne n'est PAS un bouton — elle en contient plusieurs, chacun focusable
 * séparément. Un contrôle focusable dans un contrôle focusable est une imbrication
 * invalide que les lecteurs d'écran aplatissent (même règle que `MarkerList`).
 *
 * Hauteur CONSTANTE (`--m3d-catalog-row-h`) : la virtualisation en dépend. Rien ici ne
 * doit pouvoir la faire varier — pas de seconde ligne de texte, pas d'icône plus haute.
 */
function CatalogRowInner({
  node,
  source,
  catalog,
  expanded,
  onToggleExpand,
  checkState,
  onCheck,
  tipId,
}: CatalogRowProps) {
  const { item, key, depth } = node
  const { theme } = useMapContext()
  const labels = useLabels()
  const config = useConfig()
  const tip = useTip(tipId)

  const shown = checkState === 'on'
  const pending = catalog.isPending(key)
  // `indeterminate` n'est pas un attribut : il ne s'écrit que sur le nœud, d'où le ref.
  const boxRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = checkState === 'mixed'
  }, [checkState])
  const failed = catalog.hasError(key)
  const off = item.disabled === true
  const actions = inlineActions(source, config.catalog.maxInlineActions)
  const expandable = item.hasChildren === true && source.children !== undefined

  return (
    <div className={`m3d-catrow${depth > 0 ? ' m3d-child' : ''}${off ? ' m3d-off' : ''}`}>
      {expandable ? (
        <button
          type="button"
          className={`m3d-catchevron${expanded ? ' m3d-on' : ''}`}
          {...tip(expanded ? labels.catalog.collapse : labels.catalog.expand)}
          aria-expanded={expanded}
          disabled={off}
          onClick={() => onToggleExpand(item.id)}
        >
          <UiIcon path={mdiChevronRight} />
        </button>
      ) : (
        <span className="m3d-catchevron-spacer" />
      )}

      {/* Case à cocher et non bouton : « sur la carte » est un ÉTAT persistant, et c'est
          déjà ainsi que « Couches » l'exprime — jusqu'à sa PLACE, en tête de ligne, pour
          que les deux panneaux de la même barre se lisent pareil. */}
      <input
        ref={boxRef}
        type="checkbox"
        className="m3d-catcheck"
        {...tip(formatLabel(shown ? labels.catalog.remove : labels.catalog.add, { label: item.title }))}
        checked={shown}
        disabled={off || pending}
        // Depuis « partiellement coché », le geste attendu est de TOUT cocher — c'est la
        // convention des arbres de cases, et `e.target.checked` la donne déjà.
        onChange={(e) => onCheck(e.target.checked)}
      />

      <button
        type="button"
        className="m3d-catmain"
        // Le nom est tronqué par construction : l'infobulle est le seul endroit où il se
        // lit en entier — d'où le libellé COMPLET plutôt qu'un intitulé d'action.
        {...tip(item.subtitle ? `${item.title} — ${item.subtitle}` : item.title)}
        aria-pressed={shown}
        disabled={off || pending}
        onClick={() => catalog.toggle(source, item, { fit: true })}
      >
        {item.icon ? (
          <UiIcon path={item.icon} color={item.color} />
        ) : (
          <span className="m3d-tagdot" style={{ background: item.color ?? theme.colors.zone.stroke }} />
        )}
        <span className="m3d-cattitle">{item.title}</span>
      </button>

      {failed && (
        <span className="m3d-caterrdot" {...tip(labels.catalog.itemError)}>
          <UiIcon path={mdiAlertCircleOutline} />
        </span>
      )}

      {item.badges?.map((b, i) => (
        <span
          key={`${b.label}-${i}`}
          className="m3d-catbadge"
          {...tip(b.label)}
          style={b.color ? { color: b.color } : undefined}
        >
          {b.icon && <UiIcon path={b.icon} />}
          {b.text}
        </span>
      ))}

      <span className="m3d-catactions">
        {actions.map((a) =>
          a.hidden?.(item) ? null : (
            <button
              key={a.id}
              type="button"
              className="m3d-cataction"
              {...tip(a.label)}
              disabled={off || (a.disabled?.(item) ?? false)}
              onClick={() => a.run(item, source)}
            >
              <UiIcon path={a.icon} />
            </button>
          ),
        )}
      </span>
    </div>
  )
}

export const CatalogRow = memo(CatalogRowInner)
