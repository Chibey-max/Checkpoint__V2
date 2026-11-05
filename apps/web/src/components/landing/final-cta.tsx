import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/site/logo";
import { Reveal } from "@/components/ui/reveal";

export function FinalCta() {
  return (
    <Reveal as="section" className="relative my-16 overflow-hidden rounded-[28px] glass px-6 py-16 text-center sm:px-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
      <LogoMark className="relative mx-auto size-12 text-fg" />
      <h2 className="relative mt-6 text-4xl font-semibold text-fg sm:text-5xl">
        Hand agents a budget, <span className="font-serif font-normal text-accent">not your keys.</span>
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
