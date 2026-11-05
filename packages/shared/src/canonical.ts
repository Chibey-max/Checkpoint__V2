/**
 * Canonical JSON used for rules_hash and evidence_hash (PRD §9.4, FR-AG06).
 *
 * It is RFC 8785 (JCS) restricted to integers: object keys sorted by UTF-16
 * code unit, no whitespace, strings escaped as JSON.stringify does, and only
 * safe integers allowed as numbers. Floats, bigints, NaN and non-plain objects
 * throw. Object keys whose value is `undefined` are omitted (as JSON.stringify
 * does), so a bundle hashes the same before and after a JSON round trip.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, '$');
}

function encode(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new Error(`canonicalJson: non-integer or unsafe number at ${path}`);
      }
      return Object.is(value, -0) ? '0' : String(value);
    case 'bigint':
      throw new Error(`canonicalJson: bigint at ${path}; encode amounts as decimal strings`);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value
          .map((v, i) => {
            if (v === undefined)
              throw new Error(`canonicalJson: undefined in array at ${path}[${i}]`);
            return encode(v, `${path}[${i}]`);
          })
          .join(',')}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(`canonicalJson: non-plain object at ${path}`);
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${encode(v, `${path}.${k}`)}`).join(',')}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }
}
