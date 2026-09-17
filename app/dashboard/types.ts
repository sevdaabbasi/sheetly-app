
export type Preview = {
  fileName: string;
  size: number;
  sheetName: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  rowFills?: Record<string, string>;
};

export type Upload = { fileId: string; preview: Preview };

export type Step = {
  kind: string;
  column?: string;
  operator?: string;
  value?: string;
  newName?: string;
  descending?: boolean;
  color?: string;
  secondColumn?: string;
  formulaOperator?: string;
  replacement?: string;
  mode?: string;
  separator?: string;
  aggregate?: string;
  start?: number;
  length?: number;
  values?: Record<string, string>;
};

export type MultiFileRequest = {
  kind: string;
  fileIds: string[];
  keyColumn?: string;
  otherKeyColumn?: string;
  fuzzy?: boolean;
  similarityThreshold?: number;
};

export type Plan = {
  operationId: string;
  plan: { summary: string; steps: Step[]; warnings: string[] };
  originalRows: number;
  estimatedRows: number;
  previewRows: string[][];
  columns: string[];
};

export type HistoryItem = {
  id: string;
  fileName: string;
  summary: string;
  rows: number;
  time: string;
  downloadReady: boolean;
};

export type Recipe = { id: string; name: string; steps: Step[] };

export type View = "workspace" | "files" | "history" | "actions";

export type ActionCategory =
  | "Satırlar"
  | "Temizleme"
  | "Kolonlar"
  | "Raporlama"
  | "Çoklu dosya";

export type ReadyAction = {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: ActionCategory;
};

export type BusyState = "upload" | "plan" | "execute" | "apply" | "revert" | null;
