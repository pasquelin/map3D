import { createContext } from 'react'
import type { MapEngine } from '../core/MapEngine'
import type { CaptureFormat, CaptureOptions, OverlayRasterizer } from '../core/capture'

/**
 * Injection hôte de la capture, portée par `<Map capture>`. Ne contient que des FONCTIONS
 * (le rasteriseur d'overlay et les callbacks) : les valeurs par défaut sérialisables
 * (format, qualité, échelle, fond) vivent dans `config.capture`.
 *
 * Sa présence ACTIVE la ligne « Prendre une photo » du menu ⚙ (comme `plugins`/`catalog`
 * gardent la leur). La capture par code (`engine.capture()` / `handle.capture()` /
 * `useCapture()`) reste possible sans elle, en 3D seule.
 */
export type CaptureProps = {
  /** Rasteriseur d'overlay DOM injecté (markers/labels). Absent → capture 3D seule. */
  rasterizeOverlay?: OverlayRasterizer
  /** Trace : appelé à CHAQUE capture produite (toute action confondue) — pour un log / envoi API. */
  onCapture?: (blob: Blob, meta: { format: CaptureFormat }) => void
  /** Livraison de l'action « Envoyer par mail ». Absent → la ligne mail est désactivée. */
  onMail?: (blob: Blob, meta: { format: CaptureFormat }) => void
}

/** `null` hors d'une carte fournissant la prop `capture` : la ligne ⚙ ne s'affiche pas. */
export const CaptureContext = createContext<CaptureProps | null>(null)

/**
 * Chemin de capture des couches React (handle + hook) : injecte le rasteriseur de la prop
 * `capture` puis émet la trace `onCapture`. Une option d'appel explicite l'emporte sur
 * l'injection (ex. forcer `overlay: false`).
 */
export async function runCapture(
  engine: MapEngine,
  capture: CaptureProps | null,
  opts: CaptureOptions = {},
): Promise<Blob> {
  const blob = await engine.capture({ rasterizeOverlay: capture?.rasterizeOverlay, ...opts })
  capture?.onCapture?.(blob, { format: opts.format ?? engine.config.capture.format })
  return blob
}
