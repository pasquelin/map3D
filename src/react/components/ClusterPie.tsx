import { mdiGroup } from '@mdi/js'
import { markerColorOf } from '../../theme/colors'
import { useTheme } from '../context'
import { UiIcon } from './UiIcon'

/**
 * Mini-camembert d'un groupe de cluster : mêmes couleurs de parts que la pastille sur la
 * carte (parts ÉGALES par type, comme `<DefaultCluster>`), en `conic-gradient`. Remplace
 * l'icône générique du groupe pour que la ligne « ressemble » au cluster qu'elle représente.
 * PARTAGÉ par le panneau de sélection et la loupe — un seul rendu de camembert.
 */
export function ClusterPie({ counts }: { counts: Record<string, number> }) {
  const theme = useTheme()
  const types = Object.keys(counts)
  if (types.length === 0) return <UiIcon path={mdiGroup} />
  // Parts égales : un seul type donne `couleur 0deg 360deg`, soit un conic-gradient uni.
  const stops = types
    .map(
      (t, i) => `${markerColorOf(theme, t).base} ${(i / types.length) * 360}deg ${((i + 1) / types.length) * 360}deg`,
    )
    .join(', ')
  return <span aria-hidden className="m3d-clusterpie" style={{ background: `conic-gradient(${stops})` }} />
}
