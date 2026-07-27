# Référence de map3D

Quatre documents, tous **générés depuis les sources** (`pnpm doc`) : les valeurs sont
lues à l'exécution et les descriptions extraites des JSDoc, si bien qu'aucun défaut
annoncé ici ne peut diverger de ce que la lib applique.

| Document | Contenu | Entrées |
|---|---|---|
| [CONFIG.md](CONFIG.md) | `MapConfig` — ce qui se **règle** : fournisseurs, gestes, budgets, stockage | 199 |
| [THEME.md](THEME.md) | `MapTheme` — ce qui se **voit** : couleurs, tailles, rythme | 98 |
| [LABELS.md](LABELS.md) | `MapLabels` — tous les **textes** et les règles de formatage | 179 |
| [PROPS.md](PROPS.md) | Props des 13 composants React | 145 |

## Les trois arbres

`<Map>` accepte trois arbres de réglages, mergés profondément sur une base complète.
Chacun a sa raison de changer :

```tsx
<MapProvider
  theme={{ colors: { ui: { accent: '#0af' } } }}   // charte graphique
  labels={{ measure: imperialMeasure }}            // langue et unités
  config={{ performance: { antialias: false } }}   // machine, quota, support
>
  <Map center={…} zoom={14} />
</MapProvider>
```

La ligne de partage : on change de **thème** pour une charte, de **labels** pour une
locale, de **config** pour une clé d'API, un quota ou un support tactile.

Les props d'un composant **surchargent** ces arbres pour une instance : ne rien
passer suit la carte.

## Régénérer

```bash
pnpm doc
```

À relancer après toute modification de `config/types.ts`, `theme/types.ts`,
`labels/types.ts` ou des props d'un composant.
