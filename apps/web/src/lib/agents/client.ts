import { config } from "../config";
import { mockClient } from "./mock";
import { EVENT_TYPES, type AgentEvent, type AgentsClient, type CatalogItem } from "./types";

/** The real agents service (PRD §11.5, port 8788). Every call goes through here; the UI never builds URLs. */
const live: AgentsClient = {
  mode: "live",
  async catalog() {
    const r = await fetch(`${config.agentsUrl}/v1/catalog`);
    if (!r.ok) throw new Error(`catalog: ${r.status}`);
    return (await r.json()) as CatalogItem[];
  },
  async createRequest(input) {
    const r = await fetch(`${config.agentsUrl}/v1/requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error(`Couldn't create the request (${r.status}). Is the agents service running?`);
    return (await r.json()) as { request_id: string };
  },
  subscribe(id, onEvent, onError) {
    // EventSource resends Last-Event-ID itself on reconnect; a fresh page gets the full replay (FR-AG02).
    const es = new EventSource(`${config.agentsUrl}/v1/requests/${id}/events`);
    let last = 0;
    const handle = (m: MessageEvent<string>) => {
      try {
        const e = JSON.parse(m.data) as AgentEvent;
        if (e.seq <= last) return;
        last = e.seq;
        onEvent(e);
      } catch {
        onError?.("Received an event the app couldn't read.");
      }
    };
    es.onmessage = handle;
    for (const t of EVENT_TYPES) es.addEventListener(t, handle as EventListener);
    es.onerror = () => onError?.("Lost the live connection to the agents service. Retrying…");
    return () => es.close();
  },
  async acknowledge(id, offerIds) {
    const r = await fetch(`${config.agentsUrl}/v1/requests/${id}/acknowledge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer_ids: offerIds }) });
    if (!r.ok) throw new Error(`acknowledge: ${r.status}`);
  },
  async cancel(id) {
    await fetch(`${config.agentsUrl}/v1/requests/${id}/cancel`, { method: "POST" });
  },
};

export const agents: AgentsClient = config.useMock ? mockClient : live;

// Request history is per browser: the PRD has no list endpoint, so the desk keeps its own index.
const HIST = "cp-requests";
export interface HistoryEntry {
  id: string;
  text: string;
  created: number;
  owner: string;
}
export function history(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HIST) ?? "[]");
  } catch {
    return [];
  }
}
export function remember(e: HistoryEntry) {
  localStorage.setItem(HIST, JSON.stringify([e, ...history().filter((h) => h.id !== e.id)].slice(0, 20)));
}
