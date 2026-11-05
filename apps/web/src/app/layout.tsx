import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import { TestnetBanner } from "@/components/testnet-banner";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Checkpoint · Procurement Desk",
  description: "AI agents propose purchases. Guard checks them, you approve the exact basket, and the Vault enforces limits on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <WalletProvider>
          <TestnetBanner />
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
