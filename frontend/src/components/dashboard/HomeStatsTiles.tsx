"use client";

import { MetricCard } from "@/components/dashboard/MetricCard";
import type { useTranslations } from "next-intl";

interface HomeStatTile {
  labelKey: string;
  value: string;
  change: string;
}

interface HomeStatsTilesProps {
  tiles: HomeStatTile[];
  t: ReturnType<typeof useTranslations>;
}

function parseTrend(change: string) {
  const numericValue = Number.parseFloat(change.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numericValue) ? Math.abs(numericValue) : 0;
}

export function HomeStatsTiles({ tiles, t }: HomeStatsTilesProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Home statistics">
      {tiles.map((tile) => {
        const isDown = tile.change.startsWith("-");
        const trend = parseTrend(tile.change);

        return (
          <MetricCard
            key={tile.labelKey}
            label={t(`tickers.${tile.labelKey}`)}
            value={tile.value}
            trend={trend}
            trendDirection={isDown ? "down" : "up"}
          />
        );
      })}
    </section>
  );
}
