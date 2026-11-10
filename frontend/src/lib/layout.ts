// Shell layout math (pure, unit-testable). See docs/HOW_IT_WORKS.md "Responsive layout".
//
//   mode     = mobile  if vw < 768      (sidebar -> drawer, copilot -> full-screen sheet)
//            = rail    if vw < 1280     (56px icon rail)
//            = full    otherwise        (208px labelled sidebar)
//   panel    = clamp(userWidth ?? 0.30 * vw, 340, min(760, vw))
//   dock     = mode != mobile  AND  vw - sidebar - panel >= 640
//              i.e. the copilot sits beside the content only if the content keeps >= 640px;
//              otherwise it slides over the content as a sheet.

export const BP_MOBILE = 768;
export const BP_FULL = 1280;
export const SIDEBAR_FULL = 208;
export const SIDEBAR_RAIL = 56;
export const MIN_CONTENT = 640;
export const PANEL_MIN = 340;
export const PANEL_MAX = 760;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeLayout(vw: number, userPanelW: number | null) {
  const mode = vw < BP_MOBILE ? "mobile" : vw < BP_FULL ? "rail" : "full";
  const sidebar = mode === "mobile" ? 0 : mode === "rail" ? SIDEBAR_RAIL : SIDEBAR_FULL;
  const panel = clamp(userPanelW ?? Math.round(0.3 * vw), PANEL_MIN, Math.min(PANEL_MAX, vw));
  const dock = mode !== "mobile" && vw - sidebar - panel >= MIN_CONTENT;
  return { mode, sidebar, panel, dock } as const;
}
