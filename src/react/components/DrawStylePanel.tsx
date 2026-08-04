import { useState } from 'react'
import { formatCount } from '../../labels/mergeLabels'
import { useDrawing } from '../hooks/useDrawing'
import { useLabels, useTheme } from '../context'
import { Dropdown } from './Dropdown'
import { StyleEditor, SwatchPreview, type SwatchTarget } from './drawControls'
import type { BarTip } from './ToolButton'

export type DrawStylePanelProps = {
  /** Côté de la drawbar qui porte le bouton (le panneau s'ouvre du côté opposé). */
  position?: 'left' | 'right'
  /** Infobulle de la barre hôte (`useTip`). */
  tip?: BarTip
}

/**
 * Bloc de couleurs de la barre à dessin, et le panneau de style qu'il ouvre.
 *
 * **Le bouton EST l'aperçu** — les deux carrés fond/bordure, façon case couleur de
 * Photoshop : le style courant se lit en permanence sans rien ouvrir. ⚠️ Et RIEN ne
 * l'ouvre à notre place : c'est un menu comme les autres, sans quoi dessiner ferait
 * surgir une surface sur la carte au moment précis où l'on regarde ce qu'on trace.
 *
 * Ce qu'il RÈGLE, lui, suit le contexte : une sélection non vide et il restyle ces formes
 * (son titre les compte), sinon il fixe les défauts des prochaines.
 */
export function DrawStylePanel({ position = 'left', tip }: DrawStylePanelProps) {
  const { tool, selection, setStyle, currentStyle, selectionHasRect } = useDrawing()
  const theme = useTheme()
  const labels = useLabels()
  const [target, setTarget] = useState<SwatchTarget>('fill')

  const editsSelection = selection.length > 0
  const fallback = theme.colors.draw.default

  return (
    <Dropdown
      label={labels.style.expand}
      tip={tip}
      position={position}
      // Dernier bouton de la barre : le panneau se cale sur son bord BAS et grandit vers
      // le haut, comme celui des réglages, plutôt que de partir vers un bord de carte.
      edge="bottom"
      maxHeight={theme.sizing.panelMaxHeight.settings}
      buttonClassName="m3d-stylebtn"
      panelClassName="m3d-stylepanel"
      badge={<SwatchPreview style={currentStyle} fallback={fallback} />}
      grouped
    >
      {() => (
        <StyleEditor
          style={currentStyle}
          onPatch={setStyle}
          palette={theme.colors.draw.palette}
          fallbackColor={fallback}
          target={target}
          onTarget={setTarget}
          title={
            editsSelection
              ? formatCount(
                  labels.style.selectionCount,
                  labels.style.selectionCountPlural,
                  selection.length,
                  labels.plural,
                )
              : undefined
          }
          showRadius={tool === 'rect' || (editsSelection && selectionHasRect)}
        />
      )}
    </Dropdown>
  )
}
