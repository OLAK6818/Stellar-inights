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
