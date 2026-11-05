import { Ban, CircleCheck, TriangleAlert } from "lucide-react";

export type VerdictLevel = "ALLOW" | "REVIEW" | "BLOCK";

const STYLES: Record<VerdictLevel, { cls: string; Icon: typeof Ban; label: string }> = {
  ALLOW: { cls: "bg-ok-soft text-ok border-ok/30", Icon: CircleCheck, label: "Allow" },
  REVIEW: { cls: "bg-warn-soft text-warn border-warn/30", Icon: TriangleAlert, label: "Review" },
  BLOCK: { cls: "bg-bad-soft text-bad border-bad/30", Icon: Ban, label: "Block" },
};

/** Verdict shown with an icon and a word, never colour alone (NFR-09). */
export function VerdictBadge({ level }: { level: VerdictLevel }) {
  const { cls, Icon, label } = STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
