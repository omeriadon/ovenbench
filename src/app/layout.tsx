import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "OvenBench — Cookie Chain transaction benchmark",
  description:
    "Measure real Cookie Chain confirmation latency with signed on-chain transactions and verifiable Cookiescan receipts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
