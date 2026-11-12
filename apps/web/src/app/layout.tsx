import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { Atmosphere } from "@/components/site/atmosphere";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { Intro } from "@/components/site/intro";
import { ServiceWarmup } from "@/components/site/service-warmup";
import { Spotlight } from "@/components/ui/spotlight";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

/*
 * Fonts are self-hosted (src/fonts, SIL OFL 1.1) so dev and builds never depend on
 * fonts.googleapis.com; a slow or offline connection used to fall back to default fonts.
 */
/** The hero's handwriting. */
const script = localFont({ src: "../fonts/parisienne-latin-400-normal.woff2", weight: "400", variable: "--font-script-face", display: "swap" });
/** Display headings: a banknote serif. */
const display = localFont({
  src: [
    { path: "../fonts/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-display-face",
  display: "swap",
});
/** The hero's lede under the handwritten headline: a refined sans, so the script stays the only flourish. */
const lede = localFont({
  src: [
    { path: "../fonts/raleway-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/raleway-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-lede-face",
  display: "swap",
});
/** Engraved labels: Roman capitals, like the lettering on a vault door or a bank's brass plate. */
const engrave = localFont({
  src: [
    { path: "../fonts/cinzel-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cinzel-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-engrave-face",
  display: "swap",
});

/** viewport-fit=cover, so the phone dock can sit just above the home indicator (env(safe-area-inset-bottom)). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://checkpoint-eight-dusky.vercel.app";
const DESCRIPTION = "AI agents propose purchases. Guard checks every offer, you approve the exact basket, and the Vault enforces your limits on NEAR.";

/** Each page sets its own title through the template; the link preview (app/opengraph-image.png) is the vault door. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Checkpoint · A spending firewall for AI agents", template: "%s · Checkpoint" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Checkpoint", title: "Checkpoint · A spending firewall for AI agents", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "Checkpoint · A spending firewall for AI agents", description: DESCRIPTION },
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
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${script.variable} ${display.variable} ${engrave.variable} ${lede.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + INTRO_SCRIPT }} />
      </head>
      <body className="min-h-screen max-md:pb-[calc(112px+env(safe-area-inset-bottom))]">
        <Intro />
        <ServiceWarmup />
        <WalletProvider>
          <Atmosphere />
          <Spotlight />
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
