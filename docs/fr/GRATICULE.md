# Graticule — grille de coordonnées géographiques

**Français** · [English](../en/GRATICULE.md) · [↑ Index](README.md)

Parallèles et méridiens drapés sur le globe, dont la **maille s'adapte au zoom** sur
l'échelle sexagésimale d'un atlas — 30° en vue globe, 1″ en vue rue — et qui **s'estompe
en douceur** quand la vue s'incline trop pour qu'une grille reste lisible.

C'est un **calque de repère**, pas un outil : l'allumer n'interrompt rien, ne relâche
aucun outil de tracé, et ne crée aucune forme. Rien dans le GeoJSON, l'undo/redo ou le
panneau de style.

---

## 1. Ce qu'elle affiche

Trois familles de traits, et leurs étiquettes :

| | |
|---|---|
| **Parallèles** | latitudes constantes — horizontales en vue nord-en-haut |
| **Méridiens** | longitudes constantes — ils **convergent** vers les pôles, ce que la grille montre réellement puisqu'elle épouse la courbure |
| **Lignes remarquables** | Équateur, Tropiques du Cancer et du Capricorne, Cercles polaires, Méridien d'origine, 180ᵉ méridien. Couleur propre, opacité plus soutenue, et **leur nom** en guise d'étiquette |

Les étiquettes prennent l'apparence des infobulles de la lib, et affichent la coordonnée
au format de la maille courante : `45°N` au degré, `45°11'N` à la minute,
`45°11'25"N` à la seconde.

## 2. L'activer

Trois chemins, selon qui décide.

**La couche doit être montée** dans tous les cas — c'est elle qui peint :

```tsx
<Map center={PARIS} zoom={14} controls={{}}>
  <GraticuleLayer />
</Map>
```

Elle ne coûte rien tant que la grille est éteinte : ni géométrie, ni étiquette, ni
réveil de la boucle de rendu. On peut donc la monter en permanence.

**Allumée au démarrage** — par la config :

```tsx
<Map config={{ graticule: { enabled: true } }}>
  <GraticuleLayer />
</Map>
```

**Pilotée depuis l'application** — par le hook, qui lit l'état au moteur :

```tsx
const { visible, setVisible, toggle } = useGraticule()
```

⚠️ `graticule.enabled` n'est que l'état de **départ**. La source de vérité courante vit
dans le moteur (`engine.setGraticuleVisible`), parce que trois commandes la pilotent :
la rangée « Grille » du sous-menu Mesures, le bouton des contrôles de vue, et le
raccourci clavier. Deux copies d'état auraient divergé.

## 3. Comment la maille s'adapte

L'échelle est **sexagésimale**, jamais décimale — c'est ce qui donne les `13°42'25"N`
d'une carte, plutôt que des `0,1°` qu'aucun relevé n'emploie :

```
30° 15° 10° 5° 2° 1° │ 30′ 15′ 10′ 5′ 2′ 1′ │ 30″ 15″ 10″ 5″ 2″ 1″
```

La lib retient le **plus grand palier qui laisse au moins `targetLines` lignes à
l'écran** (8 par défaut). Monter `targetLines` densifie la grille, le baisser l'aère.

```tsx
config={{ graticule: { targetLines: 12 } }}
```

