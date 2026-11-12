"use client";

import { useEffect, useState } from "react";

/**
 * Names people give their own accounts, so "55d149b6…be9e89b3" can read as "My test wallet".
 *
 * A name is a private label kept in this browser only (localStorage, keyed by account id): it never leaves the device,
 * isn't on chain and means nothing to anyone else. The account id is always shown next to it, because the id is what
 * the Vault and Guard actually check.
 */
const KEY = (accountId: string) => `cp-name:${accountId}`;
const EVENT = "cp-names";
export const NAME_MAX = 32;

export function getAccountName(accountId: string): string | null {
  try {
    return localStorage.getItem(KEY(accountId));
  } catch {
    return null;
  }
}

/** Saves a trimmed name (at most NAME_MAX characters); an empty one removes it. */
export function setAccountName(accountId: string, name: string) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  try {
    if (clean) localStorage.setItem(KEY(accountId), clean);
    else localStorage.removeItem(KEY(accountId));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** The name for an account, kept in step across components and tabs. */
export function useAccountName(accountId: string | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId) return setName(null);
    const read = () => setName(getAccountName(accountId));
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [accountId]);
  return name;
}

/** A readable form of an account id: implicit (64 hex) ids and other long ones keep their ends. */
export function shortAccount(accountId: string): string {
  if (/^[0-9a-f]{64}$/.test(accountId)) return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
  return accountId.length > 28 ? `${accountId.slice(0, 14)}…${accountId.slice(-10)}` : accountId;
}
