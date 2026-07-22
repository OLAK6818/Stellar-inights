import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewDeploymentsList } from "../NewDeploymentsList";
import { TopContractsTable } from "../TopContractsTable";
import { ActiveContractsPanel } from "../ActiveContractsPanel";
import { GasUsagePanel } from "../GasUsagePanel";
import { ContractCallsChart } from "@/components/charts/ContractCallsChart";
import {
  fetchSorobanContractCalls,
  fetchSorobanNewDeployments,
  fetchSorobanTopContracts,
  fetchSorobanActiveContracts,
} from "@/lib/soroban-api";

describe("NewDeploymentsList", () => {
  it("shows PARTIAL badge and notice when coverage is incomplete", () => {
    render(
      <NewDeploymentsList
        deployments={[]}
        partial
        notice="Coverage incomplete pending contracts-repo events."
      />,
    );

    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
    expect(
      screen.getByText("Coverage incomplete pending contracts-repo events."),
    ).toBeInTheDocument();
    expect(screen.getByText("No deployments reported")).toBeInTheDocument();
  });

  it("renders deployment rows when data is present", () => {
    render(
      <NewDeploymentsList
        deployments={[
          {
            contract_id: "CDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY54N",
            deployed_at: "2026-07-01T12:00:00Z",
            ledger: 12_345_678,
          },
        ]}
        partial={false}
      />,
    );

    expect(screen.getByText("1 FOUND")).toBeInTheDocument();
    expect(screen.getByText(/Ledger 12345678/i)).toBeInTheDocument();
  });
});

describe("TopContractsTable", () => {
  it("shows empty state when there are no contracts", () => {
    render(<TopContractsTable contracts={[]} windowLabel="7d" />);
    expect(
      screen.getByText("No contract activity in this window"),
    ).toBeInTheDocument();
  });

  it("renders ranked contracts", () => {
    render(
      <TopContractsTable
        contracts={[
          {
            contract_id: "CDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY54N",
            call_count: 1200,
            event_count: 40,
          },
        ]}
      />,
    );

    expect(screen.getByText("TOP_1")).toBeInTheDocument();
    expect(screen.getByText("1.2K")).toBeInTheDocument();
  });
});

describe("ContractCallsChart", () => {
  it("shows empty state when series is missing", () => {
    render(<ContractCallsChart data={[]} />);
    expect(screen.getByText("Contract Calls")).toBeInTheDocument();
    expect(
      screen.getByText(/No contract-call time series yet/i),
    ).toBeInTheDocument();
  });

  it("renders summary stats from series data", () => {
    render(
      <ContractCallsChart
        data={[
          { date: "2026-07-01", count: 100 },
          { date: "2026-07-02", count: 250 },
          { date: "2026-07-03", count: 175 },
        ]}
      />,
    );

    expect(screen.getByText("Latest day")).toBeInTheDocument();
    expect(screen.getByText("Period total")).toBeInTheDocument();
    expect(screen.getByText("525")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
  });
});

describe("soroban-api empty/partial fallbacks", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty top contracts on network failure", async () => {
    const result = await fetchSorobanTopContracts();
    expect(result.contracts).toEqual([]);
    expect(result.window).toBe("7d");
  });

  it("returns partial empty deployments on network failure", async () => {
    const result = await fetchSorobanNewDeployments();
    expect(result.partial).toBe(true);
    expect(result.deployments).toEqual([]);
    expect(result.notice).toMatch(/incomplete|unavailable/i);
  });

  it("returns empty contract-calls series on network failure", async () => {
    const result = await fetchSorobanContractCalls();
    expect(result.points).toEqual([]);
    expect(result.metric).toBe("events");
  });
});

describe("fetchSorobanContractCalls normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes a bare {date,count} array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => [
            { date: "2026-07-02", count: 20 },
            { date: "2026-07-01", count: 10 },
          ],
        }),
      ),
    );

    const result = await fetchSorobanContractCalls(7);
    expect(result.points).toEqual([
      { date: "2026-07-01", count: 10 },
      { date: "2026-07-02", count: 20 },
    ]);
  });
});

describe("ActiveContractsPanel", () => {
  it("shows loading skeleton when loading=true", () => {
    const { container } = render(
      <ActiveContractsPanel stat={null} loading />,
    );
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("shows empty state when stat is null and not loading", () => {
    render(<ActiveContractsPanel stat={null} />);
    expect(screen.getByText("No activity data yet")).toBeInTheDocument();
  });

  it("shows empty state when active_count is 0", () => {
    render(
      <ActiveContractsPanel
        stat={{ active_count: 0, window: "7d", change_pct: null, total_deployed: null }}
      />,
    );
    expect(screen.getByText("No activity data yet")).toBeInTheDocument();
  });

  it("renders active count with trend when data is present", () => {
    render(
      <ActiveContractsPanel
        stat={{
          active_count: 1234,
          window: "7d",
          change_pct: 12.5,
          total_deployed: 9800,
        }}
      />,
    );
    // "1.2K" appears in both the hero value and the secondary stat cell — both are expected
    expect(screen.getAllByText("1.2K").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("+12.5% vs prev window")).toBeInTheDocument();
    // secondary stat (all-time)
    expect(screen.getByText("9.8K")).toBeInTheDocument();
  });

  it("renders negative trend correctly", () => {
    render(
      <ActiveContractsPanel
        stat={{ active_count: 500, window: "7d", change_pct: -8.3, total_deployed: null }}
      />,
    );
    expect(screen.getByText("8.3% vs prev window")).toBeInTheDocument();
  });
});

describe("GasUsagePanel", () => {
  it("renders the coming-soon placeholder", () => {
    render(<GasUsagePanel />);
    expect(screen.getByText("Gas Usage")).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(
      screen.getByText(/Pending: GET \/api\/v1\/soroban\/gas-usage/i),
    ).toBeInTheDocument();
  });

  it("has accessible coming-soon status region", () => {
    render(<GasUsagePanel />);
    expect(
      screen.getByRole("status", { name: /gas usage data coming soon/i }),
    ).toBeInTheDocument();
  });
});

describe("fetchSorobanActiveContracts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns zero counts on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const result = await fetchSorobanActiveContracts();
    expect(result.active_count).toBe(0);
    expect(result.window).toBe("7d");
    expect(result.change_pct).toBeNull();
  });

  it("normalizes a valid API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            active_count: 420,
            window: "7d",
            change_pct: 5.2,
            total_deployed: 3100,
          }),
        }),
      ),
    );
    const result = await fetchSorobanActiveContracts("7d");
    expect(result.active_count).toBe(420);
    expect(result.change_pct).toBe(5.2);
    expect(result.total_deployed).toBe(3100);
  });
});
