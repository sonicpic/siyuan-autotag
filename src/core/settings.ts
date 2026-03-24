import type { PluginSettings, ProviderType } from "./types";

export const STORAGE_NAME = "settings";
export const REQUEST_TIMEOUT_MS = 60000;
export const DEFAULT_LEAF_LABEL_THRESHOLD = 80;
export const MAX_BRANCH_OPTIONS = 4;
export const MAX_HIERARCHY_DEPTH = 4;
export const MAX_PROMPT_CHARS = 12000;
export const MAX_HEADINGS_CHARS = 3000;

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
  glm: {
    label: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4.7-flash",
  },
  qwen: {
    label: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus-latest",
  },
  moonshot: {
    label: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1/chat/completions",
    model: "kimi-latest",
  },
  siliconflow: {
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1/chat/completions",
    model: "Qwen/Qwen3-32B",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
  },
};

function isProviderType(value: unknown): value is ProviderType {
  return typeof value === "string" && value in PROVIDER_PRESETS;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
  model: PROVIDER_PRESETS.deepseek.model,
  managedWhitelistLabels: [],
  labelDescriptions: {},
  maxTags: 5,
  promptSuffix: "",
  excludeDailyNotes: false,
  preserveNonManagedTags: true,
};

export function applyProviderPreset(settings: PluginSettings, provider: ProviderType): PluginSettings {
  const preset = PROVIDER_PRESETS[provider];
  return {
    ...settings,
    provider,
    baseUrl: preset.baseUrl,
    model: preset.model,
  };
}

export function normalizeSettings(raw: Partial<PluginSettings> | null | undefined): PluginSettings {
  const provider = isProviderType(raw?.provider) ? raw.provider : DEFAULT_SETTINGS.provider;
  const preset = PROVIDER_PRESETS[provider];
  const maxTags = Number(raw?.maxTags);

  return {
    provider,
    apiKey: typeof raw?.apiKey === "string" ? raw.apiKey.trim() : "",
    baseUrl: typeof raw?.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : preset.baseUrl,
    model: typeof raw?.model === "string" && raw.model.trim() ? raw.model.trim() : preset.model,
    managedWhitelistLabels: Array.isArray(raw?.managedWhitelistLabels)
      ? Array.from(new Set(raw.managedWhitelistLabels.filter((label): label is string => typeof label === "string" && label.trim().length > 0)))
      : [],
    labelDescriptions: normalizeLabelDescriptions(raw?.labelDescriptions),
    maxTags: Number.isFinite(maxTags) && maxTags > 0 ? Math.min(20, Math.max(1, Math.round(maxTags))) : DEFAULT_SETTINGS.maxTags,
    promptSuffix: typeof raw?.promptSuffix === "string" ? raw.promptSuffix.trim() : "",
    excludeDailyNotes: Boolean(raw?.excludeDailyNotes),
    preserveNonManagedTags: true,
  };
}

function normalizeLabelDescriptions(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([label, description]) => [label.trim(), typeof description === "string" ? description.trim() : ""] as const)
    .filter(([label, description]) => Boolean(label) && Boolean(description));

  return Object.fromEntries(entries);
}
