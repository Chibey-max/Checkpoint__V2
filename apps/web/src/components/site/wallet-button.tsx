"use client";

import { LogOut, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { ready, accountId, signIn, signOut } = useWallet();
  if (!ready) return <span className="key key-secondary h-9 w-28 animate-pulse px-4 text-[13px] text-faint">Wallet</span>;
  if (!accountId)
    return (
      <button onClick={() => signIn()} className="key key-primary h-9 px-4 text-[13px]">
        <Wallet aria-hidden className="size-4" /> Sign in
      </button>
    );
  return (
    <span className="flex items-center gap-1">
      <span className="key key-secondary h-9 max-w-44 px-3.5 font-mono text-[12px]" title={accountId}>
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">{accountId}</span>
      </span>
      <button onClick={() => signOut()} aria-label="Sign out" className="key key-ghost size-9">
        <LogOut aria-hidden className="size-4" />
      </button>
    </span>
  );
}
