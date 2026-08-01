export const CSS_CONFIRM = `
/* ── Dialogue de confirmation (composant Confirm) ── */
/* Modal : au-dessus de TOUT (barres z-ui/menu, markers, poignées d'édition). */
.m3d-confirm-backdrop{position:absolute;inset:0;z-index:var(--m3d-z-modal,1092);pointer-events:auto;
  display:flex;align-items:center;justify-content:center}
.m3d-confirm{box-sizing:border-box;width:min(300px,80%);padding:16px;display:flex;flex-direction:column;gap:14px}
.m3d-confirm-msg{font-size:var(--m3d-size-sm);color:var(--m3d-text);line-height:1.45}
.m3d-confirm-actions{display:flex;gap:8px;justify-content:flex-end}
.m3d-confirm-cancel,.m3d-confirm-ok{padding:7px 14px;border-radius:9px;cursor:pointer;font-family:inherit;
  font-size:var(--m3d-size-sm);border:1px solid var(--m3d-border);background:transparent;color:var(--m3d-text);
  transition:background .14s}
.m3d-confirm-cancel:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-confirm-ok{border-color:transparent;background:var(--m3d-accent);color:#fff}
.m3d-confirm-ok:hover{background:color-mix(in srgb,var(--m3d-accent) 85%,#000)}
.m3d-confirm-danger{background:var(--m3d-error)}
.m3d-confirm-danger:hover{background:color-mix(in srgb,var(--m3d-error) 85%,#000)}
`
