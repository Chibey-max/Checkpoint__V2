"use client";

import { LogOut, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { ready, accountId, signIn, signOut } = useWallet();
  if (!ready) return <span className="text-xs text-white/50">Loading wallet…</span>;
  if (!accountId)
    return (
      <button onClick={() => signIn()} className="inline-flex items-center gap-1.5 rounded-md bg-blue px-3 py-1.5 text-sm font-medium hover:bg-blue/90">
        <Wallet aria-hidden className="size-4" /> Sign in
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="max-w-48 truncate rounded bg-white/10 px-2 py-1 font-mono text-xs" title={accountId}>
        {accountId}
      </span>
      <button onClick={() => signOut()} aria-label="Sign out" className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
        <LogOut aria-hidden className="size-4" />
      </button>
    </span>
  );
}
