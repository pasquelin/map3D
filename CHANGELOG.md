# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
La lib suit le [versionnage sémantique](https://semver.org/lang/fr/) à partir de la 1.0.0 ;
en `0.x`, une version mineure peut casser l'API — les ruptures sont listées ici.

## [Non publié]

## [0.4.0] — 2026-08-31

### change! : `toolbar.tools` fait autorité sur `draw.tools` quand ce dernier est absent

**Rupture de comportement.** Sur `<Map>`, `draw.tools` non fourni retombe désormais sur
`toolbar.tools`. Auparavant, ne renseigner que `toolbar.tools` laissait **tous** les outils
autorisés : un outil retiré de la barre restait armable à son raccourci clavier, sans bouton
pour en sortir — un mode dont l'utilisateur ne pouvait plus sortir à la souris.

L'invariant était jusqu'ici tenu par la vigilance de l'appelant, qui devait recopier sa liste
sur les deux props. Il est maintenant garanti par construction.

Les deux réglages restent distincts — `toolbar.tools` ce qui est **affiché**, `draw.tools` ce
qui est **autorisé** — et les dissocier volontairement reste possible en renseignant les deux.

**Qui est concerné** : une application qui fournit `toolbar.tools` sans `draw.tools` **et**
qui comptait sur les raccourcis clavier des outils masqués. Le dessin y sera désormais borné
aux outils affichés. Pour rétablir l'ancien comportement, fournir explicitement
`draw={{ tools: […] }}` avec la liste complète voulue.

Sans barre (`toolbar: false`) ou sans dessin (`draw: false`), rien ne change.

### fix : `VERSION` reflète la version réellement publiée

`VERSION` était figée à `'0.1.0'` depuis deux versions, la constante ayant été recopiée à la
main. Elle est désormais dérivée du `package.json`, seule source de vérité — la désynchronisation
ne peut plus se reproduire. Le manifeste n'est pas embarqué dans le bundle (seul le champ
`version` survit au tree-shaking).

### fix : un agrégat de catalogue ne s'inscrit plus lui-même en sélection

La règle « un groupe n'est qu'un sélecteur de ses enfants » ne tenait que pour **un geste sur
deux** : la case n'inscrivait que les enfants, le clic sur le NOM inscrivait le groupe. Trois
conséquences, toutes visibles :

- le badge comptait **4** pour un groupe de 3 zones (le groupe + ses enfants), et la carte
  peignait **6 formes pour 3 zones** — `geometry` d'un agrégat rend celles de ses enfants ;
- décocher le groupe ne retirait que les enfants : sa clé survivait, badge à **1** avec un
  panneau où plus rien n'était coché ;
- rouvrir le panneau **recochait le groupe**, seule information encore disponible une fois
  l'appartenance oubliée.

Les deux gestes passent désormais par le même chemin, et le nom d'un agrégat affiche (ou
retire) ses enfants en cadrant leur union. Une clé d'agrégat laissée par une session
antérieure est **retirée au premier contact avec le groupe**, dépliage compris : personne ne
perd sa sélection.

### feat : le catalogue montre ce qui est affiché, sans rien déplier

Retrouver trois zones cochées demandait d'ouvrir chaque type puis chaque groupe. Deux
compteurs y répondent : un agrégat dont une partie des éléments est sur la carte porte
« 2/3 » (`labels.catalog.groupCount`), et chaque ligne du menu des types porte le nombre
d'éléments qu'elle affiche (`labels.catalog.sourceShown`). Les deux restent muets à zéro.

C'est l'**appartenance retenue par le store** qui le permet — quels éléments composent quel
agrégat, mémorisé dès qu'ils ont été chargés une fois et persisté avec la sélection. Aucune
requête de plus : une case repliée est juste sans que la source soit redemandée. Le champ est
additif, une charge écrite avant se relit intacte.

Nouveaux : `useCatalogSourceCount(id)`, `CatalogApi.rememberGroup` / `.groupState`, et
`setMany(source, items, shown, { fit })`. Aucune rupture.

> Si vos agrégats annonçaient leur nombre d'enfants par un `badge`, retirez-le : la lib
> écrit déjà « 2/3 », et les deux côte à côte donnent « 3/3 3 ».

### change : nouvel ordre des groupes de la barre de navigation

De haut en bas : `drag`, `compass`, **`layers`**, **`target`**, `pedestrian`, **`zoom`**,
`fullscreen`. Le zoom descend au contact du plein écran — geste le plus répété, donc le plus
près du bord bas, et les deux seuls groupes qui n'ouvrent aucune surface se retrouvent
ensemble. Les couches / catalogue / templates remontent juste après le point de vue, suivies
du retour au point de contrôle : on choisit ce que la carte montre, on y revient, puis on
descend s'y promener.

Réordonnancement **visuel uniquement**. Les clés de `components` et de `buttons` ne changent
pas, les raccourcis non plus ; un hôte qui remplace un groupe le retrouve à sa nouvelle place.

### change : l'outil « Main levée » s'appelle désormais « Crayon »

Le terme « main levée » est déjà pris ailleurs, avec un autre sens, dans les applications
qui intègrent la lib — deux objets sans rapport portaient le même nom à l'écran. Et en deux
mots, le libellé passait sur **deux lignes** dans la rangée de catégories du gestionnaire de
templates, seul de sa rangée. « Crayon » lève l'ambiguïté et tient sur une ligne.

Changement de **libellé par défaut FR uniquement** : `labels.tools.freehand` et
`labels.templates.category.freehand` valent `'Crayon'` au lieu de `'Main levée'`. **Aucune
rupture d'API** — la clé reste `freehand`, le raccourci reste `H` (`'c'` est pris par le
cercle), et un hôte qui redéfinit ces libellés via `labels` n'est pas concerné.

### fix : un menu de la barre à dessin se referme quand la barre se replie

En dézoomant sous `toolbar.minZoom`, la barre glisse hors écran — mais son menu ouvert
restait, **seul au milieu de la carte**, sans le bouton qui l'avait ouvert ni rien pour le
refermer, et il rouvrait tel quel au retour. Les sous-menus de survol tenaient déjà cette
règle ; les menus ne l'avaient jamais eue.

`<Dropdown>` s'y raccroche désormais lui-même, donc **tous** en héritent (style, réglages,
symboles, catalogue, filtre de tags). Un `useCloseAnyDropdown` existait pour ça, sans aucun
appelant : il fermait la surface ouverte *quelle qu'elle soit*, y compris celle d'une autre
barre que le repli ne concerne pas. Il est remplacé et retiré.

Au passage, `ToolbarApi` / `useToolbar` rejoignent les autres contextes (`react/context`) :
`<Dropdown>` doit lire celui de la barre, et la barre importe `<Dropdown>` — c'est ce cycle
qui avait fait renoncer la première fois. L'API publique ne bouge pas (`<Toolbar>` les
ré-exporte).

### ⚠️ Défaut changé — la barre de dessin se replie sous le zoom 5, non plus 11

À 11, elle disparaissait dès qu'on quittait l'échelle de la rue — alors qu'on trace aussi
des emprises régionales, et que le repli est là pour un seul cas : la vue globe, où
dessiner n'a pas de sens. `config.toolbar.minZoom` (ou la prop `<Toolbar minZoom>`)
rétablit l'ancien seuil en une ligne.

L'exemple ne fige plus sa propre valeur : il lit `defaultConfig.toolbar.minZoom`. Il
passait `11` en prop, laquelle prime sur la config — le défaut de la lib pouvait donc
changer sans que la démo ne bouge d'un pixel.

### feat : catalogue — régime « index », pour un référentiel que l'hôte peint déjà

La ligne d'une source de parcours portait une case **inconditionnellement**. Or une
application qui monte elle-même ses entités — typiquement des zones **éditables**, dans
`<DrawLayer>`, la seule couche où une forme est sélectionnable — n'a rien à cocher : elles
sont sur la carte en permanence. La case mentait (on la coche, l'état visuel change, la
carte est identique), et si elle avait vraiment posé, la même entité aurait été peinte deux
fois par deux couches qui ne se connaissent pas.

`CatalogBrowseSource.checkable: false` déclare ce régime. La ligne perd sa case — et sa
gouttière avec, comme le chevron d'une source qui ne déplie pas —, rien n'entre en sélection
ni en persistance, et le clic sur le nom **cadre** : sur `item.bounds` s'il est annoncé
(aucune requête), sinon sur la géométrie, chargée le temps de mesurer puis jetée. Chevron,
enfants, sections et actions de ligne sont inchangés — c'est tout l'intérêt du régime.

La règle vit dans le SOCLE, pas dans la liste qui l'affiche : `toggle` et `setMany` la
portent, et la restauration écarte ces clés au démarrage. Sans quoi elle n'aurait tenu que
pour les gestes de l'UI de la lib — un hôte, ou une sélection persistée par une version
antérieure où la source posait encore, aurait repeint par-dessus ce que l'hôte affiche déjà,
sans case pour l'en retirer.

Défaut `true` : **aucune source existante ne bouge**. Ajoute `labels.catalog.focus`
(« Centrer sur {label} »), qui remplace `catalog.add`/`remove` sur ces lignes, où
`aria-pressed` n'annonce plus rien.

### ui : « Annuler » et « Rétablir » se retirent de la barre au lieu de rester grisés

Deux boutons inertes occupaient en permanence une barre qu'on **compacte déjà faute de
hauteur** (cf. `useFitColumns`) — et sur une carte vierge, ils n'ont rien à faire. Ils
suivent désormais la règle des autres outils : `config.toolbar.autoHide.history` (défaut
`true`), chacun se retirant pour son propre compte. Le raccourci clavier, lui, ne dépend
pas de la barre — l'historique reste pilotable sans elle. `false` rétablit les deux flèches
en permanence.

### ⚠️ Rupture — le panneau de style ne s'ouvre plus tout seul : la barre porte un bloc de couleurs

Il s'affichait dès qu'un outil de forme devenait actif, et se ré-ancrait sur la forme
sélectionnée : dessiner ou sélectionner faisait surgir 212 px de surface sur la carte, au
moment précis où l'on regardait ce qu'on traçait. Il n'ouvrait donc jamais que ce qu'on ne
lui demandait pas.

