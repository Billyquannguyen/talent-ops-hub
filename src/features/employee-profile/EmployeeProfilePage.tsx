import {
  CalendarDays,
  Copy,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { TopBar } from "@/components/TopBar";
import {
  launchpadCategories,
  launchpadServices,
  loadLaunchpadLinks,
  saveLaunchpadLinks,
  type LaunchpadLinks,
  type LaunchpadService,
} from "./launchpad";
import { loadEmployeeProfile, saveEmployeeProfile } from "./storage";
import type { EmployeeProfile } from "./types";

type UrlDraft = {
  service: LaunchpadService;
  url: string;
};

export function EmployeeProfilePage() {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());
  const [launchpadLinks, setLaunchpadLinks] = useState<LaunchpadLinks>(() =>
    loadLaunchpadLinks(loadEmployeeProfile()),
  );
  const [profileDraft, setProfileDraft] = useState<EmployeeProfile | null>(null);
  const [urlDraft, setUrlDraft] = useState<UrlDraft | null>(null);
  const [copiedLabel, setCopiedLabel] = useState("");

  useEffect(() => {
    const nextProfile = loadEmployeeProfile();
    setProfile(nextProfile);
    setLaunchpadLinks(loadLaunchpadLinks(nextProfile));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveEmployeeProfile(profile);
  }, [loaded, profile]);

  useEffect(() => {
    if (!loaded) return;
    saveLaunchpadLinks(launchpadLinks);
  }, [launchpadLinks, loaded]);

  const groupedServices = useMemo(
    () =>
      launchpadCategories.map((category) => ({
        category,
        services: launchpadServices.filter((service) => service.category === category),
      })),
    [],
  );
  const profileInitials = getInitials(profile.displayName);

  function updateProfile(nextProfile: EmployeeProfile) {
    setProfile({
      ...nextProfile,
      updatedAt: new Date().toISOString(),
    });
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDraft) return;
    updateProfile(profileDraft);
    setProfileDraft(null);
  }

  function handleLaunchpadClick(service: LaunchpadService) {
    const savedUrl = launchpadLinks[service.id] ?? "";
    if (!savedUrl) {
      setUrlDraft({ service, url: "" });
      return;
    }

    const url = normalizeUrl(savedUrl);
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleLaunchpadContextMenu(event: MouseEvent, service: LaunchpadService) {
    event.preventDefault();
    setUrlDraft({ service, url: launchpadLinks[service.id] ?? "" });
  }

  function saveLaunchpadUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!urlDraft?.url.trim()) return;

    setLaunchpadLinks((current) => ({
      ...current,
      [urlDraft.service.id]: urlDraft.url.trim(),
    }));
    setUrlDraft(null);
  }

  async function copyValue(label: string, value: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(""), 1400);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6">
        <section className="rounded-2xl border border-border bg-card/60 p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-background text-2xl font-semibold">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profileInitials
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Employee Profile
                </p>
                <h1 className="mt-2 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                  {profile.displayName || "Your Profile"}
                </h1>
                <p className="mt-1 text-sm font-medium text-foreground/80">
                  {profile.role || "Add your role"}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {profile.bio || "Add a short work bio so this page feels like yours."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setProfileDraft(profile)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Pencil className="size-4" />
                Edit Profile
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile
              icon={CalendarDays}
              label="Joining Date"
              value={formatDate(profile.joiningDate) || "Not set"}
            />
            <InfoTile icon={Globe2} label="Timezone" value={profile.timezone || "Not set"} />
            <InfoTile
              icon={MapPin}
              label="Primary Markets"
              value={profile.primaryMarkets || "Not set"}
            />
            <InfoTile
              icon={ShieldCheck}
              label="Preferred Contact"
              value={profile.preferredContactMethod || "Not set"}
            />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          <Panel title="Work Contact Info" action={copiedLabel ? `${copiedLabel} copied` : ""}>
            <div className="grid gap-2">
              <ContactRow
                icon={Mail}
                label="Work Email"
                value={profile.workEmail || "Not set"}
                canCopy={Boolean(profile.workEmail)}
                onCopy={() => copyValue("Email", profile.workEmail)}
              />
              <ContactRow
                icon={Phone}
                label="Phone / WhatsApp"
                value={profile.phone || "Not set"}
                canCopy={Boolean(profile.phone)}
                onCopy={() => copyValue("Phone", profile.phone)}
              />
              <ContactRow
                icon={MessageCircle}
                label="LINE ID"
                value={profile.lineId || "Not set"}
                canCopy={Boolean(profile.lineId)}
                onCopy={() => copyValue("LINE", profile.lineId)}
              />
              <ContactRow
                icon={MessageCircle}
                label="Telegram"
                value={profile.telegram || "Not set"}
                canCopy={Boolean(profile.telegram)}
                onCopy={() => copyValue("Telegram", profile.telegram)}
              />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">Main Responsibilities</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {profile.responsibilities || "Not set"}
              </p>
            </div>
          </Panel>

          <Panel
            title="Account Launchpad"
            action="Click an icon to open. Missing links ask for a URL."
          >
            <div className="grid gap-5">
              {groupedServices.map((group) => (
                <LaunchpadGroup
                  key={group.category}
                  title={group.category}
                  services={group.services}
                  links={launchpadLinks}
                  onOpen={handleLaunchpadClick}
                  onEdit={handleLaunchpadContextMenu}
                />
              ))}
            </div>
          </Panel>
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
        />
      ) : null}

      {urlDraft ? (
        <LaunchpadUrlModal
          draft={urlDraft}
          onChange={(url) => setUrlDraft((current) => (current ? { ...current, url } : current))}
          onCancel={() => setUrlDraft(null)}
          onSubmit={saveLaunchpadUrl}
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
}: {
  draft: EmployeeProfile;
  onChange: (patch: Partial<EmployeeProfile>) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initials = getInitials(draft.displayName);

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const avatarUrl = await readFileAsDataUrl(file);
    onChange({ avatarUrl });
    event.target.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <ModalHeader title="Edit Profile" subtitle="Personal work details" onCancel={onCancel} />

        <div className="mt-5 flex flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-card text-xl font-semibold">
            {draft.avatarUrl ? (
              <img
                src={draft.avatarUrl}
                alt={draft.displayName || "Profile avatar"}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Avatar</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Upload a profile photo from your computer. It is saved locally in this browser.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90">
                <Upload className="size-3.5" />
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
            label="Display Name"
            value={draft.displayName}
            onChange={(displayName) => onChange({ displayName })}
            placeholder="Billy Nguyen"
            required
          />
          <TextInput
            label="Work Title / Role"
            value={draft.role}
            onChange={(role) => onChange({ role })}
            placeholder="Creator Operations"
          />
          <TextInput
            label="Joining Date"
            type="date"
            value={draft.joiningDate}
            onChange={(joiningDate) => onChange({ joiningDate })}
          />
          <TextInput
            label="Timezone"
            value={draft.timezone}
            onChange={(timezone) => onChange({ timezone })}
            placeholder="Europe/Berlin"
          />
          <TextInput
            label="Preferred Contact Method"
            value={draft.preferredContactMethod}
            onChange={(preferredContactMethod) => onChange({ preferredContactMethod })}
            placeholder="LINE or WhatsApp"
          />
          <TextInput
            label="Work Email"
            value={draft.workEmail}
            onChange={(workEmail) => onChange({ workEmail })}
            placeholder="you@katlasmedia.com"
          />
          <TextInput
            label="Phone / WhatsApp"
            value={draft.phone}
            onChange={(phone) => onChange({ phone })}
            placeholder="+66..."
          />
          <TextInput
            label="LINE ID"
            value={draft.lineId}
            onChange={(lineId) => onChange({ lineId })}
            placeholder="@yourline"
          />
          <TextInput
            label="Telegram"
            value={draft.telegram}
            onChange={(telegram) => onChange({ telegram })}
            placeholder="@yourtelegram"
          />
        </div>

        <div className="mt-3 grid gap-3">
          <TextAreaInput
            label="Short Bio"
            value={draft.bio}
            onChange={(bio) => onChange({ bio })}
            placeholder="What should this profile say about your work?"
          />
          <TextAreaInput
            label="Primary Markets"
            value={draft.primaryMarkets}
            onChange={(primaryMarkets) => onChange({ primaryMarkets })}
            placeholder="Thailand, Vietnam, Philippines"
          />
          <TextAreaInput
            label="Main Responsibilities"
            value={draft.responsibilities}
            onChange={(responsibilities) => onChange({ responsibilities })}
            placeholder="Creator sourcing, creator outreach, campaign coordination"
          />
        </div>

        <ModalActions onCancel={onCancel} saveLabel="Save Profile" />
      </form>
    </div>
  );
}

function LaunchpadUrlModal({
  draft,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: UrlDraft;
  onChange: (url: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const Icon = draft.service.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <ModalHeader
          title={`${draft.service.label} URL`}
          subtitle="Add launchpad shortcut"
          onCancel={onCancel}
        />

        <div className="mt-5 flex items-center gap-4 rounded-lg border border-border bg-background p-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground/80">
            <Icon className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium">{draft.service.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Paste the web link you want this icon to open.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <TextInput
            label="Shortcut URL"
            value={draft.url}
            onChange={onChange}
            placeholder="https://..."
            required
          />
        </div>

        <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
          Store links only. Do not paste passwords, API keys, recovery codes, or private secrets.
        </p>

        <ModalActions onCancel={onCancel} saveLabel="Save URL" />
      </form>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h2 className="text-base font-semibold">{title}</h2>
        {action ? <p className="text-xs text-muted-foreground">{action}</p> : null}
      </div>
      {children}
    </section>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-20 gap-3 rounded-lg border border-border bg-background p-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  canCopy,
  onCopy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  canCopy: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-medium">{value}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={!canCopy}
        onClick={onCopy}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function LaunchpadGroup({
  title,
  services,
  links,
  onOpen,
  onEdit,
}: {
  title: string;
  services: LaunchpadService[];
  links: LaunchpadLinks;
  onOpen: (service: LaunchpadService) => void;
  onEdit: (event: MouseEvent, service: LaunchpadService) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 xl:grid-cols-8">
        {services.map((service) => {
          const hasUrl = Boolean(links[service.id]);
          const Icon = service.icon;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onOpen(service)}
              onContextMenu={(event) => onEdit(event, service)}
              title={hasUrl ? `Open ${service.label}` : `Add ${service.label} URL`}
              aria-label={hasUrl ? `Open ${service.label}` : `Add ${service.label} URL`}
              className={`group relative grid size-16 place-items-center rounded-xl border border-border bg-background/80 text-foreground/75 transition duration-200 hover:border-cyan-300/30 hover:bg-card hover:text-foreground hover:shadow-[0_0_18px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/50 ${
                hasUrl ? "opacity-100" : "opacity-45 hover:opacity-90"
              }`}
            >
              <Icon
                className="size-6 transition duration-200 group-hover:scale-105"
                aria-hidden="true"
              />
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
                {service.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
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
        <p className="text-xs font-semibold uppercase text-muted-foreground">{subtitle}</p>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
      >
        Cancel
      </button>
    </div>
  );
}

function ModalActions({ onCancel, saveLabel }: { onCancel: () => void; saveLabel: string }) {
  return (
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
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        {saveLabel}
      </button>
    </div>
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

function TextInput({
  label,
  value,
  placeholder,
  required,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        type={type}
        value={value}
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
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
