"use client";

import { Tooltip } from "radix-ui";
import { Info, Lock } from "lucide-react";

const KINDS = {
  onchain: {
    text: "Enforced on-chain",
    tip: "The Vault contract checks this on NEAR. The app can't override it.",
    Icon: Lock,
    cls: "border-navy/20 bg-navy/5 text-navy",
  },
  advisory: {
    text: "Advisory",
    tip: "Written by an AI or an off-chain service. Rules and the Vault decide, not this text.",
    Icon: Info,
    cls: "border-line bg-white text-muted",
  },
} as const;

/** FR-UI07 labels: "enforced on-chain" for Vault checks, "advisory" for explanations. */
export function TrustLabel({ kind }: { kind: keyof typeof KINDS }) {
  const { text, tip, Icon, cls } = KINDS[kind];
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span tabIndex={0} className={`inline-flex cursor-help items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${cls}`}>
            <Icon aria-hidden className="size-3" />
            {text}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="max-w-xs rounded bg-navy px-2.5 py-1.5 text-xs text-white shadow-lg">
            {tip}
            <Tooltip.Arrow className="fill-navy" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