Le **dernier bouton de la barre à dessin est désormais le bloc de couleurs** — les deux
carrés fond/bordure, façon case couleur de Photoshop. Le style courant se lit en permanence
sans rien ouvrir, et le panneau est un menu comme les autres : il s'ouvre au clic, se ferme
au clic dehors. Plus de chevron de repli ni d'état réduit — le bouton fait les deux. Ce que
le panneau règle continue de suivre le contexte (défauts des prochaines formes, ou restyle
de la sélection ; rayon d'angle sur les rectangles seulement).

**Ce qui casse** : `labels.style.collapse` n'existe plus (le panneau ne se replie plus).
Un hôte qui remplaçait la section `stylePanel` de la barre la voit maintenant rendue DANS
la barre, en dernier — et non plus en surface flottante à côté d'elle.

`<ToolButton icon>` devient **optionnel** en conséquence : un bouton dont l'aperçu est la
valeur qu'il règle n'a pas de glyphe à montrer. Rien à changer pour les appels existants.

### fix : l'infobulle d'un marker se rabat dans la carte au lieu d'être coupée

Centrée sur son ancre par un `transform`, elle était **amputée** dès que le marker
approchait un bord — un titre dont les premiers caractères manquaient, sans aucun moyen de
les lire. Les menus contextuels, ancrés au même overlay, savaient déjà se rabattre
(`useNudgeInside`) : c'est ce mécanisme qui est réutilisé, suivi de l'ancre frame par frame
compris. Vaut pour l'infobulle de marker, celle d'une pastille de regroupement et celle du
dock d'épinglés — les trois passent par le même composant.

Le hook mesurait la boîte de LAYOUT, insensible au `transform` propre — juste pour un menu,
posé par ses coordonnées ; faux pour une infobulle, que le `transform` place, et dont la
boîte de layout n'est qu'un point sur l'ancre. D'où une mesure `'visual'` en option, et une
animation d'entrée réduite à l'opacité : une position animée aurait fait mesurer la première
image, donc rabattre de travers — et durablement, la carte pouvant ne plus bouger ensuite.

### fix : plus de barre de défilement horizontale dans le menu du catalogue

La ligne d'un jeu à **bascule** est un `div` (la case et le nom sont deux contrôles), là où
un type parcourable est un `button`. Or le navigateur ne pose `box-sizing: border-box` que
sur le second : la ligne à bascule prenait `100%` PLUS ses 14 px de marge interne, dépassait
seule du panneau, et `overflow-y: auto` ouvrait pour ces 14 px une barre horizontale sous
tout le menu. `box-sizing` posé sur les deux formes, et l'axe horizontal explicitement
fermé — un menu ne se lit pas en le faisant glisser de côté, c'est le nom qui cède.

Même défaut corrigé sur les champs texte du panneau **Plugins** (`.m3d-plugin-input`), en
content-box eux aussi, donc débordant du sous-panneau qui les porte.

### feat : le trafic en fournisseur interne — le fond emprunte Google le temps du calque

Le calque trafic était refusé **dès que le fond 2D venait du serveur interne**, clé Google
présente ou non : le bouton n'apparaissait pas, le raccourci était mort et
`setTrafficVisible(true)` sans effet. La raison tient (le trafic est gravé DANS la tuile
Google, ce n'est pas une surcouche), mais la conclusion était trop courte — avec une clé, il
y a de quoi le servir, il suffit de changer de fournisseur.

Désormais, fond `internal` + `<Map googleMapsApiKey>` : le bouton est offert, l'allumer
bascule le fond sur Google, l'éteindre revient au serveur interne (cache vidé de part et
d'autre — ce sont deux jeux de tuiles). Repasser en 3D éteint le trafic **et** rend le fond
à l'interne, comme avant. Réglé par `providers.tiles.trafficViaExternal` (défaut `true`) :
`false` rétablit le refus d'origine, pour qui a choisi l'interne précisément pour ne plus
rien demander à Google. ⚠️ L'emprunt change l'aspect du fond (style Google) et refacture ses
tuiles tant que le calque est allumé.

La règle vit dans la table de vérité commune (`BasemapSupport.canBorrowTraffic`), et
`setTrafficVisible` la relit au lieu de rejuger : deux règles du trafic auraient divergé —
c'est déjà ce qui s'était produit entre le moteur et la barre.

### ui : le panneau « Infos » se répartit en colonnes — plus de défilement

Ses quatre sections empilées (24 grandeurs) dépassaient la hauteur du sous-panneau : on
ouvrait pour lire une valeur d'un coup d'œil, et il fallait faire défiler. Elles se
répartissent désormais en **colonnes déduites de la largeur reçue** (`columns`, pas un
compte figé), chaque section restant d'un seul tenant — deux colonnes dans le menu, une
seule si l'hôte monte `<StatsPanel>` dans une surface étroite. Les filets entre sections
disparaissent : entre deux colonnes, un trait horizontal ne sépare plus rien.

### fix : `<MarkerLayer onLoadingChange>` retombe au démontage

La prop n'avait **aucun contrat de démontage**, et le commentaire de `CatalogSurface`
affirmait le contraire. `ViewportController.cancel()` émet bien un `false`, mais il
s'arrête au `setLoading` INTERNE de `useLiveData` : l'effet qui relaie vers l'hôte, lui, ne
rejoue jamais pendant un démontage. Dans la lib le symptôme était masqué par accident
(`setSourceOn`/`purge`/`clear` purgent déjà `loadingSources`, plus la garde de lecture) —
mais un hôte qui branche un indicateur sur cette prop publique le voyait tourner
indéfiniment dès qu'il démontait une couche en plein vol. Nettoyage d'effet dédié, séparé
de celui sur `[loading]` pour ne pas tirer un `false` à chaque transition.

### perf : le gate `minZoom` n'émet plus qu'une fois, et abandonne ce qui est en vol

Sous le seuil, `ViewportController` émettait un tableau vide **neuf à chaque tick** : la
couche marker en tirait une identité neuve, tous ses mémos de visibilité tombaient, et les
trois registres étaient notifiés — `ChangeNotifier` n'ayant aucune garde d'égalité, la
surface de regroupement replanifiait un `rebuild()` complet. Soit, à quelques milliers de
markers, une chaîne par marker et un tri supercluster **toutes les 500 ms de déplacement,
pour zéro changement visuel**. Désormais une seule émission par descente, sur un tableau
constant.

Le gate n'abandonnait pas non plus la requête **en vol** : une réponse partie au-dessus du
seuil se résolvait après coup et repeuplait la couche sous le seuil — précisément les
milliers de points que le gate existe pour éviter. Trois tests couvrent ces chemins, dont
la descente sous le seuil requête en vol, que la première série manquait.

### feat : le catalogue nomme ses groupes — familles du menu et sections de la liste

Le menu des types séparait ses familles (`CatalogSource.family`) par un simple filet, et
la liste d'un type ne savait pas se sectionner du tout. À trois entrées le filet suffisait ;
à dix, venues de plusieurs plugins, il faut deviner ce que les voisines ont en commun.

- **Menu des types** : chaque famille porte un en-tête à son nom. Une source sans `family`
  reste dans un groupe sans nom — la lib n'invente aucun intitulé (« Autres » serait du
  texte en dur). Réglable par `config.catalog.familyHeaders` (défaut `true`).
- **Liste** : `CatalogItem.group` ouvre un intertitre au CHANGEMENT de valeur. Réglable par
  `config.catalog.groupHeaders` (défaut `true`).

⚠️ **La lib ne trie pas** : elle ouvre une section quand `group` change d'un élément au
suivant, et c'est à la source de servir ses éléments déjà groupés. Ce n'est pas une
limitation mais la condition de la **pagination** — trier supposerait de tenir le jeu
complet, alors que les pages arrivent au fil du défilement. Une page qui arrive prolonge
la section en cours au lieu d'en rouvrir une identique.

L'intertitre est une **ligne du flux virtualisé**, de la même hauteur que les autres :
la fenêtre visible suppose une hauteur constante, et un en-tête qui envelopperait ses
éléments aurait demandé un virtualiseur à hauteurs variables. `CatalogNode` devient donc
une union discriminée (`kind: 'item' | 'group'`) plutôt qu'un champ optionnel — un en-tête
n'a ni case, ni actions, ni état d'affichage.

Coût nul pour qui ne s'en sert pas : réglage coupé, `flattenCatalog` ne fait même pas la
comparaison par élément ; source sans `group`, aucun en-tête n'est produit.

Deux réglages et non un : une poignée de types d'un côté, des dizaines de milliers
d'éléments de l'autre — deux surfaces, deux volumes.

### feat : le catalogue pose des markers, et sait s'allumer d'un interrupteur

Le catalogue ne savait poser que des **formes**, et ne savait fonctionner qu'en **parcours** —
liste paginée, une case par élément. Deux manques : un référentiel de points n'avait aucune
voie, et 36 000 défibrillateurs n'ont pas vocation à être cochés un par un.

`CatalogSource` devient une **union discriminée** par `kind`, avec `'browse'` **par défaut**.

- **`markers?(id, signal)`** sur une source de parcours : un élément pose des points en plus (ou
  à la place) de ses formes. Chargés sur le même geste, retirés ensemble, jamais persistés, et
  ils entrent dans le regroupement, le filtre « Couches » et la recherche comme n'importe quel
  marker. Le cadrage du clic sur le nom porte sur l'union des formes **et** des points.
- **`kind: 'toggle'`** : un jeu qu'on allume au premier niveau du menu, chargé **au cadre
  visible**. Sa `source` est la `DataSource<MarkerData>` existante — anti-rebond, gate
  `minZoom`, `AbortSignal` et rejet des réponses hors-ordre viennent de `ViewportController`,
  rien n'a été réécrit. `markerLayer` reprend le contrat de la voie déclarative des plugins.
  Éteint, le jeu n'a **aucune couche montée** : ni contrôleur, ni écoute de la vue, ni requête.
- **Pas de cadrage sur une bascule**, et ce n'est pas un oubli : sur un jeu piloté par la vue,
  c'est la vue qui décide du contenu. La caméra n'est pas atteignable depuis ce chemin.
- **Aucun compteur d'éléments chargés**, nulle part. `computeBounds` élargit délibérément
  l'emprise (`config.performance.boundsMargin`, défaut `0.15` — +30 % sur les deux axes, ≈ +69 %
  de surface) : une bascule charge structurellement plus que ce qui est à l'écran, et un « 142 »
  posé à côté d'une carte qui en montre trois se lit « 142 affichés ». `total` (le jeu de
  référence) et l'état de chargement restent affichés — eux sont vrais et vérifiables.
- **Pas de remontée d'erreur** en mode bascule : un chargement qui échoue laisse le jeu de
  données courant intact et l'indicateur s'éteint, sans pastille rouge — le régime de
  parcours, lui, garde ses `pending`/`errors` par élément.
- **Persistance** : l'état allumé/éteint vit dans un **champ distinct** de la charge, jamais
  mêlé aux clés d'éléments — un id de source y entrerait en collision avec un id d'élément.
  Une source disparue est éteinte en silence. Les markers ne sont jamais sérialisés.
