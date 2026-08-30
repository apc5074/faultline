"use client";

import type { MouseEvent, ReactNode } from "react";

import { useTransitionLinkClick } from "@/features/page-transition/PageTransitionProvider";
import { markLevelIntroPending } from "@/features/architecture-canvas/level-intro-storage";

const LEVEL_ONE_HREF = "/level/1?intro=1";

export function PlayLevelLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const handleClick = useTransitionLinkClick(LEVEL_ONE_HREF);

  return (
    <a
      className={className}
      href={LEVEL_ONE_HREF}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        markLevelIntroPending();
        handleClick(event);
      }}
    >
      {children}
    </a>
  );
}
