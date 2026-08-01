import { type MoveSpeed, type QualityChoice } from '../../config/preferences'
import { useLabels } from '../context'
import { usePreferences } from '../preferences/context'
import { Field, Seg } from './preferenceControls'

/**
 * Panneau « Préférences » de l'utilisateur final, ouvert depuis le ⚙ de la barre
 * (`DrawSettingsButton`).
 *
 * Deux sections NON claviers : **Qualité 3D** (presets seuls, façon menu graphique de
 * jeu) et **Contrôles** au sens du RESSENTI (vitesse de déplacement, inertie). Le
 * rebinding des touches ne vit PAS ici — il est dans le récap « Raccourcis » (une seule
 * liste de touches, pas de doublon).
 *
 * Il n'écrit rien dans le moteur : chaque geste modifie le store de préférences, que
 * `<MapProvider>` merge par-dessus la config de l'application et applique à chaud. Tout
 * est persisté. Hors `<MapProvider>` (`store === null`), le panneau s'efface.
 */
export function PreferencesPanel() {
  const { prefs, hasStored, store } = usePreferences()
  const labels = useLabels()
  if (!store) return null

  const p = labels.settings.preferences
  // Aucun preset n'est allumé tant que rien n'est stocké : la carte suit l'application,
  // et allumer « Auto » d'office laisserait croire qu'un choix a été fait.
  const activeQuality = hasStored ? prefs.quality : undefined

  return (
    <div className="m3d-pref">
      <div className="m3d-settings-subtitle">{p.quality.title}</div>
      <Seg<QualityChoice>
        value={activeQuality}
        onChange={(quality) => store.set({ quality })}
        options={[
          { v: 'auto', label: p.quality.auto },
          { v: 'high', label: p.quality.high },
          { v: 'medium', label: p.quality.medium },
          { v: 'low', label: p.quality.low },
        ]}
      />

      <div className="m3d-settings-subtitle">{p.controls.title}</div>
      <Field label={p.controls.speed}>
        <Seg<MoveSpeed>
          value={prefs.moveSpeed}
          onChange={(moveSpeed) => store.set({ moveSpeed })}
          options={[
            { v: 'slow', label: p.controls.slow },
            { v: 'normal', label: p.controls.normal },
            { v: 'fast', label: p.controls.fast },
          ]}
        />
      </Field>
      <label className="m3d-togglerow">
        <span className="m3d-togglerow-name">{p.controls.damping}</span>
        <input type="checkbox" checked={prefs.damping} onChange={(e) => store.set({ damping: e.target.checked })} />
      </label>

      <button type="button" className="m3d-tagclear" disabled={!hasStored} onClick={() => store.reset()}>
        {p.reset}
      </button>
    </div>
  )
}
