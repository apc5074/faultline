const LEVEL_INTRO_PENDING_KEY = "faultline:level1:intro-pending:v1";

/**
 * Marks that the level intro (help card, then briefing) should show on the
 * next mount of the level page. Set by the home screen's Play link so the
 * intro always appears after that click, but consuming the flag on read
 * means a plain refresh of the level page won't re-trigger it.
 */
export function markLevelIntroPending(): void {
  try {
    window.sessionStorage.setItem(LEVEL_INTRO_PENDING_KEY, "1");
  } catch {
    // Storage may be unavailable (private mode, disabled cookies); the intro
    // simply won't show in that case.
  }
}

export function consumeLevelIntroPending(): boolean {
  try {
    const pending = window.sessionStorage.getItem(LEVEL_INTRO_PENDING_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(LEVEL_INTRO_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}
