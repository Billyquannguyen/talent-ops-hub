import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Send,
  Target,
  TrendingUp,
} from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  loadPerformanceBundleFromGoogleSheetsOnly,
  loadAppDatabase,
  saveAppSettingToGoogleSheetsOnly,
  savePerformanceBenchmarkToGoogleSheetsOnly,
  savePerformanceWeeklyInputToGoogleSheetsOnly,
} from "@/storage/appRepository";
import type {
  ActiveCampaignCreatorRecord,
  AppSettingRecord,
  CampaignProfileRecord,
  CentralAppDatabase,
  PerformanceBenchmarkRecord,
  PerformanceWeeklyInputRecord,
} from "@/storage/schema";

type PerformanceCampaign = {
  campaignId: string;
  campaignName: string;
  campaignCode: string;
};

type BenchmarkDraft = {
  benchmarkId: string;
  campaignId: string;
  campaignName: string;
  includeInPerformance: boolean;
  teamSize: number;
  targetDailyOutreach: number;
  teamOutreachExcludingMe: number;
  teamSubmissionsExcludingMe: number;
  teamApprovalsExcludingMe: number;
  createdAt: string;
  updatedAt: string;
};

type WeeklyInputDraft = {
  campaignId: string;
  myOutreachVolume: number;
  myCreatorSubmissions: number;
  myCreatorApprovals: number;
};

type ScoreValue = {
  raw: number | null;
  capped: number | null;
};

type WeeklySnapshotCalculation = {
  outreach: ScoreValue;
  submission: ScoreValue;
  approval: ScoreValue;
  weeklyScore: number;
};

const defaultTargetDailyOutreach = 25;
const monthlyKpiSettingPrefix = "performance.monthlyProfitKpi.";

const weeklyWeights = {
  outreach: 0.15,
  submission: 0.25,
  approval: 0.3,
} as const;

