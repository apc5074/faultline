/** Below this zoom, the canvas switches to silhouette glyphs and hidden labels. */
export const SEMANTIC_ZOOM_THRESHOLD = 0.6;

export function isSemanticZoomOut(zoom: number): boolean {
  return zoom < SEMANTIC_ZOOM_THRESHOLD;
}
