"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type TransitionPhase = "idle" | "covering" | "covered" | "revealing";

const PageTransitionContext = createContext<(href: string) => void>(() => {});

export function usePageTransitionNavigate() {
  return useContext(PageTransitionContext);
}

/**
 * Intercepts a plain anchor click and routes it through the ink-wipe
 * transition. Modifier clicks (new tab, etc.) fall through to default.
 */
export function useTransitionLinkClick(href: string) {
  const navigateWithTransition = usePageTransitionNavigate();

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      navigateWithTransition(href);
    },
    [href, navigateWithTransition],
  );
}

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const pendingPathRef = useRef<string | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const navigationCommittedRef = useRef(false);

  const navigate = useCallback(
    (href: string) => {
      if (pendingPathRef.current) return;

      const targetPath = new URL(href, window.location.origin).pathname;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (targetPath === pathname || reduceMotion) {
        router.push(href);
        return;
      }

      pendingPathRef.current = targetPath;
      pendingHrefRef.current = href;
      navigationCommittedRef.current = false;
      // Start loading the destination while the current screen is still
      // visible. The cover animation is then the loading state, not a reveal
      // that races the new page's first paint.
      router.prefetch(href);
      setPhase("covering");
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!pendingPathRef.current || pathname !== pendingPathRef.current) return;
    navigationCommittedRef.current = true;
    setPhase((current) => (current === "covered" ? "revealing" : current));
  }, [pathname]);

  useEffect(() => {
    if (phase === "covered" && navigationCommittedRef.current) {
      setPhase("revealing");
    }
  }, [phase]);

  const handlePanelAnimationEnd = () => {
    if (phase === "covering") {
      setPhase("covered");
      const href = pendingHrefRef.current;
      if (href) router.push(href);
    } else if (phase === "revealing") {
      pendingPathRef.current = null;
      pendingHrefRef.current = null;
      navigationCommittedRef.current = false;
      setPhase("idle");
    }
  };

  return (
    <PageTransitionContext.Provider value={navigate}>
      {children}
      {phase !== "idle" ? (
        <div className="page-transition" data-phase={phase} aria-hidden="true">
          <div
            className="page-transition__panel"
            onAnimationEnd={handlePanelAnimationEnd}
          />
        </div>
      ) : null}
    </PageTransitionContext.Provider>
  );
}
