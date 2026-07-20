"use client";
import { logger } from "@/lib/logger";
import { useEffect, useState, use, Suspense } from "react";
import { useTranslations } from "next-intl";
import { getAddressValidationError } from "@/lib/address";
import { BalanceHistoryChart } from "@/components/charts/BalanceHistoryChart";
import { AlertCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BackButton } from "@/components/ui/BackButton";
import { fetchWalletBalanceHistory } from "@/lib/analytics-api";

function WalletPageContent({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const unwrappedParams = use(params);
  const { address } = unwrappedParams;
  const t = useTranslations("layout.walletInsights");
  const [balanceHistory, setBalanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!address) return;

      const validationError = getAddressValidationError(address);
      if (validationError) {
        setError(validationError);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await fetchWalletBalanceHistory(address);
        setBalanceHistory(result.balance_history);
        setError(null);
      } catch (err) {
        logger.error("Failed to fetch wallet balance history:", err);
        setError("Failed to load wallet data. Please try again later.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [address]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-4 w-32 bg-slate-800 rounded mb-6"></div>
          <div className="h-[500px] bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          Error Loading Wallet Insights
        </h2>
        <p className="text-slate-400 mb-6 max-w-md">
          {error}
        </p>
        <Link
          href="/wallet"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium text-sm"
        >
          Back to Wallet Insights
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Breadcrumb / Back */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <BackButton
          fallbackHref="/wallet"
          label={t("breadcrumb")}
          className="hover:text-white transition-colors flex items-center gap-1 group"
        />
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 truncate max-w-[200px]">
          {address.slice(0, 8)}...{address.slice(-8)}
        </span>
      </div>

      {/* Balance History Chart */}
      <BalanceHistoryChart data={balanceHistory} address={address} />
    </div>
  );
}

export default function WalletPage(props: {
  params: Promise<{ address: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <WalletPageContent {...props} />
    </Suspense>
  );
}