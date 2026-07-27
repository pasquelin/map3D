# BLOQUANT 5 — Event « carte prête » (`ready`)

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin

`onMapLoad` est la prop la plus utilisée de l'ancienne carte : **7 sites**
(`FieldLatLngMap`, `MapAgent`, `ViewForm`, `companyZones/ViewDetail`, `ResumeMap`,
`map/ViewDetail`, `parameters/ViewDetail`), plus `MapAgent.onMapReady` qui la relaie.

Deux usages distincts s'y mêlent :

1. **récupérer le ref** de la carte pour appeler ses méthodes ;
2. **gater un cadrage** (`ResumeMap` : `setIsMapReady` puis `fitBounds`).

map3d couvre déjà le premier gratuitement — `useMap()` donne le moteur dès le montage.
C'est le second qui manquait : les tuiles chargent en asynchrone, et un `fitBounds` lancé
trop tôt viserait l'ellipsoïde nu au lieu du sol réel.

## Sémantique retenue

> `ready` = la projection résout des hauteurs, et un cadrage vise le **sol réel**.

Ce n'est **pas** « le moteur existe » (déjà couvert par `useMap()`), ni « la première frame
est peinte ». C'est le seuil à partir duquel les commandes caméra sont fiables.

```ts
usable =
  projection.isReady() &&
  (mapMode !== '3d' || (terrainKnown && tiles.loadProgress >= 1))
```

La branche 3D est **exactement la condition qui décide du décollage de l'intro**
(`MapEngine.ts:760`) — pas une condition parallèle réinventée. Elle avait déjà été
choisie pour signifier « la planète est là, on peut viser le sol ».

La branche 2D existe parce que `trackTerrainElevation()` n'est appelé qu'en mode 3D :
`terrainKnown` resterait éternellement faux sur un fond plan, et `ready` n'arriverait qu'au
bout du garde-fou. Sans terrain 3D à attendre, la projection suffit.

## Garde-fou

`READY_MAX_WAIT_MS = 8000`, même valeur et même raison d'être que `INTRO_MAX_WAIT_MS` :
une source de tuiles en échec (403, token invalide, réseau coupé) ne doit jamais laisser
l'application suspendue à un event qui n'arrivera pas. `ready` finit toujours par tomber.

Son origine est posée dans `start()`, pas à la construction : le temps du montage React ne
doit pas entamer le délai d'attente des tuiles.

## Émission unique, et rejeu

L'event tire **une seule fois** (`readyEmitted`). Mais un abonné peut arriver après — une
couche montée tardivement, une vue remontée. `on('ready', cb)` **rappelle donc `cb`
immédiatement** si la carte l'est déjà :

```ts
on(event, cb) {
  this.listeners[event].add(cb)
  if (event === 'ready' && this.readyEmitted) cb(this)
  return () => this.listeners[event].delete(cb)
}
```

Sans ce rejeu, `onReady` serait un piège : il marcherait au premier montage et resterait
silencieux ensuite, de façon intermittente et difficile à diagnostiquer.

Lecture synchrone disponible : `engine.ready`.

## Surfaces

| Où | Quoi |
|---|---|
| `engine.on('ready', (engine) => …)` | event moteur |
| `engine.ready` | booléen synchrone |
| `<Map onReady={(engine) => …}>` | prop |
| `useMapEvents({ onReady })` | abonnement déclaratif depuis une couche enfant |

`useMapEvents` couvre le cas de `MapAgent.onMapReady` : un composant intermédiaire qui a
besoin du signal sans être celui qui rend `<Map>`.

## Correspondance

| Ancienne carte | map3d |
|---|---|
| `onMapLoad(map)` — pour obtenir le ref | `useMap()`, sans attendre |
| `onMapLoad(map)` — pour gater un `fitBounds` | `<Map onReady>` ou `useMapEvents({ onReady })` |
| `MapAgent.onMapReady()` | `useMapEvents({ onReady })` |
| `setIsMapReady(true)` puis cadrage (`ResumeMap`) | `onReady={() => camera.fitBounds(...)}` |

## Critères d'acceptation

- [x] `onReady` tire une fois, après quoi `fitBounds`/`camera` sont fiables.
- [x] Sémantique documentée, et distinguée de « le moteur existe ».
- [x] Un abonné tardif reçoit quand même le signal.
- [x] Une source de tuiles en échec n'empêche pas `ready`.
- [x] `pnpm typecheck` vert.
- [x] Exemple : `onReady` journalise l'état de la vue au moment où le cadrage devient fiable.

## Non vérifié

Pas de contrôle en navigateur. En particulier : le délai réel entre montage et `ready` sur
une connexion lente, et le comportement au **basculement 2D ↔ 3D après coup** — `ready`
ayant déjà été émis, il ne sera pas réévalué si l'on passe en 3D depuis un fond plan alors
que le terrain n'est pas encore connu. C'est un choix (l'event est un jalon de démarrage,
pas un état continu), mais il mérite d'être confirmé à l'usage : `engine.ready` resterait
`true` pendant le court instant où la 3D charge son terrain.
