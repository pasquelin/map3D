import { useEffect } from 'react'
import { GraticuleLayer as CoreGraticuleLayer } from '../../layers/GraticuleLayer'
import { useLabels, useMapContext } from '../context'
import { useGraticule } from '../hooks/useGraticule'
import { useLayer, useLayerSync } from '../hooks/useLayer'

/**
 * Grille de coordonnées géographiques : parallèles, méridiens, lignes remarquables et
 * étiquettes — cf. le guide GRATICULE.md.
 *
 * Ne rend rien : elle monte une couche du moteur et lui pousse ses réglages. Son état
 * marche/arrêt vit dans le moteur (`useGraticule`), pas ici — trois commandes le pilotent.
 */
export function GraticuleLayer() {
  const { engine, overlay, theme } = useMapContext()
  const labels = useLabels()
  const { visible } = useGraticule()

  const ref = useLayer(() => new CoreGraticuleLayer(engine.annotations, engine.projection, overlay, labels.graticule))

  // Déclare au moteur qu'une couche peint : c'est ce qui autorise l'effacement du quadrillage
  // du globe de repli. Sans elle, allumer la grille l'effacerait sans rien dessiner.
  useEffect(() => {
    engine.setGraticuleMounted(true)
    return () => engine.setGraticuleMounted(false)
  }, [engine])

  useLayerSync(ref, visible, (layer, v) => layer.setVisible(v))
  useLayerSync(ref, theme.colors.graticule, (layer, c) => layer.setColors(c))
  useLayerSync(ref, labels.graticule, (layer, t) => layer.setTexts(t))

  // Le plafond d'inclinaison suit le MODE (79,2° en volume, 36° à plat) et c'est
  // `MapEngine.applyCameraLimits` qui en est la SOURCE UNIQUE — il le borne en plus par la
  // limite courante des contrôles. On le relit donc au moteur plutôt que de rejouer
  // `mode === 'plan' ? maxTilt2d : maxTilt3d`, copie que le moteur lui-même a déjà bannie.
  useEffect(() => {
    const push = () => ref.current?.setMaxTilt(engine.camera.maxTilt)
    push()
    return engine.on('basemap', push)
  }, [engine, ref])

  return null
}
