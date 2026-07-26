import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe2,
  Instagram,
  MapPin,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

import type { AgencyDatabaseRecord, CreatorDatabaseRecord } from "@/storage/schema";

const creatorContentTags = [
  "Lifestyle",
  "Beauty",
  "Fashion",
  "Fitness & Wellness",
  "Food & Cooking",
  "Travel",
  "Gaming",
  "Tech",
  "Family & Parenting",
  "Home & DIY",
  "Finance & Business",
  "Education",
  "Entertainment & Comedy",
  "Pets",
  "Sports",
] as const;

const followerTierOptions = [
  { value: "nano", label: "Nano (<10K)", min: 0, maxExclusive: 10_000 },
  { value: "micro", label: "Micro (10K–100K)", min: 10_000, maxExclusive: 100_000 },
  { value: "mid-tier", label: "Mid-tier (100K–500K)", min: 100_000, maxExclusive: 500_000 },
  { value: "macro", label: "Macro (500K–1M)", min: 500_000, maxExclusive: 1_000_000 },
  { value: "mega", label: "Mega (1M+)", min: 1_000_000 },
] as const;

const avgViewsRangeOptions = [
  { value: "under-10k", label: "<10K", min: 0, maxExclusive: 10_000 },
  { value: "10k-50k", label: "10K–50K", min: 10_000, maxExclusive: 50_000 },
  { value: "50k-100k", label: "50K–100K", min: 50_000, maxExclusive: 100_000 },
  { value: "100k-1m", label: "100K–1M", min: 100_000, maxExclusive: 1_000_000 },
  { value: "over-1m", label: ">1M", min: 1_000_000 },
] as const;

type DatabaseViewType = "agency" | "creator";
type AgencyContact = {
  id: string;
  name: string;
  role: string;
  contact: string;
  isPrimary: boolean;
};

