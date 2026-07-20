"use client";

import React from "react";
import { Medal } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Scaffold for Asset Rankings (#188). Data wired to /api/v1/rankings/assets when available.
 */
export default function RankingsPage() {
  const t = useTranslations("layout.sidebar");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] mb-2">
            Assets // Rankings
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-3">
            <Medal className="w-8 h-8 text-accent" aria-hidden="true" />
            {t("rankings")}
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mt-3">
            Top assets by holder count and volume will appear here.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
          Rankings data coming soon
        </p>
      </div>
    </div>
  );
}
