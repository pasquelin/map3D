// Montage des surfaces déclarées en props de `<Map>` (cf. `mapConfig.ts`).
//
// Tout l'intérêt du fichier tient dans l'ORDRE d'imbrication, qui n'est pas
// arbitraire et qu'une application ne devrait pas avoir à connaître :
//
//   relations      — tout en haut : ses entrées doivent atteindre les TROIS surfaces
//     loupe        — enveloppe l'arbre : elle fournit son contexte au bouton de barre
//       dessin     — fournit `useDrawing()`, dont la barre dépend entièrement
//         barre    — donc obligatoirement sous la couche de dessin
//         markers, formes
//         enfants de l'application
//         panneau de sélection
//       contrôles, recherche, dock — indépendants du dessin
//
// Les relations étaient auparavant montées à côté des couches. Elles sont remontées
// au-dessus de la loupe parce qu'elles ne rendent rien : elles fournissent un
// contexte, et l'inventaire de la loupe comme le panneau de sélection en ont besoin
// pour proposer le même menu qu'un marker (cf. `RelationsHost`).
//
// Relations et loupe sont montées par `<Map>` (en dehors de ce composant) parce
// qu'elles doivent envelopper jusqu'aux enfants ; le reste se monte ici.

import { type MutableRefObject, type ReactNode, useContext, useMemo } from 'react'
import type { MarkerData } from '../data/types'
import {
  DrawingContext,
  LensContext,
  RelationContext,
  type DrawingApi,
  type LensApi,
  type RelationApi,
} from './context'
import { DrawLayer } from './components/DrawLayer'
import type { MenuItem } from './components/ContextMenu'
import { CameraReadout } from './components/CameraReadout'
import { GraticuleLayer } from './components/GraticuleLayer'
import { LensLayer, type LensOptions } from './components/LensLayer'
import { MapControls } from './components/MapControls'
import { PedestrianHud } from './components/PedestrianHud'
import { MarkerLayer } from './components/MarkerLayer'
import { PathLayer } from './components/PathLayer'
import { PinnedDock } from './components/PinnedDock'
import { RelationLayer } from './components/RelationLayer'
import { BuildingMenuHost } from './components/BuildingMenuHost'
import { RelationStatusBar } from './components/RelationStatusBar'
import { SearchBox } from './components/SearchBox'
import { SelectionBadges, type SelectionBadgesProps } from './components/SelectionBadges'
import { ShapeLayer } from './components/ShapeLayer'
import { Toolbar, type DrawToolbarProps } from './components/Toolbar'
import { CatalogSurface } from './components/CatalogSurface'
import { ClusterSurface } from './components/ClusterSurface'
import { PluginSurfaces } from './components/PluginSurfaces'
import type { LayerSpec, MapSurfaces as Surfaces, MarkersSpec, RelationsConfig } from './mapConfig'

/** Clé React d'une couche : son `id` si fourni, son rang sinon. */
const keyOf = (spec: LayerSpec, i: number): string => spec.id ?? `${spec.kind}-${i}`

/** APIs vivant dans des contextes internes, recopiées pour la poignée de `<Map>`. */
export type BridgedApis = {
  drawing: DrawingApi | null
  lens: LensApi | null
  relations: RelationApi | null
}

/**
 * Recopie les APIs de contexte dans une ref, pour que la poignée de `<Map>` les
 * expose sans que l'application ait à écrire un composant enfant.
 *
 * C'est précisément le composant-pont que chaque application finissait par écrire
 * pour récupérer `useDrawing()` — un hook n'étant appelable que sous le provider.
 * Autant qu'il vive ici une fois pour toutes. Rend `null`, n'affiche rien.
 */
function ApiBridge({ target }: { target: MutableRefObject<BridgedApis> }) {
  const drawing = useContext(DrawingContext)
  const lens = useContext(LensContext)
  const relations = useContext(RelationContext)
  // Écriture pendant le rendu : assumée, car idempotente et sans effet observable —
  // la poignée lit ces champs à l'appel, jamais pendant une phase de rendu.
  target.current = { drawing, lens, relations }
  return null
}

