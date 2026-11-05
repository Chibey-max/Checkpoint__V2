import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { Locks } from "@/components/landing/locks";
import { ProductWindow } from "@/components/landing/product-window";
import { Refusals } from "@/components/landing/refusals";
import { StackBar } from "@/components/landing/stack-bar";
import { Reveal } from "@/components/ui/reveal";

export default function Home() {
  return (
    <>
      <Hero />
      <StackBar />
      <section aria-labelledby="desk-title" className="pt-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">The desk</p>
          <h2 id="desk-title" className="mt-3 text-4xl font-semibold text-fg sm:text-5xl">
            Watch one basket <span className="font-serif font-normal text-muted">go through.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            Every offer shows its source, its distance from the market median and the rule that decided it. The basket you approve is decoded
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
      <Locks />
      <Refusals />
      <FinalCta />
    </>
  );
}
