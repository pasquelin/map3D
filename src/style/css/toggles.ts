export const CSS_TOGGLES = `
/* ── Liste à toggle partagée : un titre + des rangées « libellé à gauche / case à
   droite ». Utilisée telle quelle par le hub de plugins (ligne « Plugins ») ET par
   les réglages du catalogue (ligne « Catalogue ») du menu Réglages — même mise en
   page, une seule source. Contenu du sous-panneau .m3d-panel.m3d-settings-sub (déjà
   stylé : fond, bordure, ombre, largeur, scroll) — on ne pose ici que la mise en
   page interne. Le nom de rangée est un bouton côté plugins (déplie la config), un
   span dans un label côté catalogue : le même style couvre les deux. */
.m3d-togglelist{display:flex;flex-direction:column;gap:2px}
/* Habillage partagé avec les autres intertitres (cf. CSS_CHASSIS). */
.m3d-togglelist-title{margin:0;padding:2px 6px 6px}
.m3d-togglelist-empty{padding:10px 8px;font-size:12px;color:var(--m3d-muted);text-align:center}
.m3d-togglerow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;
  transition:background .14s}
.m3d-togglerow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-togglerow-name{flex:1;min-width:0;border:none;background:transparent;padding:0;margin:0;
  font-family:inherit;font-size:var(--m3d-size-sm);color:var(--m3d-text);text-align:left;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-togglerow-name:disabled{cursor:default}
/* ── Plugins : corps dépliant sous la rangée + contrôles auto-rendus depuis le schéma (D4). */
.m3d-plugin-row{display:flex;flex-direction:column;border-radius:8px}
.m3d-plugin-row-body{display:flex;flex-direction:column;gap:8px;padding:2px 8px 8px}
.m3d-plugin-config{display:flex;flex-direction:column;gap:8px}
.m3d-plugin-field{display:flex;flex-direction:column;gap:3px;font-size:12px}
.m3d-plugin-field-label{color:var(--m3d-muted);font-size:11px}
.m3d-plugin-number{display:flex;align-items:center;gap:8px}
.m3d-plugin-number input[type='range']{flex:1;accent-color:var(--m3d-accent);cursor:pointer}
.m3d-plugin-number input[type='number']{width:52px;flex:none;padding:3px 5px;
  border:1px solid var(--m3d-border);border-radius:6px;background:transparent;color:var(--m3d-text);
  font:inherit;font-size:11.5px;font-variant-numeric:tabular-nums}
/* box-sizing : un champ texte est en content-box chez le navigateur (contrairement au
   select ou au bouton), donc 100 % de large PLUS sa marge interne et sa bordure — il
   dépassait du sous-panneau, dont le overflow-y ouvrait alors une barre horizontale. */
.m3d-plugin-input,.m3d-plugin-select{width:100%;padding:5px 7px;border:1px solid var(--m3d-border);
  box-sizing:border-box;
  border-radius:7px;background:var(--m3d-bg);color:var(--m3d-text);font:inherit;font-size:11.5px}
.m3d-plugin-select{cursor:pointer}
.m3d-plugin-input:focus-visible,.m3d-plugin-select:focus-visible,
.m3d-plugin-number input:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-plugin-reset{align-self:flex-start;padding:4px 9px;border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-pill);background:transparent;color:var(--m3d-muted);
  font:inherit;font-size:11px;cursor:pointer;transition:background .14s,color .14s}
.m3d-plugin-reset:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
`