/**
 * Couches de markers et de formes. Monté sous `<RelationLayer>` quand il y en a un,
 * ce qui lui donne accès à l'API des relations pour la passer aux menus.
 *
 * `useContext` directement et non `useRelations()` : ce dernier lève hors d'un
 * `<RelationLayer>`, alors qu'ici son absence est le cas le plus courant.
 */
function DataLayers({ specs, markerMenu }: { specs: LayerSpec[]; markerMenu?: MarkerMenu }) {
  const relations = useContext(RelationContext)
  return (
    <>
      {specs.map((spec, i) => {
        const key = keyOf(spec, i)
        if (spec.kind === 'shapes') return <ShapeLayer key={key} shapes={spec.shapes} />
        if (spec.kind === 'paths') return <PathLayer key={key} paths={spec.paths} animateHead={spec.animateHead} />
        if (spec.kind !== 'markers') return null
        const s = spec as MarkersSpec
        // Le menu de la couche l'emporte sur le menu commun : une carte peut avoir
        // une couche à part (formes de service, points techniques) sans renoncer au
        // menu partagé pour les autres.
        return <MarkersFromSpec key={key} spec={s} menu={s.menu ?? markerMenu} relations={relations} />
      })}
    </>
  )
}

/**
 * Fournisseur de menu commun aux trois surfaces (cf. `<Map markerMenu>`).
 *
 * Vu en `unknown` ici comme `layers` l'est : ce fichier monte des couches
 * hétérogènes, dont les données ne partagent aucun type. `<Map>` le repasse depuis
 * son `T`, qui reste celui que l'application voit.
 */
export type MarkerMenuOf = MarkerMenu
type MarkerMenu = (p: MarkerData<unknown>, relations: RelationApi | null) => MenuItem[]

/**
 * Lie un menu commun au contexte de relations. Appelé sous `<RelationsHost>`, donc
 * après le provider — c'est ce qui donne aux DEUX listings les entrées de relations,
 * exactement comme `MarkersFromSpec` les donne au menu d'un marker.
 */
function useMenuWithRelations(menu: MarkerMenu | undefined): ((m: MarkerData<unknown>) => MenuItem[]) | undefined {
  const relations = useContext(RelationContext)
  return useMemo(() => (menu ? (m: MarkerData<unknown>) => menu(m, relations) : undefined), [menu, relations])
}

/**
 * Loupe, montée sous le moteur de relations pour que son inventaire reçoive le menu
 * commun déjà lié. Composant à part : `useContext`/`useMemo` ne peuvent pas être
 * appelés depuis `<Map>`, qui est AU-DESSUS du provider.
 */
export function LensHost<T>({
  lens,
  markerMenu,
  children,
}: {
  lens: false | LensOptions<T>
  markerMenu?: MarkerMenu
  children: ReactNode
}) {
  const bound = useMenuWithRelations(markerMenu)
  if (lens === false) return <>{children}</>
  return (
    <LensLayer<T> {...lens} menu={lens.menu ?? (bound as LensOptions<T>['menu'])}>
      {children}
    </LensLayer>
  )
}

/**
 * Une couche de markers issue de sa spec. Composant à part — et non un `<MarkerLayer>`
 * inline — parce que le wrapper de `menu` doit être MÉMOÏSÉ : `props.menu` est dans les
 * deps du `useMemo` des portails de `MarkerLayer`, donc une flèche neuve à chaque rendu
 * de `<Map>` (une frappe clavier ailleurs dans l'app suffit) reconstruisait les N
 * portails. L'API déclarative rendait un `menu` stable impossible côté appelant.
 */
function MarkersFromSpec({
  spec,
  menu,
  relations,
}: {
  spec: MarkersSpec
  menu?: MarkersSpec['menu']
  relations: RelationApi | null
}) {
  const { kind, id, menu: _own, ...rest } = spec
  void kind
  void id
  void _own
  // Le second argument est ce qui remplace la render-prop de `<RelationLayer>` : sans
  // enfants, c'est par là que « Distance autour › » arrive dans le menu d'un marker.
  const withRelations = useMemo(
    () => (menu ? (m: MarkerData<unknown>) => menu(m, relations) : undefined),
    [menu, relations],
  )
  return <MarkerLayer {...rest} menu={withRelations} />
}

