import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getShareCard, ShareCardError, type ShareCardV1 } from "@/lib/share/cards";

type SharePageProps = { params: Promise<{ shareId: string }> };

async function loadShare(params: SharePageProps["params"]): Promise<ShareCardV1> {
  try {
    return await getShareCard((await params).shareId);
  } catch (error) {
    if (error instanceof ShareCardError) notFound();
    notFound();
  }
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const share = await loadShare(params);
  const title = `${share.alias} passed ${share.challengeTitle} · Faultline`;
  const description = `Verified pass in ${formatDuration(share.solveTimeMs)} at $${formatMoney(share.monthlyCostUsd)}/mo — fastest #${share.fastestRank ?? "—"}, cheapest #${share.cheapestRank ?? "—"}.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `/s/${share.shareId}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/s/${share.shareId}/opengraph-image`] },
  };
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

export default async function SharePage({ params }: SharePageProps) {
  const share = await loadShare(params);
  const underBudget = share.budgetUsd - share.monthlyCostUsd;

  return (
    <main className="share-page">
      <article className="share-card" aria-labelledby="share-card-title">
        <header className="share-card__header">
          <span className="share-card__wordmark">Faultline</span>
          <span className="share-card__day">{share.challengeDay} · verified result</span>
        </header>
        <section className="share-card__hero">
          <p className="share-card__eyebrow">{share.alias} solved</p>
          <h1 id="share-card-title">{share.challengeTitle}</h1>
          <span className="share-card__badge">PASSED</span>
        </section>
        <dl className="share-card__facts">
          <div><dt>Official solve</dt><dd>{formatDuration(share.solveTimeMs)}</dd></div>
          <div><dt>Monthly cost</dt><dd>${formatMoney(share.monthlyCostUsd)}</dd></div>
          <div><dt>Budget ceiling</dt><dd>${formatMoney(share.budgetUsd)}</dd></div>
          <div><dt>Under budget</dt><dd className={underBudget >= 0 ? "share-card__positive" : "share-card__negative"}>${formatMoney(Math.abs(underBudget))} {underBudget >= 0 ? "under" : "over"}</dd></div>
          <div><dt>Fastest rank</dt><dd>#{share.fastestRank ?? "—"}</dd></div>
          <div><dt>Cheapest rank</dt><dd>#{share.cheapestRank ?? "—"}</dd></div>
        </dl>
        <details className="share-card__evidence">
          <summary>Verified margins</summary>
          <p>p95 latency: {share.latencyP95Ms === undefined ? "—" : `${share.latencyP95Ms} ms`} / target {share.latencyTargetMs === undefined ? "—" : `${share.latencyTargetMs} ms`}</p>
          <p>Headroom: {share.headroom === undefined ? "—" : formatPercent(share.headroom)} / target {share.headroomTarget === undefined ? "—" : formatPercent(share.headroomTarget)}</p>
        </details>
        <footer className="share-card__footer">
          <span>Server-verified. Architecture stays private.</span>
          <Link href="/">Play today&apos;s Faultline <span aria-hidden="true">→</span></Link>
        </footer>
      </article>
    </main>
  );
}
