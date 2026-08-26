import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Faultline",
  description: "A daily distributed-systems design game.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const webMcpOriginTrialToken = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN;

  return (
    <html lang="en">
      <head>
        {webMcpOriginTrialToken ? (
          <meta httpEquiv="origin-trial" content={webMcpOriginTrialToken} />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
