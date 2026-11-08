import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { GeistSerif } from "geist/font/serif";
import { Cinzel, Cormorant_Garamond, Parisienne } from "next/font/google";
import { Atmosphere } from "@/components/site/atmosphere";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { Intro } from "@/components/site/intro";
import { TestnetStrip } from "@/components/site/testnet-strip";
import { Spotlight } from "@/components/ui/spotlight";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

/** The hero's handwriting. next/font downloads it at build time and serves it from this site. */
const script = Parisienne({ weight: "400", subsets: ["latin"], variable: "--font-script-face", display: "swap" });
/** Display headings: a banknote serif. */
const display = Cormorant_Garamond({ weight: ["500", "600"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-display-face", display: "swap" });
/** Engraved labels: Roman capitals, like the lettering on a vault door or a bank's brass plate. */
const engrave = Cinzel({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-engrave-face", display: "swap" });

export const metadata: Metadata = {
  title: "Checkpoint · Procurement Desk",
  description: "AI agents propose purchases. Guard checks every offer, you approve the exact basket, and the Vault enforces your limits on NEAR.",
};

/** Sets the theme before first paint (no flash). `?theme=light|dark` overrides and persists, handy for demos and screenshots. */
const THEME_SCRIPT = `try{var q=new URLSearchParams(location.search).get("theme");if(q==="light"||q==="dark")localStorage.setItem("cp-theme",q);var t=localStorage.getItem("cp-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;
/**
 * Decides before first paint whether the intro plays: once per session, never with reduced motion.
 * `?intro=1` replays it, `?intro=0` skips it (for screenshots); reduced motion wins over both.
 */
const INTRO_SCRIPT = `try{var i=new URLSearchParams(location.search).get("intro");if(i==="0")sessionStorage.setItem("cp-intro","1");var play=!matchMedia("(prefers-reduced-motion: reduce)").matches&&(i==="1"||!sessionStorage.getItem("cp-intro"));document.documentElement.dataset.intro=play?"play":"skip"}catch(e){document.documentElement.dataset.intro="skip"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSerif.variable} ${script.variable} ${display.variable} ${engrave.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + INTRO_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <Intro />
        <WalletProvider>
          <Atmosphere />
          <Spotlight />
          <TestnetStrip />
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
