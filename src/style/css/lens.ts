import { LENS_PANEL_W } from '../panelGeometry'

export const CSS_LENS = `
/* ── Loupe (LensLayer) : zone d'inspection + panneau d'inventaire ─────────────── */
/* Curseur de tracé, seulement tant qu'aucune zone n'existe (phase de dessin). */
.m3d-root.m3d-lensing canvas{cursor:crosshair}
/* Zone : cadre marching-ants déplaçable (corps) + redimensionnable (poignées).
   Fenêtre écran 2D. Le cadre lui-même réutilise les classes partagées
   .m3d-marquee-under / .m3d-marquee du sélecteur (voir plus haut) — la loupe ne
   définit donc que sa géométrie et ses affordances propres. */
/* Sommet du plan CARTE, pas du plan UI : la zone vit dans .m3d-overlay, donc emprunter
   --m3d-z-ui n'y changeait rien (le contexte la borne) mais laissait croire qu'elle
   rivalisait avec les barres. C'est ce genre d'emprunt qui a fait passer les poignées
   d'édition devant les panneaux. */
.m3d-lenszone{position:absolute;z-index:calc(var(--m3d-z-list-menu,96) + 1);box-sizing:border-box;pointer-events:auto;cursor:move}
.m3d-lenszone-preview{pointer-events:none;cursor:default}
/* Barre espace maintenue : le rectangle (et ses poignées) devient traversant →
   le glissé atteint la carte et la déplace, où que soit le curseur. */
.m3d-root.m3d-space-pan .m3d-lenszone,
.m3d-root.m3d-space-pan .m3d-lenszone *{pointer-events:none!important}
.m3d-lenszone-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
/* Croix de fermeture (haut-droite), neutre — pas de pastille pleine « stop ». */
.m3d-lenszone-x{position:absolute;top:-11px;right:-11px;width:22px;height:22px;z-index:2;
  display:flex;align-items:center;justify-content:center;border-radius:50%;padding:0;cursor:pointer}
.m3d-lenszone-x:hover{background:color-mix(in srgb,var(--m3d-text) 10%,var(--m3d-panel))}
/* Poignées : mêmes tokens --m3d-handle-* que .m3d-handle (le sélecteur), y compris
   au survol — seules les PROPRIÉTÉS diffèrent (span DOM ici, rect SVG là-bas). */
.m3d-lenszone-h{position:absolute;width:11px;height:11px;box-sizing:border-box;transform:translate(-50%,-50%);
  background:var(--m3d-handle-bg);border:var(--m3d-handle-line-w) solid var(--m3d-handle-line);
  border-radius:2px;pointer-events:auto;z-index:1;box-shadow:var(--m3d-handle-shadow)}
.m3d-lenszone-h:hover{background:var(--m3d-accent);border-color:var(--m3d-handle-bg)}
/* Panneau d'inventaire, ancré à droite de la zone (position inline via le hook). */
/* Panneau de la loupe : position posée en inline (il suit la zone), d'où l'absence
   de top/right ici — seules sa largeur et sa borne de débordement le distinguent. */
.m3d-lenshud{max-width:min(60%,360px)}
.m3d-lenspanel{--m3d-panel-w:var(--m3d-lens-panel-w, ${LENS_PANEL_W}px)}
.m3d-lensempty{padding:14px 8px;text-align:center;color:var(--m3d-muted);font-size:12px}
`
