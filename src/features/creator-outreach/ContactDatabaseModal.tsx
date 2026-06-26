import { useMemo, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import type { AgencyDatabaseRecord, CreatorDatabaseRecord } from "@/storage/schema";

const databaseStatusOptions = ["potential", "contacted", "interested", "rejected", "saved"];

type DatabaseViewType = "agency" | "creator";
type AgencyContact = {
  id: string;
  name: string;
  role: string;
  contact: string;
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
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col rounded-xl border border-border bg-card shadow-2xl">
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

  const normalizedRecords = useMemo(
    () =>
      filteredRecords.map((record) => ({
        ...record,
        contacts: getAgencyContacts(record).filter(hasAgencyContactContent),
      })),
    [filteredRecords],
  );

  return (
    <div>
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

      <div className="katlas-table-shell mt-4">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Agency</th>
              <th className="px-3 py-3">Contacts</th>
              <th className="px-3 py-3">Instagram</th>
              <th className="px-3 py-3">Website</th>
              <th className="px-3 py-3">Country</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <DatabaseLoadingRow colSpan={7} />
            ) : normalizedRecords.length ? (
              normalizedRecords.map((record) => (
                <tr key={record.id} className="border-t border-border align-top">
                  <td className="px-3 py-3 font-medium">{record.agencyName || "Untitled"}</td>
                  <td className="min-w-[280px] px-3 py-3">
                    <AgencyContactList
                      contacts={record.contacts}
                      onAddContact={() => onAddContact(record)}
                      onCopy={onCopy}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <ContactValue value={record.instagram} label="Instagram" onCopy={onCopy} />
                  </td>
                  <td className="px-3 py-3">
                    <ContactValue value={record.website} label="Website" onCopy={onCopy} />
                  </td>
                  <td className="px-3 py-3">{record.country || "-"}</td>
                  <td className="max-w-[300px] px-3 py-3 text-xs leading-5 text-muted-foreground">
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
              <DatabaseEmptyRow colSpan={7} label="No agencies found." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgencyContactList({
  contacts,
  onAddContact,
  onCopy,
}: {
  contacts: AgencyContact[];
  onAddContact: () => void;
  onCopy: (text: string, label: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {contacts.length ? (
        contacts.map((contact) => (
          <div key={contact.id} className="rounded-lg border border-border/70 bg-background/40 p-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{contact.name || "Contact"}</p>
                {contact.role ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{contact.role}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-1">
              <ContactValue value={contact.contact} label="Contact" onCopy={onCopy} />
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-border/80 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
          No contacts yet.
        </div>
      )}
      <button
        type="button"
        onClick={onAddContact}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/25 bg-cyan-300/5 px-2.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
      >
        <Plus className="size-3.5" />
        Add Contact
      </button>
    </div>
  );
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
  const [nicheFilter, setNicheFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          matchesDatabaseSearch(record, search, [
            "creatorName",
            "handle",
            "platform",
            "profileUrl",
            "country",
            "language",
            "niche",
            "email",
            "line",
            "instagram",
            "whatsapp",
            "agencyName",
            "notes",
            "status",
          ]) &&
          matchesFilter(record.platform, platformFilter) &&
          matchesFilter(record.country, countryFilter) &&
          matchesFilter(record.niche, nicheFilter) &&
          matchesFilter(record.status, statusFilter),
      ),
    [countryFilter, nicheFilter, platformFilter, records, search, statusFilter],
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
          label="Niche"
          value={nicheFilter}
          values={getUniqueValues(records.map((record) => record.niche))}
          onChange={setNicheFilter}
        />
        <DatabaseFilter
          label="Status"
          value={statusFilter}
          values={databaseStatusOptions}
          onChange={setStatusFilter}
        />
      </DatabaseToolbar>

      <div className="katlas-table-shell mt-4">
        <table className="min-w-[1360px] w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Creator</th>
              <th className="px-3 py-3">Platform</th>
              <th className="px-3 py-3">Profile</th>
              <th className="px-3 py-3">Country</th>
              <th className="px-3 py-3">Language</th>
              <th className="px-3 py-3">Niche</th>
              <th className="px-3 py-3">Followers</th>
              <th className="px-3 py-3">Avg Views</th>
              <th className="px-3 py-3">Contacts</th>
              <th className="px-3 py-3">Agency</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <DatabaseLoadingRow colSpan={13} />
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
                  <td className="px-3 py-3">
                    <ContactValue value={record.profileUrl} label="Profile URL" onCopy={onCopy} />
                  </td>
                  <td className="px-3 py-3">{record.country || "-"}</td>
                  <td className="px-3 py-3">{record.language || "-"}</td>
                  <td className="px-3 py-3">{record.niche || "-"}</td>
                  <td className="px-3 py-3">{formatInteger(record.followers)}</td>
                  <td className="px-3 py-3">{formatInteger(record.avgViews)}</td>
                  <td className="space-y-1 px-3 py-3">
                    <ContactValue value={record.email} label="Email" onCopy={onCopy} />
                    <ContactValue value={record.line} label="LINE" onCopy={onCopy} />
                    <ContactValue value={record.instagram} label="Instagram" onCopy={onCopy} />
                    <ContactValue value={record.whatsapp} label="WhatsApp" onCopy={onCopy} />
                  </td>
                  <td className="px-3 py-3">{record.agencyName || "-"}</td>
                  <td className="px-3 py-3">
                    <DatabaseStatusBadge status={record.status} />
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
              <DatabaseEmptyRow colSpan={13} label="No creators found." />
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
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
    const normalized = nextContacts.length ? nextContacts : [createBlankAgencyContact()];
    const firstContact = normalized[0] ?? createBlankAgencyContact();
    onChange({
      ...record,
      contactName: firstContact.name,
      contactRole: firstContact.role,
      contact: firstContact.contact,
      email: extractEmail(firstContact.contact),
      line: extractLine(firstContact.contact),
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
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Contact {index + 1}
              </p>
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
          label="Profile URL"
          value={record.profileUrl}
          onChange={(profileUrl) => onChange({ ...record, profileUrl })}
        />
        <DatabaseInput
          label="Country"
          value={record.country}
          onChange={(country) => onChange({ ...record, country })}
        />
        <DatabaseInput
          label="Language"
          value={record.language}
          onChange={(language) => onChange({ ...record, language })}
        />
        <DatabaseInput
          label="Niche"
          value={record.niche}
          onChange={(niche) => onChange({ ...record, niche })}
        />
        <DatabaseStatusSelect
          value={record.status}
          onChange={(status) => onChange({ ...record, status })}
        />
        <DatabaseInput
          label="Followers"
          value={String(record.followers || "")}
          onChange={(followers) => onChange({ ...record, followers: normalizeNumber(followers) })}
        />
        <DatabaseInput
          label="Avg Views"
          value={String(record.avgViews || "")}
          onChange={(avgViews) => onChange({ ...record, avgViews: normalizeNumber(avgViews) })}
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
        <DatabaseInput
          label="Agency Name"
          value={record.agencyName}
          onChange={(agencyName) => onChange({ ...record, agencyName })}
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
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
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

function DatabaseStatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">Status</span>
      <select
        value={normalizeDatabaseStatus(value)}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      >
        {databaseStatusOptions.map((status) => (
          <option key={status} value={status}>
            {formatStatusLabel(status)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DatabaseStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
      {formatStatusLabel(status)}
    </span>
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

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function getAgencyContacts(record: AgencyDatabaseRecord): AgencyContact[] {
  const parsedContacts = parseAgencyContacts(record.contactsJson);
  if (parsedContacts.length) return parsedContacts;

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
      },
    ];
  }

  return [createBlankAgencyContact()];
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
      };
      return contact.name || contact.role || contact.contact ? [contact] : [];
    });
  } catch {
    return [];
  }
}

function serializeAgencyContacts(contacts: AgencyContact[]) {
  return JSON.stringify(
    contacts
      .map((contact) => ({
        id: contact.id || createAgencyContactId(),
        name: contact.name.trim(),
        role: contact.role.trim(),
        contact: contact.contact.trim(),
      }))
      .filter((contact) => contact.name || contact.role || contact.contact),
  );
}

function createBlankAgencyContact(): AgencyContact {
  return {
    id: createAgencyContactId(),
    name: "",
    role: "",
    contact: "",
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

function normalizeDatabaseStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  return databaseStatusOptions.includes(status) ? status : "potential";
}

function normalizeNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatStatusLabel(status: string) {
  return normalizeDatabaseStatus(status)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatInteger(value: number) {
  return value > 0 ? Math.round(value).toLocaleString() : "-";
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
