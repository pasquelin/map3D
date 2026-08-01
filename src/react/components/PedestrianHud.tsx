import { useLabels } from '../context'
import { usePedestrianChrome } from '../hooks/usePedestrian'
import { usePedestrianKeys } from '../hooks/usePedestrianKeys'

/**
 * HUD du mode piéton — monté INDÉPENDAMMENT du dessin et des contrôles (il doit exister même
 * sous `draw={false}` / `controls={false}`, le mode piéton ne dépendant d'aucune barre).
 *
 * Ne rend QUE l'incrustation d'IMMERSION TOTALE : le réticule de visée et le rappel « Échap
 * pour quitter ». L'immersion elle-même se DÉCLENCHE par le plein écran (le bouton plein
 * écran, cf. `MapEngine.onFullscreenChange`), pas par un bouton flottant. L'UI de contrôle
 * est masquée par la classe `.m3d-immersive`, posée par le moteur ; le réticule n'apparaît
 * qu'ici. Hors immersion totale, ne rend rien (mais le clavier reste monté).
 */
export function PedestrianHud() {
  const chrome = usePedestrianChrome()
  const labels = useLabels()
  // Clavier piéton (Échap deux niveaux + bascule immersion), toujours monté (avant tout
  // retour) : il partage l'abonnement de `usePedestrianChrome` — cf. `usePedestrianKeys`.
  usePedestrianKeys(chrome)

  if (chrome.mode !== 'pedestrian' || chrome.phase !== 'active' || chrome.immersion !== 'full') return null

  return (
    <>
      <div className="m3d-reticle" aria-hidden="true" />
      <div className="m3d-pedestrian-hint" role="status">
        {labels.controls.pedestrianHint}
      </div>
    </>
  )
}
