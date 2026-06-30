import { BadgeDollarSign, ImageUp, Pencil, StickyNote, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import {
  listEmployeeProfilesFromGoogleSheetsOnly,
  saveEmployeeProfileToGoogleSheetsOnly,
} from "@/storage/appRepository";
import {
  employeeProfileFromRecord,
  employeeProfileRecordId,
  employeeProfileToRecord,
  loadEmployeeProfile,
  saveEmployeeProfile,
} from "./storage";
import type { EmployeeProfile } from "./types";

export function EmployeeProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());
  const [profileDraft, setProfileDraft] = useState<EmployeeProfile | null>(null);
  const [storageMessage, setStorageMessage] = useState("Loading shared profile...");
  const [storageError, setStorageError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedProfile() {
      try {
        const records = await listEmployeeProfilesFromGoogleSheetsOnly();
        if (cancelled) return;

        const sharedRecord =
          records.find((record) => record.profileId === employeeProfileRecordId) ?? records[0];

        if (sharedRecord) {
          const nextProfile = employeeProfileFromRecord(sharedRecord);
          setProfile(nextProfile);
          saveEmployeeProfile(nextProfile);
          setStorageMessage("Profile saved in Katlas Buddy Database");
          setStorageError("");
          return;
        }

        const localProfile = loadEmployeeProfile();
        const savedRecords = await saveEmployeeProfileToGoogleSheetsOnly(
          employeeProfileToRecord(localProfile),
        );
        if (cancelled) return;

        const savedRecord =
          savedRecords.find((record) => record.profileId === employeeProfileRecordId) ??
          savedRecords[0];
        const nextProfile = savedRecord ? employeeProfileFromRecord(savedRecord) : localProfile;
        setProfile(nextProfile);
        saveEmployeeProfile(nextProfile);
        setStorageMessage("Employee profile created in Katlas Buddy Database");
        setStorageError("");
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Google Sheets is unavailable. Employee profile was not loaded from shared storage.";
        setStorageError(message);
        setStorageMessage("Shared profile storage unavailable");
      }
    }

    void loadSharedProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDraft) return;

    const profileToSave = {
      ...profileDraft,
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    setStorageError("");
    try {
      const savedRecords = await saveEmployeeProfileToGoogleSheetsOnly(
        employeeProfileToRecord(profileToSave),
      );
      const savedRecord =
        savedRecords.find((record) => record.profileId === employeeProfileRecordId) ??
        savedRecords[0];
      const savedProfile = savedRecord ? employeeProfileFromRecord(savedRecord) : profileToSave;
      setProfile(savedProfile);
      saveEmployeeProfile(savedProfile);
      setStorageMessage("Profile saved in Katlas Buddy Database");
      setProfileDraft(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Employee profile was not saved.";
      setStorageError(message);
      setStorageMessage("Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  const initials = getInitials(profile.displayName);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page max-w-5xl">
        <section className="katlas-hero-panel">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AvatarBlock
                avatarUrl={profile.avatarUrl}
                initials={initials}
                name={profile.displayName}
              />
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Employee Profile
                </p>
                <h1 className="mt-2 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                  {profile.displayName || "Your Profile"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Personal settings for Katlas Buddy. Your monthly salary powers the ROI view in
                  Campaign Profiles.
                </p>
              </div>
            </div>

            <div className="flex max-w-sm flex-col items-start gap-2 lg:items-end">
              <button
                onClick={() => setProfileDraft(profile)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Pencil className="size-4" />
                Edit Profile
              </button>
              <p
                className={`text-xs leading-5 ${
                  storageError ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {storageError || storageMessage}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard icon={User} label="Name" value={profile.displayName || "Not set"} />
          <InfoCard
            icon={BadgeDollarSign}
            label="Monthly Salary"
            value={
              profile.monthlySalary > 0
                ? formatCurrency(profile.monthlySalary, profile.currency)
                : "Not configured"
            }
          />
          <InfoCard icon={StickyNote} label="Currency" value={profile.currency || "USD"} />
        </section>

        <section className="katlas-panel">
          <div className="mb-3 flex items-center gap-2">
            <div className="katlas-panel-icon">
              <StickyNote className="size-4" />
            </div>
            <h2 className="text-base font-semibold">Notes</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {profile.notes || "No notes yet."}
          </p>
        </section>
      </main>

      {profileDraft ? (
        <ProfileModal
          draft={profileDraft}
          onChange={(patch) =>
            setProfileDraft((current) => (current ? { ...current, ...patch } : current))
          }
          onCancel={() => setProfileDraft(null)}
          onSubmit={saveProfile}
          isSaving={isSaving}
          storageError={storageError}
        />
      ) : null}
    </div>
  );
}

function ProfileModal({
  draft,
  onChange,
  onCancel,
  onSubmit,
  isSaving,
  storageError,
}: {
  draft: EmployeeProfile;
  onChange: (patch: Partial<EmployeeProfile>) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
  storageError: string;
}) {
  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const avatarUrl = await readFileAsDataUrl(file);
    onChange({ avatarUrl });
    event.target.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <ModalHeader
          title="Edit Profile"
          subtitle="Personal settings and salary input"
          onCancel={onCancel}
        />

        <div className="mt-5 flex flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center">
          <AvatarBlock
            avatarUrl={draft.avatarUrl}
            initials={getInitials(draft.displayName)}
            name={draft.displayName}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Avatar</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Upload a profile image. It also updates the top-right profile badge.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90">
                <ImageUp className="size-3.5" />
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                disabled={!draft.avatarUrl}
                onClick={() => onChange({ avatarUrl: "" })}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Name"
            value={draft.displayName}
            onChange={(displayName) => onChange({ displayName })}
            placeholder="Billy Nguyen"
            required
          />
          <TextInput
            label="Currency"
            value={draft.currency}
            onChange={(currency) => onChange({ currency: currency.toUpperCase() })}
            placeholder="USD"
            required
          />
          <TextInput
            label="Monthly Salary"
            type="number"
            min="0"
            step="0.01"
            value={String(draft.monthlySalary || "")}
            onChange={(monthlySalary) => onChange({ monthlySalary: numberValue(monthlySalary) })}
            placeholder="2500"
          />
        </div>

        <div className="mt-3">
          <TextAreaInput
            label="Optional Notes"
            value={draft.notes}
            onChange={(notes) => onChange({ notes })}
            placeholder="Anything you want to remember about your own setup."
          />
        </div>

        {storageError ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive">
            {storageError}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AvatarBlock({
  avatarUrl,
  initials,
  name,
}: {
  avatarUrl: string;
  initials: string;
  name: string;
}) {
  return (
    <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-background text-2xl font-semibold">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || "Employee profile"}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="katlas-panel">
      <div className="flex items-start gap-3">
        <div className="katlas-panel-icon">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ModalHeader({
  title,
  subtitle,
  onCancel,
}: {
  title: string;
  subtitle: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
      >
        Close
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  type = "text",
  placeholder,
  required,
  min,
  step,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        type={type}
        value={value}
        min={min}
        step={step}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function TextAreaInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={5}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "KM";
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${Math.round(value).toLocaleString()}`;
  }
}

function numberValue(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
