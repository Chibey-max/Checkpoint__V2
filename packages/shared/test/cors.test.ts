import { describe, expect, it } from 'vitest';
import { corsOriginFromEnv } from '../src/cors';

describe('WEB_ORIGIN → CORS origin (D-8.2)', () => {
  it('keeps a single origin as a string and several as a list', () => {
    expect(corsOriginFromEnv(undefined)).toBeUndefined();
    expect(corsOriginFromEnv(' ')).toBeUndefined();
    expect(corsOriginFromEnv('https://checkpoint.vercel.app/')).toBe(
      'https://checkpoint.vercel.app',
    );
    expect(corsOriginFromEnv('http://localhost:3000, https://a.vercel.app')).toEqual([
      'http://localhost:3000',
      'https://a.vercel.app',
    ]);
  });

  it('matches Vercel preview links with one wildcard, and nothing else', () => {
    const f = corsOriginFromEnv(
      'https://checkpoint.vercel.app,https://checkpoint-*-team.vercel.app',
    ) as (o: string) => string | null;
    expect(typeof f).toBe('function');
    expect(f('https://checkpoint.vercel.app')).toBe('https://checkpoint.vercel.app');
    expect(f('https://checkpoint-git-main-team.vercel.app')).toBe(
      'https://checkpoint-git-main-team.vercel.app',
    );
    expect(f('https://checkpoint-abc123-team.vercel.app')).toBe(
      'https://checkpoint-abc123-team.vercel.app',
    );
    expect(f('https://checkpoint-x.evil.com/-team.vercel.app')).toBeNull();
    expect(f('https://checkpoint-a.b-team.vercel.app')).toBeNull();
    expect(f('http://checkpoint-x-team.vercel.app')).toBeNull();
    expect(f('https://evil.com')).toBeNull();
  });

  it('rejects an entry with two wildcards', () => {
    expect(() => corsOriginFromEnv('https://*.*.vercel.app')).toThrow(/more than one/);
  });
});
