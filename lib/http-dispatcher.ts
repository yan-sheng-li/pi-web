import { EventEmitter } from "node:events";

export const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;

type DispatcherGlobal = typeof globalThis & {
  __piWebHttpDispatcherConfigured?: boolean;
};

const dispatcherGlobal = globalThis as DispatcherGlobal;
const originalGlobalFetch = globalThis.fetch;
const ignoreUndiciDispatcherError = (): void => {};

function parseHttpIdleTimeoutMs(value: unknown): number | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === "disabled") return 0;
    if (trimmed.length === 0) return undefined;
    return parseHttpIdleTimeoutMs(Number(trimmed));
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function withUndiciErrorListener(dispatcher: unknown): unknown {
  if (dispatcher instanceof EventEmitter) {
    EventEmitter.prototype.on.call(dispatcher, "error", ignoreUndiciDispatcherError);
  }
  return dispatcher;
}

export async function configureHttpDispatcher(
  timeoutMs: number = DEFAULT_HTTP_IDLE_TIMEOUT_MS,
): Promise<void> {
  if (dispatcherGlobal.__piWebHttpDispatcherConfigured) return;

  const normalizedTimeoutMs = parseHttpIdleTimeoutMs(timeoutMs);
  if (normalizedTimeoutMs === undefined) {
    throw new Error(`Invalid HTTP idle timeout: ${String(timeoutMs)}`);
  }

  const undici = await import("undici");

  const undiciApi = undici as unknown as {
    Client: new (origin: string | URL, opts: Record<string, unknown>) => unknown;
    Pool: new (origin: string | URL, opts: { connections?: number; factory: (origin: string | URL, opts: unknown) => unknown }) => unknown;
    EnvHttpProxyAgent: new (opts: Record<string, unknown>) => unknown;
    setGlobalDispatcher(dispatcher: unknown): void;
    install?(): void;
  };

  function createClient(origin: string | URL, options: unknown): unknown {
    const client = new undiciApi.Client(origin, options as Record<string, unknown>);
    return withUndiciErrorListener(client);
  }

  function createPool(origin: string | URL, options: { connections?: number }): unknown {
    const pool = new undiciApi.Pool(origin, {
      ...options,
      factory: (o: string | URL, opts: unknown) => createClient(o, opts),
    });
    return withUndiciErrorListener(pool);
  }

  const agent = new undiciApi.EnvHttpProxyAgent({
    allowH2: false,
    bodyTimeout: normalizedTimeoutMs,
    headersTimeout: normalizedTimeoutMs,
    clientFactory: (origin: string | URL, opts: unknown) => createClient(origin, opts) as never,
    factory: (origin: string | URL, opts: unknown) => createPool(origin, opts as { connections?: number }) as never,
  });

  const dispatcher = withUndiciErrorListener(agent);
  undiciApi.setGlobalDispatcher(dispatcher);

  if (globalThis.fetch === originalGlobalFetch) {
    undiciApi.install?.();
  }

  dispatcherGlobal.__piWebHttpDispatcherConfigured = true;
}
