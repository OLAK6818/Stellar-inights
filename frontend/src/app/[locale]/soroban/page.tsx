"use client";

import React from "react";
import { Code2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Scaffold for the Soroban dashboard (#165). Panels land in #166–#169.
 */
export default function SorobanPage() {
  const t = useTranslations("layout.sidebar");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] mb-2">
            Soroban // Dashboard
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-3">
            <Code2 className="w-8 h-8 text-accent" aria-hidden="true" />
            {t("soroban")}
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mt-3">
            Active contracts, call volume, gas usage, and deployments will appear here.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
          Panels coming soon
        </p>
      </div>
    </div>
  );
}