export function EmployeePerformanceTracking() {
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthValue());
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [monthlyProfitKpi, setMonthlyProfitKpi] = useState(0);
  const [campaigns, setCampaigns] = useState<PerformanceCampaign[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkDraft[]>([]);
  const [weeklyInputs, setWeeklyInputs] = useState<Record<string, WeeklyInputDraft>>({});
  const [snapshots, setSnapshots] = useState<PerformanceWeeklyInputRecord[]>([]);
  const [activeCreators, setActiveCreators] = useState<ActiveCampaignCreatorRecord[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    hydrateFromDatabase(loadAppDatabase(), "local-cache");

    let cancelled = false;
    void (async () => {
      try {
        console.info("[EmployeePerformance]", "load-targeted-sheets", {
          at: new Date().toISOString(),
        });
        const bundle = await loadPerformanceBundleFromGoogleSheetsOnly();
        if (cancelled) return;
        const database = loadAppDatabase();
        database.worksheets.CampaignProfiles = bundle.campaignProfiles;
        database.worksheets.PerformanceBenchmarks = bundle.performanceBenchmarks;
        database.worksheets.PerformanceWeeklyInputs = bundle.performanceWeeklyInputs;
        database.worksheets.ActiveCampaignCreators = bundle.activeCampaignCreators;
        database.worksheets.AppSettings = bundle.appSettings;
        hydrateFromDatabase(database, "google-sheets");
        setStatusMessage("Performance data loaded from Google Sheets.");
      } catch (error) {
        if (cancelled) return;
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Google Sheets is unavailable. Performance data was not refreshed.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const weeks = useMemo(() => getWeeksOverlappingMonth(selectedMonth), [selectedMonth]);

  useEffect(() => {
    if (!weeks.length) return;
    if (!weeks.some((week) => week.weekStart === selectedWeekStart)) {
      setSelectedWeekStart(weeks[0].weekStart);
    }
  }, [selectedMonth, selectedWeekStart, weeks]);

  useEffect(() => {
    setMonthlyProfitKpi(readMonthlyProfitKpi(appSettings, selectedMonth));
  }, [appSettings, selectedMonth]);

  const benchmarkByCampaign = useMemo(
    () => new Map(benchmarks.map((benchmark) => [benchmark.campaignId, benchmark])),
    [benchmarks],
  );

  const includedCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) => benchmarkByCampaign.get(campaign.campaignId)?.includeInPerformance ?? true,
      ),
    [benchmarkByCampaign, campaigns],
  );

  useEffect(() => {
    setWeeklyInputs(
      Object.fromEntries(
        campaigns.map((campaign) => {
          const snapshot = snapshots.find(
            (record) =>
              record.campaignId === campaign.campaignId && record.weekStart === selectedWeekStart,
          );
          return [
            campaign.campaignId,
            {
              campaignId: campaign.campaignId,
              myOutreachVolume: snapshot?.myOutreachVolume ?? 0,
              myCreatorSubmissions: snapshot?.myCreatorSubmissions ?? 0,
              myCreatorApprovals: snapshot?.myCreatorApprovals ?? 0,
            },
          ];
        }),
      ),
    );
  }, [campaigns, selectedWeekStart, snapshots]);

  const selectedMonthSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) =>
          snapshot.month === selectedMonth &&
          includedCampaigns.some((campaign) => campaign.campaignId === snapshot.campaignId),
      ),
    [includedCampaigns, selectedMonth, snapshots],
  );

  const monthlyResult = useMemo(
    () =>
      calculateMonthlyResult({
        selectedMonth,
        includedCampaigns,
        snapshots: selectedMonthSnapshots,
        activeCreators,
        monthlyProfitKpi,
      }),
    [activeCreators, includedCampaigns, monthlyProfitKpi, selectedMonth, selectedMonthSnapshots],
  );
  const latestSnapshot = useMemo(
    () =>
      [...selectedMonthSnapshots].sort(
        (first, second) =>
          Date.parse(second.updatedAt || second.createdAt) -
          Date.parse(first.updatedAt || first.createdAt),
      )[0],
    [selectedMonthSnapshots],
  );
  const selectedWeekLabel = useMemo(
    () => weeks.find((week) => week.weekStart === selectedWeekStart)?.label ?? "Select a week",
    [selectedWeekStart, weeks],
  );

  function hydrateFromDatabase(
    database: CentralAppDatabase,
    source: "local-cache" | "google-sheets",
  ) {
    const nextCampaigns = database.worksheets.CampaignProfiles.map(campaignProfileToPerformance);
    const nextBenchmarks = nextCampaigns.map((campaign) =>
      createBenchmarkDraft(campaign, database.worksheets.PerformanceBenchmarks),
    );

    setCampaigns(nextCampaigns);
    setBenchmarks(nextBenchmarks);
    setSnapshots(database.worksheets.PerformanceWeeklyInputs);
    setActiveCreators(database.worksheets.ActiveCampaignCreators);
    setAppSettings(database.worksheets.AppSettings);
    if (source === "local-cache") {
      setStatusMessage("Loading shared performance data...");
    }
  }

  function patchBenchmark(campaignId: string, patch: Partial<BenchmarkDraft>) {
    setBenchmarks((current) =>
      current.map((benchmark) =>
        benchmark.campaignId === campaignId
          ? { ...benchmark, ...patch, updatedAt: new Date().toISOString() }
          : benchmark,
      ),
    );
  }

  function patchWeeklyInput(campaignId: string, patch: Partial<WeeklyInputDraft>) {
    setWeeklyInputs((current) => ({
      ...current,
      [campaignId]: {
        ...(current[campaignId] ?? createEmptyWeeklyInput(campaignId)),
        ...patch,
      },
    }));
  }

  async function savePerformanceSettings() {
    setIsSaving(true);
    setStatusMessage("Saving performance settings...");
    try {
      await persistPerformanceSettings();
      setStatusMessage("Performance settings saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Performance settings failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function generateWeeklySnapshot() {
    if (!selectedWeekStart) return;
    if (!includedCampaigns.length) {
      setStatusMessage("No campaigns are included in Performance Tracking.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("Generating weekly snapshot...");
    try {
      await persistPerformanceSettings();

      let nextSnapshots = snapshots;
      for (const campaign of includedCampaigns) {
        const benchmark = benchmarkByCampaign.get(campaign.campaignId);
        if (!benchmark) continue;
        const input =
          weeklyInputs[campaign.campaignId] ?? createEmptyWeeklyInput(campaign.campaignId);
        const calculation = calculateWeeklySnapshot({
          input,
          benchmark,
          selectedMonth,
          weekStart: selectedWeekStart,
        });
        const existing = snapshots.find(
          (snapshot) =>
            snapshot.campaignId === campaign.campaignId && snapshot.weekStart === selectedWeekStart,
        );
        const now = new Date().toISOString();
        const record: PerformanceWeeklyInputRecord = {
          inputId: existing?.inputId || `snapshot-${campaign.campaignId}-${selectedWeekStart}`,
          month: selectedMonth,
          weekStart: selectedWeekStart,
          campaignId: campaign.campaignId,
          myOutreachVolume: input.myOutreachVolume,
          myCreatorSubmissions: input.myCreatorSubmissions,
          myCreatorApprovals: input.myCreatorApprovals,
          myCampaignExecutions: 0,
          expectedProfit: 0,
          actualProfit: 0,
          outreachScore: calculation.outreach.capped ?? 0,
          submissionScore: calculation.submission.capped ?? 0,
          approvalScore: calculation.approval.capped ?? 0,
          executionScore: 0,
          weeklyScore: calculation.weeklyScore,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        nextSnapshots = await savePerformanceWeeklyInputToGoogleSheetsOnly(record);
      }
      setSnapshots(nextSnapshots);
      setStatusMessage("Weekly snapshot generated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Weekly snapshot failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function persistPerformanceSettings() {
    let nextBenchmarks = benchmarks.map(benchmarkDraftToRecord);
    for (const benchmark of benchmarks) {
      nextBenchmarks = await savePerformanceBenchmarkToGoogleSheetsOnly(
        benchmarkDraftToRecord(benchmark),
      );
    }
    const nextSettings = await saveAppSettingToGoogleSheetsOnly(
      `${monthlyKpiSettingPrefix}${selectedMonth}`,
      String(monthlyProfitKpi),
    );
    setBenchmarks(campaigns.map((campaign) => createBenchmarkDraft(campaign, nextBenchmarks)));
    setAppSettings(nextSettings);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-hero-glow" />

      <main className="katlas-page">
        <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/70 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_14%_8%,rgba(34,197,94,0.12),transparent_32%)]" />
          <div className="relative grid gap-7 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1 text-xs font-medium uppercase text-cyan-100/80">
                Employee Performance Tracking
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
                Weekly snapshots. Monthly signal.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Track outreach, submissions, approvals, and revenue pull in one operating view.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/80 bg-background/50 px-3 py-1">
                  100 = meeting expectations
                </span>
                <span className="rounded-full border border-border/80 bg-background/50 px-3 py-1">
                  Above 100 = outperforming
                </span>
                <span className="rounded-full border border-border/80 bg-background/50 px-3 py-1">
                  Below 100 = underperforming
                </span>
              </div>
            </div>
            <ScoreRing
              score={monthlyResult.finalScore}
              label="Monthly Score"
              detail={`${selectedMonth} · ${formatNumber(selectedMonthSnapshots.length)} snapshots`}
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.88fr_1.42fr]">
          <Panel
            title="Monthly Control"
            action={
              <span className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
                {selectedMonth}
              </span>
            }
          >
            <div className="grid gap-4">
              <MonthInput
                label="Selected Month"
                value={selectedMonth}
                onChange={setSelectedMonth}
              />
              <NumberInput
                label="Monthly Revenue/Profit Goal"
                value={monthlyProfitKpi}
                prefix="$"
                onChange={setMonthlyProfitKpi}
              />
              <button
                type="button"
                onClick={() => void savePerformanceSettings()}
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save Settings
              </button>
            </div>
          </Panel>

          <Panel
            title="Weekly Snapshot"
            action={
              <button
                type="button"
                onClick={() => void generateWeeklySnapshot()}
                disabled={isSaving || !includedCampaigns.length}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Generate Snapshot
              </button>
            }
          >
            <div className="mb-5 grid gap-3 lg:grid-cols-[320px_1fr] lg:items-end">
              <FieldLabel label="Week Period">
                <select
                  value={selectedWeekStart}
                  onChange={(event) => setSelectedWeekStart(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {weeks.map((week) => (
                    <option key={week.weekStart} value={week.weekStart}>
                      {week.label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="rounded-xl border border-border/75 bg-background/40 p-3">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 size-4 text-cyan-100/80" />
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Current week</p>
                    <p className="mt-1 text-sm font-medium">{selectedWeekLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="katlas-table-shell">
              <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <TableHeader>Campaign</TableHeader>
                    <TableHeader>My Outreach</TableHeader>
                    <TableHeader>My Submissions</TableHeader>
                    <TableHeader>My Approvals</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {includedCampaigns.length ? (
                    includedCampaigns.map((campaign) => {
                      const input =
                        weeklyInputs[campaign.campaignId] ??
                        createEmptyWeeklyInput(campaign.campaignId);
                      return (
                        <tr key={campaign.campaignId} className="border-t border-border">
                          <TableCell>
                            <span className="font-medium">{campaign.campaignName}</span>
                          </TableCell>
                          <TableCell>
                            <CompactNumberInput
                              value={input.myOutreachVolume}
                              onChange={(myOutreachVolume) =>
                                patchWeeklyInput(campaign.campaignId, { myOutreachVolume })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <CompactNumberInput
                              value={input.myCreatorSubmissions}
                              onChange={(myCreatorSubmissions) =>
                                patchWeeklyInput(campaign.campaignId, { myCreatorSubmissions })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <CompactNumberInput
                              value={input.myCreatorApprovals}
                              onChange={(myCreatorApprovals) =>
                                patchWeeklyInput(campaign.campaignId, { myCreatorApprovals })
                              }
                            />
                          </TableCell>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No campaigns are included in Performance Tracking.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {statusMessage ? (
              <p className="mt-3 text-xs text-muted-foreground">{statusMessage}</p>
            ) : null}
          </Panel>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            icon={<Gauge className="size-4" />}
            title="Monthly Score"
            value={formatNullableScore(monthlyResult.finalScore)}
            progress={monthlyResult.finalScore}
            accent="cyan"
          />
          <KpiCard
            icon={<TrendingUp className="size-4" />}
            title="Revenue Goal"
            value={formatNullableProgress(monthlyResult.revenueGoalProgress)}
            progress={monthlyResult.revenueGoalProgress}
            accent="emerald"
          />
          <KpiCard
            icon={<Send className="size-4" />}
            title="Outreach"
            value={formatNullableScore(monthlyResult.outreachPerformance)}
            progress={monthlyResult.outreachPerformance}
            accent="blue"
          />
          <KpiCard
            icon={<Activity className="size-4" />}
            title="Submissions"
            value={formatNullableScore(monthlyResult.submissionPerformance)}
            progress={monthlyResult.submissionPerformance}
            accent="violet"
          />
          <KpiCard
            icon={<CheckCircle2 className="size-4" />}
            title="Approvals"
            value={formatNullableScore(monthlyResult.approvalPerformance)}
            progress={monthlyResult.approvalPerformance}
            accent="green"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.16fr_0.84fr]">
          <Panel
            title="Snapshot History"
            action={
              <span className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
                {formatNumber(selectedMonthSnapshots.length)} saved
              </span>
            }
          >
            <div className="katlas-table-shell">
              <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <TableHeader>Campaign</TableHeader>
                    <TableHeader>Week</TableHeader>
                    <TableHeader>Snapshot Date</TableHeader>
                    <TableHeader>Weekly Score</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthSnapshots.length ? (
                    selectedMonthSnapshots.map((snapshot) => (
                      <tr key={snapshot.inputId} className="border-t border-border">
                        <TableCell>{campaignNameForId(campaigns, snapshot.campaignId)}</TableCell>
                        <TableCell>{formatWeekLabel(snapshot.weekStart)}</TableCell>
                        <TableCell>
                          {formatDateTime(snapshot.updatedAt || snapshot.createdAt)}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
                            {formatScore(snapshot.weeklyScore)}
                          </span>
                        </TableCell>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No weekly snapshots for this month yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Revenue Pull">
            <div className="grid gap-4">
              <div className="rounded-2xl border border-border/80 bg-background/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Pulled Revenue</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatCurrency(monthlyResult.monthlyRevenue)}
                    </p>
                  </div>
                  <BarChart3 className="size-5 text-cyan-100/80" />
                </div>
              </div>
              <div className="rounded-2xl border border-border/80 bg-background/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Pulled Profit</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatCurrency(monthlyResult.monthlyProfit)}
                    </p>
                  </div>
                  <Target className="size-5 text-emerald-100/80" />
                </div>
              </div>
              <div className="grid gap-2">
                <ResultRow label="Selected Month" value={selectedMonth} />
                <ResultRow
                  label="Included Campaigns"
                  value={formatNumber(includedCampaigns.length)}
                />
                <ResultRow label="Goal" value={formatCurrency(monthlyProfitKpi)} />
                <ResultRow
                  label="Latest Snapshot"
                  value={
                    latestSnapshot
                      ? formatDateTime(latestSnapshot.updatedAt || latestSnapshot.createdAt)
                      : "--"
                  }
                />
              </div>
            </div>
          </Panel>
        </section>

        <CollapsiblePanel title="Performance Setup">
          {campaigns.length ? (
            <div className="katlas-table-shell">
              <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <TableHeader>Include</TableHeader>
                    <TableHeader>Campaign</TableHeader>
                    <TableHeader>Team Size</TableHeader>
                    <TableHeader>Target Daily Outreach</TableHeader>
                    <TableHeader>Team Outreach Excl. Me</TableHeader>
                    <TableHeader>Team Submissions Excl. Me</TableHeader>
                    <TableHeader>Team Approvals Excl. Me</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((benchmark) => (
                    <tr key={benchmark.campaignId} className="border-t border-border">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={benchmark.includeInPerformance}
                          onChange={(event) =>
                            patchBenchmark(benchmark.campaignId, {
                              includeInPerformance: event.target.checked,
                            })
                          }
                          className="size-4 accent-primary"
                          aria-label={`Include ${benchmark.campaignName} in performance`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{benchmark.campaignName}</span>
                      </TableCell>
                      <TableCell>
                        <CompactNumberInput
                          value={benchmark.teamSize}
                          onChange={(teamSize) =>
                            patchBenchmark(benchmark.campaignId, {
                              teamSize: Math.max(1, Math.round(teamSize)),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <CompactNumberInput
                          value={benchmark.targetDailyOutreach}
                          onChange={(targetDailyOutreach) =>
                            patchBenchmark(benchmark.campaignId, { targetDailyOutreach })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <CompactNumberInput
                          value={benchmark.teamOutreachExcludingMe}
                          onChange={(teamOutreachExcludingMe) =>
                            patchBenchmark(benchmark.campaignId, { teamOutreachExcludingMe })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <CompactNumberInput
                          value={benchmark.teamSubmissionsExcludingMe}
                          onChange={(teamSubmissionsExcludingMe) =>
                            patchBenchmark(benchmark.campaignId, { teamSubmissionsExcludingMe })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <CompactNumberInput
                          value={benchmark.teamApprovalsExcludingMe}
                          onChange={(teamApprovalsExcludingMe) =>
                            patchBenchmark(benchmark.campaignId, { teamApprovalsExcludingMe })
                          }
                        />
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              No campaign profiles exist yet. Create campaigns in Campaign Profiles first.
            </p>
          )}
        </CollapsiblePanel>
      </main>
    </div>
  );
}

function campaignProfileToPerformance(record: CampaignProfileRecord): PerformanceCampaign {
  return {
    campaignId: record.campaignId,
    campaignName: record.campaignName || "Untitled Campaign",
    campaignCode: record.campaignCode,
  };
}

function createBenchmarkDraft(
  campaign: PerformanceCampaign,
  records: PerformanceBenchmarkRecord[],
): BenchmarkDraft {
  const existing = records.find((record) => record.campaignId === campaign.campaignId);
  const now = new Date().toISOString();
  return {
    benchmarkId: existing?.benchmarkId || `benchmark-${campaign.campaignId}`,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    includeInPerformance: parseBoolean(existing?.includeInPerformance, true),
    teamSize: Math.max(1, existing?.teamSize || 1),
    targetDailyOutreach: existing?.targetDailyOutreach || defaultTargetDailyOutreach,
    teamOutreachExcludingMe: existing?.teamOutreachExcludingMe ?? 0,
    teamSubmissionsExcludingMe: existing?.teamSubmissionsExcludingMe ?? 0,
    teamApprovalsExcludingMe: existing?.teamApprovalsExcludingMe ?? 0,
    createdAt: existing?.createdAt || now,
    updatedAt: existing?.updatedAt || now,
  };
}

function benchmarkDraftToRecord(benchmark: BenchmarkDraft): PerformanceBenchmarkRecord {
  return {
    benchmarkId: benchmark.benchmarkId,
    campaignId: benchmark.campaignId,
    includeInPerformance: benchmark.includeInPerformance ? "TRUE" : "FALSE",
    teamSize: Math.max(1, benchmark.teamSize),
    targetDailyOutreach: benchmark.targetDailyOutreach,
    teamOutreachExcludingMe: benchmark.teamOutreachExcludingMe,
    teamSubmissionsExcludingMe: benchmark.teamSubmissionsExcludingMe,
    teamApprovalsExcludingMe: benchmark.teamApprovalsExcludingMe,
    createdAt: benchmark.createdAt,
    updatedAt: benchmark.updatedAt,
  };
}

function createEmptyWeeklyInput(campaignId: string): WeeklyInputDraft {
  return {
    campaignId,
    myOutreachVolume: 0,
    myCreatorSubmissions: 0,
    myCreatorApprovals: 0,
  };
}

function calculateWeeklySnapshot({
  input,
  benchmark,
  selectedMonth,
  weekStart,
}: {
  input: WeeklyInputDraft;
  benchmark: BenchmarkDraft;
  selectedMonth: string;
  weekStart: string;
}): WeeklySnapshotCalculation {
  const workingDays = countWeekdaysInsideMonth(weekStart, selectedMonth);
  const targetOutreach = benchmark.targetDailyOutreach * workingDays;
  const peerCount = Math.max(1, benchmark.teamSize - 1);
  const teamSubmissionBenchmark = benchmark.teamSubmissionsExcludingMe / peerCount;
  const teamApprovalBenchmark = benchmark.teamApprovalsExcludingMe / peerCount;

  const outreach = createScore(input.myOutreachVolume, targetOutreach, 100);
  const submission = createScore(input.myCreatorSubmissions, teamSubmissionBenchmark, 150);
  const approval = createScore(input.myCreatorApprovals, teamApprovalBenchmark, 150);

  const weightedScores = [
    [outreach, weeklyWeights.outreach],
    [submission, weeklyWeights.submission],
    [approval, weeklyWeights.approval],
  ] as const;
  const availableWeight = weightedScores.reduce(
    (sum, [score, weight]) => sum + (score.capped === null ? 0 : weight),
    0,
  );
  const weightedTotal = weightedScores.reduce(
    (sum, [score, weight]) => sum + (score.capped === null ? 0 : score.capped * weight),
    0,
  );

  return {
    outreach,
    submission,
    approval,
    weeklyScore: availableWeight > 0 ? weightedTotal / availableWeight : 0,
  };
}

function createScore(numerator: number, denominator: number, cap: number): ScoreValue {
  if (denominator <= 0) return { raw: null, capped: null };
  const raw = (numerator / denominator) * 100;
  return { raw, capped: Math.min(raw, cap) };
}

function calculateMonthlyResult({
  selectedMonth,
  includedCampaigns,
  snapshots,
  activeCreators,
  monthlyProfitKpi,
}: {
  selectedMonth: string;
  includedCampaigns: PerformanceCampaign[];
  snapshots: PerformanceWeeklyInputRecord[];
  activeCreators: ActiveCampaignCreatorRecord[];
  monthlyProfitKpi: number;
}) {
  const includedCampaignIds = new Set(includedCampaigns.map((campaign) => campaign.campaignId));
  const monthlyCreators = activeCreators.filter(
    (creator) => creator.month === selectedMonth && includedCampaignIds.has(creator.campaignId),
  );
  const monthlyRevenue = monthlyCreators.reduce(
    (sum, creator) => sum + numberValue(creator.externalQuote),
    0,
  );
  const monthlyProfit = monthlyCreators.reduce(
    (sum, creator) =>
      sum +
      (numberValue(creator.profit) ||
        numberValue(creator.externalQuote) - numberValue(creator.internalQuote)),
    0,
  );
  const monthlyActivityAverage = snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + numberValue(snapshot.weeklyScore), 0) /
      snapshots.length
    : null;
  const outreachPerformance = averageSnapshotScore(snapshots, "outreachScore");
  const submissionPerformance = averageSnapshotScore(snapshots, "submissionScore");
  const approvalPerformance = averageSnapshotScore(snapshots, "approvalScore");
  const revenueGoalProgress =
    monthlyProfitKpi > 0 ? Math.min((monthlyRevenue / monthlyProfitKpi) * 100, 150) : null;
  const profitScore =
    monthlyProfitKpi > 0 ? Math.min((monthlyProfit / monthlyProfitKpi) * 100, 150) : null;
  const finalScore =
    monthlyActivityAverage !== null && profitScore !== null
      ? monthlyActivityAverage * 0.6 + profitScore * 0.4
      : null;

  return {
    monthlyRevenue,
    monthlyProfit,
    monthlyActivityAverage,
    revenueGoalProgress,
    outreachPerformance,
    submissionPerformance,
    approvalPerformance,
    profitScore,
    finalScore,
  };
}

function averageSnapshotScore(
  snapshots: PerformanceWeeklyInputRecord[],
  key: "outreachScore" | "submissionScore" | "approvalScore",
) {
  return snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + numberValue(snapshot[key]), 0) / snapshots.length
    : null;
}

function readMonthlyProfitKpi(settings: AppSettingRecord[], selectedMonth: string) {
  const monthly = settings.find(
    (setting) => setting.settingKey === `${monthlyKpiSettingPrefix}${selectedMonth}`,
  );
  const legacy = settings.find((setting) => setting.settingKey === "performance.monthlyProfitKpi");
  return numberValue(monthly?.settingValue ?? legacy?.settingValue);
}

function getWeeksOverlappingMonth(month: string) {
  if (!month) return [];
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return [];
  const firstDay = new Date(year, monthIndex - 1, 1);
  const lastDay = new Date(year, monthIndex, 0);
  const start = new Date(firstDay);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);

  const weeks: Array<{ weekStart: string; label: string }> = [];
  const cursor = new Date(start);
  while (cursor <= lastDay) {
    const weekStart = toDateInputValue(cursor);
    const weekEndDate = new Date(cursor);
    weekEndDate.setDate(cursor.getDate() + 6);
    weeks.push({
      weekStart,
      label: `${formatShortDate(cursor)} - ${formatShortDate(weekEndDate)}`,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function countWeekdaysInsideMonth(weekStart: string, month: string) {
  const start = parseDateInputValue(weekStart);
  if (!start) return 0;
  let count = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const dayMonth = toDateInputValue(day).slice(0, 7);
    const weekday = day.getDay();
    if (dayMonth === month && weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

function formatWeekLabel(weekStart: string) {
  const start = parseDateInputValue(weekStart);
  if (!start) return weekStart || "--";
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function campaignNameForId(campaigns: PerformanceCampaign[], campaignId: string) {
  return (
    campaigns.find((campaign) => campaign.campaignId === campaignId)?.campaignName ?? "Campaign"
  );
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthValue(): string {
  return toDateInputValue(new Date()).slice(0, 7);
}

function parseBoolean(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "1", "include", "included"].includes(normalized)) return true;
  if (["false", "no", "0", "exclude", "excluded", "disabled"].includes(normalized)) return false;
  return fallback;
}

function numberValue(value: unknown): number {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="katlas-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CollapsiblePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="katlas-panel group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manager setup for campaign inclusion and team benchmarks.
          </p>
        </div>
        <span className="text-sm text-muted-foreground group-open:hidden">Expand</span>
        <span className="hidden text-sm text-muted-foreground group-open:inline">Collapse</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function ScoreRing({
  score,
  label,
  detail,
}: {
  score: number | null;
  label: string;
  detail: string;
}) {
  const progress = normalizeScoreProgress(score);
  const scoreText = formatNullableScore(score);
  return (
    <div className="relative mx-auto grid w-full max-w-[340px] place-items-center rounded-3xl border border-border/80 bg-background/35 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div
        className="grid size-52 place-items-center rounded-full p-2 shadow-[0_0_46px_rgba(34,211,238,0.12)]"
        style={{
          background: `conic-gradient(rgba(34,211,238,0.9) ${progress * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
        aria-label={`${label}: ${scoreText}`}
      >
        <div className="grid size-full place-items-center rounded-full border border-border/80 bg-card">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">{scoreText}</p>
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
        <span className="rounded-full border border-border/70 bg-card/60 px-2 py-1">0</span>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-cyan-100">
          100
        </span>
        <span className="rounded-full border border-border/70 bg-card/60 px-2 py-1">150</span>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  progress,
  accent,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  progress: number | null;
  accent: "cyan" | "emerald" | "blue" | "violet" | "green";
}) {
  const tone = kpiTones[accent];
  return (
    <div className="rounded-2xl border border-border/80 bg-card/75 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid size-9 place-items-center rounded-xl border ${tone.icon}`}>
          {icon}
        </div>
        <span className="rounded-full border border-border/70 bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground">
          KPI
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <ProgressBar value={progress} colorClass={tone.bar} />
    </div>
  );
}

function ProgressBar({ value, colorClass }: { value: number | null; colorClass: string }) {
  const progress = normalizeScoreProgress(value);
  return (
    <div className="mt-4">
      <div className="relative h-2 overflow-hidden rounded-full bg-background/70">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${progress}%` }} />
        <div className="absolute left-[66.666%] top-0 h-full w-px bg-foreground/45" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>100</span>
        <span>150</span>
      </div>
    </div>
  );
}

const kpiTones = {
  cyan: {
    icon: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    bar: "bg-cyan-300",
  },
  emerald: {
    icon: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    bar: "bg-emerald-300",
  },
  blue: {
    icon: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    bar: "bg-sky-300",
  },
  violet: {
    icon: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    bar: "bg-violet-300",
  },
  green: {
    icon: "border-lime-300/20 bg-lime-300/10 text-lime-100",
    bar: "bg-lime-300",
  },
} as const;

function normalizeScoreProgress(value: number | null): number {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, (value / 150) * 100));
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function MonthInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value}
        type="month"
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function NumberInput({
  label,
  value,
  prefix,
  onChange,
}: {
  label: string;
  value: number;
  prefix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <FieldLabel label={label}>
      <div className="flex h-10 items-center rounded-md border border-input bg-background">
        {prefix ? <span className="pl-3 text-sm text-muted-foreground">{prefix}</span> : null}
        <input
          value={value || ""}
          type="number"
          min="0"
          step="0.01"
          onChange={(event) => onChange(Math.max(0, numberValue(event.target.value)))}
          className="h-full w-full bg-transparent px-3 text-sm outline-none"
        />
      </div>
    </FieldLabel>
  );
}

function CompactNumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      value={value || ""}
      type="number"
      min="0"
      step="0.01"
      onChange={(event) => onChange(Math.max(0, numberValue(event.target.value)))}
      className="h-9 w-full min-w-24 rounded-md border border-input bg-background px-2 text-sm outline-none ring-ring focus:ring-2"
    />
  );
}

function TableHeader({ children }: { children: ReactNode }) {
  return <th className="px-3 py-3 font-medium">{children}</th>;
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatScore(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatNullableScore(value: number | null): string {
  return value === null ? "--" : formatScore(value);
}

function formatNullableProgress(value: number | null): string {
  return value === null ? "--" : `${formatScore(value)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
