import { EventTape } from "@/components/landing/event-tape";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { ProductWindow } from "@/components/landing/product-window";
import { Refusals } from "@/components/landing/refusals";
import { RunStory } from "@/components/landing/run-story";
import { Reveal } from "@/components/ui/reveal";

export default function Home() {
  return (
    <>
      <Hero />
      <EventTape />
      <RunStory />
      <section aria-labelledby="desk-title" className="pt-16">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">The desk</p>
          <h2 id="desk-title" className="display mt-4 text-[2.75rem] text-fg sm:text-6xl">
            Every number <span className="gilt font-medium italic">shows its work.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            Each offer carries its source, its distance from the market median and the rule that decided it. The basket you approve is decoded
            from the exact bytes the Vault will check.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-12">
          <ProductWindow />
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            Illustration · real prices from snapshot v0 · vendor accounts are stand-ins
          </p>
        </Reveal>
      </section>
      <Refusals />
      <FinalCta />
    </>
  );
}
