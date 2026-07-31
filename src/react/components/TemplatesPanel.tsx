import {
  mdiCheck,
  mdiClose,
  mdiContentSaveEditOutline,
  mdiContentSaveOutline,
  mdiCrosshairsGps,
  mdiLockOutline,
  mdiPencilOutline,
  mdiPlus,
  mdiTrayArrowDown,
  mdiTrayArrowUp,
} from '@mdi/js'
import { type CSSProperties, useId, useMemo, useRef, useState } from 'react'
import type { ApplyMode, TemplateCategory } from '../../core/templates/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { type UseTemplatesOptions, useTemplates, type TemplatesView } from '../hooks/useTemplates'
import { Confirm } from './Confirm'
import { MapTooltip } from './MapTooltip'
import { Dropdown, useToggleShortcut } from './Dropdown'
import { TemplateThumb } from './TemplateThumb'
import { tipProps, useTip } from './tooltip'
import { UiIcon } from './UiIcon'

/** Hissé hors du render : liste stable des modes offerts au clic sur une ligne. */
const APPLY_MODES = ['merge', 'replace', 'remove'] as const satisfies readonly ApplyMode[]

export type TemplatesPanelProps = UseTemplatesOptions & {
  /** Côté de la barre hôte : le panneau s'ouvre du côté opposé. */
  position?: 'left' | 'right'
  /** id du `<Tooltip>` partagé de la barre hôte (MapControls). */
  tipId?: string
  /** Touche (lettre seule) qui ouvre/ferme le panneau. `false` = aucun raccourci. */
  shortcut?: string | false
  /** Rendu SANS sa propre carte `.m3d-controls-group` — pour un groupe partagé (avec « Couches »). */
  grouped?: boolean
}

/**
 * Bouton « Templates » de la barre de contrôles — **même structure que « Couches »** :
 * un `Dropdown` (bouton + panneau latéral partagés, exclusivité, dismiss). Le contenu
 * vit dans `useTemplates`, qui atteint le dessin via `engine.templates.drawPort` — donc
 * aucun besoin du contexte `<DrawLayer>`.
 */
export function TemplatesPanel({ position = 'right', tipId, shortcut, grouped, ...opts }: TemplatesPanelProps) {
  const labels = useLabels()
  const { theme } = useMapContext()
  const view = useTemplates(opts)
  const tip = useTip(tipId ?? '')
  const toggleRef = useRef<() => void>(() => {})

  // Raccourci d'ouverture/fermeture (lettre seule, hors champ de saisie) — comme « Couches ».
  useToggleShortcut(shortcut, toggleRef)

  return (
    <Dropdown
      icon={mdiContentSaveOutline}
      label={labels.templates.title}
      tip={tipId ? tip : undefined}
      shortcut={shortcut}
      position={position}
      maxHeight={theme.sizing.panelMaxHeight.templates}
      buttonClassName="m3d-tplbtn"
      panelClassName="m3d-tplpanel"
      className="m3d-templates"
      grouped={grouped}
      badge={view.templates.length > 0 ? <span className="m3d-tag-badge">{view.templates.length}</span> : undefined}
      toggleRef={toggleRef}
    >
      {() => <TemplatesBody view={view} />}
    </Dropdown>
  )
}