/**
 * Couches de données. Le contexte de relations leur vient de `<RelationsHost>`,
 * monté plus haut par `<Map>` : les relations ne rendent pas de points, elles
 * fournissent un contexte à ce qui en rend.
 */
function Layers({
  specs,
  markerMenu,
  children,
}: {
  specs: LayerSpec[]
  markerMenu?: MarkerMenu
  children?: ReactNode
}) {
  return (
    <>
      <DataLayers specs={specs} markerMenu={markerMenu} />
      {children}
    </>
  )
}

/**
 * Panneau de sélection, avec le menu commun lié aux relations. Même raison d'être
 * que `LensHost` : le liage réclame un hook, donc un composant sous le provider.
 */
function SelectionBadgesHost({ config, markerMenu }: { config: SelectionBadgesProps; markerMenu?: MarkerMenu }) {
  const bound = useMenuWithRelations(markerMenu)
  return <SelectionBadges {...config} markerMenu={config.markerMenu ?? (bound as SelectionBadgesProps['markerMenu'])} />
}

/**
 * Moteur de relations, s'il est déclaré — monté par `<Map>` AU-DESSUS de la loupe.
 *
 * Cette hauteur n'est pas un détail : elle enveloppe non seulement les couches de
 * markers, mais aussi l'inventaire de la loupe et le panneau de sélection. Les trois
 * peuvent donc offrir le même menu, entrées de relations comprises. Monté plus bas
 * (à côté des couches, comme avant), les deux listings étaient hors de portée du
 * contexte : leur bouton « … » ne pouvait structurellement pas afficher
 * « Distance autour › ».
 *
 * `RelationLayer` ne consomme que le contexte carte — ni le dessin, ni la loupe —
 * donc rien ne s'oppose à ce qu'il soit tout en haut.
 */
export function RelationsHost({ relations, children }: { relations?: RelationsConfig; children: ReactNode }) {
  if (!relations) return <>{children}</>
  // `statusBar` n'appartient pas au moteur : on l'extrait avant de lui passer le reste.
  const { statusBar, ...engine } = relations
  return (
    <RelationLayer {...engine}>
      {children}
      {statusBar !== false && <RelationStatusBar {...(statusBar ?? {})} />}
    </RelationLayer>
  )
}

/**
 * Rend les surfaces d'interface et les couches déclarées. La loupe n'en fait pas
 * partie : `<Map>` la monte au-dessus, y compris au-dessus des enfants.
 */
