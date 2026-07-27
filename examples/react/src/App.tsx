import { type InteractiveMode, Map, type MapHandle, type MarkerData, createGoogleRoutesProvider, markersLayer, shapesLayer } from 'map3d'
import { useMemo, useRef, useState } from 'react'

import { DemoToolsMenu } from './components/DemoToolsMenu'
import { DrawDebug } from './components/DrawDebug'
import { clusterTip, markerTip } from './components/tooltips'
import { CESIUM_ION_TOKEN, GOOGLE_MAPS_KEY } from './config/env'
import { clusterTypeLabel, markerLabel } from './config/labels'
import { createMarkerMenu } from './config/markerMenus'
import { RELATION_RULES } from './config/relations'
import { SELECTION_RING, theme } from './config/theme'
import { ALERTS } from './data/alerts'
import { PARIS, TEST_POINT } from './data/cities'
import { BUILDINGS, DEMO_SHAPES, MAX_DRAW_AREA_M2, demoVolumes } from './data/shapes'
import type { AnyData } from './data/types'
import { useAgentMarkers } from './hooks/useAgentMarkers'
import { useEditablePin } from './hooks/useEditablePin'
import { useFavorites } from './hooks/useFavorites'
import { clusterTypeIcon } from './icons/clusterIcons'
import { iconFor } from './icons/markerIcons'

/**
 * Démo de la lib : une carte, ses données, son interface — tout se déclare en props
 * de `<Map>`.
 *
 * Ce fichier n'est plus QUE cet assemblage : les points vivent dans `data/`, les
 * réglages dans `config/`, l'état applicatif dans `hooks/`, les surfaces propres à
 * la démo dans `components/`.
 */
