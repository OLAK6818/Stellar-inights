import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/config";
import { logger } from "@/lib/logger";

const TOP_MOVERS_ENDPOINT = "/api/v1/rankings/top-movers";

export type TopMoverDirection = "gainers" | "losers";

export interface TopMover {
  asset_code: string;
  asset_issuer: string | null;
  price: number;
  price_change_pct: number;
  volume_24h_usd: number;
  rank: number;
}

export interface TopMoversResponse {
  movers: TopMover[];
  generated_at: string;
}

export interface UseTopMoversOptions {
  /** Number of movers to fetch. Defaults to 10. */
  limit?: number;
  /** Restrict results to gainers or losers. Defaults to both. */
  direction?: TopMoverDirection;
  /** Auto-refresh interval in milliseconds. Set to 0 to disable. Defaults to 0. */
  refreshIntervalMs?: number;
}

export interface UseTopMoversReturn {
  movers: TopMover[];
  generatedAt: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTopMovers(
  options: UseTopMoversOptions = {},
): UseTopMoversReturn {
  const { limit = 10, direction, refreshIntervalMs = 0 } = options;

  const [movers, setMovers] = useState<TopMover[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against stale responses overwriting fresher ones when requests race.
  const requestIdRef = useRef(0);

  const fetchTopMovers = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: String(limit) });
    if (direction) params.set("direction", direction);

    try {
      const response = await fetch(
        `${config.apiUrl}${TOP_MOVERS_ENDPOINT}?${params.toString()}`,
        { headers: { "Content-Type": "application/json" } },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: TopMoversResponse = await response.json();
      if (requestId !== requestIdRef.current) return;

      setMovers(data.movers);
      setGeneratedAt(data.generated_at);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message =
        err instanceof Error ? err.message : "Failed to fetch top movers";
      logger.error("[useTopMovers] Failed to fetch top movers:", err);
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [limit, direction]);

  useEffect(() => {
    fetchTopMovers();
  }, [fetchTopMovers]);

  useEffect(() => {
    if (!refreshIntervalMs) return;
    const interval = setInterval(fetchTopMovers, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchTopMovers, refreshIntervalMs]);

  return { movers, generatedAt, isLoading, error, refetch: fetchTopMovers };
"use client";

import { useEffect, useState } from "react";
import { fetchTopMovers, type TopMoversSortBy } from "@/lib/top-movers-api";

export interface TopMoverAsset {
  symbol: string;
  name: string;
  price: number;
  /** 24h percent change, or `null` for an asset with no 24h-ago baseline. */
  change24h: number | null;
  volume24h: number;
  /** New unique holders gained in the last 24h. */
  newHolders24h: number;
}

interface UseTopMoversResult {
  data: TopMoverAsset[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the top 24h movers for the homepage "Top Movers" card.
 *
 * Backed by `fetchTopMovers()`, which itself falls back to representative
 * mock data whenever the real backend endpoint (backend#33) is unreachable
 * — so `error` only surfaces for genuinely unexpected failures (e.g. a
 * malformed response), not routine backend unavailability during rollout.
 */
export function useTopMovers(
  limit = 5,
  sortBy: TopMoversSortBy = "change",
): UseTopMoversResult {
  const [data, setData] = useState<TopMoverAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const movers = await fetchTopMovers(sortBy, limit);

        if (isMounted) {
          setData(
            movers.map((asset) => ({
              symbol: asset.asset_code,
              name: asset.asset_code,
              price: asset.price_usd,
              change24h: asset.change_24h_pct,
              volume24h: asset.volume_24h_usd,
              newHolders24h: asset.new_holders_24h,
            })),
          );
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load top movers");
          setData([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [limit, sortBy]);

  return { data, loading, error };
}
