import { mdiPencilOutline } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { type BindableAction, MOVE_ACTIONS, VIEW_ACTIONS, keyConflict } from '../../config/preferences'
import { formatLabel } from '../../labels/mergeLabels'
import { useConfig, useLabels } from '../context'
import { usePreferences } from '../preferences/context'
import { UiIcon } from './UiIcon'
import { plainKey } from './shortcuts'

/**
 * Contrôles PARTAGÉS des préférences : le groupe segmenté (Qualité 3D, Vitesse) et le
 * `<kbd>` ÉDITABLE du récap des raccourcis. Le rebinding se fait DANS le récap, en place,
 * sans rien changer à sa grille — jamais dans un panneau séparé, jamais dupliqué.
 */

/** Actions dont le conflit se nomme par `labels…preferences.actions` ; le reste est générique. */
const PANEL_ACTIONS = new Set<string>([...MOVE_ACTIONS, ...VIEW_ACTIONS])

/** Groupe segmenté (boutons exclusifs) — `value` indéfini n'allume aucun bouton. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined
  options: ReadonlyArray<{ v: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="m3d-pref-seg" role="group">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`m3d-pref-segbtn${o.v === value ? ' m3d-on' : ''}`}
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Ligne étiquette ↔ contrôle. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="m3d-pref-field">
      <span className="m3d-pref-fieldlabel">{label}</span>
      {children}
    </div>
  )
}

/**
 * `<kbd>` du récap des raccourcis, rendu ÉDITABLE en place pour une action réassignable
 * (déplacement + vue). Aucun changement de mise en page : c'est le même `.m3d-kbd`, dans
 * la même ligne, la même grille — il devient juste cliquable.
 *
 * Cliquer arme la capture (`…`) ; la prochaine touche est affectée si elle est LIBRE dans
 * tout le keymap, refusée (kbd rouge + infobulle) si une commande la tient déjà, `Échap`
 * annule. Hors `<MapProvider>` (pas de store), retombe sur un `<kbd>` en lecture seule —
 * le récap reste identique à ce qu'il était.
 */
export function EditableKbd({ action, display }: { action: BindableAction; display: string }) {
  const { prefs, store } = usePreferences()
  const labels = useLabels()
  const p = labels.settings.preferences
  const shortcuts = useConfig().interaction.shortcuts
  // Refs « latest » : le listener ne se rattache qu'à l'armement de la capture.
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts
  const [capturing, setCapturing] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!capturing || !store) return
    // Pas de garde « carte active » (cf. `activeMap.ts`) : la capture n'est armée que
    // par un clic sur CE bouton, et consomme la touche en capture avant tout le monde.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        setConflict(null)
        return
      }
      // Même garde que le déplacement clavier (`NavKeys`) : `null` sur ⌘/Ctrl/Alt seuls —
      // on n'affecte jamais une touche que le moteur filtrerait ensuite (bind mort).
      const key = plainKey(e)
      if (key === null) return
      // Conflit contre TOUT le keymap effectif (déplacement, vue, outils, Espace, loupe…).
      const clash = keyConflict(shortcutsRef.current, action, key)
      if (clash) {
        setConflict(clash)
        return
      }
      store.set({ keys: { ...prefsRef.current.keys, [action]: key } })
      setCapturing(false)
      setConflict(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, action, store])

  // Sans store, le récap reste STRICTEMENT en lecture seule (aucune régression).
  if (!store) return <kbd className="m3d-kbd">{display}</kbd>

  const conflictMsg =
    conflict &&
    (PANEL_ACTIONS.has(conflict)
      ? formatLabel(p.controls.conflict, { action: p.actions[conflict as BindableAction] })
      : p.controls.conflictOther)
  const title = conflictMsg || formatLabel(p.controls.rebind, { action: p.actions[action] })

  const toggle = () => {
    setConflict(null)
    setCapturing((c) => !c)
  }

  return (
    <kbd
      className={`m3d-kbd m3d-kbd-edit${capturing ? ' m3d-on' : ''}${conflict ? ' m3d-kbd-bad' : ''}`}
      role="button"
      tabIndex={0}
      title={title}
      aria-label={title}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
    >
      {capturing ? '…' : display}
      {/* Crayon : signale que le `<kbd>` est cliquable (discret au repos, net au survol). */}
      {!capturing && <UiIcon path={mdiPencilOutline} size={0.5} className="m3d-editpen" />}
    </kbd>
  )
}