export function App() {
  // Poignée de la carte : les callbacks `onShape*` sont déclarés AU-DESSUS de la
  // carte et ont pourtant besoin du CRUD par identité. Une `ref` suffit — plus de
  // composant enfant à écrire pour aller chercher un hook.
  const map = useRef<MapHandle>(null)
  // Cycle true → 'view' (caméra figée, markers vivants) → false (inerte).
  const [interactive, setInteractive] = useState<InteractiveMode>(true)
  const cycleInteractive = () => setInteractive((m) => (m === true ? 'view' : m === 'view' ? false : true))
  // Hauteur d'extrusion, réglable à chaud (cf. le banc de test dans la barre).
  const [volumeHeight, setVolumeHeight] = useState(200)
  // Mémoïsation OBLIGATOIRE, pas une optimisation de confort : la couche de formes
  // se resynchronise sur l'IDENTITÉ du tableau, et une resynchro rebâtit chaque
  // volume (raycasts terrain + géométries THREE). Un littéral au point d'appel le
  // referait à chaque tick du flux temps réel, soit 3 fois par seconde.
  const shapes = useMemo(() => [...DEMO_SHAPES, ...BUILDINGS, ...demoVolumes(volumeHeight)], [volumeHeight])
  const [selected, setSelected] = useState<string>()

  const { agents, agentMarkers } = useAgentMarkers()
  const { pinMarker, onReposition } = useEditablePin()

  // Alertes + agents + point éditable dans un SEUL layer → clusterisés ensemble
  // (comme la référence).
  const allMarkers: MarkerData<AnyData>[] = [...ALERTS, ...agentMarkers, pinMarker]
  // Les favoris se déclarent avant les menus : l'entrée « Épingler » lit leur état
  // et les bascule, elle ne tient aucun état à elle.
  const favorites = useFavorites(allMarkers)
  const menuFor = createMarkerMenu({ agents, isPinned: favorites.isPinned, togglePin: favorites.togglePin })

  // Fournisseur de routage : la clé reste côté client (cette lib n'a pas de backend).
  // Sans clé, les appels échouent et les étiquettes affichent « Temps indisponible » —
  // jamais une distance à vol d'oiseau déguisée en temps de trajet.
  const routesProvider = useMemo(() => createGoogleRoutesProvider({ apiKey: GOOGLE_MAPS_KEY ?? '', region: 'fr' }), [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Map
        ref={map}
        theme={theme}
        colorScheme="dark"
        googleMapsApiKey={GOOGLE_MAPS_KEY || undefined}
        cesiumIonToken={CESIUM_ION_TOKEN || undefined}
        center={PARIS}
        zoom={14}
        interactive={interactive}
        // Le cas d'usage type : gater un cadrage sur la disponibilité de la carte.
        // Avant `ready`, `fitBounds` viserait l'ellipsoïde nu — pas le sol réel.
        onReady={(engine) => console.log('[map] ready — altitude sol connue, cadrage fiable', engine.getView().zoom)}
        fallbackGlobe
        mapMode="3d"
        // ── Interface : tout se déclare ici. `<Map>` monte les surfaces dans le bon
        // ordre d'imbrication (loupe > dessin > barre > relations > couches), un
        // savoir qui appartient à la lib et non à l'application.
        toolbar={{
          // La loupe se règle DANS la barre, là où son bouton apparaît. Sans cette
          // clé elle marche quand même avec le rendu par défaut ; `lens: false` la
          // retirerait. La liste (MarkerList) est partagée avec le panneau de
          // sélection, et « Cibler » est natif : `actions` ne fait qu'y ajouter.
          lens: {
            getId: (m) => m.id,
            markerTypeLabel: clusterTypeLabel,
            renderItem: markerLabel,
            // Pas d'`actions` : l'inventaire hérite de `markerMenu` ci-dessous, donc
            // le bouton « … » d'une ligne offre EXACTEMENT le menu du marker sur la
            // carte — sous-menus et « Distance autour › » compris.
          },
          // Outils de CETTE démo : ils prennent le langage visuel des outils natifs
          // au lieu de flotter dans un coin de la carte.
          extraTools: (
            <DemoToolsMenu
              map={map}
              interactive={interactive}
              onCycleInteractive={cycleInteractive}
              volumeHeight={volumeHeight}
              onVolumeHeight={setVolumeHeight}
            />
          ),
        }}
        // `target` fournie = bouton « revenir à la cible » ; omise = pas de bouton.
        // `onlyWhenOutOfView` : il n'apparaît qu'une fois la cible sortie de l'écran.
        controls={{
          position: 'right',
          target: { position: TEST_POINT, label: 'Revenir au point de contrôle', onlyWhenOutOfView: true },
        }}
        // `search` seul = Google Places via la clé de `googleMapsApiKey`. Un objet
        // permettrait d'injecter un autre fournisseur.
        search
        // Favoris : long-press sur un marker → glisser dans la barre du bas. Clic sur
        // une pastille = vol caméra + sélection. × ou glisser-hors = retrait.
        // SANS cette prop, plus aucune zone n'accepte un marker : les markers cessent
        // d'être saisissables, au lieu d'offrir un geste qui n'aboutirait nulle part.
        // La dock reste CONTRÔLÉE : `useFavorites` tient les ids et leur ordre.
        dock={{
          items: favorites.items,
          size: 88,
          onPin: favorites.onPin,
          onUnpin: favorites.onUnpin,
          onReorder: favorites.onReorder,
          onPinClick: (item) => setSelected(String(item.id)),
          tooltip: (item) => (item.data ? markerTip(item.data) : null),
        }}
        // Moteur de relations : la lib le monte AUTOUR des couches de markers, ce qui
        // fait arriver « Distance autour › » dans leur menu (2ᵉ argument de `menu`).
        // Ce n'est pas une couche — il ne rend rien de lui-même.
        relations={{
          rules: RELATION_RULES,
          provider: routesProvider,
          // La barre d'état est montée avec le moteur ; on ne fournit que de quoi
          // nommer un point, ce que la lib ne peut pas deviner.
          statusBar: {
            nameOf: (p) => {
              const m = allMarkers.find((x) => String(x.id) === p.id)
              return m ? markerLabel(m) : p.id
            },
          },
        }}
        draw={{
          // `value` accepterait un jeu de formes initial (verrouillables) ; la démo
          // part d'une page blanche pour qu'aucun tracé ne se confonde avec les zones.
          onChange: (g) => console.log('[draw] change — GeoJSON complet (ce que reçoit l’API) :', g),
          onSelectionChange: (ids, markerIds) => console.log('[draw] selection', ids, markerIds),
          // Démo du CRUD par identité : à la création, un « backend » simulé renvoie
          // un uuid qu'on rattache à la forme via `meta`, en `silent` pour ne pas
          // relancer un cycle d'events.
          onShapeAdd: (s) => {
            console.log('[draw] + forme', s.id, s.kind, s.points.length, 'pts')
            const uuid = `zone-${s.id}`
            map.current?.drawing?.updateShape(s.id, { meta: { uuid, title: `Zone ${s.kind}` } }, { silent: true })
            console.log('[draw]   uuid rattaché :', map.current?.drawing?.getShape(s.id)?.meta)
          },
          onShapeUpdate: (s) => console.log('[draw] ~ forme', s.id, s.meta),
          onShapeDelete: (s) => console.log('[draw] − forme', s.id, s.meta),
          onShapeEdit: (s) => console.log('[draw] ✎ double-clic → ouvrir la fiche de', s.meta ?? s.id),
          // Contraintes métier : toute forme doit tenir dans la zone d'une ville et ne
          // pas dépasser le plafond d'aire. Le périmètre lui-même est affiché par la
          // couche de formes — `limits` ne sert qu'à contraindre, pas à dessiner.
          constraints: { limits: DEMO_SHAPES, maxAreaM2: MAX_DRAW_AREA_M2 },
          onReject: (reason, s) =>
            console.warn(
              reason === 'outOfLimits'
                ? `[draw] refusé : le ${s.kind} sort de la zone autorisée`
                : `[draw] refusé : le ${s.kind} dépasse ${MAX_DRAW_AREA_M2 / 1e6} km²`,
            ),
          // Vignettes de sélection : montées d'office par la lib, on ne fournit que
          // les libellés métier (titre d'un marker, nom d'un type).
          selectionBadges: {
            markerTypeLabel: clusterTypeLabel,
            renderMarker: markerLabel,
            // Comme la loupe : le menu commun suffit.
          },
        }}
        // ── Menu d'un marker, déclaré UNE fois pour les trois surfaces qui en
        // proposent un : le marker sur la carte, l'inventaire de la loupe et le
        // panneau de sélection. Les deux listings y ajoutent « Cibler » d'eux-mêmes.
        // Le second argument porte les entrées du moteur de relations.
        markerMenu={(m, relations) => {
          const rel = relations?.menuFor(m) ?? []
          const own = menuFor(m as MarkerData<AnyData>)
          return rel.length === 0 ? own : [...own, { separator: true }, ...rel]
        }}
        // ── Couches de données, dans l'ordre de rendu. Les fabriques `shapesLayer` /
        // `markersLayer<T>` rendent le typage sur VOS données, que le tableau
        // hétérogène ne peut pas porter seul.
        layers={[
          // `limits` (contraintes du dessin) ne prend que DEMO_SHAPES : les bâtiments
          // et les volumes sont là pour l'œil, ils n'autorisent aucune zone.
          shapesLayer({ shapes }),
          markersLayer<AnyData>({
            points: allMarkers,
            getId: (m) => m.id,
            // `maxZoom` surcharge le thème POUR CETTE COUCHE ; le rayon, lui, n'est
            // pas repassé — la couche prend `theme.clustering.radius`.
            cluster: { enabled: true, maxZoom: 18 },
            selectedId: selected,
            // TOUT marker est sélectionnable : le dock sélectionne déjà n'importe quel
            // type au clic (`onPinClick`), restreindre ici aux agents donnait deux
            // comportements pour un même marker selon qu'on le clique sur la carte ou
            // dans les favoris. Une AFFECTATION, jamais un `return` prématuré : sortir
            // sans rien écrire laisserait l'anneau sur le marker précédent.
            onSelect: (m) => setSelected(m ? String(m.id) : undefined),
            // `size` n'est PAS passé : la couche prend `theme.markers.size`, seule
            // source de la taille. L'anneau en dérive (cf. `SELECTION_RING`).
            selectionRing: SELECTION_RING,
            icon: iconFor,
            // Tous les markers sont saisissables au long-press (dépôt dans le dock).
            // `pin-editable` porte en plus `repositionable` sur SA donnée : les deux
            // gestes y cohabitent, la saisie partant de l'ICÔNE et le
            // repositionnement du POINT AU SOL.
            draggable: true,
            onReposition: (m, latLng) => {
              console.log('[marker] reposition', m.id, latLng)
              onReposition(latLng)
            },
            clusterTypeIcon: clusterTypeIcon,
            clusterTypeLabel: clusterTypeLabel,
            tooltip: markerTip,
            clusterTooltip: clusterTip,
          }),
        ]}
      >
        {/* Seul enfant restant : le mouchard de CETTE démo, qui journalise l'état du
        dessin dans la console. Il consomme `useDrawing()` pour être RÉACTIF (un
        rendu par changement d'outil ou d'historique), ce qu'une `ref` ne fait pas.
        Rien de la lib n'a plus à être assemblé ici. */}
        <DrawDebug />
      </Map>
    </div>
  )
}
