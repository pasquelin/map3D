# Loupe — rayon X des markers d'une zone

**Français** · [English](../en/LENS.md) · [↑ Index](README.md)

Outil de **consultation** : on trace une zone rectangulaire à l'écran, et un panneau
inventorie **tous les markers qu'elle couvre — y compris ceux agrégés dans un
cluster**.

La carte, elle, ne bouge pas : rien n'est sélectionné, aucun cluster n'est éclaté,
aucune forme n'est créée. Donc rien dans le GeoJSON, l'undo/redo ou le panneau de
style.

---

## 1. Elle est déjà là

La loupe est **montée par la carte et active par défaut** — comme l'outil Symboles, il
n'y a rien à assembler :

```tsx
<Map center={PARIS} zoom={14} layers={[markersLayer({ points: markers })]} draw={{}} toolbar={{}} />
{/* bouton dans la barre, touche X */}
```

`toolbar.lens` ne sert qu'à la **régler** — tout est facultatif :

```tsx
<Map
  toolbar={{
    lens: {
      renderItem: (m) => m.data?.name ?? m.id,   // défaut : pastille de type + avatar + id
      actions: ACTIONS_FICHE,                     // en plus de « Cibler », natif
      menu: (m) => MENU(m),                       // prime sur `actions`
      markerTypeLabel: (t) => LIBELLES[t] ?? t,   // récap par type de l'en-tête
      getId: (m) => m.id,
      shortcut: 'x',                              // `null` = aucun
      targetZoom: 17,
    },
  }}
/>
```

`toolbar={{ lens: false }}` la retire **entièrement** — ni bouton, ni raccourci, ni
couche. **`toolbar={false}` la retire aussi** : sans barre il n'y a pas de bouton, et
garder l'outil joignable au seul raccourci serait une demi-mesure invisible. Une carte
qui veut la loupe sans barre monte `<LensLayer>` elle-même (cf. § 5).

---

## 2. Interaction

Tant que l'outil est actif :

| Geste | Effet |
|---|---|
| glisser sur la carte | trace la zone ; **retracer remplace** la zone existante |
| clic simple | efface la zone |
| poignées | déplace / redimensionne la zone (la liste se recalcule) |
| croix | retire la zone |
| molette | zoome la carte |
| `Espace` maintenu | pan caméra (`Espace+Maj` = rotation), comme pour le dessin |
| `Échap` | retire la zone, puis quitte l'outil |

Un glissé plus court que `config.interaction.lens.minDragPx` compte comme un **clic** :
il ne doit rien créer.

La loupe est un **overlay écran fixe** : la liste **se recalcule en direct** quand la
carte défile dessous.

**La loupe et les outils de dessin sont mutuellement exclusifs** — ils partagent le
même intercepteur de pointeur. L'exclusivité est portée par `<DrawLayer>`, monté *sous*
la couche loupe : la loupe ignore donc tout du dessin, et fonctionne sur une carte qui
n'en a pas.

---

## 3. L'inventaire

Le panneau réutilise la `<MarkerList>` du panneau de sélection : une ligne par marker,
en-tête fixe avec le **décompte par type**, corps scrollable, croix par ligne, menu
d'actions extensible.

Ce qu'il voit, exactement : **tous** les markers dont la position tombe dans le cadre,
lus depuis les **données sources** via le registre `engine.markers` — clusters compris,
et post-filtre « Couches ».

La conversion écran → géo est faite en deux temps : les coins du rectangle sont pickés
pour obtenir un cadre géo grossier (repli sur le monde entier si la vue regarde le
ciel), puis chaque marker candidat est reprojeté à l'écran pour le test final.
Chaque marker est projeté à la **hauteur du sol sous lui**, pas à celle du centre de la
zone : sinon, sur relief, le décalage écran produirait des faux positifs et des faux
négatifs près des bords.

Le menu d'une ligne suit la règle générale : `toolbar.lens.menu`, sinon
`<Map markerMenu>`, sinon `actions`. **« Cibler » est ajouté en tête par la liste** —
ne le remettez pas.

---

## 4. Piloter la loupe depuis votre UI

```ts
const lens = useLens()   // partout sous <Map>

lens.active        // l'outil est armé (ou une zone existe déjà)
lens.activate()
lens.deactivate()
lens.toggle()
lens.shortcut      // la lettre affichée dans le tooltip, ou null
```

Ou par la poignée impérative : `map.current?.lens` (`null` si la loupe est retirée).

Le bouton de barre est un **outil natif de `<Toolbar>`**, masquable par
`components={{ lens: false }}` — le masquer laisse l'outil actif au raccourci, là où
`toolbar={{ lens: false }}` le supprime.

---

## 5. Montage manuel

`<LensLayer>`, `<LensToolButton>` et `<LensPanel>` sont exportés pour une barre maison
ou un panneau réutilisé ailleurs.

```tsx
<Map toolbar={{ lens: false }}>   {/* sinon deux loupes : deux raccourcis, deux zones */}
  <LensLayer shortcut="x">
    …
  </LensLayer>
</Map>
```

Types utiles : `LensOptions`, `LensLayerProps`, `LensPanelProps`, `LensRenderItem`,
`LensRect` (rectangle en **pixels conteneur**, pas en pixels client).

---

## Voir aussi

- [MARKERS.md](MARKERS.md) — `engine.markers`, `<MarkerList>`, menus partagés
- [DRAWING.md](DRAWING.md) — l'exclusivité avec les outils de tracé
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [LABELS.md](LABELS.md)
