# map3D — documentation

Choose your language · Choisissez votre langue

| | | |
|---|---|---|
| 🇫🇷 | **[Français](fr/README.md)** | Documentation complète — guides et références |
| 🇬🇧 | **[English](en/README.md)** | Full documentation — guides and reference |

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
│   ├── MARKERS.md  ZONES.md  DRAWING.md  SYMBOLS.md  RELATIONS.md
│   ├── LENS.md     SEARCH.md CAMERA.md   DATA.md     HOOKS.md  ENGINE.md
│   └── CONFIG.md   THEME.md  LABELS.md   PROPS.md          ← références
└── en/
    └── (mêmes fichiers / same files)
```

| Fichier | Français | English |
|---|---|---|
| Guide + index | [fr/README.md](fr/README.md) | [en/README.md](en/README.md) |
| Markers | [fr](fr/MARKERS.md) | [en](en/MARKERS.md) |
| Zones & formes / Zones & shapes | [fr](fr/ZONES.md) | [en](en/ZONES.md) |
| Dessin / Drawing | [fr](fr/DRAWING.md) | [en](en/DRAWING.md) |
| Symboles / Symbols | [fr](fr/SYMBOLS.md) | [en](en/SYMBOLS.md) |
| Relations | [fr](fr/RELATIONS.md) | [en](en/RELATIONS.md) |
| Loupe / Lens | [fr](fr/LENS.md) | [en](en/LENS.md) |
| Recherche / Search | [fr](fr/SEARCH.md) | [en](en/SEARCH.md) |
| Caméra / Camera | [fr](fr/CAMERA.md) | [en](en/CAMERA.md) |
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
