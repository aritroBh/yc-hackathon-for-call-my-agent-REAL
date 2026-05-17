type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  requestId?: string;
  callId?: string;
  rfqId?: string;
  supplierId?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

const LEVEL_NUM: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4,
};

let _minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
let _service = process.env.SERVICE_NAME || "haggl";
let _sentryEnabled = !!process.env.SENTRY_DSN;
let _sentryDsn: string | null = process.env.SENTRY_DSN || null;

export function configureLogger(opts: { level?: LogLevel; service?: string; sentryDsn?: string }): void {
  if (opts.level) _minLevel = opts.level;
  if (opts.service) _service = opts.service;
  if (opts.sentryDsn) { _sentryDsn = opts.sentryDsn; _sentryEnabled = true; }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_NUM[level] >= LEVEL_NUM[_minLevel];
}

async function sendToSentry(entry: LogEntry): Promise<void> {
  if (!_sentryEnabled || !_sentryDsn) return;
  if (entry.level !== "error" && entry.level !== "fatal") return;

  try {
    const body = JSON.stringify({
      exception: { values: [{ type: entry.error || entry.message, value: entry.message, stacktrace: { frames: [] } }] },
      level: entry.level === "fatal" ? "fatal" : "error",
      logger: entry.service,
      timestamp: entry.timestamp,
      tags: { service: entry.service, callId: entry.callId || "", rfqId: entry.rfqId || "" },
      extra: entry.metadata || {},
    });

    await fetch(_sentryDsn, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": "Sentry sentry_version=7" },
      body,
    });
  } catch {}
}

function writeEntry(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error": case "fatal": console.error(line); break;
    case "warn": console.warn(line); break;
    case "debug": console.debug(line); break;
    default: console.log(line); break;
  }
}

export function log(level: LogLevel, message: string, ctx?: Partial<LogEntry>): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: ctx?.service || _service,
    requestId: ctx?.requestId,
    callId: ctx?.callId,
    rfqId: ctx?.rfqId,
    supplierId: ctx?.supplierId,
    durationMs: ctx?.durationMs,
    error: ctx?.error,
    metadata: ctx?.metadata,
  };
  writeEntry(entry);
  if (level === "error" || level === "fatal") {
    sendToSentry(entry);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Partial<LogEntry>) => log("debug", msg, ctx),
  info: (msg: string, ctx?: Partial<LogEntry>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Partial<LogEntry>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Partial<LogEntry>) => log("error", msg, ctx),
  fatal: (msg: string, ctx?: Partial<LogEntry>) => log("fatal", msg, ctx),
  child: (defaults: Partial<LogEntry>) => {
    const childLogger = { ...logger };
    for (const k of Object.keys(logger) as (keyof typeof logger)[]) {
      const orig = childLogger[k] as (msg: string, ctx?: Partial<LogEntry>) => void;
      (childLogger as any)[k] = (msg: string, ctx?: Partial<LogEntry>) => orig(msg, { ...defaults, ...ctx });
    }
    return childLogger;
  },
};

export function logDuration<T>(label: string, fn: () => Promise<T>, ctx?: Partial<LogEntry>): Promise<T> {
  const start = Date.now();
  return fn().then((result) => {
    logger.info(label + " completed", { ...ctx, durationMs: Date.now() - start });
    return result;
  }).catch((err) => {
    logger.error(label + " failed", { ...ctx, durationMs: Date.now() - start, error: err.message });
    throw err;
  });
}
