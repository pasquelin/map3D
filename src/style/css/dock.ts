export const CSS_DOCK = `
/* ── Dock des favoris épinglés (PinnedDock) ────────────────────────────────
   Barre ancrée en bas AU CENTRE, largeur au contenu (bornée, elle grandit
   symétriquement de part et d'autre de l'axe). Repliée, elle coulisse sous le bord
   de la carte ; seule la poignée ronde reste, et c'est par elle qu'on la rappelle.

   Le conteneur ne bouge JAMAIS : il fait la taille de la barre et sert de repère aux
   deux mouvements (la barre qui descend, la poignée qui la suit). C'est ce qui rend
   la transition continue là où deux éléments échangés ne pouvaient que sauter. */
.m3d-pindock-wrap{position:absolute;left:50%;bottom:16px;z-index:var(--m3d-z-dock,998);
  max-width:calc(100% - 32px);transform:translateX(-50%)}
.m3d-pindock{position:relative;
  display:flex;align-items:center;gap:10px;padding:10px;overflow:visible;box-sizing:border-box;
  transform-origin:bottom center;
  animation:m3d-pindock-in .24s cubic-bezier(.32,1.25,.5,1) backwards;
  transition:transform .34s cubic-bezier(.4,0,.2,1),opacity .22s ease}
@keyframes m3d-pindock-in{from{opacity:0;transform:translateY(8px) scale(.9)}}
/* Repliée : la barre sort par le bas (sa hauteur + la marge du bord), pas une
   remise à l'échelle — ce qui disparaît doit sortir du cadre, pas rétrécir. */
/* L'animation d'apparition est coupée ici : montée déjà repliée (defaultCollapsed),
   la barre jouerait sinon son « pop » avant de redescendre — un aller-retour pour
   rien. ATTENTION : ce CSS est un template literal, aucun accent grave dans les
   commentaires, il fermerait la chaîne. */
.m3d-collapsed .m3d-pindock{transform:translateY(calc(100% + 24px));opacity:0;pointer-events:none;animation:none}
/* Cible de dépôt active : liseré accent en pointillé + voile teinté. */
.m3d-pindock-over .m3d-pindock{border-color:var(--m3d-accent);border-style:dashed;
  background:color-mix(in srgb,var(--m3d-accent) 14%,var(--m3d-panel))}
.m3d-pindock-over .m3d-pindock-toggle{border-color:var(--m3d-accent);color:var(--m3d-accent)}
/* Poignée ronde, à cheval sur le bord haut de la barre (moitié dehors). Repliée,
   elle glisse jusqu'au bas du conteneur : c'est le décalage haut qui s'anime, donc
   elle accompagne la barre au lieu de se téléporter. */
.m3d-pindock-toggle{position:absolute;left:50%;top:0;transform:translate(-50%,-110%);z-index:2;
  min-width:34px;height:34px;padding:0;border-radius:17px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;font:inherit;
  color:var(--m3d-muted);
  transition:top .14s cubic-bezier(.4,0,.2,1),padding .28s cubic-bezier(.4,0,.2,1),
    background .14s,color .14s,border-color .14s}
.m3d-collapsed .m3d-pindock-toggle{top:100%;padding:0 13px 0 7px}
.m3d-pindock-toggle:hover{background:color-mix(in srgb,var(--m3d-text) 6%,var(--m3d-panel));color:var(--m3d-text)}
.m3d-pindock-toggle:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}
/* Un seul chevron pour les deux sens : il pointe vers le haut au repos (« rouvrir »)
   et pivote quand la barre est déployée (« refermer »). */
.m3d-pindock-chev{transition:transform .34s cubic-bezier(.4,0,.2,1)}
.m3d-pindock-wrap:not(.m3d-collapsed) .m3d-pindock-chev{transform:rotate(180deg)}
/* Compteur et nom : dépliés AVEC la poignée. Toujours dans le DOM, ils sont réduits
   à une largeur nulle quand la barre est ouverte — c'est ce qui permet à la poignée
   de passer du rond à la pilule d'un seul mouvement, sans mesure ni saut. */
.m3d-pindock-count,.m3d-pindock-name{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;
  transition:max-width .28s cubic-bezier(.4,0,.2,1),opacity .18s ease,margin-left .28s cubic-bezier(.4,0,.2,1)}
.m3d-collapsed .m3d-pindock-count{max-width:40px;opacity:1;margin-left:5px}
.m3d-collapsed .m3d-pindock-name{max-width:160px;opacity:1;margin-left:7px}
.m3d-pindock-count{flex:none;box-sizing:content-box;height:17px;border-radius:9px;
  background:var(--m3d-accent);color:#fff;font-size:11px;font-weight:var(--m3d-weight-bold);font-variant-numeric:tabular-nums;
  display:flex;align-items:center;justify-content:center}
/* Le padding suit la largeur : à largeur nulle il ne doit rien occuper. */
.m3d-collapsed .m3d-pindock-count{padding:0 5px;min-width:7px}
.m3d-pindock-name{font-size:var(--m3d-size-sm);font-weight:var(--m3d-weight-semibold);color:var(--m3d-text);line-height:1}
/* Languette d'invite : carré pointillé « + Ajouter un marqueur », le libellé
   revient à la ligne. Léger grossissement au survol. */
.m3d-pindock-add{flex:none;box-sizing:border-box;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  padding:8px;border:1.5px dashed color-mix(in srgb,var(--m3d-text) 22%,transparent);
  border-radius:18px;color:var(--m3d-muted);
  transition:transform .12s cubic-bezier(.2,.8,.3,1),border-color .12s,color .12s}
.m3d-pindock-add:hover{transform:scale(1.04);color:var(--m3d-text)}
.m3d-pindock-over .m3d-pindock-add{border-color:var(--m3d-accent);color:var(--m3d-accent)}
.m3d-pindock-addlabel{font-size:11px;font-weight:var(--m3d-weight-semibold);text-align:center;line-height:1.25}
/* Liste des pastilles : défile en X quand elle dépasse la largeur bornée. padding
   + margin opposés = le grossissement au survol (-3px) n'est pas rogné par le clip. */
.m3d-pindock-items{display:flex;align-items:center;gap:10px;min-width:0;
  overflow-x:auto;overflow-y:hidden;padding:8px;margin:-8px;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--m3d-text) 25%,transparent) transparent}

/* Carré épinglé : vignette arrondie (avatar/icône), croix de retrait dedans en
   haut-droite ; saisissable (glisser-hors = retrait). */
.m3d-pin{position:relative;flex:none;box-sizing:border-box;padding:0;border:none;
  border-radius:10px;overflow:hidden;cursor:pointer;background:var(--m3d-panel);
  box-shadow:0 0 0 1px var(--m3d-border),0 2px 8px rgba(0,0,0,.28);
  transition:transform .12s cubic-bezier(.2,.8,.3,1)}
.m3d-pin:hover{transform:translateY(-3px)}
/* Réordonnancement : un espace s'ouvre là où la pastille atterrira, et celle qu'on
   déplace s'efface — sans ce retour, on relâche à l'aveugle. */
.m3d-pin-slot{flex:none;border-radius:10px;box-sizing:border-box;
  border:1.5px dashed color-mix(in srgb,var(--m3d-text) 30%,transparent);
  background:color-mix(in srgb,var(--m3d-text) 6%,transparent)}
.m3d-pin-moving{opacity:.3}
.m3d-pin:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}
/* Média de la vignette : avatar en cover (remplit), badge coloré sinon. */
.m3d-pin-media{width:100%;height:100%;display:block}
img.m3d-pin-media{object-fit:cover}
.m3d-pin-badge{display:flex;align-items:center;justify-content:center;font-weight:var(--m3d-weight-bold);font-size:22px;line-height:1}
.m3d-pin-badge img{width:62%;height:62%;object-fit:contain}
/* Légende (titre) posée EN BAS par-dessus la vignette, sur un dégradé sombre —
   l'info « c'est quoi » lisible d'un coup d'œil. UNE seule ligne : le texte trop
   long défile au survol (marquee CSS, sans <marquee> déprécié). container-type +
   cqw = mesure la largeur visible ; min(0px, cqw - largeurTexte) ne défile QUE
   si le texte déborde réellement (sinon 0 → immobile). */
/* Conteneur du titre, sans fond : la lisibilité vient de l'ombre portée du texte. */
.m3d-pin-caption{position:absolute;left:0;right:0;bottom:0;padding:34px 10px 6px;
  pointer-events:none;overflow:hidden}
/* Couche du TEXTE : c'est ELLE (pas le voile) qui porte le fondu à droite + le
   clip du défilement. container-type ici → 100cqw = largeur de texte visible. */
.m3d-pin-caption-clip{display:block;overflow:hidden;container-type:inline-size;
  -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent);
  mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent)}
.m3d-pin-caption-text{display:inline-block;white-space:nowrap;
  font-size:10px;font-weight:var(--m3d-weight-semibold);line-height:1.2;color:#fff;
  text-shadow:0 1px 2px rgba(0,0,0,.7)}
/* Défile au survol seulement si ça déborde ; s'arrête en laissant ~22px de marge
   à droite → la fin du titre reste NETTE (hors de la zone de fondu). */
.m3d-pin:hover .m3d-pin-caption-text,
.m3d-pin:focus-within .m3d-pin-caption-text{
  animation:m3d-caption-scroll 4.5s linear infinite alternate}
@keyframes m3d-caption-scroll{
  0%,12%{transform:translateX(0)}
  88%,100%{transform:translateX(min(0px,calc(100cqw - 100% - 34px)))}}
/* Croix de retrait : dans le coin haut-droit à 6px, révélée au survol/focus. */
/* Le fond rouge, l'icône et la taille viennent de .m3d-remove (partagé) : ici
   seuls le placement sur la pastille et sa révélation au survol. */
.m3d-pin-x{position:absolute;top:6px;right:6px;opacity:0;transform:scale(.6);
  box-shadow:0 2px 6px rgba(0,0,0,.35);
  transition:opacity .12s,transform .12s}
.m3d-pin:hover .m3d-pin-x,.m3d-pin:focus-within .m3d-pin-x{opacity:1;transform:scale(1)}
/* Ghost d'une pastille en cours de retrait : tooltip « Supprimer » au-dessus,
   visible UNIQUEMENT hors d'une cible acceptée (façon dock macOS). */
/* L'indice porte le MÊME bouton que partout ailleurs (RemoveButton withText) :
   il n'apporte donc que le placement au-dessus du ghost et son apparition. */
.m3d-pin-remove-hint{position:absolute;left:50%;top:0;transform:translate(-50%,calc(-100% - 8px));
  opacity:0;transition:opacity .12s;pointer-events:none}
.m3d-pin-remove-hint .m3d-remove{box-shadow:0 4px 12px rgba(0,0,0,.35)}
.m3d-drag-ghost:not(.m3d-drag-over) .m3d-pin-remove-hint{opacity:1}

/* Infobulle au survol d'une pastille : rendue en PORTAL dans .m3d-root (hors du
   conteneur scrollable, sinon rognée). Elle porte AUSSI la classe .m3d-markertip
   → elle hérite du fond/bordure/min-max-width des infobulles de markers (et donc
   de tout override hôte). Ici on ne surcharge QUE le positionnement (left/top
   inline via le portail + lift) et l'animation. */
.m3d-pin-tip{z-index:var(--m3d-z-menu,9999);transform:translate(-50%,calc(-100% - 12px));
  animation:m3d-fade-in .16s ease-out}
@keyframes m3d-fade-in{from{opacity:0}}

/* Pendant un drag, les pastilles sous le curseur ne réagissent pas — on dépose
   librement n'importe où dans la dock : ni croix de retrait, ni grossissement,
   ni infobulle du voisin survolé. */
.m3d-root.m3d-dragging .m3d-pin:hover{transform:none}
.m3d-root.m3d-dragging .m3d-pin-x{opacity:0!important;pointer-events:none}
.m3d-root.m3d-dragging .m3d-pin-tip{display:none}
`
