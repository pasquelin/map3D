import { useEffect, useState } from 'react'
import { formatCount } from '../../labels/mergeLabels'
import { useDrawing } from '../hooks/useDrawing'
import { useLabels, useTheme } from '../context'
import { StyleEditor, type SwatchTarget } from './drawControls'
import { useFitHeight } from './panelFit'

export type DrawStylePanelProps = {
  /** Côté de la drawbar à laquelle le panneau s'accroche (il s'ouvre à côté d'elle). */
  position?: 'left' | 'right'
}

/**
 * Panneau de style : visible quand un outil de forme est actif (il règle les
 * défauts des prochaines formes) ou quand la sélection est non vide (il restyle
 * les formes sélectionnées). Swatches fond/bordure façon Photoshop + palette du
 * thème + épaisseur (0 = sans bordure) + style de trait + opacités + rayon (rects).
 */
export function DrawStylePanel({ position = 'left' }: DrawStylePanelProps) {
  const { tool, selection, setStyle, currentStyle, selectionHasRect } = useDrawing()
  const theme = useTheme()
  const labels = useLabels()
  const [target, setTarget] = useState<SwatchTarget>('fill')
  // Centré verticalement : il ne peut pas se décaler, il ne peut que rétrécir
  // (scroll interne) pour ne pas dépasser du conteneur sur une carte courte.
  const setPanel = useFitHeight('centered')

  const editsSelection = selection.length > 0
  const visible = editsSelection || (tool !== null && tool !== 'select' && tool !== 'erase')

  // Fermeture animée : le panneau reste monté le temps de jouer l'animation inverse.
  const [shown, setShown] = useState(visible)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (visible) {
      setShown(true)
      setClosing(false)
    } else {
      setClosing(true)
    }
  }, [visible])
  if (!shown) return null

  return (
    <div
      ref={setPanel}
      className={`m3d-panel m3d-stylepanel m3d-${position}${closing ? ' m3d-closing' : ''}`}
      onAnimationEnd={() => {
        if (closing) {
          setShown(false)
          setClosing(false)
        }
      }}
    >
      <StyleEditor
        style={currentStyle}
        onPatch={setStyle}
        palette={theme.colors.draw.palette}
        fallbackColor={theme.colors.draw.default}
        target={target}
        onTarget={setTarget}
        title={
          editsSelection
            ? formatCount(labels.style.selectionCount, labels.style.selectionCountPlural, selection.length, labels.plural)
            : undefined
        }
        showRadius={tool === 'rect' || (editsSelection && selectionHasRect)}
      />
    </div>
  )
}
