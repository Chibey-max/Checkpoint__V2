import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Wallet check", robots: { index: false } };

/**
 * The day-1 wallet check (P-0.3) is a team tool, not part of the product: it is a 404 on the live site unless
 * ENABLE_WALLET_CHECK=1 is set. Local development always has it.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_WALLET_CHECK !== "1") notFound();
  return children;
}