- « Tout retirer » éteint aussi les bascules, et le badge du bouton compte éléments cochés
  **et** jeux allumés : les deux mettent quelque chose sur la carte.

Nouvelle API publique : types `CatalogBrowseSource`, `CatalogToggleSource`, `CatalogSourceBase`,
gardes `isBrowseSource` / `isToggleSource`, hooks `useCatalogToggle(id)` et `useCatalogClear()`,
et sur `useCatalog()` : `markers` et `toggleSource`.

**Lire** l'état d'un jeu passe par `useCatalogToggle(id)`, jamais par `useCatalog()` : il
s'abonne aux deux booléens de CE jeu, là où l'API entière re-rendrait l'appelant à chaque
mutation du catalogue. C'est le patron que la lib s'applique à elle-même pour ses propres
lignes ; l'exposer évite de laisser à l'hôte la seule version coûteuse.

Deux ajouts hors catalogue, tirés de la même mécanique :

- **`<MarkerLayer onLoadingChange>`** — la couche tient le `ViewportController`, donc elle sait
  seule si un chargement est en vol ; elle n'en faisait rien. Le lui faire rendre évite de
  rebrancher un second contrôleur à côté pour apprendre ce qu'elle sait déjà. Bénéficie aussi à
  la voie déclarative des plugins.
- **`MarkerLayerDecl`** — le contrat de rendu était recopié entre `Plugin.markerLayer` et le
  catalogue ; une prop ajoutée à `MarkerLayer` devait l'être aux deux endroits. Un seul type
  désormais, de forme identique : **aucune rupture** pour un plugin existant.

Correctif au passage : `ViewportController` retombe son drapeau de chargement quand la requête
en vol est **abandonnée** (source retirée, `dispose`). Il ne le rendait à `false` que pour la
requête encore courante — un indicateur branché dessus tournait donc indéfiniment.

**Aucune rupture.** `kind` est optionnel et vaut `'browse'` : toute source existante reste
valide **sans un caractère à changer**, dans l'exemple comme chez un hôte. `actions` passe de la
base commune à `CatalogBrowseSource` — sans effet, puisqu'une action reçoit le `CatalogItem`
sur lequel elle porte et qu'une source à bascule n'a pas d'éléments. **Aucune clé de `labels`
n'est ajoutée** : la ligne d'une bascule réutilise `catalog.add` / `catalog.remove` /
`catalog.loading` avec le nom de la source en `{label}` — rien à retraduire côté hôte.

Documentation : [CATALOG.md § 4](docs/fr/CATALOG.md) (FR et EN), avec le tableau de décision
**bascule vs plugin** et l'avertissement `boundsMargin`. Les sections 4 à 9 sont renumérotées
5 à 10 dans les deux langues, liens entrants corrigés.

### feat : effacer devient UNE seule chose — « Tout effacer » rejoint la gomme

Trois commandes effaçaient, deux périmètres différents : après un « Tout effacer », la gomme
restait allumée sur ce qu'elle seule pouvait atteindre — les routes et zones de l'application.
Incompréhensible à l'usage. Désormais **`clear()` est la gomme sans geste** : mêmes objets,
mêmes filtres, même `onErase`.

- **Périmètre commun** : formes possédées (dessins, mesures, symboles) **et** objets hôte
  effaçables (`<PathLayer>` / `<ShapeLayer>` marqués `erasable`), filtrés par
  `config.erase.targets`, formes verrouillées et masquées par le filtre « Couches » épargnées.
- **Place commune** : « Tout effacer » quitte le pied de la barre pour devenir la 3ᵉ rangée du
  sous-menu de la gomme, sous « Gomme » et « Gomme sélection » — trois façons d'effacer, au
  même endroit. Elle porte la couleur d'alerte et un filet de séparation : seule rangée du
  menu qui agit au clic au lieu d'armer un mode.
- **Un seul prédicat** : la gomme — rangée comprise — se **retire** de la barre tant qu'aucune
  cible autorisée n'est à l'écran, plutôt que d'y rester grisée. Ce n'est pas une commande
  indisponible comme Annuler (qui attend une action à défaire), c'est un outil sans emploi.
  Elle **ne s'arme pas au clavier** pendant ce temps, et si sa dernière cible disparaît alors
  qu'elle est active, l'outil est **relâché** — sans quoi elle restait armée sur l'intercepteur
  d'entrée sans plus aucun bouton pour en sortir (le piège déjà traité au repli hors zoom).

Réglable : `config.toolbar.autoHide.erase = false` rend la gomme permanente. Le masquage
explicite par `components` reste prioritaire.

Nouvelle API publique : `config.toolbar` (`DrawToolbarConfig`, `DrawToolbarAutoHide`),
`useDrawing().canErase`, `ErasableRegistry.hasAny()`, libellé `labels.toolbar.clearAllDescription`.

**⚠️ Ruptures**

- **`clear()` change de périmètre** : il efface désormais aussi les objets hôte `erasable` et
  respecte `config.erase.targets`. Une application qui l'appelle pour vider le dessin verra
  donc partir ses routes et ses zones — c'est `onErase` qui lui en remonte les ids, à elle de
  les retirer de son state (la lib ne mute jamais des props).
- **La section `clear` n'est plus un bouton de barre** mais la rangée du sous-menu de la gomme :
  `components={{ clear: false }}` retire cette rangée, et retirer l'outil `erase` de `tools`
  emporte la commande avec lui.
- `config.interaction.drawToolbarMinZoom` → **`config.toolbar.minZoom`** (même valeur par
  défaut, `11`). Ce qui appartient à la barre est désormais regroupé sous `config.toolbar` ;
  ce qui appartient aux outils reste dans son domaine (`config.erase.targets` pour la
  politique de la gomme, `config.interaction.shortcuts.draw` pour les touches, qui agissent
  sans barre montée). La prop `<Toolbar minZoom>` est inchangée.
- `ErasableProvider` gagne deux membres **requis** : `kind` (la catégorie servie, déclarée
  une fois à l'inscription plutôt que redemandée à chaque question) et `has()`, qui répond
  « ai-je au moins un objet effaçable ? » **sans construire la liste** — un test de présence
  ne doit pas payer le prix d'une collecte de dizaines de milliers d'objets.
- L'affichage par défaut de la barre change : sur une carte sans rien d'effaçable, la gomme
  ne paraît plus (et « Tout effacer » avec elle).

## [0.3.0] — 2026-08-02

### feat : contrainte de dessin « non-chevauchement » (`noOverlap`)

Nouvelle contrainte métier `DrawConstraints.noOverlap` : une forme **fermée** est refusée
si elle en chevauche une autre (fermée) de la couche de dessin, à la création comme à
l'édition, via le flux `onReject` existant (motif `'overlap'`, ajouté à `DrawRejectReason`).
L'**adjacence bord à bord** reste permise — deux zones partageant une frontière ou un
sommet ne sont pas un chevauchement ; les lignes ouvertes (`line`/`arrow`) ne sont pas
concernées. Le test s'appuie sur un nouveau prédicat géodésique exporté `ringsOverlap(a, b)`
(sommet strictement intérieur **ou** arêtes qui se croisent franchement) : contrairement à un
test aux seuls sommets, il détecte deux formes « en croix » dont aucun sommet ne tombe dans
l'autre.

Nouvelle API publique : `DrawConstraints.noOverlap`, `DrawRejectReason` `'overlap'`, export
`ringsOverlap`.

### perf : silhouette de sélection des markers sans sondage DOM par frame

`MarkerLayer.selectedContours` choisissait le gabarit de l'anneau (avatar plein vs sprite) via
un `querySelector('.m3d-marker-avatar')` **par marker sélectionné et par frame** — une lecture
DOM sur le chemin chaud pendant tout pan avec multi-sélection. Le gabarit vit désormais dans un
flag de nœud (`OverlayItem.avatar`, corrigé à chaud par `MarkerLayer.setAvatar` sur `load`/`error`
de l'image) : **zéro accès DOM** dans la boucle de frame. Aucun changement de comportement visible.

## [0.2.0] — 2026-08-02

### Loupe : un marker masqué par le zoom est signalé (œil barré), pas retiré

Un marker de décor (`MarkerData.static`) passé **sous son seuil `minZoom`** disparaît de la
carte mais **reste listé** dans la loupe (comme dans la recherche : voler dessus à tout
zoom). Il était alors présent dans l'inventaire **sans explication** de son invisibilité.

- La ligne d'un marker masqué porte désormais un **œil barré** (infobulle `labels.lens.hidden`,
  « Masqué au zoom actuel ») et son texte s'**atténue légèrement**. **Aucun changement de
  comportement** : l'inventaire reste complet, il s'explique.
- Nouvelle requête autoritaire `engine.markers.hiddenByZoom(id)` (registre `MarkerRegistry`),
  alimentée par la couche marker — seuil **par couche** et hystérésis compris.
- Nouveau libellé `labels.lens.hidden`.

### Sélection : un marker `static` masqué par le zoom sort de la sélection

Un marker de décor (`MarkerData.static`) sélectionné puis masqué au **dézoom** (passage
sous son seuil `minZoom`) restait compté dans la multi-sélection alors qu'il avait disparu
de la carte — d'où un panneau « 3 marqueurs » face à un cluster n'en affichant que 2.

- Le provider de sélection (`engine.selectables`) ne déclare désormais vivants que les
  markers **réellement rendus** : un statique passé sous son seuil est **purgé** de la
  sélection (le compteur du panneau suit). La loupe/recherche gardent, elles, les points
  complets (voler sur un marker à tout zoom, inchangé).
- Comportement **choisi** : ce qui se masque au zoom sort de la sélection ; re-zoomer le
  fait réapparaître **non re-sélectionné**.

### Empilement des formes cohérent (sélection au premier plan)

Deux formes qui se chevauchaient s'empilaient de façon **arbitraire** (toutes au même
`renderOrder`), alors que leur **contour de sélection** (overlay SVG) reste toujours au-dessus —
d'où un mismatch (« la forme passe sous une autre mais pas son pointillé »).

- **Empilement stable** : chaque forme reçoit un `renderOrder` par **ordre de création** (les
  plus récentes devant), posé en une passe `restack()` **sans reconstruire la géométrie**
  (remplissage sous son propre trait via `userData.ro`).
- **Sélection au premier plan** : une forme sélectionnée bondit **devant toutes les autres**
  (remplissage + trait), si bien que sa profondeur 3D suit enfin son contour de sélection.
  Appliqué aux mutations, au changement de sélection et à la bascule de drapage.

### Panneau de sélection : mise en page HOMOGÈNE, deux briques uniques

