/**
 * LLM access for list parsing and explanations, via the Groq API (team
 * decision, 5 Nov; replaces the Anthropic plan in PRD §13 / D-10).
 *
 * The LLM never chooses offers, vendors, amounts or verdicts, and this module
 * has no access to any NEAR key or the Guard signer. Every call asks for a
 * strict JSON schema (constrained decoding on supported models) and the
 * result is validated again with Zod; any failure throws LlmError and the
 * caller falls back to the deterministic parser or template text.
 */
import Groq from 'groq-sdk';
import { z } from 'zod';

export interface LlmConfig {
  provider: 'groq' | 'none';
  /** Default openai/gpt-oss-120b: production model with strict structured outputs. */
  model: string;
  apiKey?: string;
  /** gpt-oss models only; low keeps parsing fast and cheap. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Tests inject a fake fetch; production uses the global one. */
  fetch?: typeof fetch;
}

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'unparsed' | 'api' | 'disabled',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface StructuredLlm {
  /** One structured call. Throws LlmError on API error, truncation or schema mismatch. */
  structured<S extends z.ZodType>(opts: {
    system: string;
    user: string;
    schema: S;
    name?: string;
    maxTokens?: number;
  }): Promise<z.infer<S>>;
}

/** Groq strict mode needs every object closed (additionalProperties: false) with all properties required. */
export function isStrictCompatible(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(isStrictCompatible);
  if (!node || typeof node !== 'object') return true;
  const n = node as Record<string, unknown>;
  if (n.type === 'object' && n.properties && typeof n.properties === 'object') {
    const keys = Object.keys(n.properties);
    const required = Array.isArray(n.required) ? n.required : [];
    if (n.additionalProperties !== false || keys.some((k) => !required.includes(k))) return false;
  }
  return Object.values(n).every(isStrictCompatible);
}

/** JSON Schema for the request, from the same Zod schema that validates the reply. */
export function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export class GroqLlm implements StructuredLlm {
  private readonly client: Groq;

  constructor(private readonly cfg: LlmConfig) {
    this.client = new Groq({
      ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
      ...(cfg.fetch ? { fetch: cfg.fetch } : {}),
      timeout: 30_000,
      maxRetries: 2,
    });
  }

  async structured<S extends z.ZodType>(opts: {
    system: string;
    user: string;
    schema: S;
    name?: string;
    maxTokens?: number;
  }): Promise<z.infer<S>> {
    const jsonSchema = toResponseSchema(opts.schema);
    const gptOss = this.cfg.model.startsWith('openai/gpt-oss');
    let res;
    try {
      res = await this.client.chat.completions.create({
        model: this.cfg.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: opts.name ?? 'result',
            schema: jsonSchema,
            strict: isStrictCompatible(jsonSchema),
          },
        },
        max_completion_tokens: opts.maxTokens ?? 4096,
        ...(gptOss ? { reasoning_effort: this.cfg.reasoningEffort ?? 'low' } : {}),
      });
    } catch (e) {
      if (e instanceof Groq.APIError) {
        throw new LlmError(`Groq API error ${e.status ?? ''}: ${e.message}`, 'api');
      }
      throw new LlmError(`Groq API call failed: ${(e as Error).message}`, 'api');
    }
    const choice = res.choices[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason === 'length') throw new LlmError('output was truncated', 'unparsed');
    if (!content)
      throw new LlmError(
        `no output (finish_reason ${choice?.finish_reason ?? 'none'})`,
        'unparsed',
      );
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new LlmError('output is not valid JSON', 'unparsed');
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) throw new LlmError('output does not match the schema', 'unparsed');
    return parsed.data;
  }
}

export function createLlm(cfg: LlmConfig): StructuredLlm | null {
  return cfg.provider === 'groq' ? new GroqLlm(cfg) : null;
}
