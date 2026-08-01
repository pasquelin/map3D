import { type RefObject, useEffect } from 'react'
import { type DrawTool } from '../../layers/DrawLayer'

/**
 * Une surface concurrente (loupe, palette de symboles) prend la main : l'outil de
 * tracé l'abandonne. Deux boutons allumés dans la barre ne diraient plus lequel des
 * deux reçoit le prochain geste.
 *
 * La garde `toolRef.current !== null` est CAPITALE — sans outil actif, `setTool(null)`
 * reprendrait quand même le slot `engine.inputInterceptor` (et `setDrawing(false)`)
 * que la surface vient de prendre : elle resterait affichée active mais morte. Même
 * piège que la cascade Échap. Elle est ici écrite UNE fois, au lieu d'être recopiée
 * par surface concurrente — la troisième aurait recopié le piège avec.
 *
 * Vit dans son propre fichier (et non dans `DrawLayer`) pour que `useDrawSymbols` —
 * lui-même importé par `DrawLayer` — puisse la consommer sans cycle d'import.
 */
export function useYieldsTool(
  taken: boolean,
  toolRef: RefObject<DrawTool | null>,
  setTool: (t: DrawTool | null) => void,
) {
  useEffect(() => {
    if (taken && toolRef.current !== null) setTool(null)
  }, [taken, setTool, toolRef])
}
