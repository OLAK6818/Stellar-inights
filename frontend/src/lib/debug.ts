/**
 * Development-only debug helpers for Stellar Insights frontend.
 *
 * All exported functions are no-ops (return null) in production.
 * They must never be relied on for business logic.
 *
 * Usage (browser console or component DevTools panel):
 *   import { getDebugReport } from '@/lib/debug';
 *   console.log(await getDebugReport());
 */

// Checked dynamically so tests can override process.env.NODE_ENV after import.
const isDev = () => process.env.NODE_ENV === "development";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NetworkState {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export interface WebSocketHealth {
  url: string | null;
  readyState: number | null;
  readyStateLabel: string;
  reconnectAttempts: number | null;
}

export interface CacheStatus {
  entries: number;
  /** Approximate size in bytes — available only when Cache API is present */
  estimatedBytes: number | null;
  cacheNames: string[];
}

export interface DebugReport {
  timestamp: string;
  environment: string;
  network: NetworkState;
  websocket: WebSocketHealth | null;
  cache: CacheStatus;
  buildId: string | null;
}

// ── Network ──────────────────────────────────────────────────────────────────

/**
 * Returns the current browser network state.
 * Returns null in production.
 */
export function getNetworkState(): NetworkState | null {
  if (!isDev()) return null;
  if (typeof navigator === "undefined") return null;

  const conn =
    (navigator as Navigator & { connection?: Record<string, unknown> })
      .connection ?? {};

  return {
    online: navigator.onLine,
    effectiveType: (conn.effectiveType as string) ?? undefined,
    downlink: (conn.downlink as number) ?? undefined,
    rtt: (conn.rtt as number) ?? undefined,
  };
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

const WS_READY_STATE_LABELS: Record<number, string> = {
  0: "CONNECTING",
  1: "OPEN",
  2: "CLOSING",
  3: "CLOSED",
};

/**
 * Inspects a WebSocket instance and returns health information.
 * Pass the raw `WebSocket` object from your client.
 * Returns null in production.
 */
export function getWebSocketHealth(ws: WebSocket | null): WebSocketHealth | null {
  if (!isDev()) return null;
  if (!ws) {
    return {
      url: null,
      readyState: null,
      readyStateLabel: "NO_INSTANCE",
      reconnectAttempts: null,
    };
  }
  return {
    url: ws.url,
    readyState: ws.readyState,
    readyStateLabel: WS_READY_STATE_LABELS[ws.readyState] ?? "UNKNOWN",
    reconnectAttempts: null,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/**
 * Reports the state of the browser Cache API (Service Worker caches).
 * Returns null in production.
 */
export async function getCacheStatus(): Promise<CacheStatus | null> {
  if (!isDev()) return null;
  if (typeof caches === "undefined" || typeof caches.keys !== "function") {
    return { entries: 0, estimatedBytes: null, cacheNames: [] };
  }

  let names: string[] = [];
  let totalEntries = 0;
  try {
    names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      totalEntries += keys.length;
    }
  } catch {
    // Cache API partially unavailable (e.g. restricted browsing context)
  }

  let estimatedBytes: number | null = null;
  if ("storage" in navigator && "estimate" in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      estimatedBytes = estimate.usage ?? null;
    } catch {
      // estimate() is not always available
    }
  }

  return {
    entries: totalEntries,
    estimatedBytes,
    cacheNames: names,
  };
}

// ── Composite report ──────────────────────────────────────────────────────────

/**
 * Collects all available debug information into a single report object.
 * Useful for pasting into a bug report or logging in a DevTools session.
 * Returns null in production.
 */
export async function getDebugReport(
  ws?: WebSocket | null
): Promise<DebugReport | null> {
  if (!isDev()) return null;

  const [cacheStatus] = await Promise.all([getCacheStatus()]);

  return {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown",
    network: getNetworkState() ?? { online: false },
    websocket: ws !== undefined ? getWebSocketHealth(ws ?? null) : null,
    cache: cacheStatus ?? { entries: 0, estimatedBytes: null, cacheNames: [] },
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
  };
}

/**
 * Attaches debug helpers to `window.__stellarDebug` so they can be called
 * from the browser DevTools console without any import.
 *
 * Call once at app startup (e.g. in `_app.tsx`) — in development only.
 *
 * ```ts
 * import { installDebugConsoleHelpers } from '@/lib/debug';
 * installDebugConsoleHelpers();
 * // Then in DevTools:
 * // window.__stellarDebug.report()
 * ```
 */
export function installDebugConsoleHelpers(ws?: WebSocket | null): void {
  if (!isDev() || typeof window === "undefined") return;

  (window as Window & { __stellarDebug?: unknown }).__stellarDebug = {
    networkState: () => getNetworkState(),
    wsHealth: () => getWebSocketHealth(ws ?? null),
    cacheStatus: () => getCacheStatus(),
    report: () => getDebugReport(ws),
  };
}
