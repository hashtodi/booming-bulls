import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Structured server-side logging. Each call emits ONE JSON line to the server
// console, which on Vercel lands in Runtime Logs (and locally in the `next dev`
// terminal). It never reaches the browser: this module is server-only, and it's
// only ever imported by route handlers, server components, and server-only libs
// — so the build fails if anything tries to pull it into client code.
//
// An AsyncLocalStorage context lets a request stamp shared fields (e.g. a
// requestId + influencer) once, and every log.* call within that request —
// including from nested lib calls (lemonn/telegram/invites-store) — inherits
// them, so all lines for one login correlate.

type LogContext = Record<string, unknown>;

const contextStore = new AsyncLocalStorage<LogContext>();

// Run `fn` inside a logging context. Nested contexts merge onto the parent.
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = contextStore.getStore() ?? {};
  return contextStore.run({ ...parent, ...context }, fn);
}

type Level = "info" | "warn" | "error";

function serializeError(err: unknown): LogContext {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        ...(err.cause !== undefined
          ? {
              cause:
                err.cause instanceof Error
                  ? err.cause.message
                  : String(err.cause),
            }
          : {}),
      },
    };
  }
  if (err !== undefined) return { err: String(err) };
  return {};
}

function emit(level: Level, event: string, data?: LogContext): void {
  const line = JSON.stringify({
    level,
    event,
    ...contextStore.getStore(),
    ...data,
    time: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: LogContext) => emit("info", event, data),
  warn: (event: string, data?: LogContext) => emit("warn", event, data),
  // err is auto-serialized (name/message/stack/cause). Pass undefined for a
  // logical error with no exception object, with details in `data`.
  error: (event: string, err?: unknown, data?: LogContext) =>
    emit("error", event, { ...data, ...serializeError(err) }),
};
