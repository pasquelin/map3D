import { useLabels } from '../context'
import { usePedestrianChrome } from '../hooks/usePedestrian'
import { usePedestrianKeys } from '../hooks/usePedestrianKeys'

/**
 * HUD du mode piéton — monté INDÉPENDAMMENT du dessin et des contrôles (il doit exister même
 * sous `draw={false}` / `controls={false}`, le mode piéton ne dépendant d'aucune barre).
 *
 * Deux états, exclusifs :
 * - **exploration** : un bouton propose d'entrer en immersion totale. Son clic est
 *   précisément le geste utilisateur qu'exige `requestPointerLock` — d'où un bouton, et non
 *   une bascule automatique que le navigateur refuserait.
 * - **immersion totale** : le réticule de visée et le rappel « Échap pour quitter ». L'UI de
 *   contrôle (barres) est masquée par la classe `.m3d-immersive` (cf. `css/base`), posée par
 *   le moteur ; le réticule, lui, n'apparaît qu'ici.
 *
 * Hors mode piéton actif, ne rend rien.
 */
export function PedestrianHud() {
  const chrome = usePedestrianChrome()
  const labels = useLabels()
  // Clavier piéton (Échap deux niveaux + bascule immersion), toujours monté (avant tout
  // retour) : il partage l'abonnement de `usePedestrianChrome` — cf. `usePedestrianKeys`.
  usePedestrianKeys(chrome)

  if (chrome.mode !== 'pedestrian' || chrome.phase !== 'active') return null

  if (chrome.immersion === 'full') {
    return (
      <>
        <div className="m3d-reticle" aria-hidden="true" />
        <div className="m3d-pedestrian-hint" role="status">
          {labels.controls.pedestrianHint}
        </div>
      </>
    )
  }

  return (
    <button type="button" className="m3d-pedestrian-immerse" onClick={() => chrome.setImmersion('full')}>
      {labels.controls.immersion}
    </button>
  )
}
