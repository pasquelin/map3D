# Préférences — le réglage par l'utilisateur final

**Français** · [English](../en/PREFERENCES.md) · [↑ Index](README.md)

Un panneau que l'**utilisateur final** ouvre depuis la carte pour régler sa qualité 3D
et ses contrôles, à la manière d'un menu graphique de jeu vidéo. À ne pas confondre avec
`config` (ce que l'**application** fige, cf. [CONFIG.md](CONFIG.md)) ni avec le banc
d'essai de la démo : ici, trois presets et quelques touches, rien de plus.

## 1. Où et comment

Le panneau est monté par le **⚙ de la barre d'outils** (`Toolbar`), en pied, sous
« Plugins ». Il n'exige aucune prop : dès qu'un `<MapProvider>` est présent (celui que
`<Map>` monte pour vous, ou le vôtre), la ligne « Préférences » apparaît.

Il n'accède **jamais** au moteur en direct. Chaque geste écrit un `Preferences` dans un
store persisté (localStorage), que `<MapProvider>` merge comme **troisième couche** :

```
defaultConfig  <  config (application)  <  préférences (utilisateur)
```

Le changement est ensuite poussé au moteur **à chaud** par le même chemin que la prop
`config`. Conséquences directes :

- **Persisté** : un réglage survit au rechargement, rejoué au montage.
- **L'utilisateur gagne** sur l'application (c'est le but), mais rien n'est appliqué tant
  qu'aucune préférence n'est stockée — une carte jamais réglée reste exactement ce que
  l'application a demandé.
- **Zéro flash** : les presets ne touchent que des réglages applicables à chaud.

## 2. Qualité 3D — presets seuls

Quatre boutons, aucun curseur. **Auto** sonde la machine une fois
(`navigator.hardwareConcurrency` / `deviceMemory` / `devicePixelRatio`) ; les trois autres
forcent le niveau. Chaque niveau applique ce bundle de leviers **à chaud** :

| Levier (`config`) | Élevé | Moyen | Léger |
| --- | --- | --- | --- |
| `performance.pixelRatio` | min(dpr, 2) | 1 | 1 |
| `performance.adaptiveResolution.minRatio` | 0.75 | 0.5 | 0.4 |
| `performance.adaptiveResolution.targetFrameMs` | 22 | 22 | 28 |
| `performance.textureAnisotropy` | 0 (max) | 4 | 1 |
| `providers.buildings.maxViewDistance` | 5000 | 3500 | 2000 |
| `providers.buildings.maxTiles` / `maxBytes` | 80 / 448 Mi | 48 / 256 Mi | 24 / 128 Mi |
| `providers.buildings.maxRequest` | 49 | 32 | 16 |
| `sky.enabled` / `clouds.coverage` | on / 0.35 | on / 0.2 | **off** |
| `providers.tiles.retina` | on si dpr > 1 | off | off |

« Élevé » reprend globalement les défauts de la lib — à l'exception
d'`adaptiveResolution.minRatio`, où le preset (0.75) est plus permissif que le défaut de
`defaultConfig` (0.5, posé comme plancher anti-flou du sol photogrammétrique). Sont **volontairement exclus** :
`performance.antialias` et `performance.powerPreference` (lus à la création du contexte
WebGL — les changer exigerait un remontage), et le budget **raster** `tiles.maxTiles` (le
baisser rouvre l'aplat uniforme au loin).

## 3. Contrôles (panneau Préférences)

Le RESSENTI, pas les touches :

- **Vitesse de déplacement** : Lent / Normal / Rapide → `camera.keyPan.speed` (0.4 / 0.8 / 1.5).
- **Glissement de la carte** (`interaction.damping`) : coché, la carte continue sur sa
  lancée après un glissé puis ralentit en douceur ; décoché, elle s'arrête net.

## 4. Raccourcis — édition en place

Les touches se modifient **directement dans le récap « Raccourcis »** du même ⚙ (pas dans
Préférences, pas dans un bloc séparé : une seule liste de touches, aucun doublon). Chaque
touche réassignable porte un **crayon** et se **clique** pour la changer — la grille du
récap est par ailleurs inchangée (déplacement et vue sont juste listés touche par touche).

- **Portée** — déplacement (`forward`, `backward`, `left`, `right`, `boost`) et vue
  (`north`, `tilt`, `globe`, `zoomIn`, `zoomOut`, `fullscreen`). Le reste du récap (pan,
  outils de dessin, sélection, édition…) reste en lecture seule.
- **Éditer** — cliquer la touche arme la capture (`…`), la frappe suivante l'affecte si
  elle est **libre**, `Échap` annule. Défaut ZQSD ; les flèches restent toujours liées.
- **Détection de conflit** — la touche est **refusée** (kbd rouge) si elle est déjà prise
  par **n'importe quelle commande** : pas seulement le déplacement/la vue, mais aussi les
  outils de dessin, le fond de carte, la loupe, `Espace` (pan)… Réassigner « Nord » sur `b`
  (qui bascule le fond) est bloqué.
- **Tout réinitialiser** — le bouton « Réinitialiser les préférences » (panneau Préférences)
  efface aussi les touches réassignées.

## 5. Pour l'application

Le panneau suffit — rien à câbler. Pour aller plus loin, la lib exporte :

```ts
import {
  PreferencesPanel,        // le panneau lui-même, à monter dans VOTRE surface
  usePreferences,          // { prefs, hasStored, store } — lire/écrire depuis votre UI
  preferencesToPartialConfig, // Preferences → PartialConfig (pur)
  qualityPreset, detectQuality, detectDeviceCaps, // presets qualité (purs)
  defaultPreferences,
  type Preferences, type QualityLevel, type QualityChoice,
  type KeyboardLayout, type MoveSpeed, type BindableAction,
} from 'map3d'
```

- **Clé de stockage** : `config.data.storageKeys.preferences` (défaut `m3d:preferences`) —
  à distinguer si deux cartes cohabitent sur le même origin.
- **Masquer la fonction** : retirez la section `settings` de la barre
  (`toolbar={{ components: { settings: false } }}`) ou n'affichez pas la barre.
- **Forcer un niveau depuis l'hôte** sans le panneau : appliquez `qualityPreset(level)` à
  votre prop `config`.

> **Limite connue** : le ⚙ vit dans la barre de dessin (il exige `<DrawLayer>`). Sans
> dessin, montez `<PreferencesPanel/>` dans votre propre surface (comme `StatsPanel`) — il
> n'exige qu'un `<MapProvider>` au-dessus.
