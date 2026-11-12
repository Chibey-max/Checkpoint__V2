"use client";

import { LogOut, Pencil, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shortAccount, useAccountName } from "@/lib/account-names";
import { NameEditor } from "./account-label";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { ready, accountId, signIn, signOut } = useWallet();
  const name = useAccountName(accountId);
  // the account panel: closed, a small menu (name, id, rename, sign out), or the name editor
  const [panel, setPanel] = useState<"closed" | "menu" | "edit">("closed");
  const editing = panel !== "closed";
  const setEditing = (open: boolean) => setPanel(open ? "menu" : "closed");
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
        onClick={() => setEditing(!editing)}
        aria-expanded={editing}
        aria-haspopup="menu"
        title={accountId}
        className={`key key-secondary h-9 max-w-44 px-3.5 text-[12px] max-sm:max-w-36 max-sm:px-3 ${name ? "" : "font-mono"}`}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">{name ?? shortAccount(accountId)}</span>
        <Pencil aria-hidden className="size-3 shrink-0 opacity-60 max-sm:hidden" />
      </button>
      {editing && (
        <span className="glass absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl p-3 text-left max-sm:fixed max-sm:inset-x-3 max-sm:top-[78px] max-sm:mt-0 max-sm:w-auto">
          <span className="block truncate text-[13px] font-medium text-fg">{name ?? "Your account"}</span>
          <span className="mt-0.5 block font-mono text-[10.5px] break-all text-faint">{accountId}</span>
          {panel === "edit" ? (
            <>
              <span className="mt-2.5 block">
                <NameEditor accountId={accountId} initial={name ?? ""} onDone={() => setPanel("menu")} />
              </span>
              <span className="mt-2 block text-[11px] leading-snug text-muted">Only in this browser. The account id is what Guard and the Vault check.</span>
            </>
          ) : (
            <span className="mt-3 flex gap-2">
              <button type="button" onClick={() => setPanel("edit")} className="key key-secondary h-9 flex-1 px-3 text-[12.5px]">
                <Pencil aria-hidden className="size-3.5" /> {name ? "Rename" : "Add a name"}
              </button>
              <button type="button" onClick={() => signOut()} className="key key-secondary h-9 flex-1 px-3 text-[12.5px]">
                <LogOut aria-hidden className="size-3.5" /> Sign out
              </button>
            </span>
          )}
        </span>
      )}
      <button onClick={() => signOut()} aria-label="Sign out" className="key key-ghost size-9 max-sm:hidden!">
        <LogOut aria-hidden className="size-4" />
      </button>
    </span>
  );
}
