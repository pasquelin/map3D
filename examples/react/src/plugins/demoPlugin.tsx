import { mdiMapMarkerStar } from '@mdi/js'
import { definePlugin } from 'map3d'
import type { MarkerData } from 'map3d'

/**
 * Plugin de DÉMO (jamais publié) : preuve vivante de la plateforme dans l'exemple de la
 * lib, qui n'embarque aucun plugin concret. Exerce : voie A (markers viewport, procéduraux
 * → zéro réseau), les 4 types de champ de config (auto-rendu hub + dev panel), refetch vs
 * cosmétique, enrichBuilding + tags de provenance.
 */
export const demoPlugin = () =>
  definePlugin({
    meta: {
      id: 'demo-poi',
      name: 'Points de démo',
      description: 'Markers procéduraux + enrichissement au pick (démonstration de la plateforme)',
      icon: mdiMapMarkerStar,
      version: '1.0.0',
      author: 'map3d',
    },
    enabledByDefault: true,
    config: [
      { key: 'count', type: 'number', default: 12, min: 1, max: 60, refetch: true, label: 'Nombre de points' },
      {
        key: 'kind',
        type: 'select',
        default: 'poi',
        options: { poi: 'POI', alert: 'Alerte' },
        refetch: true,
        label: 'Type',
      },
      { key: 'showTitles', type: 'boolean', default: true, label: 'Afficher les titres' },
      { key: 'note', type: 'string', default: '', placeholder: 'Note libre', label: 'Note' },
    ] as const,
    data: {
      refresh: 'viewport',
      fetch: (ctx) => {
        const { bounds } = ctx.viewport
        const n = ctx.config.count
        const out: MarkerData[] = []
        for (let i = 0; i < n; i++) {
          // Grille déterministe dans les bounds courants (pas de Math.random pour un rendu stable).
          const fx = (i % 4) / 4 + 0.1
          const fy = Math.floor(i / 4) / Math.ceil(n / 4) + 0.05
          const lat = bounds.south + (bounds.north - bounds.south) * fy
          const lng = bounds.west + (bounds.east - bounds.west) * fx
          out.push({
            id: `demo-${i}`,
            position: { lat, lng },
            type: ctx.config.kind,
            title: ctx.config.showTitles ? `Démo ${i + 1}` : undefined,
            tags: ['demo-poi'],
            data: {},
          })
        }
        return out
      },
    },
    markerLayer: { cluster: { enabled: true } },
    enrichBuilding: async (hit) => ({
      attrs: {
        Latitude: hit.info.lat.toFixed(5),
        Longitude: hit.info.lng.toFixed(5),
        'Hauteur (démo)': `${Math.round(hit.info.height)} m`,
      },
      tags: ['demo-poi'],
    }),
  })
