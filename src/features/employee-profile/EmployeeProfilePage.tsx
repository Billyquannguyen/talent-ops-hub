import { BadgeDollarSign, CalendarDays, ImageUp, Pencil, StickyNote, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { IconType } from "react-icons";
import { FaDiscord, FaFacebook, FaInstagram, FaTelegramPlane, FaWhatsapp } from "react-icons/fa";
import { MdOutlineMail } from "react-icons/md";
import {
  SiCalendly,
  SiGoogledrive,
  SiLine,
  SiNotion,
  SiSlack,
  SiThreads,
  SiTiktok,
  SiViber,
} from "react-icons/si";

import { TopBar } from "@/components/TopBar";
import {
  listEmployeeProfilesFromGoogleSheetsOnly,
  saveEmployeeProfileToGoogleSheetsOnly,
} from "@/storage/appRepository";
import {
  employeeProfileFromRecord,
  employeeProfileRecordId,
  employeeProfileToRecord,
  employeeAccountServices,
  loadEmployeeProfile,
  saveEmployeeProfile,
} from "./storage";
import type { EmployeeAccountCategory, EmployeeAccountLink, EmployeeProfile } from "./types";

const accountIconMap: Record<string, IconType> = {
  slack: SiSlack,
  whatsapp: FaWhatsapp,
  line: SiLine,
  telegram: FaTelegramPlane,
  viber: SiViber,
  discord: FaDiscord,
  instagram: FaInstagram,
  tiktok: SiTiktok,
  facebook: FaFacebook,
  threads: SiThreads,
  outlook: MdOutlineMail,
  "google-drive": SiGoogledrive,
  notion: SiNotion,
  calendly: SiCalendly,
};

const accountCategories: EmployeeAccountCategory[] = ["Communication", "Social", "Workspace"];

export function EmployeeProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());
  const [profileDraft, setProfileDraft] = useState<EmployeeProfile | null>(null);
  const [storageMessage, setStorageMessage] = useState("Loading shared profile...");
  const [storageError, setStorageError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [accountUrlDraft, setAccountUrlDraft] = useState<EmployeeAccountLink | null>(null);

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

  async function persistProfile(profileToSave: EmployeeProfile) {
    const nextProfileToSave = {
      ...profileToSave,
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    setStorageError("");
    try {
      const savedRecords = await saveEmployeeProfileToGoogleSheetsOnly(
        employeeProfileToRecord(nextProfileToSave),
      );
      const savedRecord =
        savedRecords.find((record) => record.profileId === employeeProfileRecordId) ??
        savedRecords[0];
      const savedProfile = savedRecord ? employeeProfileFromRecord(savedRecord) : nextProfileToSave;
      setProfile(savedProfile);
      saveEmployeeProfile(savedProfile);
      setStorageMessage("Profile saved in Katlas Buddy Database");
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Employee profile was not saved.";
      setStorageError(message);
      setStorageMessage("Save failed");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDraft) return;

    const didSave = await persistProfile(profileDraft);
    if (didSave) setProfileDraft(null);
  }

  async function saveAccountUrl(account: EmployeeAccountLink, url: string) {
    const nextProfile = {
      ...profile,
      accounts: profile.accounts.map((item) =>
        item.serviceId === account.serviceId ? { ...item, url } : item,
      ),
    };

    const didSave = await persistProfile(nextProfile);
    if (didSave) setAccountUrlDraft(null);
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

        <section className="grid gap-4 md:grid-cols-4">
          <InfoCard icon={User} label="Name" value={profile.displayName || "Not set"} />
          <InfoCard
            icon={CalendarDays}
            label="Joining Date"
            value={formatDisplayDate(profile.joiningDate)}
          />
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

        <AccountLaunchpad accounts={profile.accounts} onMissingUrl={setAccountUrlDraft} />

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

      {accountUrlDraft ? (
        <AccountUrlModal
          account={accountUrlDraft}
          isSaving={isSaving}
          storageError={storageError}
          onCancel={() => setAccountUrlDraft(null)}
          onSave={(url) => saveAccountUrl(accountUrlDraft, url)}
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
            label="Joining Date"
            type="date"
            value={draft.joiningDate}
            onChange={(joiningDate) => onChange({ joiningDate })}
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

        <AccountLinksEditor
          accounts={draft.accounts}
          onChange={(accounts) => onChange({ accounts })}
        />

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

function AccountLaunchpad({
  accounts,
  onMissingUrl,
}: {
  accounts: EmployeeAccountLink[];
  onMissingUrl: (account: EmployeeAccountLink) => void;
}) {
  const normalizedAccounts = normalizeAccountsForUi(accounts);

  return (
    <section className="katlas-panel">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Account Launchpad</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Click an icon to open. Missing links ask for a URL.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {accountCategories.map((category) => {
          const categoryAccounts = normalizedAccounts.filter(
            (account) => account.category === category,
          );

          return (
            <div key={category}>
              <h3 className="mb-3 text-sm font-semibold">{category}</h3>
              <div className="flex flex-wrap gap-3">
                {categoryAccounts.map((account) => {
                  const Icon = accountIconMap[account.serviceId] ?? MdOutlineMail;
                  const hasUrl = Boolean(account.url);
                  const tileTone = hasUrl
                    ? "border-cyan-300/35 bg-cyan-300/[0.06] text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)] hover:border-cyan-200/60 hover:bg-cyan-300/[0.10] hover:text-white hover:shadow-[0_0_32px_rgba(34,211,238,0.30)]"
                    : "border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-300/75 shadow-[0_0_16px_rgba(34,211,238,0.10)] hover:border-cyan-300/50 hover:bg-cyan-300/[0.08] hover:text-cyan-100 hover:shadow-[0_0_26px_rgba(34,211,238,0.24)]";

                  return (
                    <button
                      key={account.serviceId}
                      type="button"
                      title={hasUrl ? account.label : `Add ${account.label} URL`}
                      onClick={() => {
                        if (hasUrl) {
                          window.open(account.url, "_blank", "noopener,noreferrer");
                          return;
                        }
                        onMissingUrl(account);
                      }}
                      className={`group grid size-16 place-items-center rounded-xl border text-3xl transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] ${tileTone}`}
                    >
                      <Icon
                        className="drop-shadow-[0_0_10px_rgba(34,211,238,0.42)] transition duration-200 group-hover:scale-110"
                        aria-hidden="true"
                      />
                      <span className="sr-only">{account.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AccountLinksEditor({
  accounts,
  onChange,
}: {
  accounts: EmployeeAccountLink[];
  onChange: (accounts: EmployeeAccountLink[]) => void;
}) {
  const normalizedAccounts = normalizeAccountsForUi(accounts);

  return (
    <div className="mt-5 rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-medium">Account Links</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        These power the launchpad icons on your profile page. Leave any service blank if you do not
        use it.
      </p>

      <div className="mt-4 space-y-5">
        {accountCategories.map((category) => {
          const categoryAccounts = normalizedAccounts.filter(
            (account) => account.category === category,
          );

          return (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {category}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {categoryAccounts.map((account) => (
                  <TextInput
                    key={account.serviceId}
                    label={account.label}
                    value={account.url}
                    onChange={(url) => onChange(updateAccountUrl(normalizedAccounts, account, url))}
                    placeholder={`https://${account.label.toLowerCase().replace(/\s+/g, "")}.com`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountUrlModal({
  account,
  isSaving,
  storageError,
  onCancel,
  onSave,
}: {
  account: EmployeeAccountLink;
  isSaving: boolean;
  storageError: string;
  onCancel: () => void;
  onSave: (url: string) => void;
}) {
  const [urlDraft, setUrlDraft] = useState(account.url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(urlDraft.trim());
        }}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <ModalHeader
          title={`Add ${account.label} Link`}
          subtitle="Paste the account URL for this shortcut"
          onCancel={onCancel}
        />

        <div className="mt-5">
          <TextInput
            label="URL"
            value={urlDraft}
            onChange={setUrlDraft}
            placeholder="https://..."
            required
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
            {isSaving ? "Saving..." : "Save Link"}
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

function normalizeAccountsForUi(accounts: EmployeeAccountLink[]) {
  const savedById = new Map(accounts.map((account) => [account.serviceId, account]));
  return employeeAccountServices.map((service) => ({
    ...service,
    url: savedById.get(service.serviceId)?.url ?? "",
  }));
}

function updateAccountUrl(
  accounts: EmployeeAccountLink[],
  targetAccount: EmployeeAccountLink,
  url: string,
) {
  return normalizeAccountsForUi(accounts).map((account) =>
    account.serviceId === targetAccount.serviceId ? { ...account, url } : account,
  );
}

function formatDisplayDate(value: string) {
  if (!value) return "Not set";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
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
