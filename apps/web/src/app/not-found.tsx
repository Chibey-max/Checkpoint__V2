import Link from "next/link";
import { LogoMark } from "@/components/site/logo";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-32 text-center">
      <LogoMark className="size-12 text-fg" />
      <p className="eyebrow mt-6">404</p>
      <h1 className="mt-2 text-4xl font-semibold text-fg">This page isn&apos;t behind any lock.</h1>
      <Link href="/" className="key key-secondary mt-8 h-11 px-5 text-sm">Back to start</Link>
    </div>
  );
}
