import { useEffect, useMemo, useState, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import {
  loadAppDatabase,
  loadAppDatabaseFromGoogleSheetsOnly,
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
  myCampaignExecutions: number;
};

type ScoreValue = {
  raw: number | null;
  capped: number | null;
};

type WeeklySnapshotCalculation = {
  outreach: ScoreValue;
  submission: ScoreValue;
  approval: ScoreValue;
  execution: ScoreValue;
  weeklyScore: number;
};

const defaultTargetDailyOutreach = 25;
const monthlyKpiSettingPrefix = "performance.monthlyProfitKpi.";

const weeklyWeights = {
  outreach: 0.15,
  submission: 0.25,
  approval: 0.3,
  execution: 0.3,
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
        const database = await loadAppDatabaseFromGoogleSheetsOnly({
          reason: "employee-performance:load",
          force: true,
        });
        if (cancelled) return;
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
              myCampaignExecutions: snapshot?.myCampaignExecutions ?? 0,
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
          myCampaignExecutions: input.myCampaignExecutions,
          expectedProfit: 0,
          actualProfit: 0,
          outreachScore: calculation.outreach.capped ?? 0,
          submissionScore: calculation.submission.capped ?? 0,
          approvalScore: calculation.approval.capped ?? 0,
          executionScore: calculation.execution.capped ?? 0,
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
        <section className="katlas-hero-panel">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Employee Performance Tracking
              </p>
              <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">
                Weekly snapshots with monthly rollup
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Select a month, generate weekly snapshots, and let monthly profit pull from Active
                Campaign Management.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
              <p>100 = meeting expectations</p>
              <p>Above 100 = outperforming</p>
              <p>Below 100 = underperforming</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Monthly Score" value={formatNullableScore(monthlyResult.finalScore)} />
          <MetricCard
            title="Activity Average"
            value={formatNullableScore(monthlyResult.monthlyActivityAverage)}
          />
          <MetricCard title="Profit Score" value={formatNullableScore(monthlyResult.profitScore)} />
          <MetricCard title="Pulled Profit" value={formatCurrency(monthlyResult.monthlyProfit)} />
          <MetricCard title="Snapshots" value={formatNumber(selectedMonthSnapshots.length)} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Panel title="1. Monthly Setup">
            <div className="grid gap-3">
              <MonthInput
                label="Selected Month"
                value={selectedMonth}
                onChange={setSelectedMonth}
              />
              <NumberInput
                label="Monthly Profit KPI"
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

          <Panel title="2. Project Performance Controls">
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
          </Panel>
        </section>

        <Panel
          title="3. Weekly Input"
          action={
            <button
              type="button"
              onClick={() => void generateWeeklySnapshot()}
              disabled={isSaving || !includedCampaigns.length}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Generate Weekly Snapshot
            </button>
          }
        >
          <div className="mb-4 grid gap-3 md:grid-cols-[320px_1fr] md:items-end">
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
            <p className="text-sm leading-6 text-muted-foreground">
              Weekly inputs only store activity. Profit comes from Active Campaign Management rows
              with Month = {selectedMonth}.
            </p>
          </div>

          <div className="katlas-table-shell">
            <table className="min-w-[860px] w-full border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <TableHeader>Campaign</TableHeader>
                  <TableHeader>My Outreach</TableHeader>
                  <TableHeader>My Submissions</TableHeader>
                  <TableHeader>My Approvals</TableHeader>
                  <TableHeader>My Executions</TableHeader>
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
                        <TableCell>
                          <CompactNumberInput
                            value={input.myCampaignExecutions}
                            onChange={(myCampaignExecutions) =>
                              patchWeeklyInput(campaign.campaignId, { myCampaignExecutions })
                            }
                          />
                        </TableCell>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
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

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="4. Snapshot History">
            <div className="katlas-table-shell">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <TableHeader>Campaign</TableHeader>
                    <TableHeader>Week</TableHeader>
                    <TableHeader>Outreach</TableHeader>
                    <TableHeader>Submissions</TableHeader>
                    <TableHeader>Approvals</TableHeader>
                    <TableHeader>Executions</TableHeader>
                    <TableHeader>Weekly Score</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthSnapshots.length ? (
                    selectedMonthSnapshots.map((snapshot) => (
                      <tr key={snapshot.inputId} className="border-t border-border">
                        <TableCell>{campaignNameForId(campaigns, snapshot.campaignId)}</TableCell>
                        <TableCell>{formatWeekLabel(snapshot.weekStart)}</TableCell>
                        <TableCell>{formatNumber(snapshot.myOutreachVolume)}</TableCell>
                        <TableCell>{formatNumber(snapshot.myCreatorSubmissions)}</TableCell>
                        <TableCell>{formatNumber(snapshot.myCreatorApprovals)}</TableCell>
                        <TableCell>{formatNumber(snapshot.myCampaignExecutions)}</TableCell>
                        <TableCell>{formatScore(snapshot.weeklyScore)}</TableCell>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
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

          <Panel title="5. Monthly Score Result">
            <div className="grid gap-3">
              <ResultRow label="Selected Month" value={selectedMonth} />
              <ResultRow
                label="Included Campaigns"
                value={formatNumber(includedCampaigns.length)}
              />
              <ResultRow
                label="Monthly Activity Average"
                value={formatNullableScore(monthlyResult.monthlyActivityAverage)}
              />
              <ResultRow
                label="Pulled Revenue"
                value={formatCurrency(monthlyResult.monthlyRevenue)}
              />
              <ResultRow
                label="Pulled Profit"
                value={formatCurrency(monthlyResult.monthlyProfit)}
              />
              <ResultRow label="Monthly Profit KPI" value={formatCurrency(monthlyProfitKpi)} />
              <ResultRow
                label="Profit Score"
                value={formatNullableScore(monthlyResult.profitScore)}
              />
              <ResultRow
                label="Final Monthly Score"
                value={formatNullableScore(monthlyResult.finalScore)}
              />
            </div>
            <details className="mt-4 rounded-lg border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-medium">
                View calculation details
              </summary>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <p>
                  Weekly snapshots score activity from outreach, submissions, approvals, and
                  executions.
                </p>
                <p>
                  Team size normalizes team benchmarks so larger teams do not unfairly inflate
                  comparison numbers.
                </p>
                <p>
                  Monthly score combines the average saved weekly snapshot score with monthly profit
                  pulled from Active Campaign Management.
                </p>
              </div>
            </details>
          </Panel>
        </section>
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
    myCampaignExecutions: 0,
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
  const execution = createScore(
    input.myCampaignExecutions,
    Math.max(input.myCreatorApprovals, 1),
    150,
  );

  const weightedScores = [
    [outreach, weeklyWeights.outreach],
    [submission, weeklyWeights.submission],
    [approval, weeklyWeights.approval],
    [execution, weeklyWeights.execution],
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
    execution,
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
    profitScore,
    finalScore,
  };
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

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="katlas-panel p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
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

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
