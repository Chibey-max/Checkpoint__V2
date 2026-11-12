"use client";

import { useSyncExternalStore } from "react";
import { config } from "./config";

/**
 * Wakes the hosted agents and Guard before anyone needs them.
 *
 * Both run on a free tier that sleeps after ~15 minutes idle and takes 30-60 s to wake. Nobody visiting the site should
 * have to know that: the first page anyone opens pings both health endpoints, so they're awake by the time a list is
 * sent, and while a tab stays open a light ping every 4 minutes keeps them from dozing off mid-session. The Desk reads
 * the status to show "waking" and to hold a list until both answer.
 *
 * Mock mode (no services) and local services skip all of this.
 */
export type ServiceState = "idle" | "waking" | "ready" | "down";
export interface ServicesStatus {
  agents: ServiceState;
  guard: ServiceState;
  /** when the current wake attempt started, for an elapsed-seconds readout */
  since: number;
}

const WAKE_TIMEOUT_MS = 90_000;
const KEEP_AWAKE_MS = 4 * 60_000;
const hosted = (u: string) => /^https:\/\//.test(u);
const targets = { agents: config.agentsUrl, guard: config.guardUrl } as const;
const enabled = !config.useMock && hosted(config.agentsUrl);

let status: ServicesStatus = { agents: "idle", guard: "idle", since: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<ServicesStatus>) => {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
};

/** One health check: retried until it answers or the wake window runs out (a waking service often 502s first). */
async function ping(name: keyof typeof targets) {
  const until = Date.now() + WAKE_TIMEOUT_MS;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${targets[name]}/v1/health`, { signal: AbortSignal.timeout(Math.max(1_000, until - Date.now())), cache: "no-store" });
      if (r.ok) return set({ [name]: "ready" });
    } catch {}
    await new Promise((r) => setTimeout(r, 3_000));
  }
  set({ [name]: "down" });
}

let waking: Promise<unknown> | null = null;
/** Wakes both services (once at a time). Safe to call from anywhere, as often as you like. */
export function wakeServices(): Promise<unknown> {
  if (!enabled || typeof window === "undefined") return Promise.resolve();
  if (waking) return waking;
  set({
    agents: status.agents === "ready" ? "ready" : "waking",
    guard: status.guard === "ready" ? "ready" : "waking",
    since: Date.now(),
  });
  waking = Promise.all([ping("agents"), ping("guard")]).finally(() => (waking = null));
  return waking;
}

let started = false;
/** Called once from the root layout: wake now, then keep awake while a tab is visible. */
export function startWarmup() {
  if (started || !enabled || typeof window === "undefined") return;
  started = true;
  void wakeServices();
  window.setInterval(() => {
    // a light re-check while someone is on the site, so neither service dozes off mid-session
    if (document.visibilityState === "visible" && !waking) void Promise.all([ping("agents"), ping("guard")]);
  }, KEEP_AWAKE_MS);
}

/** True once both services have answered (always true in mock mode or with local services). */
export const servicesReady = () => !enabled || (status.agents === "ready" && status.guard === "ready");

export function useServices(): ServicesStatus & { enabled: boolean; ready: boolean } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
  return { ...s, enabled, ready: !enabled || (s.agents === "ready" && s.guard === "ready") };
}
