import { useMemo, useRef } from 'react'
import { makeReadoutFormatter, type ReadoutField } from '../../labels/readout'
import { ReadoutLayer, type ReadoutCells } from '../../layers/ReadoutLayer'
import { useConfig, useLabels } from '../context'
import { useLayer, useLayerSync } from '../hooks/useLayer'

export type { ReadoutField }

/** Coin d'ancrage du bloc dans la carte. */
export type ReadoutCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

export type CameraReadoutProps = {
  /** Coin d'ancrage (défaut : `'top-right'`, le seul qu'aucune autre surface n'occupe). */
  corner?: ReadoutCorner
  /**
   * Grandeurs affichées, dans l'ordre. Une grandeur retirée n'est pas seulement
   * masquée : elle n'est plus calculée à chaque rafraîchissement.
   */
  fields?: readonly ReadoutField[]
  /** Cadence maximale d'écriture (ms). Défaut : `config.performance.readoutRefreshMs`. */
  refreshMs?: number
  /** Classe supplémentaire, en plus de `m3d-readout`. */
  className?: string
}

const DEFAULT_FIELDS: readonly ReadoutField[] = ['altitude', 'latitude', 'longitude', 'heading', 'tilt', 'zoom']

/** Suffixe de classe du coin — deux lettres, comme les ancrages de barre. */
const CORNER_CLASS: Record<ReadoutCorner, string> = {
  'top-right': 'm3d-corner-tr',
  'top-left': 'm3d-corner-tl',
  'bottom-right': 'm3d-corner-br',
  'bottom-left': 'm3d-corner-bl',
}

/**
 * Bloc de lecture de la vue : altitude de l'œil, point au sol sous lui, cap, inclinaison
 * et zoom — sur une ligne, dans le coin demandé.
 *
 * **Il ne re-rend jamais.** Il pose sa structure une fois, garde les cellules de valeur
 * en refs, et confie leur écriture à `ReadoutLayer` : la carte émet un état caméra à
 * chaque frame, en faire de l'état React ferait de ce petit bloc le composant le plus
 * coûteux de l'arbre. React pose le DOM, le moteur l'anime — le même marché que
 * `MarkerLayer` passe pour ses projections.
 *
 * Le passage par une couche n'est pas un raffinement : l'événement `camera` ignore
 * délibérément l'orientation, si bien qu'un cap ou une inclinaison branchés dessus
 * resteraient figés pendant toute une rotation (cf. le préambule de `ReadoutLayer`).
 *
 * Les valeurs sont le seul endroit où le pointeur reprend la main (`pointer-events`) :
 * le reste du bloc laisse passer les gestes de carte, mais une coordonnée doit rester
 * sélectionnable — c'est ce pour quoi on l'affiche.
 */
export function CameraReadout({
  corner = 'top-right',
  fields = DEFAULT_FIELDS,
  refreshMs,
  className,
}: CameraReadoutProps) {
  const labels = useLabels()
  const config = useConfig()
  const format = useMemo(() => makeReadoutFormatter(labels), [labels])
  const interval = refreshMs ?? config.performance.readoutRefreshMs

  // Cellules de valeur, indexées par grandeur. L'objet est STABLE et muté en place par
  // les callback refs : la couche en garde la référence, elle n'a rien à resynchroniser
  // tant que la liste des grandeurs ne change pas.
  const cells = useRef<ReadoutCells>({})
  // `useLayer` monte la couche dans un effet, donc APRÈS le commit : les refs sont déjà
  // posées quand la première frame lit `cells.current`.
  const layer = useLayer(() => new ReadoutLayer(cells.current, format, interval))
  useLayerSync(layer, format, (l, f) => l.setFormat(f))
  useLayerSync(layer, interval, (l, ms) => l.setInterval(ms))
  // Une grandeur ajoutée ou retirée change les cellules à écrire. La signature suffit :
  // l'objet, lui, ne change jamais d'identité.
  useLayerSync(layer, fields.join(','), (l) => l.setCells(cells.current))

  return (
    <dl
      className={`m3d-readout ${CORNER_CLASS[corner]}${className ? ` ${className}` : ''}`}
      // `group` et non `status` : ces valeurs changent à chaque geste, et une région
      // live les ferait annoncer en continu par un lecteur d'écran. Le bloc reste
      // atteignable à la demande, il ne s'impose pas.
      role="group"
      aria-label={labels.readout.title}
    >
      {fields.map((field) => (
        <div key={field} className="m3d-readout-row">
          {/* Les grandeurs portent le nom de leur clé de libellé : une table de
              correspondance n'aurait fait que recopier `ReadoutField`. */}
          <dt className="m3d-readout-key">{labels.readout[field]}</dt>
          <dd
            className="m3d-readout-val"
            ref={(el) => {
              cells.current[field] = el
            }}
          />
        </div>
      ))}
    </dl>
  )
}
