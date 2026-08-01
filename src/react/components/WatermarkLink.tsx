import { WATERMARK_ARIA, WATERMARK_HREF, WATERMARK_TEXT } from '../../core/watermark/constants'

/**
 * Doublon CLIQUABLE de la signature « map3D ».
 *
 * Le mark VISIBLE est peint dans le canvas WebGL (`Watermark`, non supprimable en
 * CSS/DOM) ; ce lien n'est qu'une **zone de clic transparente** posée au même endroit,
 * qui ouvre le dépôt et sa licence. Le masquer en CSS n'enlève que l'affordance de
 * clic — jamais les pixels. Il se pose dans le coin, comme `CameraReadout`, donc ne
 * dispute sa place à aucune barre.
 *
 * Le texte est présent (couleur transparente) pour que la zone épouse exactement la
 * marque peinte ; `aria-label` porte l'intitulé lu par les lecteurs d'écran.
 */
export function WatermarkLink() {
  return (
    <a
      className="m3d-watermark"
      href={WATERMARK_HREF}
      target="_blank"
      // `license` : la relation dit que la cible porte les conditions d'usage.
      rel="noopener noreferrer license"
      aria-label={WATERMARK_ARIA}
    >
      {WATERMARK_TEXT}
    </a>
  )
}
