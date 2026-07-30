// Capture et restitution de la VUE d'un template — le pont entre le moteur et
// `TemplateView`. Deux fonctions, aucun état : c'est la symétrie entre les deux qui fait
// la garantie utile (ce qu'on sauve est ce qu'on retrouve), et elle se teste sur un double
// du moteur sans WebGL.
//
// `import type` sur `MapEngine` : le moteur porte déjà le registre de templates
// (`engine.templates`), l'importer autrement refermerait le cycle à l'exécution.

import type { MapEngine } from '../MapEngine'
import type { TemplateView } from './types'

/** Comment la caméra rejoint la vue : d'un trait, ou en `duration` secondes. */
export type ApplyViewOptions = { duration?: number }

/**
 * Photographie la vue courante : pose caméra complète, fond de carte, filtre « Couches »
 * et vue première personne s'il y en a une.
 *
 * Rien de dérivé n'est retenu (ni zoom, ni emprise) : l'altitude et la pose les redonnent,
 * alors qu'une copie figée divergerait dès que le conteneur change de taille.
 */
export function captureView(engine: MapEngine): TemplateView {
  const pose = engine.camera.getPose()
  const basemap = engine.getBasemap()
  const view: TemplateView = {
    lat: pose.lat,
    lng: pose.lng,
    altitude: pose.altitude,
    heading: pose.heading,
    tilt: pose.tilt,
    mapMode: basemap.mode,
    traffic: basemap.traffic,
    // Des noms de tags, jamais les éléments qu'ils portent — cf. `TagFilter.setSelection`.
    tags: [...engine.tags.selected],
  }
  const walk = engine.getPedestrianPose()
  if (walk) {
    view.pedestrian = {
      lat: walk.position.lat,
      lng: walk.position.lng,
      heading: walk.heading,
      pitch: walk.pitch,
      immersion: engine.getPedestrian().immersion,
    }
  }
  return view
}

/**
 * Rejoue une vue mémorisée. L'ordre n'est pas cosmétique :
 *
 * 1. **La prise de main d'abord** — sans `cancelIntro`, le vol de démarrage repositionne la
 *    caméra à la frame suivante et la vue chargée n'aura jamais existé.
 * 2. **Le mode de carte avant la pose** — c'est lui qui fixe `camera.maxTilt` (via
 *    `applyCameraLimits`) : posée avant, une vue oblique se ferait borner par la limite du
 *    mode qu'on QUITTE. Le trafic vient après, parce qu'entrer en 3D l'éteint.
 * 3. **Sortir du piéton avant de poser la caméra** — tant qu'on y est, le contrôleur
 *    repositionne la caméra à chaque frame et écraserait la pose.
 * 4. **Entrer en piéton en dernier**, une fois la caméra sur place : le point de station se
 *    valide au raycast, donc il faut être arrivé. Le mode peut légitimement refuser (sol pas
 *    encore streamé, volume indisponible) — la vue reste alors celle de la pose caméra, qui
 *    en est déjà l'à-peu-près : même endroit, même cap.
 *
 * Chaque réglage se dégrade seul : `setMapMode` refuse un mode que rien n'alimente,
 * `setTrafficVisible` un calque indisponible. Une vue prise sur une carte mieux dotée reste
 * donc chargeable, en donnant ce qui est donnable.
 */
export function applyView(engine: MapEngine, view: TemplateView, opts: ApplyViewOptions = {}): void {
  engine.cancelIntro()
  engine.setMapMode(view.mapMode)
  engine.setTrafficVisible(view.traffic)
  if (view.tags) engine.tags.setSelection(view.tags)
  if (engine.getPedestrian().mode === 'pedestrian') engine.exitPedestrian()

  const pose = { lat: view.lat, lng: view.lng, altitude: view.altitude, heading: view.heading, tilt: view.tilt }
  // Une vue piéton se pose d'un trait : `enterPedestrian` coupe les vols de toute façon, et
  // un survol interrompu à mi-course pour plonger au sol ne serait qu'un à-coup.
  const duration = view.pedestrian ? 0 : opts.duration
  if (duration === undefined || duration <= 0) engine.camera.jumpToPose(pose)
  else engine.camera.flyToPose(pose, { duration })

  const walk = view.pedestrian
  if (!walk) return
  const entered = engine.enterPedestrian({ lat: walk.lat, lng: walk.lng }, { heading: walk.heading, pitch: walk.pitch })
  if (entered) engine.setPedestrianImmersion(walk.immersion)
}
