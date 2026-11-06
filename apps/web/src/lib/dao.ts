import { config } from "./config";
import { view } from "./near";

/**
 * Sputnik DAO v2 views, typed from what a live testnet DAO returns (checked against
 * sputnik-v2.testnet DAOs on 6 Nov). Replace with Isaac's docs/dao.md shapes if they differ.
 */
export type ProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";
export type Vote = "Approve" | "Reject" | "Remove";
export type ProposalKind = string | Record<string, unknown>;

export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  vote_counts: Record<string, [string | number, string | number, string | number]>;
  votes: Record<string, Vote>;
  submission_time: string; // nanoseconds
}

export interface Role {
  name: string;
  kind: "Everyone" | { Group: string[] } | { Member: string };
  permissions: string[];
}

export interface DaoPolicy {
  roles: Role[];
  default_vote_policy: { weight_kind: string; quorum: string; threshold: [number, number] | string };
  proposal_period: string; // nanoseconds
}

export interface FunctionCallAction {
  method_name: string;
  args: string; // base64 JSON
  deposit: string;
  gas: string;
}

export const dao = {
  config: () => view<{ name: string; purpose: string }>(config.daoId, "get_config"),
  policy: () => view<DaoPolicy>(config.daoId, "get_policy"),
  proposal: (id: number) => view<Proposal>(config.daoId, "get_proposal", { id }),
  /** The newest `limit` proposals, newest first. get_last_proposal_id is the next id to be used. */
  async recent(limit = 10) {
    const next = await view<number>(config.daoId, "get_last_proposal_id");
    const from = Math.max(0, next - limit);
    const list = next ? await view<Proposal[]>(config.daoId, "get_proposals", { from_index: from, limit }) : [];
    return list.reverse();
  },
};

/** The kind's name as it appears in role permissions ("call:VoteApprove", "*:*"). */
const LABEL: Record<string, string> = {
  FunctionCall: "call",
  Transfer: "transfer",
  AddMemberToRole: "add_member_to_role",
  RemoveMemberFromRole: "remove_member_from_role",
  ChangeConfig: "config",
  ChangePolicy: "policy",
  ChangePolicyAddOrUpdateRole: "policy_add_or_update_role",
  ChangePolicyRemoveRole: "policy_remove_role",
  ChangePolicyUpdateDefaultVotePolicy: "policy_update_default_vote_policy",
  ChangePolicyUpdateParameters: "policy_update_parameters",
  UpgradeSelf: "upgrade_self",
  UpgradeRemote: "upgrade_remote",
  SetStakingContract: "set_vote_token",
  AddBounty: "add_bounty",
  BountyDone: "bounty_done",
  FactoryInfoUpdate: "factory_info_update",
  Vote: "vote",
};

export const kindName = (k: ProposalKind) => (typeof k === "string" ? k : (Object.keys(k)[0] ?? "Unknown"));

const inRole = (r: Role, account: string) => r.kind === "Everyone" || ("Group" in r.kind && r.kind.Group.includes(account)) || ("Member" in r.kind && r.kind.Member === account);

/** Whether `account` may cast `action` on a proposal of this kind under the DAO policy. */
export function canVote(policy: DaoPolicy, account: string, kind: ProposalKind, action: "VoteApprove" | "VoteReject") {
  const label = LABEL[kindName(kind)] ?? "*";
  return policy.roles.some((r) => inRole(r, account) && r.permissions.some((p) => [`*:*`, `*:${action}`, `${label}:*`, `${label}:${action}`].includes(p)));
}

/** Members of every role that can approve something, for the council list. */
export const voters = (policy: DaoPolicy) =>
  [...new Set(policy.roles.filter((r) => r.permissions.some((p) => /:(\*|VoteApprove)$/.test(p)) && typeof r.kind === "object" && "Group" in r.kind).flatMap((r) => (r.kind as { Group: string[] }).Group))];

export function decodeArgs(b64: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/** Nanoseconds as a decimal string to milliseconds. */
export const nsToMs = (ns: string) => Number(BigInt(ns) / 1_000_000n);
