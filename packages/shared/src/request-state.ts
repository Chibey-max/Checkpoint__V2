/**
 * Request state derived purely from the SSE event log. The agents service
 * stores events and derives state with this reducer, and the web app runs the
 * same reducer on the stream, so a page refresh (full replay) renders the same.
 */
import type { AgentEvent, AgentEventData, RequestState } from './api';
import type {
  BasketDraft,
  Constraints,
  Finding,
  ItemRequest,
  Offer,
  Payout,
  SignedBasket,
  Unmatched,
  Verdict,
} from './schemas';

export interface RequestView {
  request_id: string | null;
  owner_id: string | null;
  text: string;
  constraints: Constraints;
  state: RequestState;
  parser: 'deterministic' | 'llm' | null;
  items: ItemRequest[];
  unmatched: Unmatched[];
  offers: Offer[];
  verdicts: Record<string, Verdict>;
  medians: Record<string, string | null>;
  basket: BasketDraft | null;
  acknowledged_offer_ids: string[];
  needs_ack: { offer_ids: string[]; reasons: { offer_id: string; findings: Finding[] }[] } | null;
  signed:
    | (SignedBasket & { basket_id: string; payouts: Payout[]; total: string; findings: Finding[] })
    | null;
  refusal: AgentEventData<'guard.refused'> | null;
  approval: {
    hash_hex: string;
    expires_at_ms: number;
    owner_id: string | null;
    status: 'waiting' | 'seen' | 'expired';
  } | null;
  settlement: {
    tx_hash: string | null;
    payouts: AgentEventData<'settlement.payout'>[];
    final_status: AgentEventData<'settlement.final'>['status'] | null;
  };
  explanations: {
    verdicts: Record<string, AgentEventData<'explain.verdict'>>;
    basket: AgentEventData<'explain.basket'> | null;
  };
  errors: AgentEventData<'error'>[];
  last_seq: number;
}

export function initialRequestView(): RequestView {
  return {
    request_id: null,
    owner_id: null,
    text: '',
    constraints: {},
    state: 'created',
    parser: null,
    items: [],
    unmatched: [],
    offers: [],
    verdicts: {},
    medians: {},
    basket: null,
    acknowledged_offer_ids: [],
    needs_ack: null,
    signed: null,
    refusal: null,
    approval: null,
    settlement: { tx_hash: null, payouts: [], final_status: null },
    explanations: { verdicts: {}, basket: null },
    errors: [],
    last_seq: 0,
  };
}

const TERMINAL: RequestState[] = ['final', 'refused', 'expired', 'cancelled'];

export function isTerminal(state: RequestState): boolean {
  return TERMINAL.includes(state);
}

/** Apply one event. Events with seq <= last_seq are ignored (safe on SSE replay). */
export function reduceRequest(view: RequestView, e: AgentEvent): RequestView {
  if (e.seq <= view.last_seq) return view;
  const v: RequestView = { ...view, last_seq: e.seq };
  switch (e.type) {
    case 'request.created':
      return {
        ...v,
        request_id: e.data.request_id,
        owner_id: e.data.owner_id,
        text: e.data.text,
        constraints: e.data.constraints,
        state: 'created',
      };
    case 'research.parsed':
      return { ...v, items: e.data.items, parser: e.data.parser, state: 'parsed' };
    case 'research.unmatched':
      return { ...v, unmatched: e.data.unmatched };
    case 'research.offer':
      return {
        ...v,
        offers: [...v.offers.filter((o) => o.offer_id !== e.data.offer.offer_id), e.data.offer],
        state: 'researched',
      };
    case 'policy.verdict':
      return {
        ...v,
        verdicts: { ...v.verdicts, [e.data.verdict.offer_id]: e.data.verdict },
        medians: { ...v.medians, [e.data.verdict.item_key]: e.data.median_micro },
        state: 'assessed',
      };
    case 'coordinator.basket':
      // A new basket (first plan or a re-plan after acknowledgement) supersedes any earlier signature.
      return {
        ...v,
        basket: e.data.basket,
        acknowledged_offer_ids: e.data.acknowledged_offer_ids,
        needs_ack: null,
        signed: null,
        refusal: null,
        approval: null,
        state: 'assessed',
      };
    case 'coordinator.needs_ack':
      return { ...v, needs_ack: e.data, state: 'needs_ack' };
    case 'guard.signed':
      return {
        ...v,
        signed: {
          ...e.data.signed,
          basket_id: e.data.basket_id,
          payouts: e.data.payouts,
          total: e.data.total,
          findings: e.data.findings,
        },
        state: 'signed',
      };
    case 'guard.refused':
      return { ...v, refusal: e.data, state: 'refused' };
    case 'approval.waiting':
      return {
        ...v,
        approval: {
          hash_hex: e.data.hash_hex,
          expires_at_ms: e.data.expires_at_ms,
          owner_id: null,
          status: 'waiting',
        },
        state: 'awaiting_approval',
      };
    case 'approval.seen':
      return {
        ...v,
        approval: {
          ...(v.approval ?? { expires_at_ms: 0 }),
          hash_hex: e.data.hash_hex,
          owner_id: e.data.owner_id,
          status: 'seen',
        },
        state: 'executing',
      };
    case 'approval.expired':
      return {
        ...v,
        approval: v.approval ? { ...v.approval, status: 'expired' } : null,
        state: 'expired',
      };
    case 'settlement.submitted':
      return { ...v, settlement: { ...v.settlement, tx_hash: e.data.tx_hash }, state: 'executing' };
    case 'settlement.payout':
      return {
        ...v,
        settlement: {
          ...v.settlement,
          payouts: [...v.settlement.payouts.filter((p) => p.index !== e.data.index), e.data].sort(
            (a, b) => a.index - b.index,
          ),
        },
      };
    case 'settlement.final':
      return { ...v, settlement: { ...v.settlement, final_status: e.data.status }, state: 'final' };
    case 'explain.verdict':
      return {
        ...v,
        explanations: {
          ...v.explanations,
          verdicts: { ...v.explanations.verdicts, [e.data.offer_id]: e.data },
        },
      };
    case 'explain.basket':
      return { ...v, explanations: { ...v.explanations, basket: e.data } };
    case 'error': {
      const errors = [...v.errors, e.data];
      if (e.data.recoverable) return { ...v, errors };
      return {
        ...v,
        errors,
        state:
          e.data.code === 'CANCELLED' ? 'cancelled' : isTerminal(v.state) ? v.state : 'refused',
      };
    }
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

export function replayRequest(events: AgentEvent[]): RequestView {
  return [...events].sort((a, b) => a.seq - b.seq).reduce(reduceRequest, initialRequestView());
}
