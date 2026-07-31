import { useEffect, useMemo, useState } from 'react'
import type { Camera, CameraState, FitBoundsOptions, FlyOptions } from '../../core/Camera'
import type { Bounds, LatLng } from '../../shared'
import { useMap, useTheme } from '../context'

/** Commandes de caméra, sans état : leur identité ne dépend que du moteur et du thème. */
export type CameraCommands = {
  flyTo: Camera['flyTo']
  follow: (getPos: () => LatLng | null) => () => void
  /** Recentre/altitude immédiats (équivaut à un flyTo court). */
  moveTo: (dest: Partial<LatLng> & { altitude?: number }, opts?: FlyOptions) => void
  /** Cadre un ensemble géographique (marge en px, `duration: 0` = instantané). */
  fitBounds: (bounds: Bounds, opts?: FitBoundsOptions) => void
  /** Recentre instantanément, altitude inchangée. */
  setCenter: (p: LatLng) => void
  /** Recentre en douceur, altitude inchangée. */
  panTo: (p: LatLng, opts?: FlyOptions) => void
  /** Zoom façon carte 2D (échelle Google : 0 = monde, ~20 = rue). */
  setZoom: (zoom: number, opts?: { duration?: number }) => void
  getZoom: () => number
}

export type UseCameraResult = CameraCommands & {
  state: CameraState
}

/**
 * Commandes de caméra SEULES, d'identité stable : ce hook ne s'abonne à rien et ne
 * re-rend jamais son consommateur.
 *
 * C'est le chemin à prendre pour un bouton « recentrer » ou un menu qui pilote la vue
 * sans l'afficher. `useCamera` porte en plus l'état, réémis par le moteur À CHAQUE
 * FRAME de mouvement : y passer pour un seul `flyTo` ferait re-rendre tout le
 * sous-arbre soixante fois par seconde pendant un pan.
 */
export function useCameraCommands(): CameraCommands {
  const engine = useMap()
  const moveToDuration = useTheme().animations.moveTo

  return useMemo(
    () => ({
      flyTo: (dest, opts) => engine.camera.flyTo(dest, opts),
      follow: (getPos: () => LatLng | null) => engine.camera.follow(getPos),
      moveTo: (dest: Partial<LatLng> & { altitude?: number }, opts?: FlyOptions) =>
        engine.camera.flyTo(dest, { duration: moveToDuration, ...opts }),
      fitBounds: (bounds: Bounds, opts?: FitBoundsOptions) => engine.camera.fitBounds(bounds, opts),
      setCenter: (p: LatLng) => engine.camera.setCenter(p),
      panTo: (p: LatLng, opts?: FlyOptions) => engine.camera.panTo(p, opts),
      setZoom: (zoom: number, opts?: { duration?: number }) => engine.camera.setZoom(zoom, opts),
      getZoom: () => engine.camera.getZoom(),
    }),
    [engine, moveToDuration],
  )
}

/**
 * État caméra réactif + commandes (vol, suivi, cadrage, recentrage) sur le globe.
 *
 * `state` suit l'événement `camera`, émis par frame tant que la caméra bouge : ce hook
 * re-rend donc son consommateur à la cadence du rendu pendant un pan. C'est le prix de
 * l'état, pas celui des commandes — qui n'ont besoin de rien de tout cela et se
 * prennent séparément avec `useCameraCommands()`.
 */
export function useCamera(): UseCameraResult {
  const engine = useMap()
  const commands = useCameraCommands()
  const [state, setState] = useState<CameraState>(() => engine.camera.getState())

  useEffect(() => engine.on('camera', (s) => setState({ ...s })), [engine])

  return useMemo(() => ({ state, ...commands }), [state, commands])
}
