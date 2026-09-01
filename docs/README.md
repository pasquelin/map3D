# map3D — documentation

Choose your language · Choisissez votre langue

| Language · Langue | Contents · Contenu |
|---|---|
| 🇫🇷 **[Français](fr/README.md)** | Documentation complète — guides et références |
| 🇬🇧 **[English](en/README.md)** | Full documentation — guides and reference |

---

## Structure

Une langue = un dossier nommé par son code **ISO 639-1**, contenant les **mêmes noms
de fichiers**. Passer d'une langue à l'autre est donc mécanique : `fr/MARKERS.md` ↔
`en/MARKERS.md`.

*One language = one folder named after its **ISO 639-1** code, holding the **same file
names**. Switching languages is mechanical: `fr/MARKERS.md` ↔ `en/MARKERS.md`.*

```
docs/
├── README.md          ← vous êtes ici / you are here
├── fr/
│   ├── README.md      guide + index
│   ├── MARKERS.md    ZONES.md      CATALOG.md      DRAWING.md   SYMBOLS.md   TEMPLATES.md
│   ├── RELATIONS.md  LENS.md       SEARCH.md        CAMERA.md   TILES.md     BUILDINGS.md
│   ├── GRATICULE.md  PLUGINS.md    PREFERENCES.md   DATA.md     HOOKS.md     ENGINE.md
│   ├── PEDESTRIAN.md ← marche au sol, immersion première personne
│   └── CONFIG.md   THEME.md  LABELS.md   PROPS.md          ← références
└── en/
    └── (mêmes fichiers / same files)
```

| Fichier | Français | English |
|---|---|---|
| Guide + index | [fr/README.md](fr/README.md) | [en/README.md](en/README.md) |
| Markers | [fr](fr/MARKERS.md) | [en](en/MARKERS.md) |
| Zones & formes / Zones & shapes | [fr](fr/ZONES.md) | [en](en/ZONES.md) |
| Catalogue / Catalog | [fr](fr/CATALOG.md) | [en](en/CATALOG.md) |
| Dessin / Drawing | [fr](fr/DRAWING.md) | [en](en/DRAWING.md) |
| Symboles / Symbols | [fr](fr/SYMBOLS.md) | [en](en/SYMBOLS.md) |
| Templates | [fr](fr/TEMPLATES.md) | [en](en/TEMPLATES.md) |
| Relations | [fr](fr/RELATIONS.md) | [en](en/RELATIONS.md) |
| Loupe / Lens | [fr](fr/LENS.md) | [en](en/LENS.md) |
| Recherche / Search | [fr](fr/SEARCH.md) | [en](en/SEARCH.md) |
| Caméra / Camera | [fr](fr/CAMERA.md) | [en](en/CAMERA.md) |
| Mode piéton / Pedestrian mode | [fr](fr/PEDESTRIAN.md) | [en](en/PEDESTRIAN.md) |
| Tuiles / Tiles | [fr](fr/TILES.md) | [en](en/TILES.md) |
| Bâtiments / Buildings | [fr](fr/BUILDINGS.md) | [en](en/BUILDINGS.md) |
| Graticule | [fr](fr/GRATICULE.md) | [en](en/GRATICULE.md) |
| Plugins | [fr](fr/PLUGINS.md) | [en](en/PLUGINS.md) |
| Préférences / Preferences | [fr](fr/PREFERENCES.md) | [en](en/PREFERENCES.md) |
| Données / Data | [fr](fr/DATA.md) | [en](en/DATA.md) |
| Hooks | [fr](fr/HOOKS.md) | [en](en/HOOKS.md) |
| Moteur / Engine | [fr](fr/ENGINE.md) | [en](en/ENGINE.md) |
| `MapConfig` | [fr](fr/CONFIG.md) | [en](en/CONFIG.md) |
| `MapTheme` | [fr](fr/THEME.md) | [en](en/THEME.md) |
| `MapLabels` | [fr](fr/LABELS.md) | [en](en/LABELS.md) |
| Props | [fr](fr/PROPS.md) | [en](en/PROPS.md) |

## Ajouter une langue / Adding a language

1. `cp -r docs/fr docs/<iso>` (ex. `docs/es`), puis traduisez.
2. Conservez les **noms de fichiers** et les **ancres de titres** : tous les liens
   croisés en dépendent.
3. Mettez à jour la ligne de langue en tête de chaque fichier, ce tableau, et le
   [README racine](../README.md).
4. Pour que la **vitrine** ([pasquelin.github.io/map3D](https://pasquelin.github.io/map3D/))
   parle aussi cette langue : copiez `site/i18n/en.json` en `site/i18n/<iso>.json` et
   traduisez ses valeurs. Le rendu (`site/build.mjs`) publie la langue par défaut à la
   racine du site et les autres sous `/<iso>/`, et **échoue** si un dictionnaire n'a
   pas exactement les mêmes clés que `en.json`.

*4. For the **landing page** to speak that language too: copy `site/i18n/en.json` to
`site/i18n/<iso>.json` and translate its values. The renderer (`site/build.mjs`)
publishes the default language at the site root and the others under `/<iso>/`, and
**fails** when a dictionary does not carry exactly the same keys as `en.json`.*

Ce qui **ne se traduit pas** : le code des exemples, les noms d'API, les clés de
`labels`, les identifiants (`marker:agent`, `m3d:tag-filter`).

*What is **not** translated: example code, API names, `labels` keys, identifiers.*

> Les quatre **références** (`CONFIG`, `THEME`, `LABELS`, `PROPS`) sont extraites des
> types et des JSDoc du code, qui sont en français : leur version anglaise est
> traduite à la main et doit être revue quand les types changent.
>
> *The four **reference** documents are extracted from the source types and JSDoc,
> which are written in French: the English version is hand-translated and must be
> reviewed whenever the types change.*
