"use client";

import type { NearConnector } from "@hot-labs/near-connect";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { Tx } from "./tx";

interface WalletState {
  ready: boolean;
  accountId: string | null;
  walletName: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Signs with the connected wallet and waits for the final outcome. Throws on rejection or failure. */
  send: (tx: Tx) => Promise<unknown>;
}

const Ctx = createContext<WalletState | null>(null);

/**
 * NEAR Connect on testnet (FR-UI01). No limited-access key at sign-in: every call that matters
 * attaches 1 yocto, which forces a full-access signature in the wallet anyway.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Loaded on the client only: the connector uses window, iframes and IndexedDB.
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({
        network: config.network === "sandbox" ? "testnet" : config.network,
        providers: { testnet: [config.rpcUrl] },
        features: { testnet: true, signAndSendTransaction: true },
        autoConnect: true,
      });
      connector.current = c;
      c.on("wallet:signIn", (e) => {
        setAccountId(e.accounts[0]?.accountId ?? null);
        setWalletName(e.wallet.manifest?.name ?? null);
      });
      c.on("wallet:signOut", () => {
        setAccountId(null);
        setWalletName(null);
      });
      try {
        const { wallet, accounts } = await c.getConnectedWallet();
        if (!cancelled) {
          setAccountId(accounts[0]?.accountId ?? null);
          setWalletName(wallet.manifest?.name ?? null);
        }
      } catch {
        // Not signed in yet.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      connector.current?.removeAllListeners();
    };
  }, []);

  const signIn = useCallback(async () => {
    await connector.current?.connect();
  }, []);

  const signOut = useCallback(async () => {
    await connector.current?.disconnect();
  }, []);

  const send = useCallback(
    async (tx: Tx) => {
      const c = connector.current;
      if (!c || !accountId) throw new Error("Sign in with your wallet first.");
      const wallet = await c.wallet();
      return wallet.signAndSendTransaction({ network: "testnet", signerId: accountId, receiverId: tx.receiverId, actions: tx.actions });
    },
    [accountId],
  );

  return <Ctx.Provider value={{ ready, accountId, walletName, signIn, signOut, send }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}
