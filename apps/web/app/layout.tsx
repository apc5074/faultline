import type { Metadata, Viewport } from "next";
import { Space_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { PageTransitionProvider } from "@/features/page-transition/PageTransitionProvider";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Faultline",
  description: "A daily distributed-systems design game.",
};

export const viewport: Viewport = {
  themeColor: "#f5f0e8",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const webMcpOriginTrialToken = isFaultlineAiEnabled()
    ? process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN
    : undefined;

  return (
    <html lang="en" className={spaceMono.variable}>
      <head>
        {webMcpOriginTrialToken ? (
          <meta httpEquiv="origin-trial" content={webMcpOriginTrialToken} />
        ) : null}
      </head>
      <body className={spaceMono.className}>
        <PageTransitionProvider>{children}</PageTransitionProvider>
      </body>
    </html>
  );
}
