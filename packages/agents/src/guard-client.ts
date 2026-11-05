import {
  AssessResponseSchema,
  GuardErrorSchema,
  SignBasketResponseSchema,
  type AssessRequest,
  type AssessResponse,
  type Finding,
  type SignBasketRequest,
  type SignBasketResponse,
} from '@checkpoint/shared';

export class GuardClientError extends Error {
  constructor(
    /** HTTP status; 0 = Guard unreachable. */
    readonly status: number,
    readonly code: string,
    message: string,
    readonly findings: Finding[] = [],
  ) {
    super(message);
    this.name = 'GuardClientError';
  }

  get unavailable(): boolean {
    return this.status === 0 || this.status === 503;
  }
}

export interface GuardClient {
  assess(req: AssessRequest): Promise<AssessResponse>;
  signBasket(req: SignBasketRequest): Promise<SignBasketResponse>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Talks to Guard over HTTP. `fetchImpl` lets the mock run Guard in-process through the same HTTP layer. */
export class HttpGuardClient implements GuardClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = (u, i) =>
      fetch(u, { ...i, signal: AbortSignal.timeout(15_000) }),
  ) {}

  private async post<T>(path: string, body: unknown, parse: (v: unknown) => T): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new GuardClientError(
        0,
        'GUARD_UNAVAILABLE',
        `Guard is unreachable: ${(e as Error).message}`,
      );
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new GuardClientError(
        res.status,
        'GUARD_BAD_RESPONSE',
        `Guard returned non-JSON (HTTP ${res.status})`,
      );
    }
    if (!res.ok) {
      const err = GuardErrorSchema.safeParse(json);
      if (err.success)
        throw new GuardClientError(
          res.status,
          err.data.code,
          err.data.message,
          err.data.findings ?? [],
        );
      throw new GuardClientError(
        res.status,
        'GUARD_BAD_RESPONSE',
        `Guard error HTTP ${res.status}`,
      );
    }
    try {
      return parse(json);
    } catch (e) {
      throw new GuardClientError(
        res.status,
        'GUARD_BAD_RESPONSE',
        `unexpected Guard response: ${(e as Error).message}`,
      );
    }
  }

  assess(req: AssessRequest): Promise<AssessResponse> {
    return this.post('/v1/assess', req, (v) => AssessResponseSchema.parse(v));
  }

  signBasket(req: SignBasketRequest): Promise<SignBasketResponse> {
    return this.post('/v1/sign-basket', req, (v) => SignBasketResponseSchema.parse(v));
  }
}

/** Route requests to an in-process Hono app (mock server, tests) through the real HTTP handlers. */
export function inProcessFetch(app: {
  request: (url: string, init: RequestInit) => Response | Promise<Response>;
}): FetchLike {
  return (url, init) => Promise.resolve(app.request(url.replace(/^https?:\/\/[^/]+/, ''), init));
}
