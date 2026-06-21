import { useEffect, useMemo, useState, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import { loadCampaignRegistry, type GlobalCampaign } from "@/lib/campaignRegistry";
import {
  getAppSetting,
  readPerformanceBenchmarks,
  readPerformanceWeeklyInputs,
  updateDatabase,
} from "@/storage/appRepository";
import type { AppSettingRecord } from "@/storage/schema";

type CampaignPerformanceInput = {
  id: string;
  campaignId: string;
  campaignName: string;
  targetDailyOutreachVolume: number;
  teamOutreachVolumeExcludingMe: number;
  teamSubmissionsExcludingMe: number;
  teamApprovalsExcludingMe: number;
  myOutreachVolume: number;
  myCreatorSubmissions: number;
  myCreatorApprovals: number;
  myCampaignExecutions: number;
  expectedProfit: number;
  actualProfit: number;
};

type EmployeePerformanceState = {
  monthlyProfitKpi: number;
  workingDays: number;
  campaigns: CampaignPerformanceInput[];
  updatedAt: string;
};

type ScoreResult = {
  rawScore: number | null;
  cappedScore: number | null;
  weightedContribution: number | null;
  unavailableReason?: string;
};

const defaultTargetDailyOutreach = 25;

const scoreWeights = {
  outreach: 0.15,
  submission: 0.25,
  approval: 0.2,
  profit: 0.4,
} as const;

export function EmployeePerformanceTracking() {
  const [loaded, setLoaded] = useState(false);
  const [campaignProfiles, setCampaignProfiles] = useState<GlobalCampaign[]>([]);
  const [state, setState] = useState<EmployeePerformanceState>(() =>
    createDefaultPerformanceState([]),
  );

  useEffect(() => {
    const campaigns = loadCampaignRegistry().campaigns;
    setCampaignProfiles(campaigns);
    setState(loadPerformanceState(campaigns));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    savePerformanceState(state);
  }, [loaded, state]);

  const calculations = useMemo(() => calculateScores(state), [state]);

  function patchState(patch: Partial<EmployeePerformanceState>) {
    setState((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  }

  function patchCampaign(id: string, patch: Partial<CampaignPerformanceInput>) {
    setState((current) => ({
      ...current,
      campaigns: current.campaigns.map((campaign) =>
        campaign.id === id ? { ...campaign, ...patch } : campaign,
      ),
      updatedAt: new Date().toISOString(),
    }));
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
                KPI scoring for influencer booking work
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                A mathematical scorecard based on outreach, submission quality, approvals, and
                profit. No AI, no subjective labels.
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
          <MainScoreCard score={calculations.employeeScore} />
          <ScoreSummaryCard title="Outreach Score" result={calculations.outreach} />
          <ScoreSummaryCard title="Submission Score" result={calculations.submission} />
          <ScoreSummaryCard title="Approval Score" result={calculations.approval} />
          <ScoreSummaryCard title="Profit Score" result={calculations.profit} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Panel title="1. Monthly KPI Setup">
            <div className="grid gap-3">
              <NumberInput
                label="Monthly Profit KPI"
                value={state.monthlyProfitKpi}
                prefix="$"
                onChange={(monthlyProfitKpi) => patchState({ monthlyProfitKpi })}
              />
              <NumberInput
                label="Working Days In Selected Period"
                value={state.workingDays}
                onChange={(workingDays) => patchState({ workingDays })}
              />
            </div>
          </Panel>

          <Panel title="2. Campaign Benchmarks">
            {campaignProfiles.length ? (
              <div className="katlas-table-shell">
                <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <TableHeader>Campaign Name</TableHeader>
                      <TableHeader>Target Daily Outreach</TableHeader>
                      <TableHeader>Team Outreach Excluding Me</TableHeader>
                      <TableHeader>Team Submissions Excluding Me</TableHeader>
                      <TableHeader>Team Approvals Excluding Me</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {state.campaigns.map((campaign) => (
                      <tr key={campaign.id} className="border-t border-border">
                        <TableCell>
                          <span className="font-medium">{campaign.campaignName}</span>
                        </TableCell>
                        <TableCell>
                          <CompactNumberInput
                            value={campaign.targetDailyOutreachVolume}
                            onChange={(targetDailyOutreachVolume) =>
                              patchCampaign(campaign.id, { targetDailyOutreachVolume })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <CompactNumberInput
                            value={campaign.teamOutreachVolumeExcludingMe}
                            onChange={(teamOutreachVolumeExcludingMe) =>
                              patchCampaign(campaign.id, { teamOutreachVolumeExcludingMe })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <CompactNumberInput
                            value={campaign.teamSubmissionsExcludingMe}
                            onChange={(teamSubmissionsExcludingMe) =>
                              patchCampaign(campaign.id, { teamSubmissionsExcludingMe })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <CompactNumberInput
                            value={campaign.teamApprovalsExcludingMe}
                            onChange={(teamApprovalsExcludingMe) =>
                              patchCampaign(campaign.id, { teamApprovalsExcludingMe })
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

        <Panel title="3. Weekly Input">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Enter your weekly work manually for now. Approvals, executions, expected profit, and
            actual profit are ready to be pulled from Active Campaign Management later.
          </p>
          <div className="katlas-table-shell">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <TableHeader>Campaign</TableHeader>
                  <TableHeader>My Outreach Volume</TableHeader>
                  <TableHeader>My Creator Submissions</TableHeader>
                  <TableHeader>My Creator Approvals</TableHeader>
                  <TableHeader>My Campaign Executions</TableHeader>
                  <TableHeader>Expected Profit</TableHeader>
                  <TableHeader>Actual Profit</TableHeader>
                </tr>
              </thead>
              <tbody>
                {state.campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-border">
                    <TableCell>
                      <span className="font-medium">{campaign.campaignName || "Untitled"}</span>
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.myOutreachVolume}
                        onChange={(myOutreachVolume) =>
                          patchCampaign(campaign.id, { myOutreachVolume })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.myCreatorSubmissions}
                        onChange={(myCreatorSubmissions) =>
                          patchCampaign(campaign.id, { myCreatorSubmissions })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.myCreatorApprovals}
                        onChange={(myCreatorApprovals) =>
                          patchCampaign(campaign.id, { myCreatorApprovals })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.myCampaignExecutions}
                        onChange={(myCampaignExecutions) =>
                          patchCampaign(campaign.id, { myCampaignExecutions })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.expectedProfit}
                        onChange={(expectedProfit) =>
                          patchCampaign(campaign.id, { expectedProfit })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CompactNumberInput
                        value={campaign.actualProfit}
                        onChange={(actualProfit) => patchCampaign(campaign.id, { actualProfit })}
                      />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="4. Score Breakdown">
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="Outreach Score"
              result={calculations.outreach}
              rows={[
                ["My Outreach", formatNumber(calculations.totals.myOutreach)],
                ["Target Outreach", formatNumber(calculations.totals.targetOutreach)],
                [
                  "Calculation",
                  `${formatNumber(calculations.totals.myOutreach)} / ${formatNumber(
                    calculations.totals.targetOutreach,
                  )} × 100`,
                ],
              ]}
            />
            <BreakdownCard
              title="Submission Score"
              result={calculations.submission}
              rows={[
                [
                  "My Submissions / My Outreach",
                  `${formatNumber(calculations.totals.mySubmissions)} / ${formatNumber(
                    calculations.totals.myOutreach,
                  )}`,
                ],
                [
                  "Team Submissions / Team Outreach",
                  `${formatNumber(calculations.totals.teamSubmissions)} / ${formatNumber(
                    calculations.totals.teamOutreach,
                  )}`,
                ],
                ["My Rate", formatPercentValue(calculations.rates.mySubmissionRate)],
                ["Team Rate", formatPercentValue(calculations.rates.teamSubmissionRate)],
              ]}
            />
            <BreakdownCard
              title="Approval Score"
              result={calculations.approval}
              rows={[
                [
                  "My Approvals / My Submissions",
                  `${formatNumber(calculations.totals.myApprovals)} / ${formatNumber(
                    calculations.totals.mySubmissions,
                  )}`,
                ],
                [
                  "Team Approvals / Team Submissions",
                  `${formatNumber(calculations.totals.teamApprovals)} / ${formatNumber(
                    calculations.totals.teamSubmissions,
                  )}`,
                ],
                ["My Rate", formatPercentValue(calculations.rates.myApprovalRate)],
                ["Team Rate", formatPercentValue(calculations.rates.teamApprovalRate)],
              ]}
            />
            <BreakdownCard
              title="Profit Score"
              result={calculations.profit}
              rows={[
                ["Actual Profit", formatCurrency(calculations.totals.actualProfit)],
                ["Monthly Profit KPI", formatCurrency(state.monthlyProfitKpi)],
                [
                  "Calculation",
                  `${formatCurrency(calculations.totals.actualProfit)} / ${formatCurrency(
                    state.monthlyProfitKpi,
                  )} × 100`,
                ],
              ]}
            />
          </div>
        </Panel>

        <Panel title="5. Formula Explanation">
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Employee Score = 15% Outreach Score + 25% Submission Score + 20% Approval Score + 40%
              Profit Score.
            </p>
            <p>
              This scoring system rewards outcomes more than activity. Outreach prevents doing
              nothing, but it is capped at 100 and only weighted 15%.
            </p>
            <p>
              Submissions, approvals, and profit carry more weight because they reflect actual
              business value. Profit is the highest weighted component because company profit is the
              most important outcome.
            </p>
          </div>
        </Panel>
      </main>
    </div>
  );
}

function calculateScores(state: EmployeePerformanceState) {
  const totals = state.campaigns.reduce(
    (sum, campaign) => ({
      targetOutreach:
        sum.targetOutreach + campaign.targetDailyOutreachVolume * Math.max(state.workingDays, 0),
      teamOutreach: sum.teamOutreach + campaign.teamOutreachVolumeExcludingMe,
      teamSubmissions: sum.teamSubmissions + campaign.teamSubmissionsExcludingMe,
      teamApprovals: sum.teamApprovals + campaign.teamApprovalsExcludingMe,
      myOutreach: sum.myOutreach + campaign.myOutreachVolume,
      mySubmissions: sum.mySubmissions + campaign.myCreatorSubmissions,
      myApprovals: sum.myApprovals + campaign.myCreatorApprovals,
      actualProfit: sum.actualProfit + campaign.actualProfit,
      expectedProfit: sum.expectedProfit + campaign.expectedProfit,
      executions: sum.executions + campaign.myCampaignExecutions,
    }),
    {
      targetOutreach: 0,
      teamOutreach: 0,
      teamSubmissions: 0,
      teamApprovals: 0,
      myOutreach: 0,
      mySubmissions: 0,
      myApprovals: 0,
      actualProfit: 0,
      expectedProfit: 0,
      executions: 0,
    },
  );

  const mySubmissionRate = safeRate(totals.mySubmissions, totals.myOutreach);
  const teamSubmissionRate = safeRate(totals.teamSubmissions, totals.teamOutreach);
  const myApprovalRate = safeRate(totals.myApprovals, totals.mySubmissions);
  const teamApprovalRate = safeRate(totals.teamApprovals, totals.teamSubmissions);

  const outreach = createScore({
    rawScore: safeScore(totals.myOutreach, totals.targetOutreach),
    cap: 100,
    weight: scoreWeights.outreach,
    unavailableReason: totals.targetOutreach <= 0 ? "No target available." : undefined,
  });

  const submission = createScore({
    rawScore:
      teamSubmissionRate && teamSubmissionRate > 0
        ? ((mySubmissionRate ?? 0) / teamSubmissionRate) * 100
        : null,
    cap: 150,
    weight: scoreWeights.submission,
    unavailableReason:
      teamSubmissionRate && teamSubmissionRate > 0 ? undefined : "No benchmark available.",
  });

  const approval = createScore({
    rawScore:
      teamApprovalRate && teamApprovalRate > 0
        ? ((myApprovalRate ?? 0) / teamApprovalRate) * 100
        : null,
    cap: 150,
    weight: scoreWeights.approval,
    unavailableReason:
      teamApprovalRate && teamApprovalRate > 0 ? undefined : "No benchmark available.",
  });

  const profit = createScore({
    rawScore:
      state.monthlyProfitKpi > 0 ? (totals.actualProfit / state.monthlyProfitKpi) * 100 : null,
    cap: 150,
    weight: scoreWeights.profit,
    unavailableReason: state.monthlyProfitKpi > 0 ? undefined : "No KPI set.",
  });

  const componentScores = [outreach, submission, approval, profit];
  const employeeScore = componentScores.every((score) => score.weightedContribution !== null)
    ? componentScores.reduce((sum, score) => sum + (score.weightedContribution ?? 0), 0)
    : null;

  return {
    totals,
    rates: {
      mySubmissionRate,
      teamSubmissionRate,
      myApprovalRate,
      teamApprovalRate,
    },
    outreach,
    submission,
    approval,
    profit,
    employeeScore,
  };
}

function createScore({
  rawScore,
  cap,
  weight,
  unavailableReason,
}: {
  rawScore: number | null;
  cap: number;
  weight: number;
  unavailableReason?: string;
}): ScoreResult {
  if (rawScore === null || !Number.isFinite(rawScore)) {
    return {
      rawScore: null,
      cappedScore: null,
      weightedContribution: null,
      unavailableReason,
    };
  }

  const cappedScore = Math.min(rawScore, cap);
  return {
    rawScore,
    cappedScore,
    weightedContribution: cappedScore * weight,
  };
}

function MainScoreCard({ score }: { score: number | null }) {
  return (
    <div className="katlas-panel p-4">
      <p className="text-xs text-muted-foreground">Employee Score</p>
      <p className="mt-2 text-3xl font-semibold">{score === null ? "--" : formatScore(score)}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {score === null ? "Set benchmarks and KPI to calculate." : "Weighted score out of 100."}
      </p>
    </div>
  );
}

function ScoreSummaryCard({ title, result }: { title: string; result: ScoreResult }) {
  return (
    <div className="katlas-panel p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">
        {result.cappedScore === null ? "--" : formatScore(result.cappedScore)}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {result.unavailableReason ?? `${formatScore(result.weightedContribution ?? 0)} / 100`}
      </p>
    </div>
  );
}

function BreakdownCard({
  title,
  result,
  rows,
}: {
  title: string;
  result: ScoreResult;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <ScoreRow key={label} label={label} value={value} />
        ))}
        <ScoreRow label="Raw Score" value={formatNullableScore(result.rawScore)} />
        <ScoreRow label="Capped Score" value={formatNullableScore(result.cappedScore)} />
        <ScoreRow
          label="Weighted Contribution"
          value={
            result.weightedContribution === null
              ? (result.unavailableReason ?? "--")
              : `${formatScore(result.weightedContribution)} / 100`
          }
        />
      </div>
    </section>
  );
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
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
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex h-10 items-center rounded-md border border-input bg-background">
        {prefix ? <span className="pl-3 text-sm text-muted-foreground">{prefix}</span> : null}
        <input
          value={value || ""}
          type="number"
          min="0"
          step="0.01"
          onChange={(event) => onChange(toNumber(event.target.value))}
          className="h-full w-full bg-transparent px-3 text-sm outline-none"
        />
      </div>
    </label>
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
      onChange={(event) => onChange(toNumber(event.target.value))}
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

function loadPerformanceState(campaignProfiles: GlobalCampaign[]): EmployeePerformanceState {
  if (typeof window === "undefined") return createDefaultPerformanceState(campaignProfiles);
  return createPerformanceStateFromRepository(campaignProfiles);
}

function savePerformanceState(state: EmployeePerformanceState) {
  if (typeof window === "undefined") return;
  updateDatabase((database) => {
    const now = new Date().toISOString();
    database.worksheets.PerformanceBenchmarks = state.campaigns.map((campaign) => ({
      benchmarkId: `benchmark-${campaign.campaignId}`,
      campaignId: campaign.campaignId,
      targetDailyOutreach: campaign.targetDailyOutreachVolume,
      teamOutreachExcludingMe: campaign.teamOutreachVolumeExcludingMe,
      teamSubmissionsExcludingMe: campaign.teamSubmissionsExcludingMe,
      teamApprovalsExcludingMe: campaign.teamApprovalsExcludingMe,
      createdAt: now,
      updatedAt: state.updatedAt,
    }));
    database.worksheets.PerformanceWeeklyInputs = state.campaigns.map((campaign) => ({
      inputId: `weekly-${campaign.campaignId}`,
      weekStart: "",
      campaignId: campaign.campaignId,
      myOutreachVolume: campaign.myOutreachVolume,
      myCreatorSubmissions: campaign.myCreatorSubmissions,
      myCreatorApprovals: campaign.myCreatorApprovals,
      myCampaignExecutions: campaign.myCampaignExecutions,
      expectedProfit: campaign.expectedProfit,
      actualProfit: campaign.actualProfit,
      createdAt: now,
      updatedAt: state.updatedAt,
    }));
    upsertSetting(
      database.worksheets.AppSettings,
      "performance.monthlyProfitKpi",
      String(state.monthlyProfitKpi),
    );
    upsertSetting(
      database.worksheets.AppSettings,
      "performance.workingDays",
      String(state.workingDays),
    );
  });
}

function createDefaultPerformanceState(
  campaignProfiles: GlobalCampaign[],
): EmployeePerformanceState {
  return {
    monthlyProfitKpi: 0,
    workingDays: 5,
    campaigns: campaignProfiles.map((campaign) => createCampaignInput(campaign)),
    updatedAt: new Date().toISOString(),
  };
}

function createCampaignInput(campaign: GlobalCampaign): CampaignPerformanceInput {
  return {
    id: campaign.id,
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    targetDailyOutreachVolume: defaultTargetDailyOutreach,
    teamOutreachVolumeExcludingMe: 0,
    teamSubmissionsExcludingMe: 0,
    teamApprovalsExcludingMe: 0,
    myOutreachVolume: 0,
    myCreatorSubmissions: 0,
    myCreatorApprovals: 0,
    myCampaignExecutions: 0,
    expectedProfit: 0,
    actualProfit: 0,
  };
}

function createPerformanceStateFromRepository(
  campaignProfiles: GlobalCampaign[],
): EmployeePerformanceState {
  const database = loadCentralPerformanceData();
  const benchmarkByCampaign = new Map(
    database.benchmarks.map((benchmark) => [benchmark.campaignId, benchmark]),
  );
  const inputByCampaign = new Map(database.weeklyInputs.map((input) => [input.campaignId, input]));

  return {
    monthlyProfitKpi: Number(getAppSetting("performance.monthlyProfitKpi", "0")) || 0,
    workingDays: Number(getAppSetting("performance.workingDays", "5")) || 5,
    campaigns: campaignProfiles.map((campaign) => {
      const benchmark = benchmarkByCampaign.get(campaign.id);
      const input = inputByCampaign.get(campaign.id);
      return {
        id: campaign.id,
        campaignId: campaign.id,
        campaignName: campaign.campaignName,
        targetDailyOutreachVolume: benchmark?.targetDailyOutreach ?? defaultTargetDailyOutreach,
        teamOutreachVolumeExcludingMe: benchmark?.teamOutreachExcludingMe ?? 0,
        teamSubmissionsExcludingMe: benchmark?.teamSubmissionsExcludingMe ?? 0,
        teamApprovalsExcludingMe: benchmark?.teamApprovalsExcludingMe ?? 0,
        myOutreachVolume: input?.myOutreachVolume ?? 0,
        myCreatorSubmissions: input?.myCreatorSubmissions ?? 0,
        myCreatorApprovals: input?.myCreatorApprovals ?? 0,
        myCampaignExecutions: input?.myCampaignExecutions ?? 0,
        expectedProfit: input?.expectedProfit ?? 0,
        actualProfit: input?.actualProfit ?? 0,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

function loadCentralPerformanceData() {
  return {
    benchmarks: readPerformanceBenchmarks(),
    weeklyInputs: readPerformanceWeeklyInputs(),
  };
}

function upsertSetting(settings: AppSettingRecord[], settingKey: string, settingValue: string) {
  const existing = settings.find((setting) => setting.settingKey === settingKey);
  const updatedAt = new Date().toISOString();
  if (existing) {
    existing.settingValue = settingValue;
    existing.updatedAt = updatedAt;
    return;
  }
  settings.push({ settingKey, settingValue, updatedAt });
}

function safeScore(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function toNumber(value: unknown): number {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
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

function formatPercentValue(value: number | null): string {
  if (value === null) return "--";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatScore(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNullableScore(value: number | null): string {
  return value === null ? "--" : formatScore(value);
}
