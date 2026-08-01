import { mdiDownloadOutline, mdiEmailOutline, mdiShareVariantOutline } from '@mdi/js'
import { useContext, useState } from 'react'
import type { CaptureBackground, CaptureFormat } from '../../core/capture'
import { CaptureContext } from '../capture'
import { useConfig, useLabels } from '../context'
import { downloadBlob } from '../downloadBlob'
import { useCapture } from '../hooks/useCapture'
import { Field, Seg } from './preferenceControls'
import { UiIcon } from './UiIcon'

/** Extension de fichier d'un format (jpeg → jpg, le reste = le format). */
const extOf = (format: CaptureFormat): string => (format === 'jpeg' ? 'jpg' : format)

/**
 * Sous-panneau « Prendre une photo », ouvert depuis le ⚙ de la barre (`DrawSettingsButton`).
 * Bâti sur les primitives partagées (`Seg`, `Field`, toggle `.m3d-togglerow`, bouton
 * `.m3d-tagclear`) — aucun composant visuel nouveau.
 *
 * Les défauts (format, qualité, échelle, fond) viennent de `config.capture` ; l'état local
 * les laisse ajuster avant capture. La capture passe par `useCapture()` (rasteriseur et
 * trace `onCapture` injectés par `<Map capture>`) ; « Partager » utilise l'API Web Share,
 * « Envoyer par mail » le callback `onMail` de l'hôte (ligne désactivée s'il est absent).
 */
export function CapturePanel() {
  const labels = useLabels()
  const cfg = useConfig().capture
  const capture = useContext(CaptureContext)
  const runCapture = useCapture()
  const c = labels.settings.capture

  const [format, setFormat] = useState<CaptureFormat>(cfg.format)
  const [quality, setQuality] = useState(cfg.quality)
  const [scale, setScale] = useState<1 | 2>(cfg.scale)
  const [transparent, setTransparent] = useState(cfg.background === 'transparent')
  const [busy, setBusy] = useState(false)

  // Web Share avec fichiers : les deux gardes sont nécessaires (Firefox desktop expose
  // `share` mais refuse les fichiers). Sans support, la ligne « Partager » est désactivée.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  const filename = `carte.${extOf(format)}`

  const produce = (): Promise<Blob> => {
    const background: CaptureBackground = transparent ? 'transparent' : 'opaque'
    return runCapture({ format, quality, scale, background })
  }

  // Sérialise les actions (une capture surélève le pixelRatio : deux en vol se gêneraient,
  // le moteur les rejette de toute façon) et neutralise les boutons le temps du rendu.
  const run = async (action: (blob: Blob) => void | Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await action(await produce())
    } catch {
      // Annulation de partage / encodage échoué : on relâche simplement les boutons.
    } finally {
      setBusy(false)
    }
  }

  const onDownload = () => run((blob) => downloadBlob(blob, filename))

  const onMail = () => run((blob) => capture?.onMail?.(blob, { format }))

  const onShare = () =>
    run(async (blob) => {
      const file = new File([blob], filename, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
    })

  return (
    <div className="m3d-pref">
      <Field label={c.format}>
        <Seg<CaptureFormat>
          value={format}
          onChange={setFormat}
          options={[
            { v: 'png', label: 'PNG' },
            { v: 'jpeg', label: 'JPEG' },
            { v: 'webp', label: 'WebP' },
          ]}
        />
      </Field>

      {/* Qualité : sans objet en PNG (sans perte) — la ligne disparaît alors. */}
      {format !== 'png' && (
        <Field label={c.quality}>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={quality}
            onChange={(e) => setQuality(e.target.valueAsNumber)}
          />
        </Field>
      )}

      <Field label={c.scale}>
        <Seg<'1' | '2'>
          value={String(scale) as '1' | '2'}
          onChange={(v) => setScale(v === '2' ? 2 : 1)}
          options={[
            { v: '1', label: '×1' },
            { v: '2', label: '×2' },
          ]}
        />
      </Field>

      <label className="m3d-togglerow">
        <span className="m3d-togglerow-name">{c.transparent}</span>
        <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
      </label>

      <button type="button" className="m3d-tagclear" disabled={busy} onClick={onDownload}>
        <UiIcon path={mdiDownloadOutline} />
        {c.download}
      </button>
      <button type="button" className="m3d-tagclear" disabled={busy || !capture?.onMail} onClick={onMail}>
        <UiIcon path={mdiEmailOutline} />
        {c.mail}
      </button>
      <button type="button" className="m3d-tagclear" disabled={busy || !canShare} onClick={onShare}>
        <UiIcon path={mdiShareVariantOutline} />
        {c.share}
      </button>
    </div>
  )
}