export function MapSurfaces<T, TPin>({
  toolbar,
  controls,
  search,
  readout,
  dock,
  templates,
  draw,
  layers,
  cluster,
  markerMenu,
  buildingMenu,
  plugins,
  children,
  apis,
}: Surfaces<T, TPin> & { apis: MutableRefObject<BridgedApis> }) {
  // La barre PILOTE la couche de dessin (`useDrawing()`) : sans dessin, pas de
  // barre — la monter quand même la ferait lever au premier rendu.
  const drawEnabled = draw !== false
  // `selectionBadges` est rendu PAR nous, pas par la couche : on l'extrait de sa config.
  const { selectionBadges, ...drawProps } = draw === false ? { selectionBadges: undefined } : (draw ?? {})
  // Menu commun DÉJÀ lié aux relations, comme pour le panneau de sélection et la loupe :
  // `<DrawLayer>` le reçoit tel quel pour l'offrir aux symboles posés (parité markers),
  // sans refaire la liaison de son côté.
  const boundMarkerMenu = useMenuWithRelations(markerMenu as MarkerMenu | undefined)
  const inner = (
    <>
      {drawEnabled && toolbar !== false && <Toolbar {...toolbarConfig(toolbar)} />}
      <Layers specs={layers ?? []} markerMenu={markerMenu as MarkerMenu | undefined}>
        {children}
        {/* SOUS les trois couches (relations montée par `<Map>`, loupe, dessin) :
            c'est la seule position d'où il voit les TROIS contextes. */}
        <PluginSurfaces plugins={plugins} />
        <ApiBridge target={apis} />
      </Layers>
      {drawEnabled && selectionBadges !== false && (
        <SelectionBadgesHost config={selectionBadges ?? {}} markerMenu={markerMenu as MarkerMenu | undefined} />
      )}
    </>
  )

  return (
    <>
      {drawEnabled ? (
        // `boundMarkerMenu` propage aux SYMBOLES posés le même menu (déjà lié aux
        // relations) qu'aux markers — parité ; `<DrawLayer>` n'y ajoute que « Supprimer ».
        <DrawLayer {...drawProps} markerMenu={boundMarkerMenu}>
          {inner}
        </DrawLayer>
      ) : (
        inner
      )}
      {/* APRÈS les couches : elles se sont inscrites au registre, la surface n'a plus
          qu'à regrouper. Elle rend les pastilles ; chaque couche rend ses markers. */}
      {cluster !== false && <ClusterSurface {...(cluster ?? {})} />}
      {/* Toujours montée, indépendamment du panneau : ce qu'on a affiché depuis le
          catalogue doit rester sur la carte quand on referme la liste. Elle porte aussi
          la restauration de la session précédente, qui n'a donc pas à attendre une
          ouverture du panneau. Sans élément affiché, elle ne rend rien. */}
      <CatalogSurface />
      {/* Le gestionnaire de templates vit DANS la barre de contrôles (bouton sous
          « Couches »), d'où qu'il reçoive `templates` — même famille que le filtre par tag. */}
      {controls !== false && <MapControls {...(controls ?? {})} templates={templates} />}
      {/* Sans `buildingMenu`, rien à monter : l'outil surligne au survol, le clic n'ouvre
          rien — la lib n'a aucun contenu à mettre dans ce menu. */}
      {buildingMenu && <BuildingMenuHost menu={buildingMenu} />}
      {search ? <SearchBox {...(search === true ? {} : search)} /> : null}
      {/* HUD piéton (réticule, invite, bouton d'immersion) : monté SANS condition — le mode
          piéton est proposable dès la 3D externe, indépendamment de `draw`/`controls`, et
          l'immersion doit pouvoir se déclencher et s'annoncer même sans aucune barre. */}
      <PedestrianHud />
      {/* Grille de coordonnées : montée SANS condition, comme le HUD piéton. C'est la SEULE
          couche qui peint — le bouton `graticule` de `<MapControls>` et le raccourci ne font que
          basculer un booléen du moteur, ils ne dessinent rien sans elle. Zéro coût tant que la
          grille est éteinte (défaut `graticule.enabled:false`) : `update`/`project` sortent au
          premier `if`. L'hôte n'a donc RIEN à mettre dans les enfants de `<Map>` — la monter en
          plus soi-même donnerait deux grilles superposées. */}
      <GraticuleLayer />
      {/* Après les barres : il se pose dans un coin, donc il ne dispute sa place à
          aucune d'elles — l'ordre ne joue que si deux surfaces visent le même coin,
          auquel cas la dernière montée passe devant (même plan d'empilement). */}
      {readout ? <CameraReadout {...(readout === true ? {} : readout)} /> : null}
      {dock && <PinnedDock<TPin> {...dock} />}
    </>
  )
}

/** Config de barre sans `lens`, qui est consommée par `<Map>` et non par la barre. */
function toolbarConfig<T>(toolbar: Surfaces<T>['toolbar']): DrawToolbarProps {
  if (!toolbar) return {}
  const { lens, ...rest } = toolbar
  void lens
  return rest
}

/**
 * Options de la loupe, lues par `<Map>` qui monte la couche.
 *
 * `toolbar: false` l'emporte : sans barre il n'y a pas de bouton, et garder l'outil
 * joignable au seul raccourci clavier serait une demi-mesure invisible. Une carte
 * qui veut la loupe sans barre monte `<LensLayer>` elle-même — il reste exporté.
 */
export function lensOf<T>(toolbar: Surfaces<T>['toolbar']): false | LensOptions<T> {
  if (toolbar === false) return false
  return toolbar?.lens ?? {}
}
