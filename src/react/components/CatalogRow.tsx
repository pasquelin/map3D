import { mdiAlertCircleOutline, mdiChevronRight } from '@mdi/js'
import { memo, useEffect, useRef } from 'react'
import type { CatalogNode } from '../../catalog/flatten'
import type { CatalogAction, CatalogId, CatalogItem, CatalogSource } from '../../catalog/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

export type CatalogRowProps = {
  node: CatalogNode
  source: CatalogSource
  /** Actions de la source, déjà plafonnées — identité stable entre deux renders. */
  actions: readonly CatalogAction[]
  /** Cet élément est-il sur la carte ? Pour un agrégat, `checkState` fait autorité. */
  shown: boolean
  pending: boolean
  failed: boolean
  expanded: boolean
  onToggleExpand: (id: CatalogId) => void
  /**
   * État de la case. `'mixed'` n'existe que pour un agrégat dont une PARTIE des enfants
   * est affichée — c'est l'état natif `indeterminate`, pas une troisième valeur métier.
   */
  checkState: 'on' | 'off' | 'mixed'
  /**
   * Coche ou décoche : pour un agrégat, cela porte sur tous ses enfants.
   *
   * Reçoit le `node` en argument plutôt que d'être fermé dessus : une closure par ligne
   * changeait d'identité à chaque render et défaisait le `memo` de ce composant.
   */
  onCheck: (node: CatalogNode, next: boolean) => void
  /** Clic sur le nom : bascule ET cadre. */
  onActivate: (item: CatalogItem) => void
  /** id du `<Tooltip>` de la barre hôte — les infobulles de la lib, pas des `title` natifs. */
  tipId: string
}

/**
 * Une ligne : chevron, case « sur la carte », pastille, nom, badges, actions.
 *
 * **Toutes ses props sont des primitives ou des identités stables.** C'est la condition
 * du `memo` : la ligne recevait auparavant l'API du catalogue (identité neuve à chaque
 * mutation du store) et une closure `onCheck` créée par ligne — le `memo` ne pouvait
 * alors JAMAIS court-circuiter, et les dix-neuf lignes visibles se re-rendaient à chaque
 * frame de défilement.
 *
 * **Infobulle sur les seules actions de source.** Partout ailleurs le sens est déjà à
 * l'écran — un nom, un compteur, une case dont l'état se voit — et une bulle par survol
 * transformait le parcours d'une liste en clignotement. Les contrôles muets gardent en
 * revanche un `aria-label` : c'est un nom accessible, pas une infobulle. Une icône
 * d'action, elle, ne dit rien d'elle-même : c'est le seul endroit qui doit s'expliquer.
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
  actions,
  shown: isShown,
  pending,
  failed,
  expanded,
  onToggleExpand,
  checkState,
  onCheck,
  onActivate,
  tipId,
}: CatalogRowProps) {
  const { item, depth } = node
  const { theme } = useMapContext()
  const labels = useLabels()
  const tip = useTip(tipId)

  const shown = checkState === 'on'
  // `indeterminate` n'est pas un attribut : il ne s'écrit que sur le nœud, d'où le ref.
  const boxRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = checkState === 'mixed'
  }, [checkState])
  const off = item.disabled === true
  // La COLONNE du chevron n'existe que si la source sait déplier : sur un référentiel
  // plat (villes, zones), réserver sa gouttière décalait chaque ligne de 18 px pour un
  // contrôle qui n'apparaîtra jamais.
  const expandableSource = source.children !== undefined
  const expandable = item.hasChildren === true && expandableSource

  return (
    <div className={`m3d-catrow${depth > 0 ? ' m3d-child' : ''}${off ? ' m3d-off' : ''}`}>
      {expandable ? (
        <button
          type="button"
          className={`m3d-catchevron${expanded ? ' m3d-on' : ''}`}
          aria-label={expanded ? labels.catalog.collapse : labels.catalog.expand}
          aria-expanded={expanded}
          disabled={off}
          onClick={() => onToggleExpand(item.id)}
        >
          <UiIcon path={mdiChevronRight} />
        </button>
      ) : expandableSource ? (
        // Gouttière réservée : les lignes SANS enfants d'une source qui en a doivent
        // aligner leur nom sur celles qui portent un chevron.
        <span className="m3d-catchevron-spacer" />
      ) : null}

      {/* Case à cocher et non bouton : « sur la carte » est un ÉTAT persistant, et c'est
          déjà ainsi que « Couches » l'exprime — jusqu'à sa PLACE, en tête de ligne, pour
          que les deux panneaux de la même barre se lisent pareil. */}
      <input
        ref={boxRef}
        type="checkbox"
        className="m3d-catcheck"
        aria-label={formatLabel(shown ? labels.catalog.remove : labels.catalog.add, { label: item.title })}
        checked={shown}
        disabled={off || pending}
        // Depuis « partiellement coché », le geste attendu est de TOUT cocher — c'est la
        // convention des arbres de cases, et `e.target.checked` la donne déjà.
        onChange={(e) => onCheck(node, e.target.checked)}
      />

      <button
        type="button"
        className="m3d-catmain"
        aria-pressed={isShown}
        disabled={off || pending}
        onClick={() => onActivate(item)}
      >
        {item.icon ? (
          <UiIcon path={item.icon} color={item.color} />
        ) : (
          <span className="m3d-tagdot" style={{ background: item.color ?? theme.colors.zone.stroke }} />
        )}
        <span className="m3d-cattitle">{item.title}</span>
      </button>

      {failed && (
        <span className="m3d-caterrdot" aria-label={labels.catalog.itemError}>
          <UiIcon path={mdiAlertCircleOutline} />
        </span>
      )}

      {item.badges?.map((b, i) => (
        <span
          key={`${b.label}-${i}`}
          className="m3d-catbadge"
          aria-label={b.label}
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
