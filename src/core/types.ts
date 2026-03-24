export type ProviderType =
  | "openai"
  | "deepseek"
  | "glm"
  | "qwen"
  | "moonshot"
  | "siliconflow"
  | "openrouter";

export interface PluginSettings {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  managedWhitelistLabels: string[];
  labelDescriptions: Record<string, string>;
  maxTags: number;
  promptSuffix: string;
  excludeDailyNotes: boolean;
  preserveNonManagedTags: true;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface ForwardProxyPayload {
  url: string;
  method: "POST";
  timeout: number;
  contentType: string;
  headers: Array<Record<string, string>>;
  payload: Record<string, unknown>;
  payloadEncoding: "text" | "json";
  responseEncoding: "text";
}

export interface ForwardProxyResult {
  body: string;
  bodyEncoding: string;
  contentType: string;
  elapsed: number;
  headers: Record<string, string>;
  status: number;
  url: string;
}

export interface ClassificationResult {
  labels: string[];
  alternatives: string[];
  rankedCandidates: ClassificationCandidate[];
  reason?: string;
  rawText?: string;
}

export interface ClassificationCandidate {
  label: string;
  selected: boolean;
  reason?: string;
}

export interface ProviderRequestInput {
  settings: PluginSettings;
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
}

export interface ProviderAdapter {
  buildRequest(input: ProviderRequestInput): ForwardProxyPayload;
  parseResponse(raw: ForwardProxyResult): ClassificationResult;
}

export interface ManagedTagNode {
  name: string;
  label: string;
  depth: number;
  description?: string;
  children: ManagedTagNode[];
}

export interface TagOption {
  label: string;
  name: string;
  depth: number;
  count: number;
}

export interface KernelTagNode {
  label: string;
  name?: string;
  count?: number;
  children?: KernelTagNode[];
}

export interface KernelListDocEntry {
  path: string;
  name: string;
  id: string;
  subFileCount: number;
}

export interface KernelListDocsResult {
  box: string;
  files: KernelListDocEntry[];
  path: string;
}

export interface NotebookOption {
  id: string;
  name: string;
  closed?: boolean;
  icon?: string;
}

export interface KernelListNotebooksResult {
  notebooks: NotebookOption[];
}

export interface ExportMarkdownResult {
  hPath: string;
  content: string;
}

export interface ReviewDialogInput {
  title: string;
  hPath: string;
  currentManagedTags: string[];
  preservedTags: string[];
  selectedLabels: string[];
  alternativeLabels: string[];
  rankedCandidates: ClassificationCandidate[];
  finalLabels: string[];
  reason?: string;
  i18n: Record<string, string>;
}

export interface ReviewDialogResult {
  labels: string[];
}

export interface LabelDescriptionOption {
  label: string;
  exists: boolean;
  description: string;
}

export type ScanDocStatus = "idle" | "queued" | "running" | "review" | "failed";

export interface UnclassifiedDocItem {
  rootId: string;
  notebookId: string;
  title: string;
  path: string;
  existingTags: string[];
  classificationTags: string[];
  isDailyNote: boolean;
  status: ScanDocStatus;
}

export interface ScanFilterState {
  query: string;
  regex: boolean;
  error?: string;
}

export interface NotebookScanViewState {
  notebooks: NotebookOption[];
  selectedNotebookId: string;
  items: UnclassifiedDocItem[];
  visibleRootIds: string[];
  selectedRootIds: string[];
  filter: ScanFilterState;
  scanning: boolean;
  hasScanned: boolean;
  scanProgress: {
    scanned: number;
    total: number;
    matched: number;
  };
}
