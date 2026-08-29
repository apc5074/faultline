"use client";

import { useEffect, useState } from "react";

const FIRST_RUN_SEEN_KEY = "faultline.level1.firstrun.seen";

/** A once-per-browser reminder that appears only after a verdict has landed. */
export function FirstRunCoachHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(FIRST_RUN_SEEN_KEY) !== "1");
    } catch {
      // Storage can be unavailable in private or embedded browser contexts.
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(FIRST_RUN_SEEN_KEY, "1");
    } catch {
      // The local state still honors dismissal for this mounted result plate.
    }
    setVisible(false);
  };

  return (
    <div className="first-run-coach-hint-slot">
      {visible ? (
        <aside className="first-run-coach-hint" aria-label="First run guidance">
          <p>Watch the run → read the evidence → adjust your design → Run again → Submit official when everything passes.</p>
          <button type="button" onClick={dismiss} aria-label="Dismiss first run guidance">×</button>
        </aside>
      ) : null}
    </div>
  );
}
