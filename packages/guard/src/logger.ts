/** Structured JSON-line logger with secret redaction (FR-R05, NFR-03). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

const SECRET_KEY_RE = /(secret|seed|private|password|api[_-]?key)/i;

export function createLogger(
  opts: { secrets?: string[]; write?: (line: string) => void; base?: Record<string, unknown> } = {},
): Logger {
  const secrets = (opts.secrets ?? []).filter((s) => s && s.length >= 8);
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const base = opts.base ?? {};

  const scrub = (s: string) => secrets.reduce((acc, sec) => acc.split(sec).join('[REDACTED]'), s);

  const make = (bound: Record<string, unknown>): Logger => {
    const log = (level: LogLevel, msg: string, fields: Record<string, unknown> = {}) => {
      const line = JSON.stringify(
        { ts: new Date().toISOString(), level, msg, ...bound, ...fields },
        (key, value) => {
          if (typeof value === 'bigint') return value.toString();
          if (SECRET_KEY_RE.test(key) && typeof value === 'string') return '[REDACTED]';
          return value;
        },
      );
      write(scrub(line));
    };
    return {
      log,
      info: (m, f) => log('info', m, f),
      warn: (m, f) => log('warn', m, f),
      error: (m, f) => log('error', m, f),
      child: (f) => make({ ...bound, ...f }),
    };
  };
  return make(base);
}

export const silentLogger: Logger = createLogger({ write: () => {} });
