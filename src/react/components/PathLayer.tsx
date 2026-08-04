import { useEffect, useRef } from 'react'
import { PathLayer as CorePathLayer, type PathData } from '../../layers/PathLayer'
import { useMapContext } from '../context'
import { useLayer, useLayerSync, useStatCounter } from '../hooks/useLayer'

export type PathLayerProps = {
  /** Tracés à afficher, drapés sur le relief. */
  paths: PathData[]
  /** Pulsation du point courant, en tête du tracé (défaut `true`). */
  animateHead?: boolean
}

/** Un tracé n'est effaçable que sur opt-in ET s'il a une identité à remonter dans
 *  `onErase` — le prédicat est ici pour que provider et test de présence ne divergent pas. */
const isErasable = (p: PathData): boolean => !!p.erasable && p.id != null

/** Tracés / parcours (ruban + casing, épaisseur en mètres, tête animée). */
export function PathLayer({ paths, animateHead = true }: PathLayerProps) {
  const { engine, theme } = useMapContext()

  const ref = useLayer(
    () =>
      new CorePathLayer(
        engine.annotations,
        engine.projection,
        {
          color: theme.colors.path.base,
          casingColor: theme.colors.path.casing,
          width: 6,
          casingWidth: 3,
          renderOrder: 1,
        },
        animateHead,
      ),
  )

  useStatCounter(ref)
  useLayerSync(ref, theme, (layer, t) =>
    layer.setDefaults({
      color: t.colors.path.base,
      casingColor: t.colors.path.casing,
    }),
  )
  useLayerSync(ref, paths, (layer, p) => layer.setPaths(p))
  useLayerSync(ref, animateHead, (layer, v) => layer.setAnimateHead(v))

  // Provider du registre de sélection : expose les tracés (contour écran) au marquee
  // et au clic. Même patron que le provider marker (`useMarkerRegistries`).
  useEffect(() => {
    return engine.selectables.register({
      screenItems: () => ref.current?.selectableItems(engine.threeCamera) ?? [],
      setSelected: (ids) => ref.current?.setSelected(ids),
      info: (id) =>
        ref.current?.hasSelectable(id) ? { kind: 'path', type: 'path', color: ref.current.colorOf(id) } : null,
      hitTest: (x, y, tol) => ref.current?.hitTest(x, y, tol) ?? null,
      boundsOf: (id) => ref.current?.boundsOfId(id) ?? null,
      // Contours des tracés sélectionnés → pointillé de l'overlay (langage de sélection commun).
      selectedContours: () => ref.current?.selectedContours() ?? [],
      hasSelectedContours: () => ref.current?.hasSelectedContours() ?? false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Expose les tracés `erasable` à la gomme (via `engine.erasables`, séparé de la
  // sélection). Provider monté une fois : `items()` lit la liste courante par ref, donc
  // pas de ré-inscription à chaque changement de `paths` (la gomme interroge au besoin).
  const pathsRef = useRef(paths)
  pathsRef.current = paths
  // Présence calculée UNE fois par rendu et lue par ref : `has()` répond alors en O(1),
  // là où un second `some()` aurait re-balayé la liste à chaque interrogation.
  const hasErasablePaths = paths.some(isErasable)
  const hasErasableRef = useRef(hasErasablePaths)
  hasErasableRef.current = hasErasablePaths
  useEffect(
    () =>
      engine.erasables.register({
        kind: 'path',
        items: () =>
          pathsRef.current
            .filter(isErasable)
            .map((p) => ({ id: p.id!, ring: p.points, closed: false, kind: 'path' as const })),
        has: () => hasErasableRef.current,
      }),
    [engine],
  )

  // La gomme se retire quand plus rien n'est effaçable (`toolbar.autoHide.erase`) : le
  // registre doit donc DIRE que la présence a changé — le provider, lui, lit par ref et
  // ne notifie rien. Sur le BOOLÉEN et non sur `paths` : un hôte qui repasse un littéral
  // à chaque rendu réveillerait sinon la barre pour rien, à chaque rendu.
  useEffect(() => engine.erasables.itemsChanged(), [engine, hasErasablePaths])

  return null
}
