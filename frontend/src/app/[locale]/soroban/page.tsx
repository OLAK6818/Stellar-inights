"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Code2, RefreshCw } from "lucide-react";
import { TopContractsTable } from "@/components/soroban/TopContractsTable";
import { NewDeploymentsList } from "@/components/soroban/NewDeploymentsList";
import {
  fetchSorobanContractCalls,
  fetchSorobanNewDeployments,
  fetchSorobanTopContracts,
  type SorobanContractCallsResponse,
  type SorobanNewDeploymentsResponse,
  type SorobanTopContractsResponse,
} from "@/lib/soroban-api";
import { logger } from "@/lib/logger";

const ContractCallsChart = dynamic(
  () =>
    import("@/components/charts/ContractCallsChart").then((m) => ({
      default: m.ContractCallsChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="glass-card rounded-2xl p-6 border border-border/50 h-[420px] animate-pulse">
        <div className="h-4 w-40 bg-white/5 rounded mb-4" />
        <div className="h-8 w-64 bg-white/5 rounded mb-8" />
        <div className="h-[260px] w-full bg-white/5 rounded-xl" />
      </div>
    ),
  },
);

export default function SorobanPage() {
  const [topContracts, setTopContracts] =
    useState<SorobanTopContractsResponse | null>(null);
  const [deployments, setDeployments] =
    useState<SorobanNewDeploymentsResponse | null>(null);
  const [contractCalls, setContractCalls] =
    useState<SorobanContractCallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [contractsData, deploymentsData, callsData] = await Promise.all([
        fetchSorobanTopContracts(20, "7d"),
        fetchSorobanNewDeployments(20),
        fetchSorobanContractCalls(30),
      ]);
      setTopContracts(contractsData);
      setDeployments(deploymentsData);
      setContractCalls(callsData);
    } catch (error) {
      logger.error("Failed to load Soroban dashboard panels:", error);
      setTopContracts({ window: "7d", contracts: [] });
      setDeployments({
        partial: true,
        deployments: [],
        notice:
          "New deployments data is unavailable or incomplete until contract deployment/init events are fully ingested.",
      });
      setContractCalls({ points: [], metric: "events" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] mb-2">
            Soroban // Dashboard
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-3">
            <Code2 className="w-8 h-8 text-accent" aria-hidden="true" />
            Soroban Activity
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mt-3">
            Contract-call volume, top contracts, and recent deployments across the
            Soroban network.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="px-4 py-2 bg-accent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-60 disabled:hover:scale-100 self-start md:self-auto"
        >
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      <ContractCallsChart
        data={contractCalls?.points ?? []}
        loading={loading}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopContractsTable
          contracts={topContracts?.contracts ?? []}
          windowLabel={topContracts?.window ?? "7d"}
          loading={loading}
        />
        <NewDeploymentsList
          deployments={deployments?.deployments ?? []}
          partial={deployments?.partial ?? true}
          notice={deployments?.notice}
          loading={loading}
        />
      </div>
    </div>
  );
}
