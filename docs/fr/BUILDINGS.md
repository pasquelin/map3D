# Sélection d'un bâtiment

**Français** · [English](../en/BUILDINGS.md) · [↑ Index](README.md)

Quand la carte affiche le **volume interne** (bâtiments extrudés des tuiles vectorielles,
cf. [TILES § 5](TILES.md#5-le-volume-interne--bâtiments-extrudés)), un outil de la barre
permet de **désigner un bâtiment** : il se colore au survol, et le clic ouvre un menu que
**votre application compose**.

```tsx
<Map
  center={PARIS}
  zoom={17}
  config={{ providers: { tiles3d: { provider: 'internal' } } }}
  buildingMenu={(info) => [
    { label: 'Hauteur', hint: `${Math.round(info.height)} m`, disabled: true },
    { label: 'Voir la fiche', onSelect: () => ouvrirFiche(info.featureId) },
  ]}
/>
```

La lib n'écrit **aucun texte** dans ce menu, pas même un titre : elle ne sait pas ce qu'un
bâtiment représente pour vous.

---

## 1. Ce que fait l'outil

| Geste | Effet |
| --- | --- |
| Bouton de la barre, ou `U` | arme ou quitte l'outil ; le curseur du canvas passe en croix |
| Survol | le bâtiment visé prend `theme.globe.buildingHoverColor` |
| Clic **propre** | ouvre le menu de `buildingMenu`, au curseur |
| Menu ouvert | le bâtiment garde `theme.globe.buildingSelectColor` **tant qu'il l'est** |
| Glissé | déplace la carte, comme d'habitude — aucun menu ne s'ouvre |
| Échap, molette, clic dehors | referme le menu |

**La navigation caméra reste entière.** L'outil n'intercepte rien : il lit les mêmes
événements de pointeur que la carte et ne retient que le clic propre, celui dont le
déplacement reste sous `interaction.cleanClickPx`. On peut donc tourner autour d'un
quartier sans quitter l'outil.

Il n'y a **pas de sélection persistante** : la mise en évidence est liée à l'ouverture du
menu, elle disparaît avec lui. Une sélection qui dure appartient à l'application, qui la
tient dans son propre état à partir de ce que le menu lui apprend.

## 2. Quand le bouton apparaît

Le bouton n'existe **que** lorsqu'il y a des bâtiments internes à désigner. C'est la
capacité `canPickBuildings` de l'état du fond de carte, vraie quand les trois conditions
sont réunies :

- le mode de carte est `'3d'` ;
- `providers.tiles3d.provider` vaut `'internal'` ;
- le serveur interne sert bien des bâtiments (origine renseignée et gabarit de tuile
  vectorielle).

Passer en plan, ou repasser au volume photoréaliste, **désarme l'outil de lui-même** et
rend son curseur : il n'y a plus rien sous le pointeur à désigner.

> **Le volume photoréaliste externe est hors de portée**, et le restera : les tuiles 3D de
> Google sont un maillage texturé **fusionné**, où aucun bâtiment n'est distinct d'un
> autre. Il n'y a rien à y sélectionner — ce n'est pas une limite de la lib.

Comme tout bouton de la barre, il se masque au grain fin, et son raccourci part avec lui :

```tsx
<Map controls={{ buttons: { selectBuilding: false } }} />
```

## 3. `buildingMenu` — le contrat

`buildingMenu` reçoit le bâtiment cliqué et rend des [`MenuItem`](MARKERS.md), exactement
comme `markerMenu` : entrées d'information (`disabled: true` les rend inertes), actions,
séparateurs, sous-menus.

```tsx
import type { BuildingInfo, MenuItem } from 'map3d'

function buildingMenu(info: BuildingInfo): MenuItem[] {
  const coord = `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
  return [
    { label: 'Identifiant', hint: info.featureId ?? '—', disabled: true },
    { label: 'Coordonnée', hint: coord, disabled: true },
    { label: 'Hauteur', hint: `${Math.round(info.height)} m`, disabled: true },
    { separator: true },
    { label: 'Copier la coordonnée', onSelect: () => navigator.clipboard.writeText(coord) },
  ]
}
```

Sans cette prop, l'outil reste utilisable — il surligne au survol — mais le clic n'ouvre
rien : la lib n'aurait rien à mettre dans ce menu. Un menu qui rend un tableau **vide**
ne s'ouvre pas non plus : un panneau vide au clic serait pire que pas de menu.

La fonction est appelée **à l'ouverture**, pas à chaque rendu : elle peut lire l'état de
votre application au moment du clic sans que la carte ait à en dépendre.

## 4. `BuildingInfo`

| Champ | Type | Contenu |
| --- | --- | --- |
| `featureId` | `number \| null` | `feature.id` de la tuile vectorielle ; `null` si la donnée n'en portait pas |
| `lat` / `lng` | `number` | le **point cliqué sur le volume**, pas le centre de l'emprise |
| `height` | `number` | hauteur totale de l'emprise (m au-dessus du sol) |
| `minHeight` | `number` | hauteur de base — non nulle pour un porche, des pilotis |
| `props` | `Record<string, unknown>` | attributs MVT demandés par `pickFields` ; vide sinon (cf. § 5) |

> **Un « bâtiment » est une EMPRISE, pas une feature.** Une feature MVT peut en porter
> plusieurs (deux corps d'un même îlot), et elles partagent alors le même `featureId`.
> Chacune se survole et se désigne séparément ; l'identifiant, lui, ne les distingue pas.

## 5. Remonter des attributs de la donnée

Par défaut, `info.props` est **vide**. Ce n'est pas un oubli : une tuile dense porte
plusieurs milliers d'emprises, chacune avec des dizaines d'attributs — les transporter
toutes coûterait plus que la géométrie elle-même.

Nommez ce que vous affichez :

```tsx
config={{ providers: { buildings: { pickFields: ['name', 'class'] } } }}
```

Ces attributs traversent alors le worker d'extrusion pour chaque emprise, et arrivent dans
`info.props`. Les autres ne sont jamais lus. `height`, `minHeight`, `featureId` et la
coordonnée sont là de toute façon — ils ne coûtent rien, la géométrie les portait déjà.

⚠️ Changer `pickFields` **reconstruit les tuiles déjà extrudées** : c'est un réglage de
démarrage, pas un interrupteur à faire varier en cours de session.

## 6. Réglages

| Réglage | Défaut | Rôle |
| --- | --- | --- |
| `providers.buildings.pickFields` | `[]` | attributs MVT remontés dans `info.props` (§ 5) |
| `interaction.buildingPick.cursor` | `'crosshair'` | curseur du canvas, l'outil armé — un curseur **système** |
| `interaction.shortcuts.controls.selectBuilding` | `'u'` | raccourci de la bascule ; `false` le retire |
| `interaction.cleanClickPx` | — | partagé avec le clic carte : au-delà, le geste est un glissé |
| `theme.globe.buildingHoverColor` | `'#F2B441'` | teinte du bâtiment survolé |
| `theme.globe.buildingSelectColor` | `'#E8613C'` | teinte du bâtiment dont le menu est ouvert |
| `labels.controls.selectBuilding` | `'Sélectionner un bâtiment'` | libellé du bouton et de son infobulle |

Les deux teintes **remplacent** la couleur des sommets de l'emprise, ombrage compris —
c'est ce qui fait ressortir un bâtiment au milieu d'un quartier entier. Elles sont lues au
montage de la carte, comme les autres couleurs de volume : changer la charte ne repeint pas
une mise en évidence en cours.

## 7. Ce que ça coûte

Rien tant que l'outil n'est pas armé : aucun rayon n'est lancé, et la table des bâtiments
d'une tuile pèse une entrée par emprise — pas une par sommet.

L'outil armé, chaque mouvement du pointeur coûte **un** lancer de rayon sur l'arbre de
collision que la tuile porte déjà (~0,015 ms), et la mise en évidence réécrit une plage de
couleurs **déjà allouée** : rien n'entre ni ne sort de la scène, aucune allocation dans la
boucle de frame.

## Voir aussi

- [Tuiles](TILES.md) — d'où vient le volume, et comment régler le serveur interne
- [Markers](MARKERS.md) — `markerMenu`, dont `buildingMenu` reprend le contrat
- [`MapConfig`](CONFIG.md) · [`MapTheme`](THEME.md) · [`MapLabels`](LABELS.md) · [Props](PROPS.md)
