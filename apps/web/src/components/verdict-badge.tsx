import { Ban, CircleCheck, TriangleAlert } from "lucide-react";

export type VerdictLevel = "ALLOW" | "REVIEW" | "BLOCK";

const STYLES: Record<VerdictLevel, { cls: string; Icon: typeof Ban; label: string }> = {
  ALLOW: { cls: "bg-ok-soft text-ok ring-ok/25", Icon: CircleCheck, label: "Allow" },
  REVIEW: { cls: "bg-warn-soft text-warn ring-warn/25", Icon: TriangleAlert, label: "Review" },
  BLOCK: { cls: "bg-bad-soft text-bad ring-bad/25", Icon: Ban, label: "Block" },
};

/** Verdict shown with an icon and a word, never colour alone (NFR-09). */
export function VerdictBadge({ level, size = "sm" }: { level: VerdictLevel; size?: "sm" | "xs" }) {
  const { cls, Icon, label } = STYLES[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${cls} ${
        size === "xs" ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"
      }`}
    >
      <Icon aria-hidden className={size === "xs" ? "size-3" : "size-3.5"} />
      {label}
    </span>
  );
}
