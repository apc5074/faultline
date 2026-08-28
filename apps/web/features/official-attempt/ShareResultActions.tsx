"use client";

import { useState } from "react";

type ShareResponse =
  | { ok: true; share: { shareId: string } }
  | { ok: false; error: string; code: string };

export function ShareResultActions({ submissionId, enabled }: { submissionId: string; enabled: boolean }) {
  const [shareId, setShareId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "copied" | "error">("idle");
  const shareUrl = shareId ? `/s/${shareId}` : null;

  async function mint() {
    setStatus("pending");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const body = (await response.json()) as ShareResponse;
      if (!body.ok) throw new Error(body.error);
      setShareId(body.share.shareId);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setShareId(null);
      return error;
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(shareUrl, window.location.origin).toString());
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  if (!enabled) return null;
  if (!shareId) {
    return (
      <div className="official-scorecard__share-actions">
        <button type="button" className="official-scorecard__share" onClick={() => void mint()} disabled={status === "pending"}>
          {status === "pending" ? "Preparing share…" : "Share result"}
        </button>
        {status === "error" ? <p className="official-scorecard__share-status" role="status">Could not prepare the share link. Your verified result is still safe.</p> : null}
      </div>
    );
  }

  return (
    <div className="official-scorecard__share-actions">
      <div className="official-scorecard__share-buttons">
        <button type="button" className="official-scorecard__share" onClick={() => void copy()}>{status === "copied" ? "Link copied" : "Copy link"}</button>
        <a className="official-scorecard__share-link" href={`/s/${shareId}`} target="_blank" rel="noreferrer">Open preview ↗</a>
        <a className="official-scorecard__share-link" href={`/s/${shareId}/opengraph-image`} download={`faultline-${shareId}.png`}>Save image ↓</a>
      </div>
      <p className="official-scorecard__share-url">{shareUrl}</p>
    </div>
  );
}
