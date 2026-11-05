"use client";

import { Tooltip } from "radix-ui";
import { Info, Lock } from "lucide-react";

const KINDS = {
  onchain: {
    text: "Enforced on-chain",
    tip: "The Vault contract checks this on NEAR. The app and the agents can't override it.",
    Icon: Lock,
    cls: "text-accent ring-accent/30 bg-accent-soft",
  },
  advisory: {
    text: "Advisory",
    tip: "Computed off-chain or written by an AI. Rules and the Vault decide, not this.",
    Icon: Info,
    cls: "text-muted ring-line-strong bg-transparent",
  },
} as const;

/** FR-UI07 labels: "enforced on-chain" for Vault checks, "advisory" for explanations. */
export function TrustLabel({ kind }: { kind: keyof typeof KINDS }) {
  const { text, tip, Icon, cls } = KINDS[kind];
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            tabIndex={0}
            className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ring-1 ring-inset ${cls}`}
          >
            <Icon aria-hidden className="size-3" />
            {text}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={8} className="glass z-50 max-w-xs rounded-xl px-3 py-2 text-xs leading-relaxed text-fg">
            {tip}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