function TemplatesBody({ view }: { view: TemplatesView }) {
  const labels = useLabels()
  const t = labels.templates
  // Instance PROPRE au panneau — pour son `place:'top'` et pour que ses lignes n'entrent
  // pas en concurrence avec la barre, pas pour une raison d'empilement : `<MapTooltip>`
  // la porte à la racine, où elle est sœur du panneau et passe donc au-dessus de lui.
  // (Elle était auparavant rendue DEDANS, seule façon d'y arriver à l'époque.)
  const tid = useId()
  // Ces lignes n'ont pas de raccourci : `tipProps` (convention partagée) réduit alors au libellé seul.
  const tipOf = (label: string): Record<string, string> => tipProps(tid, label, undefined, labels.format.shortcut)
  const [name, setName] = useState('')
  const [cats, setCats] = useState<Set<TemplateCategory>>(() => new Set(view.defaultCategories))
  /**
   * « Mémoriser aussi la vue ». Volontairement HORS de `cats` : une vue n'est pas une
   * catégorie de dessin (`TemplateCategory` se dérive d'un `DrawTool`), et les mélanger
   * ferait filtrer des formes par une case qui ne parle pas de formes.
   */
  const [withView, setWithView] = useState(view.defaultSaveView)
  /** Cases de la rangée = catégories offertes, plus « Vue » quand elle l'est. */
  const slots = view.categories.length + (view.saveView ? 1 : 0)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  /** Mode d'application au clic sur une ligne, initialisé sur `providers.templates.defaultApply`. */
  const [applyMode, setApplyMode] = useState<ApplyMode>(view.defaultApply)
  /** Action destructive (suppression) ou d'écrasement (mise à jour) en attente de confirmation. */
  const [pending, setPending] = useState<{ kind: 'delete' | 'update'; id: string; name: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const toggleCat = (c: TemplateCategory) =>
    setCats((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  // Un template de VUE SEULE est légitime (« Vernon », « Nice ») : sans la case cochée il
  // faut au moins une catégorie, avec elle il y a déjà quelque chose à enregistrer.
  const canSave = name.trim().length > 0 && (cats.size > 0 || withView) && !view.busy
  const onSave = () => {
    if (!canSave) return
    void view.saveCurrent(name.trim(), [...cats], { view: withView })
    setName('')
  }

  // Clic sur la ligne = appliquer le template selon le mode choisi (ajouter/remplacer/retirer).
  const load = (id: string) => view.apply(id, applyMode)

  return (
    <>
      {/* ── Formulaire de sauvegarde ── */}
      <div className="m3d-tplsave">
        <input
          className="m3d-tplname-input"
          value={name}
          placeholder={t.name}
          aria-label={t.name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
        <div className="m3d-tplsave-hint">{t.saveHint}</div>
        {/* Une seule rangée pour tout ce qu'on peut mettre dans un template. Le nombre de
            colonnes SUIT le contenu (`--m3d-tplcats-n`) plutôt que d'être figé : les
            catégories offertes sont réglables, et une valeur en dur laisserait des cases
            vides — ou serrerait tout — dès qu'un hôte n'en offre qu'une ou deux. */}
        <div className="m3d-tplcats" style={{ '--m3d-tplcats-n': slots } as CSSProperties}>
          {view.categories.map((c) => (
            <label key={c} className="m3d-tagrow m3d-tplcat">
              <input type="checkbox" checked={cats.has(c)} onChange={() => toggleCat(c)} />
              <span className="m3d-taglabel">{t.category[c]}</span>
            </label>
          ))}
          {/* Dernière case de la rangée, mais pas une catégorie pour autant : elle ne
              nourrit pas `cats` (cf. `withView`), elle garde sa propre consigne dessous. */}
          {view.saveView && (
            <label className="m3d-tagrow m3d-tplcat">
              <input type="checkbox" checked={withView} onChange={() => setWithView((v) => !v)} />
              <span className="m3d-taglabel">{t.view}</span>
            </label>
          )}
        </div>
        {view.saveView && <div className="m3d-tplsave-hint">{t.viewHint}</div>}
        <button className="m3d-tplbtn-full" onClick={onSave} disabled={!canSave}>
          <UiIcon path={mdiPlus} />
          {t.save}
        </button>
      </div>

      {/* ── Mode appliqué au clic sur une ligne ci-dessous. Défaut = `defaultApply` (config),
             puis dernier mot à l'utilisateur pour la session du panneau. ── */}
      <div className="m3d-tplapply">
        <div className="m3d-tplsave-hint">{t.applyMode}</div>
        <div className="m3d-tplcats" role="radiogroup" aria-label={t.applyMode}>
          {APPLY_MODES.map((m) => (
            <label key={m} className="m3d-tagrow m3d-tplcat">
              <input type="radio" name={`${tid}-apply`} checked={applyMode === m} onChange={() => setApplyMode(m)} />
              <span className="m3d-taglabel">{t[m]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Liste : clic sur une ligne = appliquer le template selon le mode choisi ── */}
      <div className="m3d-tpllist">
        {view.templates.map((tpl) => {
          const isEditing = editing?.id === tpl.id
          const renameLabel = formatLabel(t.rename, { name: tpl.name })
          const commitRename = () => {
            if (editing && editing.value.trim() && editing.value.trim() !== tpl.name)
              void view.rename(tpl.id, editing.value.trim())
            setEditing(null)
          }
          const nameEl = isEditing ? (
            <input
              className="m3d-tplname-edit"
              autoFocus
              value={editing.value}
              aria-label={renameLabel}
              onChange={(e) => setEditing({ id: tpl.id, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            <span className="m3d-tplname">{tpl.name}</span>
          )
          // Vignette + méta, partagées par les deux enveloppes (bouton hors édition, div en édition).
          const body = (
            <>
              <TemplateThumb draw={tpl.content.draw} />
              <div className="m3d-tplmeta">
                <div className="m3d-tplrow-head">
                  {nameEl}
                  {/* Un clic ne fait pas la même chose selon que le template porte une vue
                      ou non (il déplace la carte) : ça doit se voir AVANT de cliquer. */}
                  {tpl.content.view && (
                    <span className="m3d-tpl-tag" {...tipOf(t.hasView)}>
                      <UiIcon path={mdiCrosshairsGps} />
                    </span>
                  )}
                  {tpl.origin === 'api' && <span className="m3d-tpl-tag">{t.shared}</span>}
                  {tpl.readOnly && (
                    <span className="m3d-tpl-tag m3d-tpl-ro" {...tipOf(t.readOnly)}>
                      <UiIcon path={mdiLockOutline} />
                    </span>
                  )}
                </div>
                {tpl.stats && <TemplateStats stats={tpl.stats} />}
              </div>
            </>
          )
          return (
            <div key={tpl.id} className="m3d-tplrow">
              {/* Geste principal = vrai <button> frère des actions : imbriquer un contrôle
                  focusable dans un autre est invalide (cf. MarkerList). En édition, le champ
                  de renommage remplace le bouton — un <input> ne peut vivre dans un <button>.
                  L'anneau de focus reste dessiné sur la LIGNE (`:has`). */}
              {isEditing ? (
                <div className="m3d-tplmain">{body}</div>
              ) : (
                <button type="button" className="m3d-tplmain" aria-label={t.apply} onClick={() => load(tpl.id)}>
                  {body}
                </button>
              )}
              <div className="m3d-tplactions">
                {isEditing ? (
                  <>
                    <button className="m3d-tplico m3d-tplico-ok" {...tipOf(t.confirm)} onClick={commitRename}>
                      <UiIcon path={mdiCheck} />
                    </button>
                    <button className="m3d-tplico" {...tipOf(t.cancel)} onClick={() => setEditing(null)}>
                      <UiIcon path={mdiClose} />
                    </button>
                  </>
                ) : (
                  <>
                    {/* Écrase le contenu du template avec le dessin courant — c'est ainsi
                        qu'on « améliore » un template sans en créer un. Toujours disponible
                        (confirmation avant écrasement) : pas de détection de « modifié ». */}
                    {!tpl.readOnly && (
                      <button
                        className="m3d-tplico m3d-tplico-ok"
                        {...tipOf(formatLabel(t.update, { name: tpl.name }))}
                        onClick={() => setPending({ kind: 'update', id: tpl.id, name: tpl.name })}
                      >
                        <UiIcon path={mdiContentSaveEditOutline} />
                      </button>
                    )}
                    {!tpl.readOnly && (
                      <button
                        className="m3d-tplico"
                        {...tipOf(renameLabel)}
                        onClick={() => setEditing({ id: tpl.id, value: tpl.name })}
                      >
                        <UiIcon path={mdiPencilOutline} />
                      </button>
                    )}
                    {view.allowExport && (
                      <button className="m3d-tplico" {...tipOf(t.export)} onClick={() => view.exportFile(tpl.id)}>
                        <UiIcon path={mdiTrayArrowDown} />
                      </button>
                    )}
                    {!tpl.readOnly && (
                      <button
                        className="m3d-tplico m3d-tplico-danger"
                        {...tipOf(formatLabel(t.delete, { name: tpl.name }))}
                        onClick={() => setPending({ kind: 'delete', id: tpl.id, name: tpl.name })}
                      >
                        <UiIcon path={mdiClose} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        {view.templates.length === 0 && <div className="m3d-tplempty">{t.empty}</div>}
      </div>

      {/* ── Import ── */}
      {view.allowExport && (
        <button className="m3d-tplbtn-full m3d-tplbtn-ghost" onClick={() => importRef.current?.click()}>
          <UiIcon path={mdiTrayArrowUp} />
          {t.import}
          <input
            ref={importRef}
            type="file"
            accept=".m3dt,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void view.importFile(file)
              e.target.value = ''
            }}
          />
        </button>
      )}

      {pending && (
        <Confirm
          message={formatLabel(pending.kind === 'delete' ? t.deleteConfirm : t.updateConfirm, { name: pending.name })}
          confirmLabel={t.confirm}
          cancelLabel={t.cancel}
          danger={pending.kind === 'delete'}
          onConfirm={() => {
            if (pending.kind === 'delete') void view.remove(pending.id)
            // La case « Vue » du formulaire vaut aussi ici : mettre à jour, c'est
            // réenregistrer l'état courant tel qu'il est coché. Décochée, la vue déjà
            // enregistrée est CONSERVÉE — on met à jour ce qui est demandé, on n'efface pas.
            else void view.updateFromDrawing(pending.id, { view: withView })
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {/* Tooltip DU panneau (même contexte d'empilement que les lignes) — apparence
          `.m3d-tip` du thème, comme la barre. */}
      <MapTooltip id={tid} place="top" />
    </>
  )
}

/** Ligne de stats compacte : « libellé nombre » par famille non nulle + poids. */
function TemplateStats({ stats }: { stats: NonNullable<TemplatesView['templates'][number]['stats']> }) {
  const t = useLabels().templates
  const parts = useMemo(() => {
    const out: string[] = []
    const pair = (label: string, count: number) => formatLabel(t.stats.pair, { label, count })
    if (stats.shapes) out.push(pair(t.category.shapes, stats.shapes))
    if (stats.freehand) out.push(pair(t.category.freehand, stats.freehand))
    if (stats.symbols) out.push(pair(t.category.symbols, stats.symbols))
    out.push(formatLabel(t.stats.bytes, { count: stats.bytes }))
    return out
  }, [stats, t])
  return <div className="m3d-tplstats">{parts.join(' · ')}</div>
}