Le panneau de sélection mélangeait du markup custom (formes, tracés) et `MarkerList`
(markers, clusters) → **trois** rendus de ligne différents. Il repose désormais sur **deux
composants uniques**, réutilisés partout :

- **`SelectionRow`** (via **`SelectionList`**) : la ligne, structure invariante
  `[icône] titre/sous-titre · menu « … » · croix ✕`. `MarkerList` (export public, loupe
  comprise) en devient un **adaptateur** — aucun markup de ligne ne vit plus ailleurs.
- **`SelectionGroup`** : l'en-tête pliable (chevron + icône + libellé + compteur + croix),
  corps = `SelectionList` / `MarkerList`. Remplace tout le markup de groupe custom.
- Conséquence : **même mise en page** pour marker, tracé, forme et enfant de cluster ; le
  « … » (avec « Cibler » partout, « Supprimer » sur une forme) et la croix ✕ (désélection,
  par membre pour un enfant de cluster) sont présents **de façon cohérente**.
- **Icônes de ligne** : chaque forme et chaque tracé affiche son **glyphe teinté de SA couleur**
  (glyphe d'outil pour une forme, polyligne pour un tracé) — repère visuel homogène. Les enfants
  d'un groupe déplié sont reliés par un **filet vertical discret** (style arbre) plutôt qu'un simple retrait.
- **Loupe et sélecteur : mêmes briques, zéro duplication** : le conteneur de défilement unique
  (`SelectionScroll`), les en-têtes pliables (`SelectionGroup`), les lignes (`MarkerList` →
  `SelectionRow`) et le mini-camembert (`ClusterPie`, extrait) sont **partagés**. La **loupe groupe
  désormais son inventaire par CLUSTER** (`engine.markers.visualNodeOf`) — même notion de groupe que
  le sélecteur — avec les groupes **OUVERTS par défaut** ; les markers isolés restent à plat. Seules
  différences assumées : le sélecteur flotte (groupes **fermés** par défaut, panneau compact), la
  loupe reste **magnétique** à sa zone. Scroll unique des deux côtés (pas de scroll par bloc ni
  horizontal), menu « … » borné en hauteur.

### Sélection : silhouette d'union UNIQUE (markers/clusters/tracés) + mini-camembert dans les badges

- **Un seul langage de pointillé.** Markers (multi-sélection), clusters et tracés partagent
  désormais **une seule silhouette marching-ants** peinte dans le SVG de `SelectionOverlay` (via
  `engine.selectables.selectedContours()`), au lieu de trois mécanismes distincts (anneaux CSS
  par nœud + contour SVG). Quand plusieurs sélectionnés se **recouvrent**, leurs contours
  **fusionnent en une silhouette d'union** (les arcs internes qui se croisaient disparaissent),
  par **masquage SVG** — sans géométrie booléenne. Marker/pastille = **cercle exact** (décalé du
  leader line), tracé/forme = polyligne. Les anneaux CSS par nœud (`.m3d-ants-ring`,
  `.m3d-multisel::before/::after`) sont **retirés** ; la classe `m3d-multisel` ne sert plus qu'à
  **éteindre** l'anneau plein de la sélection simple.
- Clés de thème `clusters.selectedColor` / `clusters.selectedWidth` (ancien anneau plein)
  **retirées** (rupture 0.x, non publiée) : le pointillé de sélection est N/B fixe. Le diamètre du
  cercle est **calculé** depuis l'écart thémé **`theme.markers.selectedGapPx`** /
  **`theme.clusters.selectedGapPx`** (défaut 4) et le décalage du leader line depuis la source unique
  `LEADER_LIFT_PX` — aucune valeur en dur.
- Une **pastille hérite** de la sélection de ses **membres** : les markers sélectionnés **absorbés
  dans un cluster** au dézoom restent visiblement sélectionnés (silhouette portée par la pastille).
- **Badges de sélection** : la rangée d'un groupe **cluster** affiche un **mini-camembert** aux
  couleurs des parts (`conic-gradient`, parts égales par type comme la pastille) au lieu d'une icône
  générique. `SelectableGroup` porte désormais `counts` (répartition par type) ; `useDrawing().clusterGroups`
  aussi.

### Sélection des tracés et des clusters (outil sélection généralisé)

L'outil sélection ne pouvait atteindre **que les markers**. Il sélectionne désormais aussi les
**tracés** (`PathLayer`) et les **clusters**, avec **tous les outils** (clic, rectangle, lasso,
polygone). Un cluster sélectionné apparaît dans le panneau comme un **groupe pliable** listant
ses **markers enfants** (réutilise le pattern catalogue).

- **Tracés** : `PathLayer` s'enregistre comme `SelectableProvider` (contour écran projeté au
  finalize/clic — chemin froid). Un tracé sélectionné reçoit le **même contour pointillé**
  (marching-ants) que les formes, via `SelectionOverlay` — **pas** de halo 3D propre.
- **Clusters** : `ClusterSurface` s'enregistre comme provider ; **clic sur pastille = zoom**
  hors outil sélection, **sélection** (de ses enfants) quand l'outil sélection est actif. Au
  **recompute du clustering** (zoom), un groupe cluster sélectionné est réconcilié : re-clé sur
  la pastille courante tant que **les mêmes membres** forment un cluster, sinon **dissous** en
  sélection plate (ses membres restent sélectionnés, listés à plat ; la rangée disparaît).
- **Politique de sélectionnabilité** : **`config.selection.selectable`** — un booléen par type
  (`marker` / `path` / `cluster`, tout `true` par défaut), surchargeable par `<Map config>`,
  pour **limiter la sélection selon le cas**. Respectée par tous les outils.

**Rupture d'API (0.x, mineure)** — élargissement du contrat de sélection :

