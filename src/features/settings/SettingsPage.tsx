import { useEffect, useState } from "react";
import { Database, RefreshCw, UploadCloud } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  getAppStorageStatusAsync,
  migrateLocalDatabaseToPrimary,
  type MigrationReport,
} from "@/storage/appRepository";
import type { StorageStatus } from "@/storage/schema";

export function SettingsPage() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setLoading(true);
    setMessage("");
    try {
      setStatus(await getAppStorageStatusAsync());
    } finally {
      setLoading(false);
    }
  }

  async function migrateLocalData() {
    setMigrating(true);
    setMessage("");
    setMigrationReport(null);
    try {
      const result = await migrateLocalDatabaseToPrimary();
      setStatus(result.status);
      setMigrationReport(result.report);
      setMessage(
        result.ok
          ? "Local data migration completed."
          : "Migration could not run. Check the storage diagnostics.",
      );
    } finally {
      setMigrating(false);
    }
  }

  const mode = getStorageMode(status);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-hero-glow" />

      <main className="katlas-page max-w-5xl">
        <section className="katlas-hero-panel">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Settings</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">
            Workspace storage
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Google Sheets is the shared database when configured. Local storage remains the fallback
            for offline or missing credential states.
          </p>
        </section>

        <section className="katlas-panel p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="flex gap-3">
              <div className="katlas-panel-icon size-10">
                <Database className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Storage Mode</h2>
                <p className={`mt-2 text-2xl font-semibold ${mode.className}`}>
                  {loading ? "Checking..." : mode.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode.description}</p>
              </div>
            </div>
            <button
              onClick={refreshStatus}
              disabled={loading || migrating}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Google Sheets Configuration</h3>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <ConfigLine name="GOOGLE_SHEETS_SPREADSHEET_ID" status="recommended" />
              <ConfigLine name="GOOGLE_SERVICE_ACCOUNT_EMAIL" />
              <ConfigLine name="GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64" />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Add these in local `.env.local` for preview and in Vercel Environment Variables for
              deployment. Share the Google Sheet with the service account email.
            </p>
          </div>

          {status?.diagnostics.length ? (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Diagnostics</h3>
              <div className="mt-3 space-y-2">
                {status.diagnostics.map((diagnostic, index) => (
                  <p
                    key={`${diagnostic.message}-${index}`}
                    className="text-sm text-muted-foreground"
                  >
                    {diagnostic.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="katlas-panel p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold">Migrate Local Data To Google Sheets</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Copies missing local records into the shared Google Sheet by ID. Existing rows in
                Google Sheets are kept to avoid duplicate or accidental overwrite.
              </p>
            </div>
            <button
              onClick={migrateLocalData}
              disabled={migrating || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className={`size-4 ${migrating ? "animate-pulse" : ""}`} />
              {migrating ? "Migrating..." : "Migrate Local Data"}
            </button>
          </div>

          {message ? (
            <p className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}

          {migrationReport ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(migrationReport)
                .filter(([key]) => key !== "errors")
                .map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">{formatReportLabel(key)}</p>
                    <p className="mt-1 text-xl font-semibold">{Number(value).toLocaleString()}</p>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ConfigLine({ name, status = "required" }: { name: string; status?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span>{name}</span>
      <span className="text-xs">{status}</span>
    </div>
  );
}

function getStorageMode(status: StorageStatus | null) {
  if (!status) {
    return {
      label: "Checking storage...",
      className: "text-muted-foreground",
      description: "Checking whether Google Sheets is configured.",
    };
  }

  const pendingGoogle = status.diagnostics.some((diagnostic) =>
    diagnostic.message.toLowerCase().includes("google sheets pending configuration"),
  );

  if (status.source === "googleSheets" && status.configured) {
    return {
      label: "Google Sheets Connected",
      className: "text-emerald-300",
      description: "Team-facing dashboard data is reading from and writing to Google Sheets.",
    };
  }

  if (pendingGoogle) {
    return {
      label: "Google Sheets Pending Configuration",
      className: "text-amber-300",
      description:
        "The adapter exists, but credentials are missing. The app is using local fallback.",
    };
  }

  return {
    label: "Local Fallback",
    className: "text-muted-foreground",
    description: "Data is saved in this browser only.",
  };
}

function formatReportLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}
