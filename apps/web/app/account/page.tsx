import { Suspense } from "react";
import Link from "next/link";

import { AccountAuthPlate } from "@/features/account/AccountAuthPlate";
import { AccountHistoryPanel } from "@/features/account/AccountHistoryPanel";
import { AccountStreakPanel } from "@/features/account/AccountStreakPanel";
import { AuthCallbackNotice } from "@/features/account/AuthCallbackNotice";

export default function AccountPage() {
  return (
    <main className="account-page">
      <header className="account-page__header">
        <Link className="account-page__wordmark" href="/">
          Faultline
        </Link>
        <AccountAuthPlate nextPath="/account" />
      </header>

      <Suspense fallback={null}>
        <AuthCallbackNotice />
      </Suspense>

      <Suspense fallback={<p className="account-history__status">Loading streak…</p>}>
        <AccountStreakPanel />
      </Suspense>

      <Suspense fallback={<p className="account-history__status">Loading history…</p>}>
        <AccountHistoryPanel />
      </Suspense>
    </main>
  );
}
