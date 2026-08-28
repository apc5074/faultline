import { ImageResponse } from "next/og";
import { unstable_cache } from "next/cache";

import { getShareCard, ShareCardError, type ShareCardV1 } from "@/lib/share/cards";

export const alt = "Faultline verified result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function Card({ share }: { share: ShareCardV1 }) {
  const underBudget = share.budgetUsd - share.monthlyCostUsd;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "54px 66px", background: "#f5f0e8", color: "#1a1612", fontFamily: "monospace" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 2, textTransform: "uppercase" }}>
        <span>Faultline</span><span>{share.challengeDay} · verified</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 54 }}>
        <span style={{ color: "#8a7f74", fontSize: 22, textTransform: "uppercase" }}>{share.alias} solved</span>
        <span style={{ marginTop: 10, maxWidth: 800, fontSize: 58, fontWeight: 700, lineHeight: 1.05 }}>{share.challengeTitle}</span>
        <span style={{ alignSelf: "flex-start", marginTop: 18, padding: "9px 14px", border: "2px solid #2f6b4f", color: "#2f6b4f", fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>PASSED</span>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 42 }}>
        <Fact label="OFFICIAL SOLVE" value={formatDuration(share.solveTimeMs)} />
        <Fact label="MONTHLY COST" value={`$${formatMoney(share.monthlyCostUsd)}`} />
        <Fact label="UNDER BUDGET" value={`$${formatMoney(Math.abs(underBudget))} ${underBudget >= 0 ? "under" : "over"}`} positive={underBudget >= 0} />
        <Fact label="FASTEST / CHEAPEST" value={`#${share.fastestRank ?? "—"} / #${share.cheapestRank ?? "—"}`} />
      </div>
      <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", color: "#8a7f74", fontSize: 18 }}>
        <span>Budget ceiling ${formatMoney(share.budgetUsd)}</span>
        <span>p95 latency {share.latencyP95Ms === undefined ? "—" : `${share.latencyP95Ms} ms`} · Headroom {share.headroom === undefined ? "—" : formatPercent(share.headroom)}</span>
      </div>
    </div>
  );
}

function Fact({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div style={{ display: "flex", flexDirection: "column", minWidth: 210, padding: "14px 16px", background: "#ede7d9" }}><span style={{ color: "#8a7f74", fontSize: 16 }}>{label}</span><span style={{ marginTop: 7, color: positive ? "#2f6b4f" : "#1a1612", fontSize: 27, fontWeight: 700 }}>{value}</span></div>;
}

export default async function OpenGraphImage({ params }: { params: Promise<{ shareId: string }> }) {
  try {
    const shareId = (await params).shareId;
    const share = await unstable_cache(() => getShareCard(shareId), ["share-card", shareId], { revalidate: 3600 })();
    return new ImageResponse(<Card share={share} />, { ...size });
  } catch (error) {
    const status = error instanceof ShareCardError && error.code === "not_found" ? 404 : 500;
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8", color: "#1a1612", fontFamily: "monospace", fontSize: 30 }}>Faultline result unavailable</div>, { ...size, status });
  }
}
