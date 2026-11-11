/**
 * WEB_ORIGIN → the CORS origin rule for Guard and the agents (D-8.2).
 *
 * WEB_ORIGIN is a comma-separated list of allowed browser origins. An entry may
 * use one `*` wildcard inside the host, so Vercel preview links work too:
 *   WEB_ORIGIN=https://checkpoint.vercel.app,https://checkpoint-*-team.vercel.app
 * A wildcard matches only within one host label run of letters, digits and
 * hyphens, never a dot or a slash, so `https://evil.com/x.vercel.app` can't match.
 */
export type CorsOrigin = string | string[] | ((origin: string) => string | null);

export function corsOriginFromEnv(spec: string | undefined): CorsOrigin | undefined {
  const entries = (spec ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (entries.length === 0) return undefined;
  if (!entries.some((e) => e.includes('*'))) return entries.length === 1 ? entries[0]! : entries;
  const patterns = entries.map((e) => {
    if ((e.match(/\*/g) ?? []).length > 1)
      throw new Error(`WEB_ORIGIN entry has more than one *: ${e}`);
    const esc = e.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[a-z0-9-]+');
    return new RegExp(`^${esc}$`, 'i');
  });
  return (origin: string) => (patterns.some((p) => p.test(origin)) ? origin : null);
}
