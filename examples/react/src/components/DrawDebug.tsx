import { type DrawnShape, useDrawSettings, useDrawing } from '@pasquelin/map3d'
import { useEffect } from 'react'

/**
 * Sonde de debug : loggue chaque action du dessin pour visualiser ce que recevrait
 * une API consommatrice, et expose l'API sur `window.drawApi`
 * (ex. `drawApi.unlock([...])`, `drawApi.selectAll()`).
 *
 * Elle consomme `useDrawing()` pour être RÉACTIVE (un rendu par changement d'outil
 * ou d'historique), ce qu'une `ref` ne fait pas — d'où un composant, monté en enfant
 * de `<Map>`.
 */
export function DrawDebug() {
  const api = useDrawing()
  const settings = useDrawSettings()

  useEffect(
    () => console.log('[draw] tool', api.tool, api.tool === 'select' ? `(mode ${api.selectMode})` : ''),
    [api.tool, api.selectMode],
  )
  useEffect(
    () => console.log('[draw] history', { canUndo: api.canUndo, canRedo: api.canRedo }),
    [api.canUndo, api.canRedo],
  )

  // Le JSON ne sert que de dépendance stable — l'objet, lui, se loggue tel quel. C'est
  // le POINT du montage : dépendre de `api.currentStyle` rejouerait le log à chaque
  // render, puisque le style est un objet neuf à chaque fois.
  const styleJson = JSON.stringify(api.currentStyle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => console.log('[draw] style courant', api.currentStyle), [styleJson])
  useEffect(() => console.log('[draw] settings modifiés (v%d)', settings.version), [settings.version])

  useEffect(() => {
    ;(window as unknown as { drawApi: typeof api }).drawApi = api
    // Vérification du round-trip d'identité, à lancer depuis la console une fois
    // des formes dessinées : `checkRoundTrip()` doit rapporter 0 id/meta perdus.
    ;(window as unknown as { checkRoundTrip: () => void }).checkRoundTrip = () => {
      const before = api.getShapes()
      const fc = api.toGeoJSON()
      api.fromGeoJSON(fc)
      const after = api.getShapes()
      const lost = before.filter((b: DrawnShape) => {
        const a = after.find((x: DrawnShape) => x.id === b.id)
        return !a || JSON.stringify(a.meta) !== JSON.stringify(b.meta)
      })
      console.log(
        `[draw] round-trip : ${before.length} formes → ${after.length}, ${lost.length} identité(s)/meta perdue(s)`,
        lost,
      )
    }
  })

  return null
}
