export const CSS_RELATIONS = `/* ── Bouton « supprimer » PARTAGÉ (cf. core/removeButton + <RemoveButton>) ──
   Rouge partout : socle de relation, pastilles du dock, indice de retrait au drag.
   Une seule définition — le style ne peut pas diverger d'un usage à l'autre. */
.m3d-remove{display:inline-flex;align-items:center;justify-content:center;gap:4px;
  padding:0;border:none;border-radius:var(--m3d-radius-pill);cursor:pointer;
  font:inherit;font-size:11.5px;font-weight:var(--m3d-weight-semibold);line-height:1;white-space:nowrap;
  background:var(--m3d-error);color:#fff;
  transition:background-color .12s ease,transform .12s ease,opacity .12s ease}
/* Survol : le MÊME rouge, assombri. Un filter brightness ternirait aussi l'icône
   et le texte blancs ; en n'assombrissant que le fond, le contraste est préservé.
   Dérivé de --m3d-error, donc un thème qui redéfinit le rouge emporte le survol. */
.m3d-remove:hover{background:color-mix(in srgb,var(--m3d-error) 78%,#000)}
.m3d-remove svg{width:14px;height:14px;flex:none;display:block}
/* Libellé masqué quand vide : le même bouton sert en icône seule ou avec texte. */
.m3d-remove .m3d-remove-text:empty{display:none}
.m3d-remove:not(:has(.m3d-remove-text:empty)){padding:4px 10px 4px 7px}
.m3d-remove:has(.m3d-remove-text:empty){width:22px;height:22px}

/* Curseur de sélection dès qu'un trait est sous le pointeur : c'est le signal qui
   rend les liens découvrables comme cliquables. */
.m3d-hover-link canvas{cursor:pointer}
/* Badge de rang : le classement se lit en clair, il n'est jamais encodé dans le trait. */
.m3d-link-rank{display:inline-flex;align-items:center;justify-content:center;
  min-width:15px;height:15px;padding:0 3px;border-radius:var(--m3d-radius-pill);
  background:color-mix(in srgb,var(--m3d-text) 12%,transparent);font-size:9.5px;margin-right:8px;}

/* Conteneur d'un socle en mode slot : un POINT, exactement au centre du disque.
   Largeur et hauteur nulles ASSUMÉES — son contenu déborde symétriquement grâce au
   flex centré. C'est ce qui le rend utilisable comme ancre : un conteneur à la taille
   de son contenu fausserait le calcul de place disponible, et la barre basculerait de
   côté sans raison.
   Le retrait hors de l'emprise du marker est porté ICI, en padding, et non par une
   marge du contenu : le padding entre dans le clientWidth de l'ancre, donc le calcul
   de place disponible du hook le voit. Posé sur le contenu, il aurait été ignoré, et
   la barre aurait basculé de côté en croyant manquer de place. */
.m3d-link-anchor{position:absolute;left:0;top:0;width:0;height:0;
  padding:0 0 0 var(--m3d-hub-offset,26px);
  display:flex;align-items:center;overflow:visible;pointer-events:none;
  /* Montée dans la surface des markers (cf. LinkLayer.slotHost), l'ancre partage leur
     contexte d'empilement. CSS2DRenderer y écrit un z-index de 1 à N (N = nombre de
     markers rendus) pour les trier par profondeur : un plafond franc met la barre
     devant eux quel qu'en soit le nombre, là où toute valeur proche de N dépendrait
     de la densité de la carte. */
  z-index:var(--m3d-z-menu,9999)}
/* Seul le contenu est cliquable : l'ancre elle-même ne doit rien intercepter. */
.m3d-link-anchor > *{pointer-events:auto}

/* Barre d'état d'une relation : ancrée au socle de SON marker source, à la place
   qu'occupait la croix de suppression. La commande se trouve ainsi là où le regard
   est déjà, et chaque barre dit sans ambiguïté de quelle relation elle parle — ce
   qu'une barre unique flottant dans un coin ne pouvait pas faire.
   Les segments sont des boutons — la barre informe ET pilote. */
.m3d-relbar{position:relative;z-index:var(--m3d-z-relation-bar,6);
  display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;
  /* Enfant d'une ancre de largeur nulle : sans cela le flex la comprimerait. */
  flex:none;
  font-size:12px;white-space:nowrap}
/* Pas la place à droite : la barre passe de l'autre côté du socle plutôt que d'être
   coupée par le bord du conteneur. Le hook de placement (useNudgeInside) en décide
   sur la place réelle autour de l'ANCRE — jamais sur la position courante, qui
   oscillerait — et écrit par ailleurs la marge corrective verticale. */
.m3d-relbar.m3d-flip{transform:translateX(calc(-100% - 2 * var(--m3d-hub-offset,26px)))}
.m3d-relbar-swatch{width:9px;height:9px;border-radius:50%;flex:none}
.m3d-relbar-text{font-weight:var(--m3d-weight-semibold)}
.m3d-relbar-scope{color:var(--m3d-muted)}
/* Le menu est le FRÈRE du bouton, jamais son enfant : un menuitem focusable dans un
   <button> est du HTML invalide, et le contenu du menu entrerait dans le nom
   accessible du bouton. C'est donc le wrapper qui porte le repère de position. */
.m3d-relbar-segwrap{position:relative;display:inline-flex}
.m3d-relbar-seg{font:inherit;color:inherit;cursor:pointer;
  padding:3px 9px;border:1px solid var(--m3d-border);border-radius:var(--m3d-radius-pill);
  background:color-mix(in srgb,var(--m3d-text) 5%,transparent)}
.m3d-relbar-seg:hover{background:color-mix(in srgb,var(--m3d-text) 10%,transparent)}
/* Le menu d'un segment s'ouvre VERS LE HAUT : la barre est collée au bas de la carte. */
.m3d-relbar-menu{position:absolute;left:0;bottom:100%;margin-bottom:6px;
  display:block;text-align:left;cursor:default}
/* La barre n'a plus de bouton propre : effacer une relation passe par le bouton
   partagé (.m3d-remove), comme sur le socle et dans la dock. */
`
