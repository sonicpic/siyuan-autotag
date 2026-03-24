import { MAX_HEADINGS_CHARS, MAX_PROMPT_CHARS } from "./settings";
import type { ClassificationCandidate } from "./types";

export function truncateMarkdownForPrompt(markdown: string, maxChars = MAX_PROMPT_CHARS): string {
  const normalized = markdown.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const headings = normalized
    .split(/\r?\n/)
    .filter((line) => /^#{1,6}\s/.test(line))
    .join("\n")
    .slice(0, MAX_HEADINGS_CHARS);

  const remaining = Math.max(2000, maxChars - headings.length - 80);
  const excerpt = normalized.slice(0, remaining);

  return [
    "## 文档提纲",
    headings || "(无标题提纲)",
    "",
    "## 文档正文摘录",
    excerpt,
    "",
    "[内容已截断]",
  ].join("\n");
}

export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const startIndex = candidate.indexOf("{");
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export function normalizeModelContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function normalizeLabelList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((item) => String(item).trim()).filter(Boolean)));
  }

  if (typeof raw === "string") {
    return Array.from(
      new Set(
        raw
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

export function normalizeClassificationCandidates(raw: unknown): ClassificationCandidate[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: ClassificationCandidate[] = [];

  raw.forEach((item) => {
    if (typeof item === "string") {
      const label = item.trim();
      if (!label || seen.has(label)) {
        return;
      }
      seen.add(label);
      candidates.push({
        label,
        selected: false,
      });
      return;
    }

    if (!item || typeof item !== "object") {
      return;
    }

    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label || seen.has(label)) {
      return;
    }

    seen.add(label);
    candidates.push({
      label,
      selected: Boolean(record.selected),
      reason: typeof record.reason === "string" ? record.reason.trim() : undefined,
    });
  });

  return candidates;
}

export function splitStoredTags(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function isDailyNoteAttrs(attrs: Record<string, string | undefined>): boolean {
  return Object.keys(attrs).some((key) => /^custom-dailynote-\d{8}$/i.test(key));
}

export function mergeManagedTags(existingTags: string[], managedWhitelistLabels: string[], suggestedManagedTags: string[]): string[] {
  const managedSet = new Set(managedWhitelistLabels);
  const preserved = existingTags.filter((tag) => !managedSet.has(tag));
  const managed = suggestedManagedTags.filter((tag) => managedSet.has(tag));
  return Array.from(new Set([...preserved, ...managed]));
}
