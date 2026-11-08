import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/site/logo";
import { Reveal } from "@/components/ui/reveal";
import { Screws } from "./lock-story";

export function FinalCta() {
  return (
    <Reveal as="section" className="panel edge-light relative my-16 overflow-hidden rounded-[28px] px-6 py-16 text-center sm:px-12">
      <Screws inset={16} />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
      {/* the lathe rings of the door face, turning out from the mark */}
      <div aria-hidden className="pointer-events-none absolute -top-[300px] left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-[repeating-radial-gradient(circle,transparent_0_13px,color-mix(in_srgb,var(--color-fg)_5%,transparent)_13px_14px)] [mask-image:radial-gradient(closest-side,#000_40%,transparent)]" />
      <span className="nav-socket relative mx-auto !size-16">
        <span>
          <LogoMark className="size-9" />
        </span>
      </span>
      <h2 className="display relative mt-6 text-[2.75rem] text-fg sm:text-6xl">
        Hand agents a budget, <span className="gilt font-medium italic">not your keys.</span>
      </h2>
      <p className="relative mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
        Paste a shopping list, watch the agents and Guard work in real time, and approve one exact basket from your wallet.
      </p>
      <div className="relative mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/desk" className="key key-primary h-12 px-6 text-[15px]">
          Open the desk <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Link href="/vault" className="key key-secondary h-12 px-6 text-[15px]">
          Fund your vault
        </Link>
      </div>
    </Reveal>
  );
}