**`levelHysteresis` n'est pas un détail de confort.** Un zoom qui s'arrête pile sur une
frontière de palier basculerait d'une frame à l'autre, et *chaque bascule reconstruit
toute la géométrie* : la bande morte (15 % d'écart de densité par défaut) est la seule
chose qui empêche un rebuild en boucle. Ne la mettre à `0` que pour observer le
phénomène.

**Figer la maille** — `levelRangeDeg` borne l'échelle, et `[x, x]` la verrouille :

```tsx
config={{ graticule: { levelRangeDeg: [1 / 60, 1 / 60] } }}   // toujours 1′
```

## 4. Comment le fondu marche

Au-delà d'une certaine inclinaison, une grille cesse d'être lisible : les mailles
s'écrasent vers l'horizon et le quadrillage devient un moiré. Elle s'efface donc, en
fondu.

La bande s'exprime en **fractions du plafond d'inclinaison du mode courant**, et non en
degrés absolus. La raison est concrète : ce plafond vaut **79,2° en volume** mais
**36° en carte plate** (`camera.maxTilt3d` / `maxTilt2d`) — une bande écrite « 60° → 75° »
ne se déclencherait *jamais* à plat.

```tsx
config={{ graticule: { tiltFade: { start: 0.75, end: 0.95 }, fadeMs: 250 } }}
```

Ce que ça donne aux défauts :

| Mode | Plafond | Début du fondu (0,75) | Disparition (0,95) |
|---|---|---|---|
| **3D** | 79,2° | 59,4° | 75,2° |
| **plan** | 36,0° | 27,0° | 34,2° |

`fadeMs` est la constante de temps du lissage — c'est elle, la douceur. À `0`, la grille
apparaît et disparaît d'un coup.

⚠️ Un hôte qui resserre `camera.maxTilt3d` **déplace le fondu avec lui**, puisque la
bande est relative. C'est voulu : la grille disparaît toujours au même « pourcentage
d'inclinaison possible », quelle que soit la limite qu'on impose à la caméra. Cf.
[CAMERA.md](CAMERA.md).

**Fondu croisé de maille** — au changement de palier, l'ancienne grille s'efface pendant
que la nouvelle apparaît, au lieu d'un saut sec :

```tsx
config={{ graticule: { levelFadeMs: 300 } }}   // 0 = bascule sèche
```

## 5. Lignes remarquables

Elles sont tracées **quelle que soit la maille** — sans ça, l'Équateur disparaîtrait dès
le palier 15°, alors que c'est justement la ligne qu'on cherche du regard. Quand l'une
d'elles tombe exactement sur une ligne de maille, elle ne la double pas : elle la
**marque**.

Elles vivent en config, avec la clé de leur libellé :

```tsx
config={{
  graticule: {
    remarkable: {
      enabled: true,
      parallels: [
        { lat: 0, labelKey: 'equator' },
        { lat: 23.4363, labelKey: 'tropicCancer' },
        // …
      ],
      meridians: [{ lng: 0, labelKey: 'primeMeridian' }],
    },
  },
}}
```

Pourquoi en config et non en constantes : l'obliquité de l'écliptique (23,4363°) dérive
lentement, et un tileset non terrestre — maquette, relevé, planète — n'a ni tropiques ni
cercles polaires. `remarkable: { enabled: false }` les retire toutes.

Ajouter une ligne demande **aussi** son libellé, sinon la coordonnée s'affiche à la
place du nom :

```tsx
labels={{ graticule: { remarkable: { myLine: 'Limite de zone' } } }}
```

## 6. Étiquettes

Par défaut elles se posent **le long de la croix centrale** : les latitudes suivent le
méridien le plus proche du centre écran, les longitudes le parallèle le plus proche.
C'est ce qui plafonne naturellement leur nombre quel que soit le zoom, et ce qui leur
donne les deux chaînes diagonales d'une carte.

```tsx
config={{
  graticule: {
    labels: {
      enabled: true,
      placement: 'center-cross',   // 'edges' : collées aux bords, jamais sur le centre
      format: 'auto',              // 'dms' | 'dm' | 'deg' pour l'imposer
      rotate: true,                // suivre l'angle de la ligne
      remarkableNames: true,       // « Équateur » plutôt que « 0°N »
      idleOpacity: 0.65,           // 1 = toujours pleines
      maxLabels: 40,
      spacingPx: 90,
      hoverPaddingPx: 4,
    },
  },
}}
```

**Rotation** — l'étiquette suit sa ligne **tant qu'elle reste lisible**. Au-delà de 45°,
elle bascule d'un quart de tour et se pose en travers : un méridien en vue nord-en-haut
est vertical, et une étiquette écrite de bas en haut ne se lit pas.

**Survol** — les étiquettes sont translucides au repos et redeviennent pleines sous le
pointeur. Elles restent en `pointer-events: none` : le survol est calculé
géométriquement, donc **aucune étiquette ne peut avaler un début de déplacement de la
carte**.

**Densité** — trois réglages la bornent, et c'est `spacingPx` qui agit en pratique :
`maxLabels` est un garde-fou qu'on n'atteint qu'en descendant `spacingPx` très bas.

## 7. Apparence

La règle du partage config / thème, ici comme ailleurs : **ce qui se voit est dans le
thème, le reste est dans la config.** Une valeur qu'on change pour une charte graphique
est du thème ; une valeur qu'on change pour un écran plus dense ou une machine plus
faible est de la config.

```tsx
theme={{
  colors: {
    graticule: {
      line: '#ffd54a',              // parallèles et méridiens ordinaires
      remarkable: '#ff8f00',        // Équateur, tropiques, cercles polaires…
      label: '#ffffff',
      labelBackground: 'rgba(0,0,0,0.55)',
    },
  },
}}
```

Le défaut est **jaune** et non blanc comme un atlas : le blanc disparaît sur un fond plan
clair, alors que l'ambre tient sur les deux fonds — satellite sombre comme carte
routière — sans se confondre avec la palette de dessin.

Restent en config parce qu'ils ne sont pas une charte : `opacity`, `remarkableOpacity`,
`dash` (pointillé, en mètres monde), `heightOffsetMeters`.

⚠️ **L'épaisseur n'est pas réglable** : WebGL ignore `linewidth`, le trait fait 1 px. La
rendre réglable imposerait des rubans triangulés, avec leurs raycasts d'ancre et leur
resettle LOD — un coût sans rapport avec ce que la grille apporte.

## 8. Dans l'interface

Deux points d'entrée, **un seul état**. Ils s'allument et s'éteignent ensemble.

**Sous-menu « Mesures »** de la barre d'outils — survoler le bouton règle ouvre deux
rangées, « Mesurer » et « Grille » :

```tsx
<Map draw={{}} toolbar={{}} />
{/* retirer la grille de la barre, sans la retirer de la carte : */}
<Map draw={{}} toolbar={{ measureTools: ['measure'] }} />
```

**Bouton des contrôles de vue**, à côté de « Globe » :

```tsx
<Map controls={{ buttons: { graticule: false } }} />   // pour le retirer
```

⚠️ Ce second bouton n'est pas un doublon. La barre d'outils **se replie sous le zoom 11**
(`interaction.drawToolbarMinZoom`) : sans lui, la grille deviendrait impilotable en vue
globe — exactement là où elle sert le plus.

**Raccourci** — `K` par défaut, dans `interaction.shortcuts.controls` :

```tsx
config={{ interaction: { shortcuts: { controls: { graticule: 'g', globe: 'k' } } } }}
```

Il vit dans la table des **contrôles** et non du dessin, bien que la grille ait aussi une
rangée dans le sous-menu Mesures : c'est une commande de vue, et son bouton fonctionne
sans aucune couche de dessin montée. Rangé sous `draw`, le raccourci mourait avec
`<DrawLayer>` pendant que l'infobulle continuait de l'annoncer.

Comme partout dans la lib, **la touche n'est active que si son bouton est rendu**.

## 9. Performance

La grille est faite pour ne rien coûter. Ce qu'il faut savoir si vous la réglez :

**Trois déclencheurs de reconstruction, jamais la frame** — la maille a changé, le centre
est sorti de la bande construite, ou la hauteur de drapage a dérivé de plus de
`heightToleranceMeters`. Entre deux reconstructions, la couche n'écrit qu'une opacité et
repositionne ses étiquettes.

**Une bande, pas le globe** — au pas de 1″, construire la Terre entière demanderait des
millions de sommets. La lib construit `bandScreens` écrans (2 par défaut) autour du
centre : le déborder est ce qui transforme « rebuild par frame » en « rebuild par écran
parcouru ». Élargir la bande espace les reconstructions et alourdit chacune.

**Elle ne lit jamais l'emprise du viewport.** `MapView.bounds` passe par une grille de
25 raycasts d'ellipsoïde que le moteur réserve aux consommateurs hors boucle de frame :
la maille se dérive de l'altitude caméra, par deux fonctions pures.

**Le rendu à la demande est respecté** — la boucle n'est réveillée que tant qu'un fondu
converge, jamais au repos. Grille éteinte, la couche ne fait rien du tout : pas de
géométrie, pas de draw call, pas une écriture DOM.

**Densification proportionnée** — `segmentsPerLine` (128) est un *plafond*. Une ligne qui
ne couvre que quelques secondes d'arc est rectiligne : la lib n'y met pas 128 segments.

Les garde-fous durs, à ne baisser que sur machine très faible : `maxLines` (64 par axe),
`labels.maxLabels` (40).

## 10. Limites connues

- **Trait à 1 px**, imposé par WebGL (cf. §7).
- **Pas de MGRS ni d'UTM** : la lib ne fait que le graticule géographique. Un carroyage
  militaire est un second moteur de grille — projection par fuseau, bandes polaires,
  désignateurs de zone.
- **Les méridiens s'arrêtent à `latLimitDeg`** (85° par défaut) : au-delà ils se
  rejoignent et la densité de sommets explose pour un rendu illisible.
- **Pas de survol des lignes** : seules les étiquettes réagissent au pointeur.
- **Sous le zoom 11**, la barre d'outils étant repliée, la grille se pilote par le bouton
  des contrôles de vue, le raccourci ou l'API (cf. §8).

---

**Voir aussi** — [CAMERA.md](CAMERA.md) (plafonds d'inclinaison dont dépend le fondu) ·
[THEME.md](THEME.md) · [CONFIG.md](CONFIG.md) · [HOOKS.md](HOOKS.md)
