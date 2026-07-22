"use client";

import React from "react";
import { Code2, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface ActiveContractsStat {
  /** Total unique contracts that emitted at least one event in the window. */
  active_count: number;
  /** Window over which activity was measured, e.g. "7d". */
  window: string;
  /** Percentage change vs the preceding window (positive = growth). */
  change_pct?: number | null;
  /** Total number of unique contracts ever deployed (all-time). */
  total_deployed?: number | null;
}

interface ActiveContractsPanelProps {
  stat: ActiveContractsStat | null;
  loading?: boolean;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function TrendBadge({ pct }: { pct: number }) {
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0) {
    return (
      <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-mono mt-2">
        <TrendingUp className="w-3 h-3" aria-hidden="true" />
        <span>+{abs}% vs prev window</span>
      </div>
    );
  }
  if (pct < 0) {
    return (
      <div className="flex items-center gap-1 text-red-400 text-[10px] font-mono mt-2">
        <TrendingDown className="w-3 h-3" aria-hidden="true" />
        <span>{abs}% vs prev window</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground text-[10px] font-mono mt-2">
      <Minus className="w-3 h-3" aria-hidden="true" />
      <span>No change vs prev window</span>
    </div>
  );
}

export function ActiveContractsPanel({
  stat,
  loading = false,
}: ActiveContractsPanelProps) {
  return (
    <section
      aria-labelledby="active-contracts-heading"
      className="glass rounded-2xl border border-border/50 p-6 flex flex-col"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <Code2 className="w-5 h-5 text-accent" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2
            id="active-contracts-heading"
            className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
          >
            Active Contracts
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest mt-0.5">
            Unique contracts with call activity
          </p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4" aria-busy="true">
          <div className="h-12 w-32 bg-white/5 rounded-xl" />
          <div className="h-4 w-24 bg-white/5 rounded" />
          <div className="h-px bg-white/5" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-white/5 rounded-xl" />
            <div className="h-16 bg-white/5 rounded-xl" />
          </div>
        </div>
      ) : stat === null || stat.active_count === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center py-8 text-center"
          role="status"
        >
          <Code2
            className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            No activity data yet
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2 max-w-xs">
            Active contract counts will appear once{" "}
            <code className="text-accent">/api/v1/soroban/active-contracts</code>{" "}
            returns data.
          </p>
        </div>
      ) : (
        <>
          {/* Primary metric */}
          <div className="mb-6">
            <div className="text-4xl font-black font-mono tracking-tighter text-accent">
              {formatCount(stat.active_count)}
            </div>
            {stat.change_pct != null && (
              <TrendBadge pct={stat.change_pct} />
            )}
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 uppercase tracking-widest">
              Window: {stat.window}
            </p>
          </div>

          <hr className="border-border/30 mb-4" />

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-slate-900/30 border border-white/5">
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                Active
              </p>
              <p className="text-lg font-black font-mono tracking-tighter text-accent">
                {formatCount(stat.active_count)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/30 border border-white/5">
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                All-time deployed
              </p>
              <p className="text-lg font-black font-mono tracking-tighter text-foreground/80">
                {stat.total_deployed != null
                  ? formatCount(stat.total_deployed)
                  : "—"}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
