import { mdiChevronDoubleLeft, mdiChevronDoubleRight, mdiPaletteOutline } from '@mdi/js'
import { useEffect, useState } from 'react'
import { formatCount } from '../../labels/mergeLabels'
import { useDrawing } from '../hooks/useDrawing'
import { useLabels, useTheme } from '../context'
import { DropdownSurface, useYieldsToDropdown } from './Dropdown'
import { ToolButton } from './ToolButton'
import { StyleEditor, type SwatchTarget } from './drawControls'
import { useToolbar } from './Toolbar'

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
  const { tool, selection, setStyle, currentStyle, selectionHasRect, selectionBoxEl } = useDrawing()
  const theme = useTheme()
  const labels = useLabels()
  const [target, setTarget] = useState<SwatchTarget>('fill')
  // Ancré sur la BARRE et rendu par la MÊME surface que les autres sous-menus. Il était
  // centré verticalement avec son propre CSS : seul à ne pas se poser au niveau de la
  // barre, et seul à ne pas passer par le composant commun.
  // L'ancre suit CE QUE le panneau règle :
  //  - une forme sélectionnée → son emprise écran, pour que le panneau s'ouvre près
  //    d'elle (s'ancrer sur le bouton « Sélectionner » le renvoyait à l'autre bout de
  //    la carte, loin de la forme qu'on est en train de modifier) ;
  //  - sinon l'outil actif → son bouton, dont il règle les défauts ;
  //  - à défaut la barre.
  const toolbar = useToolbar()

  const editsSelection = selection.length > 0
  // S'efface dès qu'une surface déroulante s'ouvre. Ce panneau n'est pas un menu : il
  // suit l'outil actif, personne ne l'ouvre, donc rien ne le refermait — et il occupait
  // la même bande que les réglages, qui venaient se poser dessus. Deux surfaces à 92 %
  // d'opacité empilées, chacune floutant l'autre : c'est ce que l'œil lisait comme
  // « le fond n'est pas le même ».
  const yields = useYieldsToDropdown()
  const visible = !yields && (editsSelection || (tool !== null && tool !== 'select' && tool !== 'erase'))
  const onShape = editsSelection && selectionBoxEl !== null
  const anchor = (onShape ? selectionBoxEl : null) ?? toolbar.activeToolEl ?? toolbar.el
  // Ancré sur une FORME : ouverture à GAUCHE par défaut, et bascule à droite seulement
  // s'il n'y a pas la place dans le conteneur (`useAnchoredPortal` arbitre). La
  // convention du hook nomme le côté où se trouve l'ANCRE, d'où `'right'` pour « le
  // panneau s'ouvre à gauche ». Ancré sur la barre, il garde le côté de la barre : lui
  // imposer la gauche le ferait passer par-dessus elle.
  const side = onShape ? 'right' : position

  // Réduit à son seul bouton. C'est l'état par DÉFAUT quand une forme est sélectionnée :
  // sélectionner ne veut pas dire restyler, et le panneau déplié monte une palette, des
  // presets et autant de vignettes — du travail de rendu pour une intention qui n'est
  // pas encore là. Un outil actif, lui, s'ouvre déplié : c'est justement pour régler ses
  // défauts qu'on l'a pris.
  const [collapsed, setCollapsed] = useState(onShape)
  // Ré-armé à chaque nouvelle sélection (et au passage forme ↔ outil) : chaque forme
  // qu'on désigne repart réduite.
  const selectionKey = selection.join(',')
  useEffect(() => setCollapsed(onShape), [onShape, selectionKey])

  if (!visible) return null

  // Chevron vers l'ancre : `side === 'right'` veut dire que le panneau est à GAUCHE
  // d'elle, donc il se replie vers la droite.
  const foldIcon = side === 'right' ? mdiChevronDoubleRight : mdiChevronDoubleLeft

  // Ancré sur une FORME : son emprise SVG est réécrite à chaque frame de navigation, donc
  // on ne l'observe pas (reflow/frame) — on place une fois. `key` sur la sélection remonte
  // la surface pour la re-placer près de la NOUVELLE forme (l'élément d'ancre, lui, ne change
  // pas d'identité). Ancré sur la barre, l'ancre est stable : observation normale.
  const followsShape = onShape
  if (collapsed) {
    return (
      <DropdownSurface
        key={followsShape ? selectionKey : undefined}
        anchor={anchor}
        position={side}
        panelClassName="m3d-stylemini"
        clampHeight={false}
        observeAnchor={!followsShape}
      >
        <ToolButton icon={mdiPaletteOutline} label={labels.style.expand} onClick={() => setCollapsed(false)} />
      </DropdownSurface>
    )
  }

  return (
    <DropdownSurface
      key={followsShape ? selectionKey : undefined}
      anchor={anchor}
      position={side}
      maxHeight={theme.sizing.panelMaxHeight.settings}
      panelClassName="m3d-stylepanel"
      observeAnchor={!followsShape}
    >
      <ToolButton
        icon={foldIcon}
        label={labels.style.collapse}
        className="m3d-stylefold"
        onClick={() => setCollapsed(true)}
      />
      <StyleEditor
        style={currentStyle}
        onPatch={setStyle}
        palette={theme.colors.draw.palette}
        fallbackColor={theme.colors.draw.default}
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
    </DropdownSurface>
  )
}