export function DatabaseViewModal({
  view,
  agencies,
  creators,
  isLoading,
  isSaving,
  error,
  agencyDraft,
  creatorDraft,
  onNewAgency,
  onEditAgency,
  onChangeAgencyDraft,
  onSaveAgency,
  onDeleteAgency,
  onNewCreator,
  onEditCreator,
  onChangeCreatorDraft,
  onSaveCreator,
  onDeleteCreator,
  onCopy,
  onClose,
}: {
  view: DatabaseViewType;
  agencies: AgencyDatabaseRecord[];
  creators: CreatorDatabaseRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  agencyDraft: AgencyDatabaseRecord | null;
  creatorDraft: CreatorDatabaseRecord | null;
  onNewAgency: () => void;
  onEditAgency: (record: AgencyDatabaseRecord) => void;
  onChangeAgencyDraft: (record: AgencyDatabaseRecord | null) => void;
  onSaveAgency: (record: AgencyDatabaseRecord) => void;
  onDeleteAgency: (recordId: string) => void;
  onMigrateAgencyContacts: () => void;
  onNewCreator: () => void;
  onEditCreator: (record: CreatorDatabaseRecord) => void;
  onChangeCreatorDraft: (record: CreatorDatabaseRecord | null) => void;
  onSaveCreator: (record: CreatorDatabaseRecord) => void;
  onDeleteCreator: (recordId: string) => void;
  onCopy: (text: string, label: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const title = view === "agency" ? "Agency Database" : "Creator Database";
  const subtitle =
    view === "agency"
      ? "Save agency contacts that may be useful for future outreach."
      : "Save creators and talents that have potential for future campaigns.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-xl border border-border bg-card shadow-2xl ${
          view === "agency" ? "h-[min(760px,92vh)] max-w-5xl" : "max-w-7xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Katlas Buddy Database
            </p>
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close database"
          >
            <X className="size-4" />
          </button>
        </div>

        {error ? (
          <div className="mx-5 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {view === "agency" ? (
            <AgencyDatabaseTable
              records={agencies}
              isLoading={isLoading}
              isSaving={isSaving}
              onNew={onNewAgency}
              onEdit={onEditAgency}
              onAddContact={(record) => onEditAgency(addBlankContactToAgencyRecord(record))}
              onDelete={onDeleteAgency}
              onCopy={onCopy}
            />
          ) : (
            <CreatorDatabaseTable
              records={creators}
              isLoading={isLoading}
              isSaving={isSaving}
              onNew={onNewCreator}
              onEdit={onEditCreator}
              onDelete={onDeleteCreator}
              onCopy={onCopy}
            />
          )}
        </div>
      </div>

      {agencyDraft ? (
        <AgencyRecordEditor
          record={agencyDraft}
          isSaving={isSaving}
          onChange={onChangeAgencyDraft}
          onSave={onSaveAgency}
          onClose={() => onChangeAgencyDraft(null)}
        />
      ) : null}

      {creatorDraft ? (
        <CreatorRecordEditor
          record={creatorDraft}
          isSaving={isSaving}
          onChange={onChangeCreatorDraft}
          onSave={onSaveCreator}
          onClose={() => onChangeCreatorDraft(null)}
        />
      ) : null}
    </div>
  );
}

function AgencyDatabaseTable({
  records,
  isLoading,
  isSaving,
  onNew,
  onEdit,
  onAddContact,
  onDelete,
  onCopy,
}: {
  records: AgencyDatabaseRecord[];
  isLoading: boolean;
  isSaving: boolean;
  onNew: () => void;
  onEdit: (record: AgencyDatabaseRecord) => void;
  onAddContact: (record: AgencyDatabaseRecord) => void;
  onDelete: (recordId: string) => void;
  onCopy: (text: string, label: string) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const contactText = getAgencyContacts(record)
          .map((contact) => `${contact.name} ${contact.role} ${contact.contact}`)
          .join(" ");
        return (
          matchesDatabaseSearch({ ...record, contactText }, search, [
            "agencyName",
            "contactName",
            "contact",
            "contactText",
            "email",
            "line",
            "instagram",
            "website",
            "country",
            "notes",
          ]) && matchesFilter(record.country, countryFilter)
        );
      }),
    [countryFilter, records, search],
  );

  const selectedAgency = useMemo(
    () => records.find((record) => record.id === selectedAgencyId) ?? null,
    [records, selectedAgencyId],
  );

  if (selectedAgency) {
    const contacts = getAgencyContacts(selectedAgency).filter(hasAgencyContactContent);

    return (
      <div
        key={`agency-detail-${selectedAgency.id}`}
        className="motion-reduce:animate-none animate-in fade-in-0 slide-in-from-right-3 duration-200"
      >
        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => setSelectedAgencyId(null)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background transition hover:border-cyan-300/30 hover:bg-accent"
              aria-label="Back to agency directory"
              title="Back to agency directory"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Agency profile
              </p>
              <h3 className="mt-1 truncate text-2xl font-semibold">
                {selectedAgency.agencyName || "Untitled agency"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" />
                  {formatContactCount(contacts.length)}
                </span>
                {selectedAgency.country ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {selectedAgency.country}
                  </span>
                ) : null}
                <AgencyExternalLinks record={selectedAgency} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 pl-12 sm:pl-0">
            <CopyAllRecipientsButton contacts={contacts} onCopy={onCopy} />
            <button
              type="button"
              onClick={() => onEdit(selectedAgency)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
            >
              <Pencil className="size-4" />
              Edit Agency
            </button>
            <button
              type="button"
              onClick={() => onAddContact(selectedAgency)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="size-4" />
              Add Contact
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.8fr)]">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">Contacts</h4>
              <span className="text-xs text-muted-foreground">
                {formatContactCount(contacts.length)}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background/35">
              {contacts.length ? (
                contacts.map((contact, index) => (
                  <div
                    key={contact.id}
                    className={`grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.35fr)] sm:items-center ${
                      index ? "border-t border-border" : ""
                    }`}
                  >
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                      {contact.isPrimary ? (
                        <Star
                          className="size-3.5 shrink-0 text-amber-300"
                          fill="currentColor"
                          aria-label="Primary contact"
                        />
                      ) : null}
                      <span className="truncate">{contact.name || "Contact"}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contact.role || "No role"}
                    </p>
                    <div className="min-w-0">
                      <ContactValue value={contact.contact} label="Contact" onCopy={onCopy} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No contacts yet. Add the first contact for this agency.
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-background/35 p-4">
              <h4 className="text-sm font-semibold">Agency notes</h4>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {selectedAgency.notes || "No notes saved."}
              </p>
            </section>
            <button
              type="button"
              onClick={() => {
                setSelectedAgencyId(null);
                onDelete(selectedAgency.id);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/25 bg-red-500/5 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
            >
              <Trash2 className="size-4" />
              Delete Agency
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div
      key="agency-directory"
      className="motion-reduce:animate-none animate-in fade-in-0 slide-in-from-left-3 duration-200"
    >
      <DatabaseToolbar
        search={search}
        onSearch={setSearch}
        addLabel="Add Agency"
        isSaving={isSaving}
        onAdd={onNew}
      >
        <DatabaseFilter
          label="Country"
          value={countryFilter}
          values={getUniqueValues(records.map((record) => record.country))}
          onChange={setCountryFilter}
        />
      </DatabaseToolbar>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background/30">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_170px_110px_36px] gap-4 border-b border-border bg-background/60 px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground md:grid">
          <span>Agency</span>
          <span>Primary contact</span>
          <span>Contacts</span>
          <span>Links</span>
          <span className="sr-only">Open</span>
        </div>
        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Loading agencies...
          </div>
        ) : filteredRecords.length ? (
          filteredRecords.map((record, index) => {
            const contacts = getAgencyContacts(record).filter(hasAgencyContactContent);
            const primaryContact = getPrimaryAgencyContact(contacts);
            return (
              <div
                key={record.id}
                className={`group grid w-full gap-2 px-4 py-3 text-left transition hover:bg-cyan-300/[0.045] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_170px_110px_36px] md:items-center md:gap-4 ${
                  index ? "border-t border-border" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedAgencyId(record.id)}
                  className="grid min-w-0 gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 md:col-span-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4"
                  aria-label={`Open ${record.agencyName || "agency"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {record.agencyName || "Untitled agency"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">
                      {record.country || "Country not set"}
                    </span>
                    {record.country ? (
                      <span className="mt-0.5 hidden truncate text-xs text-muted-foreground md:block">
                        {record.country}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {primaryContact?.name || primaryContact?.contact || "No contact yet"}
                    </span>
                    {primaryContact?.name && primaryContact.contact ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {primaryContact.contact}
                      </span>
                    ) : null}
                  </span>
                </button>
                <span className="flex items-center gap-2">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {formatContactCount(contacts.length)}
                  </span>
                  <CopyAllRecipientsButton contacts={contacts} onCopy={onCopy} compact />
                </span>
                <span className="flex items-center gap-2">
                  <AgencyExternalLinks record={record} compact />
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAgencyId(record.id)}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                  aria-label={`Open ${record.agencyName || "agency"}`}
                  title="Open agency"
                >
                  <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No agencies found.
          </div>
        )}
      </div>
    </div>
  );
}

function AgencyExternalLinks({
  record,
  compact = false,
}: {
  record: AgencyDatabaseRecord;
  compact?: boolean;
}) {
  const links = [
    { value: record.instagram, label: "Open Instagram", icon: Instagram },
    { value: record.website, label: "Open website", icon: Globe2 },
  ].filter((link) => Boolean(formatExternalUrl(link.value)));

  if (!links.length) {
    return compact ? <span className="text-xs text-muted-foreground">No links</span> : null;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {links.map(({ value, label, icon: Icon }) => (
        <a
          key={label}
          href={formatExternalUrl(value) ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-cyan-300/30 hover:bg-cyan-300/5 hover:text-cyan-100"
          aria-label={label}
          title={label}
        >
          <Icon className="size-4" />
        </a>
      ))}
    </span>
  );
}

function formatContactCount(count: number) {
  return `${count} ${count === 1 ? "contact" : "contacts"}`;
}

function CreatorDatabaseTable({
  records,
  isLoading,
  isSaving,
  onNew,
  onEdit,
  onDelete,
  onCopy,
}: {
  records: CreatorDatabaseRecord[];
  isLoading: boolean;
  isSaving: boolean;
  onNew: () => void;
  onEdit: (record: CreatorDatabaseRecord) => void;
  onDelete: (recordId: string) => void;
  onCopy: (text: string, label: string) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [contentTagFilter, setContentTagFilter] = useState("");
  const [followerTier, setFollowerTier] = useState("");
  const [avgViewsRange, setAvgViewsRange] = useState("");
  const [minRateUsd, setMinRateUsd] = useState("");
  const [maxRateUsd, setMaxRateUsd] = useState("");

  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          matchesDatabaseSearch(record, search, [
            "creatorName",
            "handle",
            "platform",
            "country",
            "contentTags",
            "email",
            "line",
            "instagram",
            "whatsapp",
            "rate1VideoUsd",
            "notes",
          ]) &&
          matchesFilter(record.platform, platformFilter) &&
          matchesFilter(record.country, countryFilter) &&
          matchesContentTag(record.contentTags, contentTagFilter) &&
          matchesPresetRange(record.followers, followerTier, followerTierOptions) &&
          matchesPresetRange(record.avgViews, avgViewsRange, avgViewsRangeOptions) &&
          matchesNumberRange(record.rate1VideoUsd, minRateUsd, maxRateUsd),
      ),
    [
      avgViewsRange,
      contentTagFilter,
      countryFilter,
      maxRateUsd,
      minRateUsd,
      followerTier,
      platformFilter,
      records,
      search,
    ],
  );

  return (
    <div>
      <DatabaseToolbar
        search={search}
        onSearch={setSearch}
        addLabel="Add Creator"
        isSaving={isSaving}
        onAdd={onNew}
      >
        <DatabaseFilter
          label="Platform"
          value={platformFilter}
          values={getUniqueValues(records.map((record) => record.platform))}
          onChange={setPlatformFilter}
        />
        <DatabaseFilter
          label="Country"
          value={countryFilter}
          values={getUniqueValues(records.map((record) => record.country))}
          onChange={setCountryFilter}
        />
        <DatabaseFilter
          label="Content Tags"
          value={contentTagFilter}
          values={[...creatorContentTags]}
          onChange={setContentTagFilter}
        />
        <DatabasePresetRangeFilter
          label="Followers"
          value={followerTier}
          options={followerTierOptions}
          onChange={setFollowerTier}
        />
        <DatabasePresetRangeFilter
          label="Avg Views"
          value={avgViewsRange}
          options={avgViewsRangeOptions}
          onChange={setAvgViewsRange}
        />
        <DatabaseNumberRangeFilter
          label="Rate USD"
          min={minRateUsd}
          max={maxRateUsd}
          onMinChange={setMinRateUsd}
          onMaxChange={setMaxRateUsd}
        />
      </DatabaseToolbar>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {filteredRecords.length.toLocaleString()} of {records.length.toLocaleString()}{" "}
        creators. All active filters apply together.
      </p>

      <div className="katlas-table-shell mt-4">
        <table className="min-w-[1120px] w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Creator</th>
              <th className="px-3 py-3">Platform</th>
              <th className="px-3 py-3">Country</th>
              <th className="px-3 py-3">Content Tags</th>
              <th className="px-3 py-3">Followers</th>
              <th className="px-3 py-3">Avg Views</th>
              <th className="px-3 py-3">Rate / 1 Video (USD)</th>
              <th className="px-3 py-3">Contacts</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <DatabaseLoadingRow colSpan={10} />
            ) : filteredRecords.length ? (
              filteredRecords.map((record) => (
                <tr key={record.id} className="border-t border-border align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{record.creatorName || "Untitled"}</p>
                    {record.handle ? (
                      <p className="mt-1 text-xs text-muted-foreground">{record.handle}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{record.platform || "-"}</td>
                  <td className="px-3 py-3">{record.country || "-"}</td>
                  <td className="px-3 py-3">{record.contentTags || "-"}</td>
                  <td className="px-3 py-3">{formatInteger(record.followers)}</td>
                  <td className="px-3 py-3">{formatInteger(record.avgViews)}</td>
                  <td className="px-3 py-3">{formatUsd(record.rate1VideoUsd)}</td>
                  <td className="space-y-1 px-3 py-3">
                    <ContactValue value={record.email} label="Email" onCopy={onCopy} />
                    <ContactValue value={record.line} label="LINE" onCopy={onCopy} />
                    <ContactValue value={record.instagram} label="Instagram" onCopy={onCopy} />
                    <ContactValue value={record.whatsapp} label="WhatsApp" onCopy={onCopy} />
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs leading-5 text-muted-foreground">
                    {record.notes || "-"}
                  </td>
                  <td className="px-3 py-3">
                    <RecordActions
                      onEdit={() => onEdit(record)}
                      onDelete={() => onDelete(record.id)}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <DatabaseEmptyRow colSpan={10} label="No creators found." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DatabaseToolbar({
  search,
  onSearch,
  addLabel,
  isSaving,
  onAdd,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  addLabel: string;
  isSaving: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="min-w-0 flex-1">
          <span className="text-xs font-medium text-muted-foreground">Search</span>
          <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-input bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search names, contacts, countries, notes..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2">{children}</div>
        <button
          type="button"
          onClick={onAdd}
          disabled={isSaving}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function DatabaseFilter({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-32">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
      >
        <option value="">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function DatabaseNumberRangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-48">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <input
          type="number"
          min="0"
          value={min}
          onChange={(event) => onMinChange(event.target.value)}
          placeholder="Min"
          aria-label={`Minimum ${label}`}
          className="h-10 min-w-0 rounded-md border border-input bg-card px-2.5 text-sm outline-none ring-ring focus:ring-2"
        />
        <input
          type="number"
          min="0"
          value={max}
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder="Max"
          aria-label={`Maximum ${label}`}
          className="h-10 min-w-0 rounded-md border border-input bg-card px-2.5 text-sm outline-none ring-ring focus:ring-2"
        />
      </div>
    </fieldset>
  );
}

function DatabasePresetRangeFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-40">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ContactValue({
  value,
  label,
  onCopy,
}: {
  value: string;
  label: string;
  onCopy: (text: string, label: string) => void | Promise<void>;
}) {
  if (!value.trim()) return <span className="text-muted-foreground">-</span>;
  const url = formatExternalUrl(value);

  return (
    <div className="flex max-w-[260px] items-center gap-2">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-cyan-200 hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="min-w-0 whitespace-pre-line break-words">{value}</span>
      )}
      {url ? <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      <button
        type="button"
        onClick={() => {
          void onCopy(value, label);
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card transition hover:bg-accent"
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function CopyAllRecipientsButton({
  contacts,
  onCopy,
  compact = false,
}: {
  contacts: AgencyContact[];
  onCopy: (text: string, label: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const recipients = getAgencyRecipientEmails(contacts);
  const label = recipients.length === 1 ? "1 recipient" : `${recipients.length} recipients`;

  return (
    <button
      type="button"
      disabled={!recipients.length}
      onClick={(event) => {
        event.stopPropagation();
        void onCopy(recipients.join(", "), label);
      }}
      className={
        compact
          ? "inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          : "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      }
      aria-label={`Copy all ${label}`}
      title={recipients.length ? `Copy all ${label}` : "No email recipients to copy"}
    >
      <Copy className="size-4" />
      {compact ? null : "Copy All Recipients"}
    </button>
  );
}

function RecordActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card transition hover:bg-accent"
        aria-label="Edit record"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-red-200 transition hover:bg-red-500/10"
        aria-label="Delete record"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function AgencyRecordEditor({
  record,
  isSaving,
  onChange,
  onSave,
  onClose,
}: {
  record: AgencyDatabaseRecord;
  isSaving: boolean;
  onChange: (record: AgencyDatabaseRecord | null) => void;
  onSave: (record: AgencyDatabaseRecord) => void;
  onClose: () => void;
}) {
  const contacts = getAgencyContacts(record);

  function updateContacts(nextContacts: AgencyContact[]) {
    const normalized = normalizePrimaryAgencyContacts(
      nextContacts.length ? nextContacts : [createBlankAgencyContact(true)],
    );
    const primaryContact = getPrimaryAgencyContact(normalized) ?? createBlankAgencyContact(true);
    onChange({
      ...record,
      contactName: primaryContact.name,
      contactRole: primaryContact.role,
      contact: primaryContact.contact,
      email: extractEmail(primaryContact.contact),
      line: extractLine(primaryContact.contact),
      contactsJson: serializeAgencyContacts(normalized),
      niche: "",
      status: record.status || "potential",
    });
  }

  return (
    <RecordEditorShell
      title={
        record.createdAt === record.updatedAt && !record.agencyName ? "Add Agency" : "Edit Agency"
      }
      isSaving={isSaving}
      canSave={Boolean(record.agencyName.trim())}
      onSave={() => onSave(record)}
      onClose={onClose}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <DatabaseInput
          label="Agency Name"
          value={record.agencyName}
          onChange={(agencyName) => onChange({ ...record, agencyName })}
        />
        <DatabaseInput
          label="Instagram"
          value={record.instagram}
          onChange={(instagram) => onChange({ ...record, instagram })}
        />
        <DatabaseInput
          label="Website"
          value={record.website}
          onChange={(website) => onChange({ ...record, website })}
        />
        <DatabaseInput
          label="Country"
          value={record.country}
          onChange={(country) => onChange({ ...record, country })}
        />
      </div>

      <AgencyContactsEditor contacts={contacts} onChange={updateContacts} />

      <DatabaseTextarea
        label="Notes"
        value={record.notes}
        onChange={(notes) => onChange({ ...record, notes })}
      />
    </RecordEditorShell>
  );
}

function AgencyContactsEditor({
  contacts,
  onChange,
}: {
  contacts: AgencyContact[];
  onChange: (contacts: AgencyContact[]) => void;
}) {
  const rows = contacts.length ? contacts : [createBlankAgencyContact()];

  function patchContact(id: string, patch: Partial<AgencyContact>) {
    onChange(rows.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)));
  }

  function addContact() {
    onChange([...rows, createBlankAgencyContact()]);
  }

  function removeContact(id: string) {
    onChange(rows.filter((contact) => contact.id !== id));
  }

  function setPrimaryContact(id: string) {
    onChange(rows.map((contact) => ({ ...contact, isPrimary: contact.id === id })));
  }

  return (
    <section className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Agency Contacts</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Add multiple contact people without repeating agency website, Instagram, country, or
            notes.
          </p>
        </div>
        <button
          type="button"
          onClick={addContact}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-accent"
        >
          <Plus className="size-3.5" />
          Add Contact
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((contact, index) => (
          <div key={contact.id} className="rounded-lg border border-border/80 bg-card/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrimaryContact(contact.id)}
                  className={`inline-flex size-8 items-center justify-center rounded-md border transition ${
                    contact.isPrimary
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-label={
                    contact.isPrimary
                      ? `Contact ${index + 1} is the primary contact`
                      : `Set contact ${index + 1} as primary`
                  }
                  aria-pressed={contact.isPrimary}
                  title={contact.isPrimary ? "Primary contact" : "Set as primary contact"}
                >
                  <Star className="size-4" fill={contact.isPrimary ? "currentColor" : "none"} />
                </button>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Contact {index + 1}
                  {contact.isPrimary ? " · Primary" : ""}
                </p>
              </div>
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeContact(contact.id)}
                  className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-red-200 transition hover:bg-red-500/10"
                  aria-label="Remove contact"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
              <DatabaseInput
                label="Name"
                value={contact.name}
                onChange={(name) => patchContact(contact.id, { name })}
              />
              <DatabaseInput
                label="Role"
                value={contact.role}
                onChange={(role) => patchContact(contact.id, { role })}
              />
              <DatabaseInput
                label="Contact"
                value={contact.contact}
                onChange={(value) => patchContact(contact.id, { contact: value })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CreatorRecordEditor({
  record,
  isSaving,
  onChange,
  onSave,
  onClose,
}: {
  record: CreatorDatabaseRecord;
  isSaving: boolean;
  onChange: (record: CreatorDatabaseRecord | null) => void;
  onSave: (record: CreatorDatabaseRecord) => void;
  onClose: () => void;
}) {
  return (
    <RecordEditorShell
      title={
        record.createdAt === record.updatedAt && !record.creatorName
          ? "Add Creator"
          : "Edit Creator"
      }
      isSaving={isSaving}
      canSave={Boolean(record.creatorName.trim())}
      onSave={() => onSave(record)}
      onClose={onClose}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <DatabaseInput
          label="Creator Name"
          value={record.creatorName}
          onChange={(creatorName) => onChange({ ...record, creatorName })}
        />
        <DatabaseInput
          label="Handle"
          value={record.handle}
          onChange={(handle) => onChange({ ...record, handle })}
        />
        <DatabaseInput
          label="Platform"
          value={record.platform}
          onChange={(platform) => onChange({ ...record, platform })}
        />
        <DatabaseInput
          label="Country"
          value={record.country}
          onChange={(country) => onChange({ ...record, country })}
        />
        <DatabaseSelect
          label="Content Tags"
          value={record.contentTags}
          values={[...creatorContentTags]}
          onChange={(contentTags) => onChange({ ...record, contentTags })}
        />
        <DatabaseInput
          label="Followers (K/M accepted)"
          value={formatCompactInput(record.followers)}
          onChange={(followers) =>
            onChange({ ...record, followers: normalizeCompactNumber(followers) })
          }
        />
        <DatabaseInput
          label="Avg Views (K/M accepted)"
          value={formatCompactInput(record.avgViews)}
          onChange={(avgViews) =>
            onChange({ ...record, avgViews: normalizeCompactNumber(avgViews) })
          }
        />
        <DatabaseInput
          label="Rate / 1 Video (USD)"
          value={String(record.rate1VideoUsd || "")}
          type="number"
          onChange={(rate1VideoUsd) =>
            onChange({ ...record, rate1VideoUsd: normalizeNumber(rate1VideoUsd) })
          }
        />
        <DatabaseInput
          label="Email"
          value={record.email}
          onChange={(email) => onChange({ ...record, email })}
        />
        <DatabaseInput
          label="LINE"
          value={record.line}
          onChange={(line) => onChange({ ...record, line })}
        />
        <DatabaseInput
          label="Instagram"
          value={record.instagram}
          onChange={(instagram) => onChange({ ...record, instagram })}
        />
        <DatabaseInput
          label="WhatsApp"
          value={record.whatsapp}
          onChange={(whatsapp) => onChange({ ...record, whatsapp })}
        />
      </div>
      <DatabaseTextarea
        label="Notes"
        value={record.notes}
        onChange={(notes) => onChange({ ...record, notes })}
      />
    </RecordEditorShell>
  );
}

function RecordEditorShell({
  title,
  isSaving,
  canSave,
  onSave,
  onClose,
  children,
}: {
  title: string;
  isSaving: boolean;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Database Record</p>
            <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close editor"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !canSave}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DatabaseInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
    </label>
  );
}

function DatabaseSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  const options = value && !values.includes(value) ? [value, ...values] : values;

  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      >
        <option value="">Select a tag</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DatabaseTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
      />
    </label>
  );
}

function DatabaseLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-muted-foreground">
        Loading Google Sheets records...
      </td>
    </tr>
  );
}

function DatabaseEmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

function matchesDatabaseSearch<T extends Record<string, unknown>>(
  record: T,
  search: string,
  keys: Array<keyof T>,
) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return keys.some((key) =>
    String(record[key] ?? "")
      .toLowerCase()
      .includes(query),
  );
}

function matchesFilter(value: string, filter: string) {
  if (!filter) return true;
  return value.trim().toLowerCase() === filter.trim().toLowerCase();
}

function matchesContentTag(value: string, filter: string) {
  if (!filter) return true;
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .includes(filter.trim().toLowerCase());
}

function matchesNumberRange(value: number, min: string, max: string) {
  const minValue = min.trim() ? normalizeNumber(min) : null;
  const maxValue = max.trim() ? normalizeNumber(max) : null;
  if (minValue !== null && value < minValue) return false;
  if (maxValue !== null && value > maxValue) return false;
  return true;
}

function matchesPresetRange(
  value: number,
  selected: string,
  options: ReadonlyArray<{ value: string; min: number; maxExclusive?: number }>,
) {
  if (!selected) return true;
  const range = options.find((option) => option.value === selected);
  if (!range) return true;
  return value >= range.min && (range.maxExclusive === undefined || value < range.maxExclusive);
}

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function getAgencyContacts(record: AgencyDatabaseRecord): AgencyContact[] {
  const parsedContacts = parseAgencyContacts(record.contactsJson);
  if (parsedContacts.length) return normalizePrimaryAgencyContacts(parsedContacts);

  const legacyContactParts = [
    record.contact?.trim(),
    record.email ? `Email: ${record.email.trim()}` : "",
    record.line ? `LINE: ${record.line.trim()}` : "",
  ].filter(Boolean);

  if (record.contactName || record.contactRole || legacyContactParts.length) {
    return [
      {
        id: createAgencyContactId(),
        name: record.contactName,
        role: record.contactRole,
        contact: legacyContactParts.join("\n"),
        isPrimary: true,
      },
    ];
  }

  return [createBlankAgencyContact(true)];
}

function addBlankContactToAgencyRecord(record: AgencyDatabaseRecord): AgencyDatabaseRecord {
  const contacts = getAgencyContacts(record).filter(hasAgencyContactContent);
  const nextContacts = [...contacts, createBlankAgencyContact()];
  return {
    ...record,
    contactsJson: serializeAgencyContacts(nextContacts),
  };
}

function hasAgencyContactContent(contact: AgencyContact) {
  return Boolean(contact.name.trim() || contact.role.trim() || contact.contact.trim());
}

function parseAgencyContacts(value: string): AgencyContact[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const contact = {
        id: String(row.id ?? "") || createAgencyContactId(),
        name: String(row.name ?? ""),
        role: String(row.role ?? ""),
        contact: String(row.contact ?? row.value ?? ""),
        isPrimary: Boolean(row.isPrimary),
      };
      return contact.name || contact.role || contact.contact ? [contact] : [];
    });
  } catch {
    return [];
  }
}

function serializeAgencyContacts(contacts: AgencyContact[]) {
  const normalized = normalizePrimaryAgencyContacts(contacts.filter(hasAgencyContactContent));
  return JSON.stringify(
    normalized.map((contact) => ({
      id: contact.id || createAgencyContactId(),
      name: contact.name.trim(),
      role: contact.role.trim(),
      contact: contact.contact.trim(),
      isPrimary: contact.isPrimary,
    })),
  );
}

function normalizePrimaryAgencyContacts(contacts: AgencyContact[]) {
  const primaryIndex = contacts.findIndex((contact) => contact.isPrimary);
  const selectedIndex = primaryIndex >= 0 ? primaryIndex : 0;
  return contacts.map((contact, index) => ({
    ...contact,
    isPrimary: index === selectedIndex,
  }));
}

function getPrimaryAgencyContact(contacts: AgencyContact[]) {
  return contacts.find((contact) => contact.isPrimary) ?? contacts[0];
}

function getAgencyRecipientEmails(contacts: AgencyContact[]) {
  const recipients = contacts.flatMap((contact) =>
    Array.from(
      contact.contact.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
      (match) => match[0],
    ),
  );
  return Array.from(
    new Map(recipients.map((recipient) => [recipient.toLowerCase(), recipient])).values(),
  );
}

function createBlankAgencyContact(isPrimary = false): AgencyContact {
  return {
    id: createAgencyContactId(),
    name: "",
    role: "",
    contact: "",
    isPrimary,
  };
}

function createAgencyContactId() {
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function extractLine(value: string) {
  const lineMatch = value.match(/(?:line|line id)[:\s]+(@?[\w.-]+)/i);
  return lineMatch?.[1] ?? "";
}

function normalizeNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCompactNumber(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([KM])?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const multiplier = match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return Number.isFinite(amount) ? amount * multiplier : 0;
}

function formatCompactInput(value: number) {
  if (!value) return "";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(2))}K`;
  return String(value);
}

function formatInteger(value: number) {
  return value > 0 ? Math.round(value).toLocaleString() : "-";
}

function formatUsd(value: number) {
  return value > 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value)
    : "-";
}

function formatExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i.test(trimmed)) return `mailto:${trimmed}`;
  if (/^(instagram\.com|www\.instagram\.com)\//i.test(trimmed)) return `https://${trimmed}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return "";
}
