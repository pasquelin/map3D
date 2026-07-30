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
  /**
   * « J'ai de quoi changer l'image » — à appeler tant que la couche a du travail en cours
   * (animation, arrivée de données, géométrie en construction).
   *
   * Sans cet appel, le moteur peut sauter le rendu de la frame
   * (`performance.renderOnDemand`) : la couche continue d'être `update`/`project`, mais
   * son résultat n'est pas peint. Le signaler ne coûte rien ; l'oublier fige l'animation
   * jusqu'au prochain mouvement (ou jusqu'à `maxIdleMs`).
   */
  invalidate(): void
}

/**
 * Couche de rendu. `update` avance l'état 3D (géométrie), `project` écrit les
 * overlays DOM (passe d'écriture pure, après toutes les lectures).
 */
export type Layer = {
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
  /**
   * Caméra au ras du sol (mode piéton) ou non. Diffusé par le moteur sur le même canal
   * que `setConfig` : à l'ajout de la couche, puis à chaque bascule du mode.
   *
   * Ce n'est PAS un réglage mais un état de vue, d'où un canal distinct de `config` :
   * il change avec la caméra, pas avec ce que l'hôte demande. Une couche qui drape des
   * annotations plates s'en sert pour décider leur test de profondeur (cf.
   * `flatMaterial`) — et doit le relire à CHAQUE construction, un drape pouvant être
   * reconstruit à tout instant par le resettle LOD.
   */
  setGrounded?(grounded: boolean): void
}
