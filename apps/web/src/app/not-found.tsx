import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold text-navy">Page not found</h1>
      <Link href="/" className="mt-3 inline-block text-blue underline">Back to start</Link>
    </div>
  );
}
