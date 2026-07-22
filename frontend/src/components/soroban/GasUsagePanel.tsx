"use client";

import React from "react";
import { Flame, Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Gas Usage panel for the Soroban dashboard.
 *
 * Gas/fee data requires a backend schema change (backend#23) that has not
 * landed yet. This panel renders an explicit "coming soon" placeholder so
 * the dashboard is complete without blocking on the missing endpoint.
 *
 * Replace the placeholder body with real data once
 * GET /api/v1/soroban/gas-usage is available.
 */
export function GasUsagePanel() {
  return (
    <section
      aria-labelledby="gas-usage-heading"
      className="glass rounded-2xl border border-border/50 p-6 flex flex-col"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-amber-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2
              id="gas-usage-heading"
              className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
            >
              Gas Usage
            </h2>
            <p className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest mt-0.5">
              Fee &amp; resource consumption per contract
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-mono border-amber-500/30 text-amber-400 bg-amber-500/10 min-h-0 min-w-0 px-2 py-0.5 shrink-0"
        >
          SOON
        </Badge>
      </div>

      {/* Coming-soon placeholder */}
      <div
        role="status"
        aria-label="Gas usage data coming soon"
        className="flex-1 flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5"
      >
        <Construction
          className="w-10 h-10 text-amber-400/60 mb-4"
          aria-hidden="true"
        />
        <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-bold mb-2">
          Coming Soon
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed">
          Gas and resource-fee analytics require a backend schema update
          (backend#23). This panel will display per-contract fee distribution
          and resource-unit consumption once the endpoint is available.
        </p>
        <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-amber-400/70 uppercase tracking-widest">
          <Flame className="w-3 h-3" aria-hidden="true" />
          <span>Pending: GET /api/v1/soroban/gas-usage</span>
        </div>
      </div>
    </section>
  );
}
