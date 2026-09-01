"use client";

import type { MouseEvent } from "react";

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

export function ScrollToLeaderboardLink() {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    const page = document.querySelector<HTMLElement>(".home-page");
    const target = document.getElementById("today-leaderboard");
    if (!page || !target) return;

    const start = page.scrollTop;
    const destination = target.offsetTop;
    const distance = destination - start;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || Math.abs(distance) < 1) {
      page.scrollTop = destination;
      return;
    }

    const duration = 420;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      page.scrollTop = start + distance * easeOutCubic(progress);
      if (progress < 1) window.requestAnimationFrame(animate);
    };

    window.requestAnimationFrame(animate);
  };

  return (
    <a className="home-page__scroll-cue" href="#today-leaderboard" onClick={handleClick}>
      Today&apos;s leaderboard <span aria-hidden="true">↓</span>
    </a>
  );
}
