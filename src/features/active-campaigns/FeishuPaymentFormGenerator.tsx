import {
  CircleCheck,
  CircleDot,
  Copy,
  FolderSearch,
  FunctionSquare,
  Hash,
  Link as LinkIcon,
  Paperclip,
  Text,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import type { GlobalCampaign, SelectedCreatorRecord } from "@/lib/campaignRegistry";

type PaymentStatus = "Pending Payment" | "Paid";
type UrgencyLevel = "Normal" | "Urgent" | "Extremely Urgent";
type PaymentType = "Deposit" | "Final Payment" | "Full Payment" | "Other / Additional Payment";
type RecordTitleDescription =
  | "Up-front payment"
  | "Balance payment"
  | "Final payment"
  | "Full payment"
  | "Other";
type PlatformCode = "TT" | "IG" | "YT" | "Other";

type FeishuPaymentFormGeneratorProps = {
  record: SelectedCreatorRecord;
  campaign: GlobalCampaign;
  onClose: () => void;
};

type OutputRow = {
  key: string;
  icon: LucideIcon;
  chineseTitle: string;
  englishMeaning: string;
  value: string;
  copyValue: string;
  tag?: FeishuTagValue;
  instruction?: boolean;
};

type FeishuTagValue =
  | "待付款"
  | "已付款"
  | "一般"
  | "紧急"
  | "十万火急"
  | "定金"
  | "尾款"
  | "全款"
  | "其它（附加款）"
  | "USD";

const paymentStatusMap: Record<PaymentStatus, FeishuTagValue> = {
  "Pending Payment": "待付款",
  Paid: "已付款",
};

const urgencyMap: Record<UrgencyLevel, FeishuTagValue> = {
  Normal: "一般",
  Urgent: "紧急",
  "Extremely Urgent": "十万火急",
};

const paymentTypeMap: Record<PaymentType, FeishuTagValue> = {
  Deposit: "定金",
  "Final Payment": "尾款",
  "Full Payment": "全款",
  "Other / Additional Payment": "其它（附加款）",
};

const tagStyles: Record<FeishuTagValue, { background: string; color: string }> = {
  待付款: { background: "#FFE1E1", color: "#E5484D" },
  已付款: { background: "#DFF5E4", color: "#2E7D32" },
  一般: { background: "#E8EEF8", color: "#4B5F7A" },
  紧急: { background: "#FFE1E1", color: "#E5484D" },
  十万火急: { background: "#FFE58F", color: "#B77900" },
  定金: { background: "#E8EEF8", color: "#4B5F7A" },
  尾款: { background: "#F5E4D2", color: "#8A5A2B" },
  全款: { background: "#DDF1F7", color: "#2B6F89" },
  "其它（附加款）": { background: "#F7E7A3", color: "#7A6500" },
  USD: { background: "#E8EEF8", color: "#4B5F7A" },
};

export function FeishuPaymentFormGenerator({
  record,
  campaign,
  onClose,
}: FeishuPaymentFormGeneratorProps) {
  const detectedPlatform = detectPlatform(record.creatorLink || record.liveLink);
  const [step, setStep] = useState<"survey" | "output">("survey");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Pending Payment");
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("Normal");
  const [creatorPublishedLink, setCreatorPublishedLink] = useState(record.liveLink);
  const [paymentType, setPaymentType] = useState<PaymentType>("Full Payment");
  const [recordTitleDescription, setRecordTitleDescription] =
    useState<RecordTitleDescription>("Full payment");
  const [customRecordTitleDescription, setCustomRecordTitleDescription] = useState("");
  const [paymentPercentage, setPaymentPercentage] = useState("");
  const [platform, setPlatform] = useState<PlatformCode>(detectedPlatform);
  const [clientQuote, setClientQuote] = useState(formatNumberForInput(record.externalQuote));
  const [amountUsd, setAmountUsd] = useState(formatNumberForInput(record.internalQuote));
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [projectCode, setProjectCode] = useState(campaign.campaignCode);
  const [copiedKey, setCopiedKey] = useState("");
  const usesPaymentPercentage = paymentType === "Deposit" || paymentType === "Final Payment";

  const amountForOutput = useMemo(
    () => calculateAmountUsd({ amountUsd, paymentPercentage, paymentType }),
    [amountUsd, paymentPercentage, paymentType],
  );
  const normalizedProjectCode = projectCode.trim() || campaign.campaignCode.trim();
  const normalizedCurrency = quoteCurrency.trim().toUpperCase() || "USD";
  const finalRecordTitleDescription =
    recordTitleDescription === "Other"
      ? customRecordTitleDescription.trim() || "Other payment"
      : recordTitleDescription;
  const paymentLabel = buildPaymentLabel(paymentType, paymentPercentage);
  const formTitle = `${normalizedProjectCode || "PROJECT-CODE"}-${campaign.campaignName} b1 ${platform} Influencer ${
    record.creatorName || "Creator"
  }\n${finalRecordTitleDescription}, ${paymentLabel} ${formatUsdAmount(amountForOutput)} USD`;

  const rows: OutputRow[] = [
    {
      key: "payment-description",
      icon: Text,
      chineseTitle: "付款说明",
      englishMeaning: "Payment Description",
      value: formTitle,
      copyValue: formTitle,
    },
    {
      key: "creator-homepage-link",
      icon: LinkIcon,
      chineseTitle: "红人主页链接",
      englishMeaning: "Creator Profile Link",
      value: record.creatorLink || "No creator profile link saved.",
      copyValue: record.creatorLink,
      instruction: !record.creatorLink,
    },
    {
      key: "payment-info",
      icon: Text,
      chineseTitle: "付款信息",
      englishMeaning: "Payment Information",
      value: `${finalRecordTitleDescription}, ${paymentLabel} ${formatUsdAmount(amountForOutput)} USD`,
      copyValue: `${finalRecordTitleDescription}, ${paymentLabel} ${formatUsdAmount(amountForOutput)} USD`,
    },
    {
      key: "payment-status",
      icon: CircleCheck,
      chineseTitle: "付款状态",
      englishMeaning: "Payment Status",
      value: paymentStatusMap[paymentStatus],
      copyValue: paymentStatusMap[paymentStatus],
      tag: paymentStatusMap[paymentStatus],
    },
    {
      key: "urgency-level",
      icon: CircleDot,
      chineseTitle: "紧急程度",
      englishMeaning: "Urgency Level",
      value: urgencyMap[urgencyLevel],
      copyValue: urgencyMap[urgencyLevel],
      tag: urgencyMap[urgencyLevel],
    },
    {
      key: "creator-published-link",
      icon: LinkIcon,
      chineseTitle: "红人发布链接",
      englishMeaning: "Creator Published Link",
      value: creatorPublishedLink || "Paste the creator published link in Feishu if available.",
      copyValue: creatorPublishedLink,
      instruction: !creatorPublishedLink,
    },
    {
      key: "payment-type",
      icon: CircleCheck,
      chineseTitle: "付款类型",
      englishMeaning: "Payment Type",
      value: paymentTypeMap[paymentType],
      copyValue: paymentTypeMap[paymentType],
      tag: paymentTypeMap[paymentType],
    },
    {
      key: "client-quote",
      icon: Hash,
      chineseTitle: "客户报价",
      englishMeaning: "Client Quote",
      value: clientQuote || "No client quote entered.",
      copyValue: clientQuote,
      instruction: !clientQuote,
    },
    {
      key: "payment-proof",
      icon: Paperclip,
      chineseTitle: "付款凭证",
      englishMeaning: "Payment Proof",
      value: "Upload payment proof in the real Feishu form.",
      copyValue: "Upload payment proof in the real Feishu form.",
      instruction: true,
    },
    {
      key: "client-name",
      icon: FolderSearch,
      chineseTitle: "客户名称",
      englishMeaning: "Client Name",
      value: "Autofilled by Feishu after submission.",
      copyValue: "Autofilled by Feishu after submission.",
      instruction: true,
    },
    {
      key: "project-name",
      icon: FolderSearch,
      chineseTitle: "项目名称",
      englishMeaning: "Project Name",
      value: "Autofilled by Feishu after submission.",
      copyValue: "Autofilled by Feishu after submission.",
      instruction: true,
    },
    {
      key: "project-code",
      icon: FunctionSquare,
      chineseTitle: "项目代码",
      englishMeaning: "Project Code",
      value: normalizedProjectCode || "Autofilled by Feishu after submission.",
      copyValue: normalizedProjectCode,
      instruction: !normalizedProjectCode,
    },
    {
      key: "amount-usd",
      icon: FunctionSquare,
      chineseTitle: "金额USD",
      englishMeaning: "Amount USD",
      value: `${formatUsdAmount(amountForOutput)} USD`,
      copyValue: formatUsdAmount(amountForOutput),
    },
    {
      key: "applicant-auto",
      icon: UserPlus,
      chineseTitle: "申请人（自动）",
      englishMeaning: "Applicant Auto",
      value: "Autofilled by Feishu after submission.",
      copyValue: "Autofilled by Feishu after submission.",
      instruction: true,
    },
    {
      key: "quote-currency",
      icon: CircleCheck,
      chineseTitle: "报价币种",
      englishMeaning: "Quote Currency",
      value: normalizedCurrency,
      copyValue: normalizedCurrency,
      tag: normalizedCurrency === "USD" ? "USD" : undefined,
    },
  ];

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("output");
  }

  async function copyValue(key: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Feishu Payment Form Generator
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {record.creatorName || "Creator payment form"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {campaign.campaignName} | {campaign.campaignCode || "No project code"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Close Feishu payment form generator"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "survey" ? (
          <form onSubmit={handleGenerate} className="p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SelectField
                label="Payment Status"
                value={paymentStatus}
                onChange={(value) => setPaymentStatus(value as PaymentStatus)}
                options={["Pending Payment", "Paid"]}
              />
              <SelectField
                label="Urgency Level"
                value={urgencyLevel}
                onChange={(value) => setUrgencyLevel(value as UrgencyLevel)}
                options={["Normal", "Urgent", "Extremely Urgent"]}
              />
              <SelectField
                label="Payment Type"
                value={paymentType}
                onChange={(value) => setPaymentType(value as PaymentType)}
                options={["Deposit", "Final Payment", "Full Payment", "Other / Additional Payment"]}
              />
              <SelectField
                label="Record Title Description"
                value={recordTitleDescription}
                onChange={(value) => setRecordTitleDescription(value as RecordTitleDescription)}
                options={[
                  "Up-front payment",
                  "Balance payment",
                  "Final payment",
                  "Full payment",
                  "Other",
                ]}
              />
              {recordTitleDescription === "Other" ? (
                <TextField
                  label="Custom Record Title Description"
                  value={customRecordTitleDescription}
                  onChange={setCustomRecordTitleDescription}
                  required
                />
              ) : null}
              {usesPaymentPercentage ? (
                <TextField
                  label="Payment Percentage"
                  value={paymentPercentage}
                  onChange={setPaymentPercentage}
                  placeholder="30"
                />
              ) : null}
              <SelectField
                label="Platform"
                value={platform}
                onChange={(value) => setPlatform(value as PlatformCode)}
                options={["TT", "IG", "YT", "Other"]}
              />
              <TextField
                label="Creator Published Link"
                value={creatorPublishedLink}
                onChange={setCreatorPublishedLink}
                placeholder="https://..."
              />
              <TextField
                label="Client Quote"
                value={clientQuote}
                onChange={setClientQuote}
                inputMode="decimal"
              />
              <TextField
                label="Amount USD"
                value={usesPaymentPercentage ? formatUsdAmount(amountForOutput) : amountUsd}
                onChange={setAmountUsd}
                inputMode="decimal"
                readOnly={usesPaymentPercentage}
              />
              <TextField
                label="Quote Currency"
                value={quoteCurrency}
                onChange={(value) => setQuoteCurrency(value.toUpperCase())}
              />
              {!campaign.campaignCode.trim() ? (
                <TextField
                  label="Project Code"
                  value={projectCode}
                  onChange={setProjectCode}
                  required
                />
              ) : null}
            </div>

            <div className="mt-5 rounded-lg border border-border bg-background/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Record title preview
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {formTitle}
              </pre>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Generate Feishu Form
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5">
            <div className="rounded-lg border border-border bg-background/70 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Generated record title
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {formTitle}
                  </pre>
                </div>
                <CopyButton
                  copied={copiedKey === "form-title"}
                  onClick={() => void copyValue("form-title", formTitle)}
                />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[44px_minmax(120px,1fr)_minmax(130px,1fr)_minmax(180px,2fr)_80px] border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Icon</span>
                <span>Chinese Field</span>
                <span>English Meaning</span>
                <span>Value / Instruction</span>
                <span>Copy</span>
              </div>
              {rows.map((row) => (
                <OutputFieldRow
                  key={row.key}
                  row={row}
                  copied={copiedKey === row.key}
                  onCopy={() => void copyValue(row.key, row.copyValue)}
                />
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("survey")}
                className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OutputFieldRow({
  row,
  copied,
  onCopy,
}: {
  row: OutputRow;
  copied: boolean;
  onCopy: () => void;
}) {
  const Icon = row.icon;

  return (
    <div className="grid grid-cols-[44px_minmax(120px,1fr)_minmax(130px,1fr)_minmax(180px,2fr)_80px] border-b border-border/70 px-3 py-3 text-sm last:border-b-0">
      <div className="pt-1 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="font-medium">{row.chineseTitle}</p>
      </div>
      <div className="text-muted-foreground">{row.englishMeaning}</div>
      <div>
        {row.tag ? (
          <FeishuTag value={row.tag} />
        ) : (
          <p
            className={`whitespace-pre-wrap leading-5 ${
              row.instruction ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {row.value}
          </p>
        )}
      </div>
      <div>
        <CopyButton copied={copied} onClick={onCopy} disabled={!row.copyValue.trim()} />
      </div>
    </div>
  );
}

function FeishuTag({ value }: { value: FeishuTagValue }) {
  const style = tagStyles[value];
  return (
    <span
      className="inline-flex rounded-md px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: style.background, color: style.color }}
    >
      {value}
    </span>
  );
}

function CopyButton({
  copied,
  disabled,
  onClick,
}: {
  copied: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Copy className="size-3.5" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TextField({
  label,
  value,
  required,
  placeholder,
  inputMode,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2 read-only:cursor-not-allowed read-only:bg-muted/35 read-only:text-muted-foreground"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function detectPlatform(value: string): PlatformCode {
  const normalized = value.toLowerCase();
  if (normalized.includes("tiktok.com")) return "TT";
  if (normalized.includes("instagram.com")) return "IG";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YT";
  return "Other";
}

function buildPaymentLabel(paymentType: PaymentType, paymentPercentage: string): string {
  if (paymentType === "Full Payment") return "Full payment";
  if (paymentType === "Other / Additional Payment") return "additional payment";
  const percentage = paymentPercentage.trim();
  if (!percentage) {
    if (paymentType === "Deposit") return "deposit payment";
    if (paymentType === "Final Payment") return "balance payment";
  }
  if (paymentType === "Deposit") return `${percentage}% up-front payment`;
  if (paymentType === "Final Payment") {
    return `${percentage}% balance of cooperation payment`;
  }
  return "additional payment";
}

function calculateAmountUsd({
  amountUsd,
  paymentPercentage,
  paymentType,
}: {
  amountUsd: string;
  paymentPercentage: string;
  paymentType: PaymentType;
}) {
  const amount = parseNumber(amountUsd);
  const usesPaymentPercentage = paymentType === "Deposit" || paymentType === "Final Payment";
  if (!usesPaymentPercentage) return amount;

  const percentage = parseNumber(paymentPercentage);
  if (amount > 0 && percentage > 0) return (amount * percentage) / 100;
  return amount;
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberForInput(value: number): string {
  if (!value) return "";
  return String(value);
}

function formatUsdAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}