- `SelectableScreenItem` porte désormais **`kind: SelectableKind`** (requis) et, en option,
  `radiusPx` et `geometry` (contour d'un tracé). `SelectableInfo` porte **`kind`** (requis) et
  un `group` optionnel (agrégat pliable). `SelectableProvider` gagne `hitTest?`. Un provider
  hôte custom doit ajouter `kind`.
- `SelectableRegistry.items(policy?)` et le nouveau `SelectableRegistry.hitTest(x,y,tol,policy?)`
  filtrent par politique. Nouveaux exports : `SelectableKind`, `SelectablePolicy`,
  `SelectableGeometry`, `PolyGeometry`, `SelectableGroup`, `SelectionConfig`, `SELECTABLE_KINDS`,
  `kindAllowed`.
- **`SelectableGeometry` change de forme** (rupture 0.x, non publiée) : d'un `{ pts, closed }` nu
  vers une **union discriminée** `{ kind: 'poly'; pts; closed } | { kind: 'circle'; cx; cy; r }` — le
  cercle est la silhouette **exacte** (non approchée) d'un marker/pastille, que l'overlay masque pour
  l'union. Nouveau type public **`PolyGeometry`** (`{ pts, closed }`), forme de l'arm `poly` et de
  `SelectableScreenItem.geometry`. `selectedContours()` renvoie donc cercles **et** polylignes.
- Le callback gagne un 3ᵉ argument : `onSelectionChange(ids, markerIds, pathIds)`. `markerIds` =
  markers à plat (enfants des clusters sélectionnés **inclus**, ids bruts) ; `pathIds` = tracés,
  **population distincte** (jamais mêlée aux markers). Rétrocompatible (arg optionnel).
- `SelectableProvider` gagne `boundsOf?` (cadrer un tracé — « Cibler » d'un badge),
  `selectedContours?` (contours des sélectionnés → pointillé de l'overlay) et `hasSelectedContours?`
  (garde bon marché) ; `SelectableRegistry` expose `boundsOf` / `selectedContours` /
  `hasSelectedContours`. `SelectableInfo` porte un `color?` optionnel (teinte du glyphe d'un tracé
  dans les badges). L'anneau/rectangle d'emprise (bbox) n'englobe QUE les formes, jamais les tracés.
- `useDrawing()` gagne `deselectClusterMember(key, memberId)` (désélection d'un enfant de cluster).
- Nouveaux `labels.selection.pathsGroup` / `pathItem` / **`delete`**. Le thème **ne porte plus**
  `colors.path.selected` (le pointillé remplace le halo — couleur fixe N/B).

### Gomme (ponctuelle + sélection)

L'outil **gomme** de la barre de dessin ouvre désormais un **sous-menu au survol** (comme la
sélection) avec deux modes qui suppriment **exactement le même ensemble** (iso) :

- **Gomme** ponctuelle : un clic efface l'élément sous le curseur (comportement existant, unifié).
- **Gomme sélection** : un marquee (rectangle / polygone / lasso, comme le sélecteur) efface
  **tout ce qu'il touche** — dessins, mesures et symboles. Les **markers** ne sont **jamais**
  effacés ; les formes **verrouillées** non plus.

- **Couches hôte effaçables** : une route (`PathData`) ou une forme hôte (`ShapeData`) porte un
  opt-in **`erasable: true`** (protégé par défaut). La lib ne mute pas les props : elle remonte
  les ids effacés via le nouveau callback **`onErase`** (`EraseResult` : `shapes` + `paths` +
  `hostShapes`), à l'app de les retirer de son state. `onErase` remonte **tout** ce qui a disparu.
- **Politique configurable** **`config.erase.targets`** (`EraseConfig`, un booléen par catégorie,
  tout `true` par défaut) restreint la gomme dans les deux modes. Clés : `drawing`, `measure`,
  `symbol` (objets lib), `path`, `shape` (couches hôte — `path`/`shape` partagent le vocabulaire
  de `config.selection.selectable`).
- Nouveaux types publics : `EraseMode`, `EraseResult`, `EraseTarget`, `EraseConfig`. Registre
  moteur `engine.erasables` (séparé de `engine.selectables`). API `useDrawing()` :
  `eraseMode`/`setEraseMode` ; `<Toolbar eraseModes>`.
- Perf : hit-test des objets hôte uniquement au finalize du marquee / au clic (jamais par frame),
  buffer scratch réutilisé, une seule entrée d'historique par passe.

### Signature « map3D » (attribution)

Une signature **« map3D »** est désormais apposée en **bas à droite** de la carte, liée au
dépôt et à sa licence. Elle est **peinte dans le canvas WebGL** (après le rendu de la carte,
dans `MapEngine.tick`) : insensible au CSS et au DOM de l'hôte, elle ne se masque pas par
`display:none` ni par retrait d'un nœud. Un doublon DOM transparent (`WatermarkLink`) pose
par-dessus la seule **zone de clic** vers le dépôt — le masquer n'ôte que le clic, jamais les
pixels. Conforme à la mention requise par la licence **PolyForm-Noncommercial**.

- **Montée automatiquement par `<Map>`**, affichée par défaut. Le **contenu** (texte, URL,
  style) reste hors `config`/`theme`/`labels` à dessein — un réglage surchargeable serait un
  vecteur de suppression de l'attribution.
- **`config.watermark.enabled`** (défaut `true`) coupe la signature (marque peinte + lien) —
  interrupteur **réservé aux clients sous licence commerciale** ; sous PolyForm-Noncommercial,
  la retirer viole la licence. Type public `WatermarkConfig`.
- Coût par frame : un seul quad texturé (`depthTest:false`), zéro allocation.

### Capture d'image de la carte

Génération d'une image de la carte **avec ses éléments visibles** — la 3D (canvas WebGL) et,
si un rasteriseur DOM est injecté, les overlays markers/labels par-dessus. Accessible **par
code** (`engine.capture()` / `MapHandle.capture()` / `useCapture()`, pour tracer une image
en cas d'action, ex. envoi vers une API) et **par l'UI** : une ligne « Prendre une photo »
dans le menu ⚙ de la barre, avec choix du format (PNG/JPEG/WebP), de la qualité, de l'échelle,
et trois actions **Télécharger / Envoyer par mail / Partager** (Web Share). Le rendu est
synchrone (pas de `preserveDrawingBuffer`, aucun coût par frame) et suréchantillonnable.

Le rasteriseur d'overlay et les callbacks mail/trace sont **injectés** par l'hôte
(`<Map capture>`) — la lib n'embarque aucune dépendance de rasterisation ; sans injection, la
capture retombe sur la 3D seule. Le fond « transparent » est accepté mais retombe aujourd'hui
sur opaque (le renderer est créé sans canal alpha).

**Ajouts**

- `MapEngine.capture(opts?): Promise<Blob>` — rendu synchrone + compositing.
- `MapHandle.capture(opts?)` (poignée de `<Map>`) et hook `useCapture()`.
- Prop `<Map capture>` (`CaptureProps` : `rasterizeOverlay`, `onCapture`, `onMail`).
- Bloc `config.capture` (`CaptureConfig` : `format`, `quality`, `scale`, `background`).
- Types publics `CaptureOptions`, `CaptureFormat`, `CaptureBackground`, `OverlayRasterizer`.
- Libellés `settings.capture.*` (titre, format, qualité, échelle, fond, télécharger, mail, partager,
  et `filename` — nom de base du fichier téléchargé, pour ne plus figer « carte » en dur).
- Ligne « Prendre une photo » dans le menu ⚙ (`DrawSettingsButton`), présente dès que la prop
  `capture` est fournie.

### Publication npm

- Le paquet est renommé **`@pasquelin/map3d`** (l'unscoped `map3d` est déjà pris sur npm).
  Import : `import { … } from '@pasquelin/map3d'`.
- Publication **automatisée** : un tag `vX.Y.Z` (via `npm version`) déclenche le workflow
  `.github/workflows/release.yml` (valide, build, `npm publish --provenance`). Requiert le
  secret repo `NPM_TOKEN`.

### Grille de coordonnées (graticule)

Parallèles et méridiens drapés sur le globe, à **maille adaptative** sur l'échelle
sexagésimale d'un atlas (30° en vue globe → 1″ en vue rue), avec les lignes remarquables
nommées (Équateur, tropiques, cercles polaires, méridien d'origine, 180ᵉ) et leurs étiquettes
de coordonnées. Elle **s'estompe en fondu** quand la vue s'incline au-delà de ce qu'une grille
supporte — bande exprimée en fraction du plafond d'inclinaison du mode, parce qu'il vaut 79,2°
en volume mais 36° en carte plate.

Guide : [docs/fr/GRATICULE.md](docs/fr/GRATICULE.md) · [EN](docs/en/GRATICULE.md).

**Ajouts**

- `<GraticuleLayer />` (**monté automatiquement par `<Map>`** — l'hôte n'a rien à placer dans
  les enfants ; le composant reste exporté pour un montage impératif sans `<Map>`),
  `useGraticule()`, `MeasureToolButton`, types `GraticuleConfig` / `CoordFormat` / `MeasureTool`.
- Moteur : `engine.setGraticuleVisible()` / `getGraticuleVisible()` / `setGraticuleMounted()`
  et l'event `graticule`. L'état vit là parce que trois commandes le pilotent.
- `config.graticule` (30 réglages), `theme.colors.graticule` (optionnel, repli sur le thème
  par défaut), `labels.measureTools` et `labels.graticule`.
- `config.style.zIndex.graticuleLabel`, `interaction.shortcuts.controls.graticule` (`K`) et
  `labels.controls.graticule`.
- `core/math` : `smoothstep` et `approach` (lissage exponentiel indépendant de la cadence),
  extraits pour cesser d'être réécrits à chaque site de fondu.

**Ruptures**

- L'outil **Règle** de la barre de dessin gagne un **sous-menu** (`<Toolbar measureTools>`,
  nouvelle section `'measure'` dans `components`). Il ne compte qu'une rangée aujourd'hui, donc
  il ne s'ouvre pas et le bouton agit directement — le châssis est en place pour la suivante.
- Nouveau bouton `graticule` dans le groupe `view` de `<MapControls>` : c'est de LÀ que la
  grille se pilote, et non de la barre de dessin, qui se replie sous le zoom 11 — précisément
  là où la grille sert le plus. `buttons={{ graticule: false }}` le retire.
- Un thème ou un jeu de libellés **complet** écrit à la main doit fournir les nouvelles clés
  (`labels.measureTools`, `labels.graticule`) ; `theme.colors.graticule` reste optionnel.

**Correctifs au passage**

- `Dropdown` : un panneau ouvert allume désormais toujours son bouton (`active || open`) — le
  filtre de tags était le seul menu de la barre à ne pas le faire.
- Templates : les tags des formes d'un template chargé sont **révélés** si un filtre
  « Couches » actif les masquait (`TagFilter.add()`).

### Performance — ne peindre que ce qui change

Chantier mesuré de bout en bout : le moteur ne consommait qu'~1 ms de JS par frame sur un
budget de 8,3 ms, et repeignait pourtant une image identique 60 fois par seconde. Ce qui
coûtait était ailleurs — la traversée du tileset par le renderer d'overlays, la remontée
des matrices par marker, les raycasts de sol redemandés à chaque frame.

- **Rendu à la demande** (`performance.renderOnDemand`, actif par défaut). La boucle
  continue de tourner — les couches avancent, les tuiles arrivent, les gestes répondent —
  mais les deux passes de RENDU sont sautées tant que rien n'a changé. Une couche signale
  son travail en cours par `ctx.invalidate()`, l'hôte par `MapEngine.invalidate()`, et un
  filet (`maxIdleMs`, 1 s) borne le prix d'un mouvement que personne n'aurait signalé.
  ⚠️ Un hôte qui écrit **directement** dans la scène three.js doit appeler `invalidate()`,
  ou couper le réglage.
- **Résolution adaptative** (`performance.adaptiveResolution`). Sous la cadence visée, le
  canvas est peint à moins de pixels et remonte dès que la carte respire : c'est le seul
  levier qui rende du temps GPU en proportion — diviser le ratio par deux, c'est diviser
  par quatre les pixels à remplir. La charge est mesurée sur l'intervalle entre frames, la
  seule grandeur qui voie un GPU saturé.
- **Overlays sortis du tileset.** Les markers vivaient sous `tiles.group` : le
  `CSS2DRenderer` traversait le tileset photoréaliste entier, deux fois par frame, pour
  trouver quelques dizaines de nœuds. Ils ont désormais leur propre scène, dont les
  matrices descendent UNE fois par frame, et une caméra jumelle porte l'élargissement
  near/far (`performance.overlayDepth`) au lieu de déborner celle du rendu.
- **Niveau de rue mémoïsé** (`Projection.sampleGroundHeightCached`,
  `performance.groundSample.cacheMaxCells`). Un appel coûte neuf raycasts BVH, et la pose
  des markers en réclamait un par marker et par frame. `Camera` y remplace son cache maison
  à une entrée, qui était aveugle aux changements d'époque.
- **Compteurs de rendu** : `MapEngine.stats()` (type `MapStats`) — appels de rendu,
  triangles, mémoire, overlays suivis, part de frames réellement peintes et résolution
  courante. De quoi juger une optimisation au lieu de la supposer.
- `performance.powerPreference` (défaut `'high-performance'`) réclame le GPU dédié : sur un
  portable à double carte, le défaut du navigateur laissait volontiers la 3D plein écran
  sur le circuit intégré.

### Corrigé

- **Le zoom de `MapView` suivait l'altitude, pas l'échelle perçue.** `altitude =
  distance × cos(tilt)` : s'incliner la faisait chuter sans que rien ne change à l'écran, et
  le zoom grimpait d'autant — mesuré, 14,75 à plat contre 18,46 à 85°, de quoi franchir
  `clustering.maxZoom` et éteindre tous les regroupements. Il dérive maintenant de la
  distance au point visé. Affecte les clusters, le décor `static` et l'événement `viewport`.
- **Markers masqués en vue rasante.** Le cull lisait « derrière la caméra » sur `z > 1` en
  NDC, qui signifie aussi « au-delà du far » — que le mode piéton resserre à la distance de
  vue. Le verdict se prend désormais sur le sens de visée, qui ne dépend d'aucune borne de
  profondeur. Au ras du sol, l'occlusion par l'horizon (qui masquait tout marker posé plus
  haut que les yeux, donc tous les toits) cède la place à la portée de vue.
- **Markers posés sur les toits sous fournisseur interne.** Le sol y est une nappe raster
  plate et non raycastable : échantillonner ne ramenait que des toits. Le court-circuit
  analytique, jusque-là réservé au placement piéton, vit maintenant dans `Projection` — une
  seule porte pour tous les consommateurs du niveau de rue.
- **Calottes polaires** (`providers.tiles.fillPoles`, défaut `true`). Web Mercator s'arrête
  à ±85,0511° : il restait à chaque pôle une calotte de ~550 km de rayon où affleurait la
  sphère de repli, soit un disque couleur d'océan au milieu de l'Antarctique. Les tuiles de
  la rangée extrême portent désormais une ligne de sommets posée AU pôle, à la coordonnée de
  texture du bord — sans requête ni texture supplémentaire.

### ⚠️ Correctifs de mémoire et de collision (revue avant publication)

Quatre défauts trouvés en relecture du volume interne, dont deux qui se voyaient à l'écran.

- **Fuite de mémoire GPU et bâtiments fantômes.** Les deux calques tuilés gardaient la
  garde de fin de chargement sur la présence de la **clé**, pas sur l'identité de la tuile.
  Une tuile évincée pendant son chargement, puis redemandée, réapparaissait sous un objet
  neuf ; le chargement de l'ancienne trouvait alors sa clé occupée, se croyait vivant, et
  montait son mesh sur un objet que plus rien ne référençait — hors du cache, donc jamais
  masqué, jamais évincé, jamais libéré. Un bloc de bâtiments figé au mauvais endroit et ses
  ~5 Mo, à chaque occurrence.
- **Volumes masqués toujours raycastés.** `Raycaster` de Three ne teste **pas** `visible` :
  masquer un groupe ne le retire pas du chemin des rayons. En mode plan avec volume interne
  — la configuration par défaut —, les arbres de collision des bâtiments cachés restaient
  donc sur le trajet des trois rayons par frame : la garde caméra s'arrêtait sur des toits
  invisibles, et un clic sur la carte plate rendait le point d'impact d'un toit au lieu du
  sol, décalé de toute la parallaxe. Les deux calques sortent désormais du graphe quand ils
  sont masqués.
- **Le budget mémoire ne bornait rien.** `maxTiles` compte des tuiles, or ce que retient
  une tuile de volume va de un à cent entre la campagne et un centre-ville : les 36
  autorisées pouvaient peser 175 Mo. `providers.buildings.maxBytes` (256 Mio) et
  `providers.tiles.maxBytes` (256 Mio) bornent la mémoire réelle — tampons GPU **et** arbre
  de collision, que `geometry.dispose()` ne connaît pas.
- **Hauteurs aberrantes.** La hauteur venait brute de la donnée ; `height=99999`, faute de
  saisie courante dans OSM, produisait un bâtiment de cent kilomètres, dont l'englobant
  gardait la tuile visible en permanence. `providers.buildings.maxHeight` (1000 m) la borne.

#### L'aplat uniforme au loin, la vraie cause

La cascade de détail s'arrêtait au niveau `covering` — celui qui couvre toute la vue dans
le budget — et ce niveau-là n'était demandé **que sur l'emprise**. Or l'emprise est déduite
de raycasts sur l'ellipsoïde : à l'horizon, le rayon rase la surface et elle s'arrête bien
avant ce que l'œil voit. Passé cette limite, plus aucun niveau intermédiaire n'était
demandé — seulement le niveau de base, dont **un texel étiré couvre des centaines de
kilomètres**. D'où la bande uniforme qui restait au ras du ciel, exactement là où la
cascade croyait n'avoir plus rien à combler.

Les anneaux descendent désormais jusqu'au niveau de base, sans dépendre de la justesse de
l'emprise. `providers.tiles.maxTiles` passe de 500 à 700 en conséquence : sous l'ancien
plafond, ces niveaux grossiers se faisaient évincer par les tuiles fines aussitôt demandés.
Le coût reste modeste — un anneau de 5 tuiles porte déjà 25 000 km à z3, et les niveaux
grossiers sont chargés une fois puis resservis toute la session.

#### Une seule file de tuiles

`core/TileQueue` réunit présence, concurrence, backoff, éviction LRU et annulation, pour le
fond raster comme pour le volume. Les deux calques en portaient chacun leur copie — `pump`
et `retryOrFail` identiques mot pour mot, `evict` à une constante près : c'est ainsi que le
défaut d'identité ci-dessus existait en deux exemplaires. La file se teste seule, sans WebGL.

- **Chargements annulables.** Une tuile évincée en cours de route interrompt son
  téléchargement, côté réseau comme côté worker (message d'abandon). Une navigation rapide
  laissait sinon la file entièrement occupée à extruder des tuiles déjà sorties de la vue.
- **Montage étalé** — `mountPerFrame` (1 pour le volume). Développer les couleurs et
  construire l'arbre de collision restent sur le thread principal : `MeshBVH` dépend de
  three, et l'embarquer dans le worker y tirerait le moteur entier. Deux tuiles qui
  aboutissaient dans la même frame additionnaient donc leurs ~20 ms en un gel franc.
- **Positions quantifiées** — `positionPrecision` (`'int16'` par défaut). Les mètres locaux
  deviennent des entiers normalisés : **deux fois moins d'octets** sur le plus gros tampon,
  pour ~4 cm de résolution — sous la précision de la donnée OSM. `'float32'` reste
  disponible. (three-mesh-bvh gère nativement un attribut normalisé, ce qu'un test
  verrouille.)
- **Un matériau partagé** au lieu d'un par tuile, et l'ombrage arrondi plutôt que tronqué
  sur huit bits — le demi-pas perdu se voyait en banding sur les grandes façades sombres.

#### `can3d` enfin appliqué

Publié, documenté et testé, il n'était **lu nulle part** : la barre proposait le bouton
« 3D » dès qu'un fond plat était servable. Un hôte en fond interne sans tileset
photoréaliste se voyait donc offrir un bouton qui, une fois cliqué, masquait le fond pour ne
rien mettre à la place. `canEnterMode(state, mode)` — exportée — est désormais la table de
vérité unique du rendu du bouton, de son raccourci **et** de `engine.setMapMode`, qui refuse
maintenant un mode vide dans les deux sens (le retour forcé vers `'3d'` était le seul traité,
et il laissait au passage le calque trafic allumé sous un mode qui ne le sert pas).

#### Réglages qui n'en étaient pas

Six valeurs de comportement ou d'apparence vivaient en littéraux : `theme.globe.buildingRoofLighten`,
`providers.internal.elevationEpsilon`, `providers.{tiles,buildings}.evictEvery` et
`evictSlack`. Toutes exposées, toutes réglables depuis le panneau de l'exemple.

#### Divers

- Le déplacement au clavier ne consomme plus que les **flèches** : consommer `z`/`q`/`s`/`d`
  sur `window` volait ces touches à l'application hôte partout dans la page.
- `setKeyNavEnabled(enabled, owner?)` compte les suspensions par demandeur : un consommateur
  qui se démonte ne rend plus les flèches à la caméra sous le nez d'un autre.
- `navAxis` n'alloue plus d'objet par frame.
- Le repli d'extrusion sur le thread principal (CSP sans `worker-src blob:`, worker
  interrompu) **le dit** une fois dans la console — c'était indiscernable d'une machine lente.

### Fournisseur de tuiles interne (serveur auto-hébergé)

Le fond de carte 2D pouvait venir d'un seul endroit : l'API Google Map Tiles, clé
obligatoire. `providers.tiles.provider` ouvre le choix — `'internal'` (votre serveur, simples URLs XYZ
sur `providers.internal.origin`, sans session, sans clé, sans quota) ou `'external'`
(Google). Voir
[docs/fr/TILES.md](docs/fr/TILES.md).

- **Le fond 2D ne dépend plus d'une clé Google.** Le calque tuilé était monté sous
  condition de `googleMapsApiKey` : le fond 2D restait donc indisponible pour TOUTE la
  session, et renseigner une origine interne à chaud n'y pouvait rien. Il est désormais
  toujours monté, et c'est sa source qui peut manquer.
- **Bascule à chaud.** Changer de fournisseur, d'origine, de style ou de densité remplace
  la source et vide le cache sans remonter la carte.
- `providers.tiles3d.provider` fait le même choix pour le **volume** (mode `'3d'`), et sur
  `'internal'` **aucun tileset photoréaliste n'est monté** — plus rien ne streame ni ne se
  facture chez le fournisseur externe, même si un token traîne dans la config.
- Deux valeurs codées en dur dans `TiledGlobeLayer` deviennent des réglages :
  `providers.tiles.baseZoom` (2) et `maxZoom` (22, qui était le plafond de Google roadmap).
- `providers.tiles.retina` demande les tuiles internes en `@2x`.

#### Capacités du fond de carte diffusées

`BasemapState` (événement `basemap`) gagne `canPlan` et `can3d`. La paire de boutons 2D/3D
ne change pas de comportement : elle reste proposée dès qu'un fond plat est servable — clé
Google **ou** origine interne — et bascule carte ↔ volume quels que soient les fournisseurs
des deux côtés. Seul le **bouton trafic** disparaît hors fournisseur externe : le trafic est
une propriété de la tuile Google, pas une surcouche, et `setTrafficVisible(true)` est un
no-op quand la source ne le sert pas. `engine.supportsBasemap2d` est conservé comme alias de
`canPlan`.

#### Volume interne — bâtiments extrudés depuis les tuiles vectorielles

`providers.tiles3d.provider = 'internal'` remplace les tuiles 3D photoréalistes par des
bâtiments reconstruits depuis les tuiles vectorielles du serveur : couche `building` du
schéma OpenMapTiles, hauteurs `render_height` / `render_min_height`, cours intérieures
percées, couleurs dans `theme.globe.buildingColor` / `buildingRoofColor`.

- Le fond raster **reste affiché** en mode `'3d'` interne : c'est lui que le relief
  déformera, et sans lui la bascule 3D donnait un écran vide.
- Aucun tileset photoréaliste n'est piloté dans ce mode — donc **aucune requête** vers
  Cesium ou Google, même avec un token configuré.
- Le décodeur MVT est chargé en **import dynamique**, comme le catalogue de symboles.
- Pas de drapeau `enabled` : `providers.tiles3d.provider` dit déjà d'où vient le volume.
- `@mapbox/vector-tile`, `pbf` et `earcut` deviennent des **dépendances déclarées**. Les
  deux premières étaient importées sans figurer dans `package.json` : elles ne
  fonctionnaient que par la remontée d'une dépendance transitive, à une version qui se
  trouvait avoir l'export attendu. `pbf` passe en 5.x (`PbfReader` remplace l'export par
  défaut).

#### Performance du volume interne

La première version rendait la carte inutilisable dès que le volume interne était affiché
— et, à cause du choix de la cible de rayons, **aussi en mode plan**. Trois causes,
mesurées sur une vraie tuile z14 parisienne (52 000 sommets d'emprises, ~131 000
triangles) :

- **Les rayons de la carte tapaient dans une géométrie non accélérée.** Le groupe du
  `TilesRenderer` répond par la hiérarchie de volumes de ses tuiles ; la surface
  reconstruite localement, elle, n'était qu'un `THREE.Group` — Three testait chaque
  triangle et collectait TOUS les impacts avant de les trier. Or la carte lance trois
  rayons par frame (garde caméra de `GlobeControls`, suivi d'altitude, drapage des
  formes). Chaque tuile de bâtiments porte désormais un **BVH** (`three-mesh-bvh`, posé par
  instance — jamais en monkey-patch de `THREE.Mesh.prototype`) : **5,7 ms → 0,015 ms par
  rayon**. Effet de bord : `firstHitOnly`, posé depuis toujours par `Projection`, devient
  enfin effectif — c'est un drapeau three-mesh-bvh, que le raycast de Three ignore.
- **Le fond raster était devenu raycastable par accident.** Sous `TilesGroup`, ses tuiles
  ne l'étaient pas — le `raycast()` du groupe arrêtait la traversée. Les sortir de là a mis
  jusqu'à `maxTiles` meshes sans arbre sur le chemin de chaque rayon, dont les tuiles de
  base, dont la sphère englobante couvre un quart de globe : ~25 000 tests de triangles par
  frame, pour rien. Le fond et la sphère « océan » sont désormais explicitement insensibles
  aux rayons : ce sont des surfaces PLATES à hauteur connue, que `Projection.flatHeight` et
  le repli ellipsoïde rendent déjà analytiquement. Seuls les bâtiments sont un vrai volume,
  et eux portent un BVH.
- **L'extrusion gelait le thread principal.** Décodage et construction des tampons
  (~231 000 sommets) partent dans un **Web Worker**, empaqueté en blob autonome au build de
  la lib — rien à configurer côté hôte, aucun asset à servir. Sans `Worker` (rendu serveur,
  tests), le même code sert de repli sur le thread principal.

### Déplacement au clavier

Les flèches (et **ZQSD**) déplacent la carte tant qu'elles sont maintenues. Ce sont les
seuls raccourcis de la lib à agir en continu : les autres sont des commandes ponctuelles
déclenchées au `keydown`, ce qui ne peut pas rendre un mouvement — la vitesse dépendrait de
la cadence de répétition du système. L'état des touches vit donc dans le moteur
(`core/NavKeys`), et la boucle le consomme au prorata du temps écoulé.

- **Dans le repère de la VUE** : « tout droit » suit le SOL, jamais la ligne de visée —
  sinon on plonge dans le décor à 79° d'inclinaison. Tourner la vue tourne les touches
  avec elle.
- **Actif en mode rotation**, ce qui est tout l'intérêt : la souris fait pivoter, les
  flèches déplacent. Le clavier étant indépendant du pointeur, ça vient sans condition.
- **Vitesse proportionnelle à la hauteur au-dessus du sol** (`camera.keyPan.speed`, 0,8
  hauteur-sol par seconde ; `boost` ×3 avec Maj), comme `dragSpeed` pour la souris.
- Un vol programmé ou l'intro cèdent la main dès qu'une touche est enfoncée.
- Les flèches reviennent au **déplacement d'une sélection de dessin** dès qu'il y en a une :
  `<DrawLayer>` appelle `engine.setKeyNavEnabled(false)`, le moteur ne pouvant pas deviner
  un état qui appartient à cette couche.
- `blur` relâche tout : un changement d'onglet ne délivre pas le `keyup`, et la carte
  partait sinon en translation infinie au retour.

#### ⚠️ Rupture — la main levée passe de `D` à `H`

`interaction.shortcuts.draw.freehand` valait `'d'`, désormais pris par le déplacement. `'h'`
comme « main levée », et il était libre. Un test verrouille l'absence de collision entre les
deux tables. À rebasculer par la config si l'application n'active pas les lettres.

#### Anticipation du mode FPS

`GlobeControls` embarque déjà un mode vol complet — `enableFlight`, W/S/A/D/Q/E, Maj pour
accélérer, et une vitesse **déjà mise à l'échelle de la hauteur au-dessus du sol**
(`_getFlightSpeedScale`). Il ne conviendrait pas ici (il translate selon les axes propres de
la caméra, donc plonge dans le décor en vue inclinée ; il écoute son `domElement`, donc
exige le focus ; et ses touches sont câblées en dur, dont trois prises par le dessin), mais
c'est la base toute trouvée de la navigation FPS à venir.

D'où le découpage : `interaction.shortcuts.navigate` porte les LIAISONS, `core/NavKeys`
l'état et l'axe, `MapEngine.applyKeyNav` le seul modèle de déplacement. Le jour venu, seul
ce dernier change.

#### ⚠️ Cascade de détail du fond raster — fin de l'aplat uniforme au loin

Au loin, la carte devenait un aplat vert uniforme, franchement lisible comme un bug. Le
calque ne connaissait que **deux niveaux** : la base (`baseZoom`, 2) et UN niveau cible,
rabaissé jusqu'à ce que son compte de tuiles tienne sur l'emprise entière. Or en vue
inclinée l'emprise porte jusqu'à l'horizon : le niveau cible s'effondrait vers la base, et
tout ce que le cache ne couvrait pas déjà tombait d'un coup sur une tuile grande comme un
quart de continent.

`providers.tiles.lodRing` (**nouveau**, 5) introduit une vraie cascade : le niveau le plus
fin autour du point visé, puis un anneau à chaque cran plus grossier — chacun portant deux
fois plus loin — jusqu'au premier niveau qui couvre toute la vue. La dégradation devient
progressive, et il y a toujours quelque chose de plus net que la base.

- Le surcoût en requêtes est modeste : un niveau grossier couvre une immense surface, donc
  il est demandé une fois puis resservi toute la session. Seul le niveau le plus fin se
  renouvelle en se déplaçant.
- Le choix des niveaux est sorti en fonction pure, `lodLevels`, testée à part : c'est la règle
  qui décide de ce qu'on voit au loin.
- Les couronnes du fond ET du volume se centrent sur le sol sous le **centre de l'écran**
  (`MapEngine.aimPoint`), pas sous la caméra.

#### Couverture du bâti — deux correctifs et une limite de donnée

Au loin, la carte redevenait plate d'un coup, avec une frontière irrégulière. Ni near/far
ni LOD : deux bugs, plus une limite qui, elle, n'est pas corrigeable.

- **L'éviction ne s'est jamais déclenchée.** `update` montrait TOUTE tuile prête et la
  marquait « vue cette frame », sans regarder l'emprise. Or `evict` écarte justement les
  tuiles vues cette frame : la liste de candidates restait vide, `maxTiles` ne servait à
  rien, et le cache grossissait sans plafond. Ce qui avait été chargé ailleurs restait par
  ailleurs affiché — l'étendue du bâti était celle de l'historique de navigation, pas celle
  de la vue, d'où la frontière irrégulière. `TiledGlobeLayer` faisait bien ce test de vue ;
  `BuildingsLayer` l'avait perdu.
- **Le budget se dépensait derrière l'observateur.** La couronne de tuiles était centrée sur
  `view.center`, le point au sol sous la CAMÉRA. En vue inclinée à 79°, on regarde loin
  devant : elle vise désormais le sol sous le centre de l'écran (intersection analytique de
  l'ellipsoïde, gratuite par frame).
- **Portée** : `maxRequest` 9 → 25 (5×5 tuiles, ~8 km à Paris), `maxTiles` 24 → 36. Au-delà,
  le fond raster reste seul, et ce n'est pas un réglage timide : les attributs 3D du schéma
  OpenMapTiles n'existent qu'au `maxzoom`. Vérifié sur le serveur — z12 n'a pas de couche
  `building`, z13 en a une ~9× plus légère mais **sans aucun attribut**, donc sans hauteur.
  Il n'existe pas de niveau de détail lointain à moindre coût. Cf.
  [docs/fr/TILES.md § 5](docs/fr/TILES.md).

#### ⚠️ Plancher de descente — trois réglages de caméra qui ne faisaient rien

`camera.minZoom`, `camera.maxZoom` et `camera.minGroundClearance` étaient **déclarés,
documentés, et branchés nulle part** hors des vols programmés. Le seul garde-fou réel sur
la molette était le `cameraRadius` de `GlobeControls`, jamais réglé : **5 mètres**. On
descendait donc au ras du pavé, nez contre une façade, sans plus rien voir — et la
documentation de `maxZoom` promettait exactement l'inverse (« au-delà la caméra entre dans
le bâti 3D »).

- `camera.maxZoom3d` (**nouveau**, 18 ≈ 153 m au-dessus du sol) borne la descente en
  volume. Distinct de `maxZoom`, qui reste le plancher du mode plan : une carte plate se lit
  d'autant mieux qu'on s'en approche, un volume non. Même paire que `maxTilt3d` / `maxTilt2d`.
- Le plancher passe par `GlobeControls.minDistance`, qui borne la distance caméra ↔ **point
  visé** — donc juste aussi en vue inclinée, là où une borne d'altitude ne dirait rien.
- `minGroundClearance` alimente `cameraRadius` : la garde au sol vaut enfin pour la molette
  et le pan, pas seulement pour `flyTo`.
- `minZoom` et `maxDistanceFactor` bornaient le même éloignement en deux unités, l'un des
  deux étant ignoré. Le plus contraignant gagne désormais ; à valeurs par défaut inchangées,
  le dézoom ne bouge pas.
- Ces bornes dépendant du mode, `applyModeVisibility` rejoue `applyCameraLimits` au lieu
  d'en recopier la seule inclinaison — le plancher restait sinon figé sur le mode de départ.

Les quatre réglages sont exposés dans le panneau de l'exemple.

#### Ombrage des façades

`theme.globe.buildingSunAzimuth` (120°) et `buildingShadeMin` (0,62) modulent chaque façade
selon son orientation. Le contraste toit/façade ne suffisait pas : toutes les façades d'un
quartier partageaient une teinte unique, et les volumes se lisaient comme une nappe grise.

Le terme est **cuit dans les couleurs de sommets par le worker** — la scène n'a toujours
aucune lumière, et la frame ne paie rien. L'azimut par défaut évite volontairement les
multiples de 45° : sur une diagonale exacte, les quatre façades d'un bâtiment orthogonal
tombent deux par deux sur la même teinte et l'angle redevient invisible. `buildingShadeMin`
à `1` désactive l'ombrage.

- **Correctif** : `<Map>` ne transmettait **aucune** couleur de bâtiment au moteur. Un hôte
  qui posait `theme.globe.buildingColor` ne voyait rien — le moteur retombait toujours sur
  `defaultTheme`. Les quatre valeurs sont désormais passées, comme `oceanColor`.

Au passage :

- **Géométrie en repère local.** Les sommets sont exprimés en mètres autour du centre de la
  tuile, et la matrice du mesh les pose sur le globe. Une position ECEF vaut ~6,4 × 10⁶ m :
  en `Float32` sa résolution tombe à ~0,4 m, soit l'épaisseur d'une façade — les murs
  tremblaient. Les échelles locales sont mesurées sur le vrai ellipsoïde par différences
  finies, de sorte qu'aucune géodésie n'est recopiée dans le worker.
- **Budgets revus** : `maxTiles` 64 → 36, `maxRequest` 24 → 25, `maxInflight` 4 → 2. Les
  anciennes valeurs étaient calquées sur celles du fond raster, sans rapport avec ce que
  pèse une tuile de volume. Les bornes du panneau de réglages suivent.
- **Les deux fournisseurs sont ISO.** Le coût du rayon avait justifié des chemins de code
  distincts (drapage court-circuité, suivi d'altitude gelé) ; il est réglé à la source, et
  `applyModeVisibility` ne conditionne plus au fournisseur que ce qui EST le fournisseur.
  Fond raster et volumes partagent en outre une même altitude de sol, au lieu de deux
  références qui pouvaient diverger.

### ⚠️ Rupture — le fournisseur par défaut devient `'internal'`

`providers.tiles.provider` et `providers.tiles3d.provider` valent désormais `'internal'`,
et `providers.internal.origin` désigne le serveur de tuiles du projet
(`https://map.gosecure.site`). Une carte tourne donc **sans aucune clé d'API**, fond 2D et
volume compris.

Conséquences pour un hôte existant :

- une application qui comptait sur le fond Google doit poser
  `config={{ providers: { tiles: { provider: 'external' }, tiles3d: { provider: 'external' } } }}` ;
- un hôte tiers **doit** remplacer `providers.internal.origin` par son propre serveur : le
  défaut désigne une infrastructure privée, pas un service public.

L'origine vit dans un nœud **`providers.internal`** à elle, et non plus sous
`providers.tiles` : elle sert au fond 2D comme au volume, qui sortent du même serveur —
la ranger sous « tuiles 2D » la faisait passer pour un réglage du seul fond de carte.

### ⚠️ Rupture — `GoogleTileSource.ensureSession`

Sa signature passe de `Promise<string>` à `Promise<void>` : le token de session vit dans
l'objet, que `tileUrl` lit déjà. C'est ce qui permet à cette classe de tenir le contrat
`TileSource` commun au fournisseur interne, lequel n'a aucun token à produire. Seul
`TiledGlobeLayer` l'appelait, et il ignorait la valeur renvoyée.

Introduction de `MapConfig` : les valeurs qui pilotaient le comportement de la carte
depuis des littéraux dispersés dans le code deviennent un arbre de réglages unique,
surchargeable par `<Map config>` et documenté dans `docs/CONFIG.md`.

### Robustesse de publication

- Le bundle porte désormais la directive `'use client'` (banner Rollup, avant les
  imports) : `import` depuis un React Server Component (Next App Router) ne casse plus
  le build serveur. La carte étant intrinsèquement cliente (WebGL, hooks, DOM), tout
  le paquet est marqué client.
- `engines.node` fixé à `>=18` (aligné sur la chaîne de build Vite 6).
- Suppression du `package-lock.json` concurrent : un seul gestionnaire, **pnpm**
  (`pnpm-lock.yaml`), et ajout au `.gitignore` pour éviter sa régénération.

### ⚠️ Ruptures

#### `labels.measure` — renommage et nouveaux champs

Le formatage des distances était câblé sur le système métrique (bascule à 1000,
division par 1000, deux décimales, point décimal imposé par `toFixed`). Aucune
traduction ne pouvait donc produire des miles, ni le séparateur décimal d'une locale
qui n'est pas l'anglaise.

| Avant                | Après             |
| -------------------- | ----------------- |
| `measure.kilometers` | `measure.major`   |
| `measure.meters`     | `measure.minor`   |

Champs ajoutés, tous optionnels dans un override partiel : `majorThreshold` (seuil de
bascule, en mètres), `majorFactor` / `minorFactor` (diviseurs), `majorDecimals` /
`minorDecimals`, et `numberLocale` (`'auto'` par défaut, suit l'environnement).

**Migration** — un override qui ne traduisait que les gabarits :

```diff
 <Map labels={{ measure: {
-  kilometers: '{value} km',
-  meters: '{value} m',
+  major: '{value} km',
+  minor: '{value} m',
 } }} />
```

Un jeu impérial ne demande désormais aucune modification du code :

```tsx
<Map labels={{ measure: {
  major: '{value} mi', minor: '{value} ft',
  majorThreshold: 1609.344, majorFactor: 1609.344, minorFactor: 0.3048,
  majorDecimals: 1, minorDecimals: 0, numberLocale: 'en-US',
} }} />
```

Idem pour les durées : `duration.minorThreshold` et `duration.majorThreshold` rendent
réglables les deux bascules (secondes → minutes → heures), jusque-là en dur.

#### Le regroupement passe de la couche à la carte

Chaque `<MarkerLayer>` regroupait **ses** points dans son coin. Deux couches
produisaient donc deux jeux de pastilles qui s'ignoraient : un symbole posé restait
affiché seul à côté — voire par-dessus — la pastille de la couche voisine, qui pour lui
n'existait pas. Le regroupement est désormais un service de la carte (`engine.clusters`
+ une surface unique), alimenté par toutes les couches.

Réglages et apparence se déclarent donc **une fois**, sur la carte : un même nœud
agrège les points de plusieurs couches, il ne peut pas prendre deux apparences
contradictoires.

```diff
 markersLayer({
   points: allMarkers,
-  cluster: { enabled: true, maxZoom: 18 },
-  clusterTypeIcon,
-  clusterTypeLabel,
-  clusterTooltip: clusterTip,
 })
+<Map
+  config={{ clustering: { maxZoom: 18 } }}
+  cluster={{ typeIcon: clusterTypeIcon, typeLabel: clusterTypeLabel, tooltip: clusterTip }}
+/>
```

`cluster: { enabled: false }` sur une couche l'exclut du regroupement. La signature de
l'infobulle passe de `MarkerData<T>[]` à `MarkerData[]` : une pastille agrège
potentiellement plusieurs couches, aucun `data` commun n'est garanti.

`clusterTypeIcon` et `clusterTypeLabel` étaient restés **déclarés sur
`MarkerLayerProps` mais plus lus** : les passer ne faisait plus rien, en silence. Ils
sont supprimés du type — un appel resté en arrière obtient donc une erreur de
compilation, et non une prop ignorée. Leur remplacement est
`<Map cluster={{ typeIcon, typeLabel }}>`, comme ci-dessus. `typeLabel` reste sur la
couche : il y nomme un type pour la **recherche** et les lignes de liste, ce qui n'a
rien à voir avec une part de camembert.

#### `theme.camera` → `config.camera`

Les bornes de navigation (zoom min/max, inclinaison, pas de zoom, vitesse de glissé,
FOV) ne relèvent pas de l'apparence : elles décident de ce que l'utilisateur peut
atteindre. Elles passent du thème à la config, **à valeurs identiques**.

```diff
-<Map theme={{ camera: { maxZoom: 19 } }} />
+<Map config={{ camera: { maxZoom: 19 } }} />
```

#### `RelationEngine` — `fastestOversample` n'est plus un paramètre de constructeur

Appelants directs du core uniquement (`<RelationLayer>` s'en charge seul) :

```diff
-new RelationEngine(provider, cache, 5)
+const engine = new RelationEngine(provider, cache)
+engine.fastestOversample = 5
```

Le passer au constructeur obligeait à reconstruire le moteur pour le changer, donc à
jeter tous les instantanés : les liens affichés disparaissaient et leur calcul était
refacturé pour un simple entier modifié.

### Ajouté

- **Markers statiques (le décor)** — `MarkerData.static` marque ce qui ne demande
  aucune action et sert de repère : symbole posé, défibrillateur, borne. Ces markers
  disparaissent en dessous de `config.markers.staticMinZoom` (défaut `13`, `0` pour
  désactiver), là où une carte dézoomée se couvrait de pictogrammes illisibles
  masquant les alertes. `static: { minZoom }` impose un seuil **propre au marker** —
  tout le décor ne se lit pas à la même distance. Un statique masqué reste **trouvé
  par la recherche et la loupe** (un seuil de zoom dit ce qui est lisible, pas ce
  qu'on a le droit de trouver) et le marker sélectionné ou suivi échappe au seuil.
  Au-dessus, c'est un marker ordinaire : il se regroupe et prend sa part de camembert.
- **Regroupement et seuil des symboles posés** — la couche de symboles clusterise
  désormais (`<DrawLayer symbols={{ cluster: { enabled: false } }}>` pour revenir en arrière) et
  ses points sont `static` d'office. Le seuil suit une cascade du plus général au plus
  précis : `config.markers.staticMinZoom`, puis `symbols.minZoom` pour la couche, puis
  `minZoom` sur l'entrée de catalogue quand il dépend du genre de symbole.
- **`<Map config>`** — arbre de réglages complet : fournisseurs tiers (endpoints,
  FieldMasks, langue, quotas), seuils de geste, budgets de calcul, cadence de
  chargement, échelle d'empilement CSS. Merge profond sur `defaultConfig`.
- **Politique réseau commune** (`FetchPolicy`) sur les deux chemins réseau de la lib
  (routage, recherche de lieu), qui n'avaient jusqu'ici **ni timeout ni réessai** :
  une requête sans réponse restait pendante indéfiniment. Timeout par tentative,
  réessais bornés, backoff exponentiel avec part aléatoire, et aucun réessai sur un
  refus (400/401/403/404/429 — réessayer ne ferait que consommer le quota plus vite).
- **`providers.routing.headers` et `providers.places.headers`** — de quoi viser un
  proxy serveur et cesser d'exposer la clé Google côté client.
- **Tests** (`pnpm test`), **ESLint** (`pnpm lint`) et **Prettier** (`pnpm format`).

### Corrigé

- **`mergeTheme` écrivait dans `defaultTheme`.** Sans override, `deepMerge` renvoie sa
  base par référence ; la coupure des animations était appliquée par mutation, donc
  atteignait le singleton exporté publiquement. Un seul utilisateur en
  `prefers-reduced-motion: reduce` figeait les animations pour **toute** l'application,
  y compris les cartes montées ensuite.
- **`<Map config>` ne se propageait pas à chaud.** Les composants lisaient
  `engine.config` pendant leur rendu, alors que la carte pose la config sur le moteur
  depuis un effet — et les effets d'un enfant s'exécutent avant ceux de son parent. Au
  rendu où la config changeait, les enfants lisaient donc la valeur précédente, et rien
  ne les re-rendait ensuite : le fournisseur de routage, en particulier, ne recevait
  jamais ses nouveaux endpoints. La couche React lit désormais `useConfig()`.
- **Les réglages de cache de routage étaient sans effet.** `RouteCache` était construit
  une fois avec les valeurs du montage, si bien que `providers.routing.cache` (TTL,
  quantification, plafond) ne changeait rien — alors que ces trois valeurs décident du
  nombre d'appels facturés.
- **Distances mal formatées hors locale anglaise** : `toFixed` imposait le point
  décimal et gardait les zéros de fin (« 2.40 km » sous des libellés français).
- Corps des réponses en erreur non consommé avant réessai (un flux laissé ouvert par
  tentative).
