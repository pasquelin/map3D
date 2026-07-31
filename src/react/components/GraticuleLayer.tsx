import { useEffect } from 'react'
import { GraticuleLayer as CoreGraticuleLayer } from '../../layers/GraticuleLayer'
import { useConfig, useLabels, useMapContext } from '../context'
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
  const config = useConfig()
  const labels = useLabels()
  const { visible } = useGraticule()

  const ref = useLayer(() => new CoreGraticuleLayer(engine.annotations, engine.projection, overlay, labels.graticule))

  useLayerSync(ref, visible, (layer, v) => layer.setVisible(v))
  useLayerSync(ref, theme.colors.graticule, (layer, c) => layer.setColors(c))
  useLayerSync(ref, labels.graticule, (layer, t) => layer.setTexts(t))

  // Le plafond d'inclinaison dépend du MODE : la bande de fondu s'exprime en fraction de lui,
  // et il passe de 79,2° à 36° en basculant en carte plate. Sans ce suivi, le fondu se
  // déclencherait au mauvais angle dans l'un des deux modes.
  const maxTilt3d = config.camera.maxTilt3d
  const maxTilt2d = config.camera.maxTilt2d
  useEffect(() => {
    const push = () => ref.current?.setMaxTilt(engine.getBasemap().mode === 'plan' ? maxTilt2d : maxTilt3d)
    push()
    return engine.on('basemap', push)
  }, [engine, ref, maxTilt2d, maxTilt3d])

  return null
}
