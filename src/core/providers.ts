import { REQUEST_TIMEOUT_MS } from "./settings";
import { extractJsonObject, normalizeClassificationCandidates, normalizeLabelList, normalizeModelContent } from "./text";
import type {
  ClassificationResult,
  ForwardProxyPayload,
  ForwardProxyResult,
  ProviderAdapter,
  ProviderRequestInput,
  ProviderType,
} from "./types";

function buildOpenAICompatibleRequest(input: ProviderRequestInput): ForwardProxyPayload {
  return {
    url: input.settings.baseUrl,
    method: "POST",
    timeout: REQUEST_TIMEOUT_MS,
    contentType: "application/json",
    headers: [
      {
        Authorization: `Bearer ${input.settings.apiKey}`,
      },
    ],
    payload: {
      model: input.settings.model,
      temperature: 0.1,
      max_tokens: 1024,
      response_format: {
        type: "json_object",
      },
      messages: input.messages,
    },
    payloadEncoding: "json",
    responseEncoding: "text",
  };
}

function parseOpenAICompatibleResponse(raw: ForwardProxyResult): ClassificationResult {
  if (raw.status < 200 || raw.status >= 300) {
    const details = extractRemoteErrorMessage(raw.body);
    throw new Error(details ? `Remote model request failed with status ${raw.status}: ${details}` : `Remote model request failed with status ${raw.status}`);
  }

  const body = JSON.parse(raw.body) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };
  const content = normalizeModelContent(body.choices?.[0]?.message?.content);
  const json = extractJsonObject(content);
  const parsed = json ? JSON.parse(json) : {};

  return {
    labels: normalizeLabelList(parsed.labels),
    alternatives: normalizeLabelList(parsed.alternatives ?? parsed.backup_labels ?? parsed.backups),
    rankedCandidates: normalizeClassificationCandidates(parsed.ranked_candidates ?? parsed.rankedCandidates ?? parsed.candidates),
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
    rawText: content,
  };
}

function extractRemoteErrorMessage(body: string): string {
  if (!body.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: unknown;
        type?: unknown;
      };
      message?: unknown;
    };
    const directMessage = typeof parsed.message === "string" ? parsed.message.trim() : "";
    const errorMessage = typeof parsed.error?.message === "string" ? parsed.error.message.trim() : "";
    const errorType = typeof parsed.error?.type === "string" ? parsed.error.type.trim() : "";

    if (errorMessage && errorType) {
      return `${errorMessage} (${errorType})`;
    }

    return errorMessage || directMessage;
  } catch {
    return body.trim().slice(0, 300);
  }
}

function createOpenAIAdapter(): ProviderAdapter {
  return {
    buildRequest: buildOpenAICompatibleRequest,
    parseResponse: parseOpenAICompatibleResponse,
  };
}

const ADAPTERS: Record<ProviderType, ProviderAdapter> = {
  openai: createOpenAIAdapter(),
  deepseek: createOpenAIAdapter(),
  glm: createOpenAIAdapter(),
  qwen: createOpenAIAdapter(),
  moonshot: createOpenAIAdapter(),
  siliconflow: createOpenAIAdapter(),
  openrouter: createOpenAIAdapter(),
};

export function getProviderAdapter(provider: ProviderType): ProviderAdapter {
  return ADAPTERS[provider];
}
