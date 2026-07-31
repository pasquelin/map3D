import { mdiAlertCircleOutline, mdiChevronRight, mdiMinus, mdiPlus } from '@mdi/js'
import { memo } from 'react'
import type { CatalogNode } from '../../catalog/flatten'
import type { CatalogAction, CatalogId, CatalogSource } from '../../catalog/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useConfig, useLabels, useMapContext } from '../context'
import type { CatalogApi } from '../hooks/useCatalog'
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
}

/**
 * Une ligne : chevron, pastille, nom cliquable, badges, actions, bascule d'affichage.
 *
 * La ligne n'est PAS un bouton — elle en contient plusieurs, chacun focusable
 * séparément. Un contrôle focusable dans un contrôle focusable est une imbrication
 * invalide que les lecteurs d'écran aplatissent (même règle que `MarkerList`).
 *
 * Hauteur CONSTANTE (`--m3d-catalog-row-h`) : la virtualisation en dépend. Rien ici ne
 * doit pouvoir la faire varier — pas de seconde ligne de texte, pas d'icône plus haute.
 */
function CatalogRowInner({ node, source, catalog, expanded, onToggleExpand }: CatalogRowProps) {
  const { item, key, depth } = node
  const { theme } = useMapContext()
  const labels = useLabels()
  const config = useConfig()

  const shown = catalog.isShown(key)
  const pending = catalog.isPending(key)
  const failed = catalog.hasError(key)
  const addable = item.addable !== false
  const actions = inlineActions(source, config.catalog.maxInlineActions)

  return (
    <div className={`m3d-catrow${depth > 0 ? ' m3d-child' : ''}`}>
      {item.hasChildren && source.children ? (
        <button
          type="button"
          className={`m3d-catchevron${expanded ? ' m3d-on' : ''}`}
          aria-label={expanded ? labels.catalog.collapse : labels.catalog.expand}
          aria-expanded={expanded}
          onClick={() => onToggleExpand(item.id)}
        >
          <UiIcon path={mdiChevronRight} />
        </button>
      ) : (
        <span className="m3d-catchevron-spacer" />
      )}

      <button
        type="button"
        className="m3d-catmain"
        // Le nom est tronqué par construction : l'infobulle est le seul endroit où il
        // se lit en entier.
        title={item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
        aria-label={formatLabel(labels.catalog.target, { label: item.title })}
        onClick={() => catalog.target(source, item)}
      >
        {item.icon ? (
          <UiIcon path={item.icon} color={item.color} />
        ) : (
          <span className="m3d-tagdot" style={{ background: item.color ?? theme.colors.zone.stroke }} />
        )}
        <span className="m3d-cattitle">{item.title}</span>
      </button>

      {failed && (
        <span className="m3d-caterrdot" title={labels.catalog.itemError} aria-label={labels.catalog.itemError}>
          <UiIcon path={mdiAlertCircleOutline} />
        </span>
      )}

      {item.badges?.map((b, i) => (
        <span
          key={`${b.label}-${i}`}
          className="m3d-catbadge"
          title={b.label}
          aria-label={b.label}
          style={b.color ? { color: b.color } : undefined}
        >
          {b.icon && <UiIcon path={b.icon} />}
          {b.text}
        </span>
      ))}

      {actions.map((a) =>
        a.hidden?.(item) ? null : (
          <button
            key={a.id}
            type="button"
            className="m3d-cataction"
            title={a.label}
            aria-label={a.label}
            disabled={a.disabled?.(item) ?? false}
            onClick={() => a.run(item, source)}
          >
            <UiIcon path={a.icon} />
          </button>
        ),
      )}

      <button
        type="button"
        className={`m3d-cattoggle${shown ? ' m3d-on' : ''}`}
        title={shown ? labels.catalog.remove : labels.catalog.add}
        aria-label={shown ? labels.catalog.remove : labels.catalog.add}
        aria-pressed={shown}
        // Un élément non ajoutable (agrégat vide) garde son bouton, grisé : le faire
        // disparaître décalerait la colonne d'une ligne à l'autre.
        disabled={pending || (!shown && !addable)}
        onClick={() => catalog.toggle(source, item)}
      >
        <UiIcon path={shown ? mdiMinus : mdiPlus} />
      </button>
    </div>
  )
}

export const CatalogRow = memo(CatalogRowInner)
