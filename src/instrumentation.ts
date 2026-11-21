import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { EventEmitter } = await import("node:events");
      // Bump EventEmitter default listener ceiling to prevent false-positive MaxListenersExceededWarning
      // when Sentry tracing, Next.js server actions, and HTTP response listeners stack under load.
      if (typeof EventEmitter.defaultMaxListeners === "number" && EventEmitter.defaultMaxListeners < 50) {
        EventEmitter.defaultMaxListeners = 50;
      }
      if (typeof process.setMaxListeners === "function") {
        process.setMaxListeners(50);
      }
    } catch {
      // ignore
    }

    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

