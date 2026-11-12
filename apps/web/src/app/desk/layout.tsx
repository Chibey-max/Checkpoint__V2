import type { Metadata } from "next";

export const metadata: Metadata = { title: "Procurement desk" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
