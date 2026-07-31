import { type RefObject, useEffect, useRef } from 'react'

export type DismissOptions = {
  /**
   * Fermer aussi à la molette. Pour une surface ancrée à un élément de la CARTE : la
   * carte défile sous elle, son ancrage devient faux — mieux vaut refermer.
   */
  wheel?: boolean
  /**
   * Capter Échap en phase de CAPTURE et arrêter sa propagation. Sans cela, la touche
   * poursuit sa route jusqu'aux raccourcis globaux (quitter l'outil, retirer la zone
   * de la loupe) alors que l'utilisateur ne visait qu'à refermer cette surface.
   */
  captureEscape?: boolean
  /**
   * Zones supplémentaires, résolues AU MOMENT du clic.
   *
   * Indispensable pour une surface FILLE montée après coup — le sous-panneau qu'ouvre
   * une ligne du panneau : elle n'existe pas à l'abonnement, donc aucun tableau figé ne
   * peut la contenir, et le premier clic dedans refermait tout.
   */
  also?: () => ReadonlyArray<HTMLElement | null | undefined>
}

/**
 * Ferme une surface ancrée au clic hors de `ref` ou à Échap — pattern partagé des
 * flyouts de barres (Couches, Réglages des outils) et des menus de ligne.
 *
 * Le test est un `contains` sur la cible : la surface n'a donc rien à faire de son
 * côté (aucun `stopPropagation` à semer sur ses gestionnaires), et un portail
 * fonctionne tant que le nœud passé en `ref` est bien celui rendu à distance.
 */
export function useDismiss(
  /**
   * La ou les zones qui comptent comme « dedans ». Plusieurs sont nécessaires dès
   * qu'une surface est PORTÉE ailleurs dans le DOM : le déclencheur reste dans la
   * barre pendant que son panneau est rendu à la racine de la carte, et un seul des
   * deux ne suffirait pas — le clic dans le panneau passerait pour un clic extérieur
   * et le refermerait aussitôt ouvert.
   */
  ref: RefObject<HTMLElement | null> | ReadonlyArray<RefObject<HTMLElement | null>>,
  open: boolean,
  onClose: () => void,
  { wheel = false, captureEscape = false, also }: DismissOptions = {},
): void {
  // `onClose` par ref, pas capturé : les écouteurs vivent tant que la surface est
  // ouverte, donc un `onClose` capturé serait celui du render d'OUVERTURE. Les
  // appelants d'aujourd'hui n'y perdent rien (tous ferment via un setter `setState`),
  // mais un `onClose` qui lirait une donnée — « enregistrer la ligne courante puis
  // fermer » — enregistrerait la valeur d'il y a plusieurs secondes, sans rien pour
  // le signaler. Le ref rend le piège impossible plutôt que de compter dessus.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Même raison que `onClose` : les zones supplémentaires sont résolues à l'événement,
  // pas à l'abonnement — sinon un réabonnement serait nécessaire à chaque montage de
  // surface fille, et les listeners globaux se recréeraient sans cesse.
  const alsoRef = useRef(also)
  alsoRef.current = also
  useEffect(() => {
    if (!open) return
    const close = () => onCloseRef.current()
    const zones = Array.isArray(ref) ? ref : [ref as RefObject<HTMLElement | null>]
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (zones.some((z) => z.current?.contains(target))) return
      if (alsoRef.current?.().some((el) => el?.contains(target))) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (captureEscape) e.stopPropagation()
      close()
    }
    const onWheel = () => close()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, captureEscape)
    if (wheel) window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, captureEscape)
      if (wheel) window.removeEventListener('wheel', onWheel)
    }
  }, [ref, open, wheel, captureEscape])
}

/**
 * Referme une surface quand la barre qui la porte se replie (hors zoom, vue quittée).
 *
 * Un flyout laissé ouvert glisse hors écran avec sa barre — invisible mais toujours
 * ouvert — puis réapparaît déplié au retour, sur un état que l'utilisateur avait
 * quitté depuis longtemps. Il ne s'agit donc pas d'un « dismiss » de plus : c'est la
 * barre qui relâche ce qu'elle possède, comme elle relâche l'outil actif.
 */
export function useCloseWhenHidden(hidden: boolean | undefined, close: (open: false) => void): void {
  // Même raison qu'au-dessus, en plus simple : l'effet ne se rejoue qu'au changement de
  // `hidden`, donc dépendre de `close` le relancerait à chaque render de l'appelant.
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (hidden) closeRef.current(false)
  }, [hidden])
}
