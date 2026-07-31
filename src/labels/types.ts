import type { DeepPartial } from '../theme/types'
import type { DrawTool, MeasureTool, SelectMode } from '../layers/DrawLayer'

/**
 * Tous les textes affichés par la lib, **entièrement traduisibles** : aucun
 * libellé en dur dans les composants ne doit exister hors de cet objet. Les
 * défauts (français) sont dans `defaultLabels` ; l'hôte override tout ou partie
 * via `<MapProvider labels={...}>` (merge profond, mêmes règles que le thème).
 *
 * Les gabarits contiennent des variables `{nom}` interpolées par `formatLabel`
 * (ex. `'Bordure {width} px'`) — les conserver dans toute traduction.
 */
export type MapLabels = {
  /** Tooltips/aria des boutons de `<MapControls>`. */
  controls: {
    pan: string
    rotate: string
    north: string
    zoomIn: string
    zoomOut: string
    tilt: string
    globe: string
    /** Grille de coordonnées — cf. le guide GRATICULE.md. */
    graticule: string
    fullscreen: string
    /** Bouton « revenir à la cible » — n'apparaît qu'avec `MapControls target`. */
    target: string
    /** Fond de carte : bascule 3D ↔ plan (bouton unique, toujours ce libellé). */
    mode3d: string
    /** Calque trafic Google (mode plan uniquement). */
    traffic: string
    /** Bouton d'entrée en mode piéton — n'apparaît qu'en 3D photoréaliste externe. */
    pedestrian: string
    /** Même bouton, mode armé ou actif : il quitte. */
    pedestrianExit: string
    /** Bascule exploration ↔ immersion totale. */
    immersion: string
    /** Rappel affiché en immersion totale, la souris étant cachée. */
    pedestrianHint: string
  }
  /** Bouton + panneau « Couches » (filtre par tag). */
  tags: {
    button: string
    searchPlaceholder: string
    /** Aucun tag présent sur la carte. */
    empty: string
    /** La recherche ne matche aucun tag. */
    noMatch: string
    showAll: string
  }
  /**
   * Catalogue d'entités géographiques distantes — bouton de barre, sous-menu des types,
   * liste et réglages. Les NOMS des types ne sont pas ici : ils viennent de
   * `CatalogSource.label`, fourni par l'hôte, qui seul sait comment il les appelle.
   */
  catalog: {
    button: string
    searchPlaceholder: string
    /** La source ne contient aucun élément. */
    empty: string
    /** La recherche ne ramène rien. */
    noMatch: string
    loading: string
    /** Échec du listage : bandeau au-dessus de la liste déjà chargée. */
    error: string
    retry: string
    /** Échec du chargement d'une géométrie, en infobulle sur la ligne concernée. */
    itemError: string
    /** Bouton bascule, état « pas encore sur la carte » — `{label}`. */
    add: string
    /** Bouton bascule, état « affiché sur la carte » — `{label}`. */
    remove: string
    expand: string
    collapse: string
    settings: {
      title: string
      persist: string
      fitOnAdd: string
      clear: string
    }
  }
  /**
   * Outil **Symboles** de la barre de dessin : palette d'icônes posables au
   * glisser-déposer. Tout est traduisible ici — y compris les catégories du
   * catalogue et les affiliations — pour qu'aucun texte n'ait à passer en prop.
   */
  symbols: {
    button: string
    searchPlaceholder: string
    /** Consigne d'usage affichée en tête du panneau. */
    dragHint: string
    /** La recherche ne matche aucune entrée du catalogue. */
    noMatch: string
    /** Titre de la section de choix d'affiliation. */
    affiliation: string
    /** Graphique multi-points : posé par clics successifs, pas par dépôt. */
    multiPointHint: string
    /** Libellé par catégorie du catalogue (clé du catalogue → texte affiché). */
    categories: Record<string, string>
    /** Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). */
    affiliations: Record<string, string>
    /**
     * Traductions du CATALOGUE, par clé d'entrée : `{ label, description }`.
     *
     * ⚠️ Le catalogue MIL-STD-2525D embarque 91 libellés et 91 descriptions **en
     * français**, écrits dans `symbols/providers/milSym`. C'était le dernier gisement
     * de texte hors des labels : la palette de symboles restait monolingue quelle que
     * soit la locale de l'application, alors que tout le reste de l'UI se traduit.
     *
     * Une entrée absente garde le texte du catalogue — une traduction partielle est
     * donc valide, et un catalogue custom n'a rien à déclarer ici.
     */
    catalog: Record<string, { label?: string; description?: string }>
  }
  /** Hub « Plugins » de la toolbar (bouton + panneau). */
  plugins: {
    /** Tooltip/aria du bouton du hub. */
    button: string
    /** Titre du panneau. */
    title: string
    /** Aucun plugin enregistré. */
    empty: string
    /** aria-label du toggle d'activation d'un plugin — `{name}`. */
    toggle: string
    /** Bouton de remise aux défauts d'un plugin. */
    reset: string
  }
  /** Gestionnaire de templates (panneau haut-droite : liste, sauvegarde, partage). */
  templates: {
    /** Tooltip/aria du bouton d'ouverture + titre du panneau. */
    title: string
    /** Bouton d'ouverture du formulaire de sauvegarde. */
    save: string
    /** Consigne du formulaire de sauvegarde. */
    saveHint: string
    /** Placeholder/aria du champ nom. */
    name: string
    /** Aucun template enregistré. */
    empty: string
    /** aria-label de la croix de suppression — `{name}`. */
    delete: string
    /** Message de confirmation de suppression — `{name}`. */
    deleteConfirm: string
    /** Bouton de confirmation (dialogue + validation du renommage). */
    confirm: string
    /** Bouton d'annulation (dialogue + annulation du renommage). */
    cancel: string
    /** aria-label du renommage inline — `{name}`. */
    rename: string
    /** Bouton « mettre à jour le template avec le dessin courant » — `{name}`. */
    update: string
    /** Message de confirmation d'écrasement — `{name}`. */
    updateConfirm: string
    /** Bouton d'application d'un template au dessin courant. */
    apply: string
    /** Phrase d'explication au-dessus des modes d'application (et aria-label du groupe). */
    applyMode: string
    /** Option d'application : ajoute au dessin existant. */
    merge: string
    /** Option d'application : remplace le dessin existant. */
    replace: string
    /** Option d'application : retire du dessin les formes venues de ce template. */
    remove: string
    /** Bouton d'export `.m3dt`. */
    export: string
    /** Bouton d'import `.m3dt`. */
    import: string
    /** Badge d'un template partagé (venu de l'API). */
    shared: string
    /** Badge/aria d'un template en lecture seule. */
    readOnly: string
    /** Nom de fichier `.m3dt` de repli à l'export quand le template n'a pas de nom. */
    defaultName: string
    /** Nom de repli d'un template importé qui n'en portait pas. */
    importedName: string
    /** Libellé d'une catégorie sauvegardable (checkbox + stats — invariant au nombre). */
    category: { shapes: string; freehand: string; symbols: string }
    /** Stats compactes : paire « libellé nombre » et gabarit de poids (`{count}`). */
    stats: { pair: string; bytes: string }
    /** Case « mémoriser la vue » du formulaire de sauvegarde. */
    view: string
    /** Consigne de la case « Vue » — ce qu'elle emporte réellement. */
    viewHint: string
    /** Badge/aria d'un template qui porte une vue. */
    hasView: string
  }
  /** `<SearchBox>` (le prop `placeholder` du composant reste prioritaire). */
  search: {
    placeholder: string
    /** aria-label du champ. */
    inputLabel: string
    /** Requête sans résultat, toutes rubriques confondues. */
    noResults: string
    /**
     * Requête sans résultat dans une rubrique restreinte — `{group}` reçoit son nom.
     * Distinct de `noResults` pour que l'utilisateur voie que c'est la PORTÉE qui
     * filtre, et pas la carte qui est vide.
     */
    noResultsInGroup: string
    /** Titre de la section historique (champ vide focalisé). */
    historyTitle: string
    clearHistory: string
    /** aria-label du bouton ✕ qui vide le champ. */
    clearInput: string
    /** Sélecteur de portée : bouton, valeur « toutes rubriques », aria-label. */
    scopeAll: string
    scopeLabel: string
    /**
     * Nom des rubriques que la LIB produit elle-même. Celles issues d'une couche de
     * markers sont nommées par son `typeLabel`, l'application seule sachant qu'un
     * type `'agent'` s'appelle « Agents ».
     */
    groups: {
      shape: string
      draw: string
      symbol: string
      place: string
    }
  }
  /** Boutons de `<Toolbar>` hors outils (navigation, historique, effacement). */
  toolbar: {
    navigate: string
    undo: string
    redo: string
    clearAll: string
  }
  /** Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). */
  tools: Record<DrawTool, string>
  /**
   * Modes du flyout de sélection (marquee rectangle / polygone / lasso) :
   * `label` = rangée du flyout, `description` = tooltip (avec le raccourci) —
   * distincte du label pour ne pas répéter le texte déjà visible.
   */
  selectModes: Record<SelectMode, { label: string; description: string }>
  /**
   * Ligne « bâtiment » du même sélecteur. Hors de `selectModes`, qui est indexé par
   * `SelectMode` : désigner un bâtiment n'est pas un mode de sélection de dessin, c'est un
   * outil du moteur qui partage seulement ce menu.
   */
  buildingPick: { label: string; description: string }
  /**
   * Rangées du sous-menu « Mesures » : `label` = rangée du flyout, `description` = tooltip
   * (avec le raccourci) — même convention que `selectModes`.
   *
   * `measure` y figure en plus de `tools.measure` : le premier nomme la RANGÉE du menu, le
   * second le bouton de barre. Les deux peuvent légitimement différer d'une traduction.
   */
  measureTools: Record<MeasureTool, { label: string; description: string }>
  /** Grille de coordonnées : noms des lignes remarquables et formatage des étiquettes. */
  graticule: {
    /**
     * Noms des lignes remarquables, indexés par les clés de
     * `config.graticule.remarkable[].labelKey`. Un hôte qui ajoute une ligne y ajoute sa clé.
     */
    remarkable: Record<string, string>
    /**
     * Gabarits d'étiquette — variables `{d}` (degrés), `{m}` (minutes), `{s}` (secondes),
     * `{hemi}` (point cardinal). Le format DMS est de l'i18n, pas du code.
     */
    format: { deg: string; dm: string; dms: string }
    /** Points cardinaux — traduisibles (`W` → `O` si l'hôte le souhaite). */
    hemisphere: { north: string; south: string; east: string; west: string }
  }
  /** Panneau de style (swatches, palette, presets) — libellés et aria. */
  style: {
    fill: string
    stroke: string
    swap: string
    /** Pastille de la palette — `{color}` = la couleur CSS. */
    color: string
    customColor: string
    border: string
    noBorder: string
    /** Preset d'épaisseur — `{width}` = px. */
    borderWidth: string
    strokeStyle: string
    solid: string
    dashed: string
    dotted: string
    strokeOpacity: string
    fillOpacity: string
    /** Preset d'opacité — `{percent}` = 0–100. */
    opacityPreset: string
    corners: string
    /** Preset de rayon d'angle — `{radius}` = % du petit côté. */
    cornerRadius: string
    /** Titre du panneau quand 1 forme est sélectionnée — `{count}`. */
    selectionCount: string
    /** Titre du panneau quand plusieurs formes sont sélectionnées — `{count}`. */
    selectionCountPlural: string
    /** Bouton qui déplie le panneau réduit. */
    expand: string
    /** Bouton qui réduit le panneau à son seul bouton. */
    collapse: string
  }
  /** Panneau de sélection (liste des éléments sélectionnés, par groupe). */
  selection: {
    /** Titre du panneau. */
    title: string
    /** Nom de la catégorie formes dans une rangée. */
    shapesGroup: string
    /** Gabarit du libellé d'une rangée — `{group}`, `{type}` (compteur séparé). */
    group: string
    /** aria-label de la croix d'une rangée — `{label}` = libellé de la rangée. */
    deselectGroup: string
    clearAll: string
    /** aria-label de la poignée de déplacement du panneau. */
    movePanel: string
  }
  /** Regroupement de markers (`<ClusterSurface>`). */
  clusters: {
    /**
     * aria-label d'une pastille — `{count}` = nombre de markers agrégés.
     *
     * C'est le seul texte qu'un lecteur d'écran a de la pastille : le camembert est
     * une image, et la répartition par type vit dans l'infobulle.
     */
    label: string
    /** Idem au singulier — `{count}` = 1. */
    labelSingular: string
  }
  /** Liste de markers partagée (sélection + loupe) : 1 ligne par marker. */
  markerList: {
    /** Action « cibler » (menu + clic sur la ligne). */
    target: string
    /** aria-label du bouton de menu d'actions d'une ligne — `{label}`. */
    actions: string
    /** aria-label de la croix d'une ligne — `{label}`. */
    remove: string
  }
  /** Outil loupe (`<LensLayer>`) : inventaire des markers d'une zone. */
  lens: {
    /** Libellé/aria de l'outil loupe dans la toolbar. */
    tool: string
    /** Titre du panneau — `{count}` = nombre de markers. */
    title: string
    /** Titre au singulier — `{count}` = 1. */
    titleSingular: string
    /** Panneau vide (zone sans marker). */
    empty: string
    /** aria-label du bouton qui retire la zone loupe. */
    remove: string
    /** aria-label de la poignée de déplacement du panneau. */
    movePanel: string
    /** aria-label/tooltip du bouton qui ré-aimante le panneau à la zone (après déplacement). */
    snapBack: string
  }
  /** Panneau « Réglages des outils ». */
  settings: {
    title: string
    resetAll: string
    resetTool: string
    shortcutsTitle: string
  }
  /** Actions d'édition du dessin (récapitulatif des raccourcis). */
  actions: {
    panMap: string
    rotateCamera: string
    rotateShape: string
    undoRedo: string
    selectAll: string
    duplicate: string
    delete: string
    moveSelection: string
    closePolygon: string
    cancel: string
    /** Maj+clic / Maj+marquee : ajouter à la sélection. */
    addToSelection: string
    /** Alt/⌘+marquee : ne sélectionner que les markers. */
    markersOnly: string
  }
  /**
   * Caractères d'interface écrits en dur dans les composants. Ils sont ici pour deux
   * raisons : le chevron `›` ne se retourne pas de lui-même en RTL, et une charge
   * typographique (police sans ces glyphes) doit pouvoir les remplacer.
   */
  glyphs: {
    /** Marque de branche d'un sous-menu. */
    submenu: string
    /** Coche de l'option active d'un menu. */
    check: string
    /** Preset « sans bordure ». */
    none: string
    /** Séparateur inline des infobulles de cluster. */
    separator: string
  }
  /** Préfixe de modificateur affiché dans les raccourcis, par plateforme. */
  modKey: {
    mac: string
    other: string
  }
  /** Noms de touches affichés (tooltips, récap raccourcis). */
  keys: {
    escape: string
    space: string
    spaceShift: string
    shiftDrag: string
    enter: string
    arrows: string
    backspace: string
    shiftClick: string
    altOrCmd: string
    /** Glyphe Maj seul, pour composer un raccourci affiché (⇧Z). */
    shift: string
  }
  /** Gabarits de composition des textes affichés. */
  format: {
    /** Libellé + raccourci d'un tooltip/aria — `{label}`, `{key}`. */
    shortcut: string
  }
  /**
   * Formatage d'une distance. La valeur d'entrée est TOUJOURS en mètres — c'est ce
   * que produisent la géodésie de la lib et les API de routage ; aucun chemin ne
   * fournit autre chose.
   *
   * Le système d'unités se décrit donc entièrement ici : deux gabarits, deux
   * facteurs de conversion depuis le mètre, et le seuil de bascule (lui aussi en
   * mètres). `imperialMeasure` en donne un jeu prêt à l'emploi.
   *
   * ⚠️ Le modèle ne pouvait PAS faire d'impérial : il convertissait la grande unité
   * (`majorFactor`) mais affichait la petite telle quelle, donc en mètres — des
   * « pieds » qui étaient des mètres. Et sa documentation se contredisait, annonçant
   * tantôt `1609.344` tantôt `5280` pour le même champ, en supposant une valeur
   * d'entrée en pieds qui n'existe nulle part.
   */
  measure: {
    /** Gabarit de la GRANDE unité (km, miles) — `{value}`. */
    major: string
    /** Gabarit de la PETITE unité (m, pieds) — `{value}`. */
    minor: string
    /** Seuil de bascule vers la grande unité, **en mètres**. */
    majorThreshold: number
    /** Diviseur mètre → grande unité : `1000` en métrique, `1609.344` en impérial. */
    majorFactor: number
    /** Diviseur mètre → petite unité : `1` en métrique, `0.3048` en impérial. */
    minorFactor: number
    /** Décimales de la grande unité. */
    majorDecimals: number
    /** Décimales de la petite unité — elle était arrondie à l'entier sans recours. */
    minorDecimals: number
    /**
     * Locale de formatage des nombres (`Intl.NumberFormat`). `'auto'` suit le
     * navigateur.
     *
     * ⚠️ Sans elle, le formatage passait par `toFixed`, donc le séparateur décimal
     * était TOUJOURS le point : la lib affichait « 2.40 km » là où ses propres
     * libellés français promettent « 2,4 km ». `toFixed` ne supprime pas non plus
     * les zéros de fin.
     */
    numberLocale: string
  }
  /** Durée de trajet — `{value}`, ou `{h}`/`{m}` au-delà de l'heure. */
  duration: {
    /** Sous ce nombre de secondes, la durée s'affiche en secondes. */
    minorThreshold: number
    /** Sous ce nombre de minutes, elle s'affiche en minutes ; au-delà en heures. */
    majorThreshold: number
    seconds: string
    minutes: string
    /** Heures pleines (minutes nulles) — `{h}`. */
    hours: string
    /** Heures et minutes — `{h}`, `{m}`. */
    hoursMinutes: string
  }
  /**
   * Bloc de lecture de la vue (`<CameraReadout>`) : altitude de l'œil, point au sol
   * sous lui, zoom.
   *
   * L'altitude n'a PAS son propre système d'unités : elle passe par `measure`, comme
   * toute distance de la lib — une carte en impérial doit lire son altitude en pieds
   * sans avoir à le redire ici.
   */
  readout: {
    /** Nom accessible de la région (lecteurs d'écran) — le bloc n'a pas de titre visible. */
    title: string
    /** Libellé de la ligne d'altitude. */
    altitude: string
    latitude: string
    longitude: string
    /** Libellé du cap — la direction que REGARDE la caméra. */
    heading: string
    /** Libellé de l'inclinaison — `0°` au nadir (à la verticale), `90°` à l'horizon. */
    tilt: string
    zoom: string
    /**
     * Gabarit des ANGLES (cap et inclinaison) — `{value}`. Les seuls champs à porter une
     * unité : le degré s'écrit collé au nombre, ce qu'aucun `Intl.NumberFormat` ne produit.
     */
    degreeFormat: string
    /**
     * Décimales des angles. `0` suffit à la navigation ; le relever pour un relevé fin.
     *
     * Commun aux deux à dessein : ils s'affichent côte à côte, et deux précisions
     * différentes suggéreraient que l'un est mieux connu que l'autre.
     */
    degreeDecimals: number
    /**
     * Décimales des coordonnées. **Fixes** (minimum = maximum) : une décimale qui
     * apparaît et disparaît change la largeur du nombre, et le bloc tressaute à
     * chaque frame de déplacement. 5 ≈ 1 m au sol.
     */
    coordDecimals: number
    /** Décimales du zoom — mêmes règles de largeur fixe. */
    zoomDecimals: number
    /**
     * Locale de formatage des coordonnées et du zoom (`'auto'` suit le navigateur).
     *
     * Distincte de `measure.numberLocale` À DESSEIN : une coordonnée WGS84 se lit et
     * se recopie ailleurs (fiche, requête, autre carte), où le point décimal est la
     * convention. Le défaut garde donc le point même sous une interface française,
     * où l'altitude affiche bien « 1,2 km » juste au-dessus.
     */
    numberLocale: string
  }
  /** Moteur de relations (`<RelationLayer>`) : liens vers les markers voisins. */
  relations: {
    /** Titre de la section ajoutée au menu contextuel d'un marker. */
    menuRoot: string
    /** Étiquette d'un lien tant que le temps réel n'est pas revenu. */
    pending: string
    /** Étiquette d'un lien dont le temps réel n'a pas pu être obtenu. */
    unavailable: string
    /** Étiquette nominale d'un lien — `{distance}`, `{duration}` déjà formatés. */
    linkLabel: string
    /** Titre du bloc de presets par rapidité. */
    fastestGroup: string
    /** Preset par rapidité — `{count}`. */
    fastest: string
    /** Titre du bloc de presets par rayon. */
    radiusGroup: string
    /** Preset par rayon — `{radius}` déjà formaté. */
    radius: string
    /** Indice d'un preset : nombre de cibles retenues — `{count}`. */
    targetCount: string
    /** Indice d'un preset dont la sélection dépasse le plafond de calcul — `{count}`. */
    tooWide: string
    /** Indice d'un preset sans aucune cible. */
    noTargets: string
    /** Étiquette agrégée d'un cluster trop fourni pour l'éventail — `{count}`. */
    clusterAggregate: string
    /** Barre d'état : relation active — `{source}`, `{targets}`. */
    statusRelation: string
    /** Barre d'état : effacer la relation (libellé du bouton, visible et aria-label). */
    clear: string
    /** aria-label de la croix d'une étiquette d'itinéraire (referme le tracé). */
    removeRoute: string
    /** Noms des modes de transport (segment cliquable de la barre d'état). */
    modes: {
      DRIVE: string
      WALK: string
      BICYCLE: string
      TWO_WHEELER: string
      TRANSIT: string
    }
  }
  /** Dock des favoris épinglés (`<PinnedDock>`). */
  pinned: {
    /** Invite de la languette d'ajout. */
    add: string
    /** Tooltip affiché en glissant une pastille hors de la dock. */
    remove: string
    /** aria-label du bouton qui replie la dock. */
    collapse: string
    /** aria-label du bouton/pastille qui redéploie la dock. */
    expand: string
    /**
     * Nom de la dock, affiché SUR la poignée quand elle est repliée : c'est alors
     * le seul élément visible, et un chevron seul ne dit pas ce qu'il rouvre.
     */
    title: string
  }
  /** Messages d'erreur développeur. */
  /**
   * Choix de la forme grammaticale d'un dénombrable. Le défaut est la règle
   * FRANÇAISE (`n > 1`), qui est fausse pour l'anglais (0 est pluriel) et très
   * insuffisante pour le polonais ou le russe, qui ont trois formes.
   *
   * Renvoyer `'one'` ou `'other'` — les deux formes que la lib sait rendre. Une
   * langue à trois formes se traite en choisissant celle qui convient le mieux, ou
   * en branchant `Intl.PluralRules`.
   */
  plural: (count: number) => 'one' | 'other'
  errors: {
    /** Hook de la lib appelé hors d'un `<Map>` — le contexte est alors absent. */
    outsideMap: string
    /** `useDrawing()` appelé alors que la couche de dessin est retirée. */
    drawingRequired: string
    /** `useLens()` appelé alors que la loupe est retirée. */
    lensRequired: string
  }
}

export type PartialLabels = DeepPartial<MapLabels>
