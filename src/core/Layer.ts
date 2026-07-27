import type * as THREE from 'three'
import type { MapConfig } from '../config/types'
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
  /**
   * Réglages de la carte, poussés par le moteur : à l'ajout de la couche, puis à
   * chaque `MapEngine.setConfig`. Optionnel — une couche qui ne lit pas la config
   * ne l'implémente pas.
   *
   * C'est le MOTEUR qui diffuse, et non chaque wrapper React : il détient déjà
   * `config` et le registre des couches, et l'ordre y est garanti. Câblé côté React,
   * l'effet de l'enfant s'exécutait AVANT celui du parent qui pose la nouvelle
   * config — la couche lisait donc l'ancienne, sans que sa dépendance rebouge.
   */
  setConfig?(config: MapConfig): void
}
