function levelIntroPendingKey(slug: string): string {
  return `faultline:intro-pending:v1:${slug}`;
}

/**
 * Marks that the level intro (help card, then briefing) should show on the
 * next mount of the level page. Set by the home screen's Play link so the
 * intro always appears after that click, but consuming the flag on read
 * means a plain refresh of the level page won't re-trigger it.
 */
export function markLevelIntroPending(slug: string): void {
  try {
    window.sessionStorage.setItem(levelIntroPendingKey(slug), "1");
  } catch {
    // Storage may be unavailable (private mode, disabled cookies); the intro
    // simply won't show in that case.
  }
}

export function consumeLevelIntroPending(slug: string): boolean {
  try {
    const key = levelIntroPendingKey(slug);
    const pending = window.sessionStorage.getItem(key) === "1";
    if (pending) window.sessionStorage.removeItem(key);
    return pending;
  } catch {
    return false;
  }
}
