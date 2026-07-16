"use client";

import { useEffect, useState } from "react";

export interface TopMoverAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
}

interface UseTopMoversResult {
  data: TopMoverAsset[];
  loading: boolean;
  error: string | null;
}

export function useTopMovers(limit = 5): UseTopMoversResult {
  const [data, setData] = useState<TopMoverAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const response = await fetch(`/api/dashboard?view=top-movers&limit=${limit}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load top movers");
        }

        const payload = await response.json();
        const movers = Array.isArray(payload?.assets)
          ? payload.assets.slice(0, limit)
          : [];

        if (isMounted) {
          setData(movers);
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
  }, [limit]);

  return { data, loading, error };
}
