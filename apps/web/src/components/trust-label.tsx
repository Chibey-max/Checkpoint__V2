"use client";

import { Tooltip } from "radix-ui";
import { Info, Lock } from "lucide-react";

const KINDS = {
  onchain: {
    text: "Enforced on-chain",
    tip: "The Vault contract checks this on NEAR. The app and the agents can't override it.",
    Icon: Lock,
    cls: "text-accent ring-accent/30 bg-accent-soft",
    dark: "text-[#e9bf6c] ring-[#e9bf6c]/35 bg-[#e9bf6c]/10",
  },
  advisory: {
    text: "Advisory",
    tip: "Computed off-chain or written by an AI. Rules and the Vault decide, not this.",
    Icon: Info,
    cls: "text-muted ring-line-strong bg-transparent",
    dark: "text-[#b3aa9b] ring-[rgb(255_236_200/0.2)] bg-transparent",
  },
} as const;

/** FR-UI07 labels: "enforced on-chain" for Vault checks, "advisory" for explanations. `dark` is for plates that stay dark in both themes. */
export function TrustLabel({ kind, dark = false }: { kind: keyof typeof KINDS; dark?: boolean }) {
  const { text, tip, Icon, cls: themed, dark: fixed } = KINDS[kind];
  const cls = dark ? fixed : themed;
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            tabIndex={0}
            className={`inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ring-1 ring-inset ${cls}`}
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
