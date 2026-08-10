export type BulkSenderColumn = {
  id: string;
  name: string;
};

export type BulkSenderRow = {
  id: string;
  values: Record<string, string>;
  result?: BulkSenderRowResult;
};

export type BulkSenderRowResult = {
  status: "created" | "skipped" | "failed";
  message: string;
  draftId?: string;
};

export type BulkSenderWorkspace = {
  columns: BulkSenderColumn[];
  rows: BulkSenderRow[];
  emailColumnId: string;
  subject: string;
  bodyHtml: string;
  updatedAt: string;
};

export type BulkSenderDraftInput = {
  rowId: string;
  to: string;
  subject: string;
  html: string;
  plainText: string;
};

export type BulkSenderJob = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  status: "queued" | "processing" | "completed" | "partially_failed" | "failed";
  total: number;
  completed: number;
  created: number;
  skipped: number;
  failed: number;
  results: Array<BulkSenderRowResult & { rowId: string }>;
  createdAt: string;
  updatedAt: string;
};
