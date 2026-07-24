import type * as THREE from 'three'
import type { Bounds, LatLng } from '../shared'
import type { CameraState } from './Camera'
import type { Projection } from './Projection'

export type MapView = {
  center: LatLng
  zoom: number
  bounds: Bounds
}

/** Contexte passé aux layers à chaque frame. */
export type FrameContext = {
  camera: THREE.PerspectiveCamera
  cameraState: CameraState
  projection: Projection
  view: MapView
  size: { width: number; height: number }
  /** Delta de temps (secondes) depuis la frame précédente. */
  dt: number
}

/**
 * Couche de rendu. `update` avance l'état 3D (géométrie), `project` écrit les
 * overlays DOM (passe d'écriture pure, après toutes les lectures).
 */
export interface Layer {
  update(ctx: FrameContext): void
  project(ctx: FrameContext): void
  dispose(): void
}
