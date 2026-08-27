"use client";

import type { ReactNode } from "react";

import { useTransitionLinkClick } from "@/features/page-transition/PageTransitionProvider";

const LEVEL_ONE_HREF = "/level/1?brief=1";

export function PlayLevelLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const handleClick = useTransitionLinkClick(LEVEL_ONE_HREF);

  return (
    <a className={className} href={LEVEL_ONE_HREF} onClick={handleClick}>
      {children}
    </a>
  );
}
