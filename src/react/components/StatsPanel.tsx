import { Fragment, useMemo, useRef } from 'react'
import type { StatField } from '../../core/viewStats'
import { makeReadoutFormatter } from '../../labels/readout'
import { isCameraField, makeStatFormatter, statLabel } from '../../labels/stats'
import { type ReadoutCells, ReadoutLayer } from '../../layers/ReadoutLayer'
import { type StatCells, StatsLayer } from '../../layers/StatsLayer'
import { useConfig, useLabels, useMapContext } from '../context'
import { useLayer, useLayerSync } from '../hooks/useLayer'

export type StatsSection = 'camera' | 'content' | 'render' | 'tiles'

/**
 * Grandeurs de chaque section, dans l'ordre d'affichage.
 *
 * Table déclarative et non code : ajouter une grandeur doit être une ligne ici, pas une
 * branche de plus dans le rendu. L'ordre à l'intérieur d'une section va du plus lu au
 * moins lu — on ouvre ce panneau pour une question précise, pas pour lire une fiche.
 */
const SECTIONS: readonly { key: StatsSection; fields: readonly StatField[] }[] = [
  { key: 'camera', fields: ['latitude', 'longitude', 'altitude', 'zoom', 'heading', 'tilt'] },
  { key: 'content', fields: ['markersVisible', 'markersTotal', 'clusters', 'shapes', 'paths', 'links', 'drawings'] },
  {
    key: 'render',
    fields: ['fps', 'paintedRatio', 'drawCalls', 'triangles', 'textures', 'geometries', 'resolutionScale'],
  },
  { key: 'tiles', fields: ['tilesCached', 'tilesInflight', 'tileBytes', 'workers'] },
]

export type StatsPanelProps = {
  /** Sections affichées, dans l'ordre du panneau. Défaut : les quatre. */
  sections?: readonly StatsSection[]
  /** Cadence maximale d'écriture (ms). Défaut : `config.performance.readoutRefreshMs`. */
  refreshMs?: number
}

/**
 * Panneau de diagnostic : ce que la vue courante contient, coûte et retient.
 *
 * Rendu avec les classes des AUTRES sous-panneaux du menu « Réglages »
 * (`m3d-settings-subtitle`, `m3d-shortcut-row`, `m3d-shortcut-sep`) : c'est une liste de
 * paires libellé / valeur, exactement comme celle des raccourcis, et elle n'a aucune
 * raison d'avoir sa propre mise en page. Seule la classe `m3d-stat` est propre au
 * panneau, et elle ne porte que la chasse fixe et la couleur du verdict.
 *
 * **Il ne re-rend jamais.** Il pose sa structure une fois, garde les cellules de valeur en
 * refs, et confie leur écriture à deux couches du moteur — le marché de `<CameraReadout>`.
 * Un panneau de performance rafraîchi par `useState` re-rendrait tout son arbre plusieurs
 * fois par seconde : il mesurerait ce qu'il a lui-même causé.
 *
 * **Deux couches, deux jeux de cellules.** `ReadoutLayer` sait déjà calculer la caméra —
 * cap et inclinaison compris, que l'événement `camera` ignore délibérément — et
 * `StatsLayer` porte le reste. Chacune reçoit STRICTEMENT les cellules qu'elle sait
 * écrire : partager un seul objet leur ferait parcourir des clés qu'elles ne connaissent
 * pas, sans autre moyen de le signaler que d'écrire n'importe quoi.
 *
 * ⚠️ Tout ce qui est compté l'est DANS LA VUE. `markersTotal` est la seule exception, et
 * elle est là pour être comparée à `markersVisible` : c'est leur écart qui révèle un cull
 * ou un regroupement qui ne fait pas son travail.
 */
export function StatsPanel({ sections, refreshMs }: StatsPanelProps) {
  const labels = useLabels()
  const config = useConfig()
  const { engine } = useMapContext()
  const readoutFormat = useMemo(() => makeReadoutFormatter(labels), [labels])
  const statFormat = useMemo(() => makeStatFormatter(labels), [labels])
  const interval = refreshMs ?? config.performance.readoutRefreshMs
  const shown = useMemo(() => (sections ? SECTIONS.filter((s) => sections.includes(s.key)) : SECTIONS), [sections])

  // Deux objets STABLES, mutés en place par les callback refs : chaque couche garde sa
  // référence et n'a rien à resynchroniser tant que les sections ne changent pas.
  const cameraCells = useRef<ReadoutCells>({})
  const statCells = useRef<StatCells>({})

  const readout = useLayer(() => new ReadoutLayer(cameraCells.current, readoutFormat, interval))
  useLayerSync(readout, readoutFormat, (l, f) => l.setFormat(f))
  useLayerSync(readout, interval, (l, ms) => l.setInterval(ms))

  const stats = useLayer(
    () => new StatsLayer(statCells.current, statFormat, interval, config, (out) => engine.viewStats(out)),
  )
  useLayerSync(stats, statFormat, (l, f) => l.setFormat(f))
  useLayerSync(stats, interval, (l, ms) => l.setInterval(ms))
  useLayerSync(stats, config, (l, c) => l.setConfig(c))

  // Une section ajoutée ou retirée change les cellules à écrire. La signature suffit :
  // les objets, eux, ne changent jamais d'identité.
  const signature = shown.map((s) => s.key).join(',')
  useLayerSync(readout, signature, (l) => l.setCells(cameraCells.current))
  useLayerSync(stats, signature, (l) => l.setCells(statCells.current))

  return (
    <div className="m3d-shortcuts">
      {shown.map((section, i) => (
        <Fragment key={section.key}>
          {i > 0 && <div className="m3d-shortcut-sep" />}
          <div className="m3d-settings-subtitle">{labels.stats.sections[section.key]}</div>
          {section.fields.map((field) => (
            <div key={field} className="m3d-shortcut-row">
              <span>{statLabel(labels, field)}</span>
              <span
                className="m3d-stat"
                ref={(el) => {
                  // Chaque couche ne reçoit que les cellules qu'elle sait écrire. Le
                  // prédicat vient de `labels/stats`, seule source de cette répartition :
                  // une liste recopiée ici enverrait un champ ajouté à la mauvaise couche.
                  if (isCameraField(field)) cameraCells.current[field] = el
                  else statCells.current[field] = el
                }}
              />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
