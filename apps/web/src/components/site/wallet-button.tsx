"use client";

import { LogOut, Pencil, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shortAccount, useAccountName } from "@/lib/account-names";
import { NameEditor } from "./account-label";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { ready, accountId, signIn, signOut } = useWallet();
  const name = useAccountName(accountId);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // the name panel closes on a click anywhere else
  useEffect(() => {
    if (!editing) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setEditing(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [editing]);
  if (!ready) return <span className="key key-secondary h-9 w-28 animate-pulse px-4 text-[13px] text-faint">Wallet</span>;
  if (!accountId)
    return (
      <button onClick={() => signIn()} title="Use a NEAR testnet wallet (Meteor, Intear, or Nightly switched to testnet)" className="key key-primary h-9 px-4 text-[13px]">
        <Wallet aria-hidden className="size-4" /> Sign in
      </button>
    );
  return (
    <span ref={box} className="relative flex items-center gap-1">
      {/* the account, by the name its owner gave it here (the id is in the panel and the tooltip) */}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        aria-expanded={editing}
        title={`${accountId} · click to ${name ? "rename" : "name"} it`}
        className={`key key-secondary h-9 max-w-44 px-3.5 text-[12px] ${name ? "" : "font-mono"}`}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">{name ?? shortAccount(accountId)}</span>
        <Pencil aria-hidden className="size-3 shrink-0 opacity-60" />
      </button>
      {editing && (
        <span className="glass absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl p-3 text-left">
          <span className="block text-[12px] font-medium text-fg">{name ? "Rename this account" : "Name this account"}</span>
          <span className="mt-0.5 block font-mono text-[10.5px] break-all text-faint">{accountId}</span>
          <span className="mt-2.5 block">
            <NameEditor accountId={accountId} initial={name ?? ""} onDone={() => setEditing(false)} />
          </span>
          <span className="mt-2 block text-[11px] leading-snug text-muted">Only in this browser. The account id is what Guard and the Vault check.</span>
        </span>
      )}
      <button onClick={() => signOut()} aria-label="Sign out" className="key key-ghost size-9">
        <LogOut aria-hidden className="size-4" />
      </button>
    </span>
  );
}
