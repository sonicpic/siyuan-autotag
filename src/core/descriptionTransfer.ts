export interface LabelDescriptionExportPayload {
  version: 1;
  plugin: "siyuan-autotag";
  exportedAt: string;
  descriptions: Record<string, string>;
}

export function buildLabelDescriptionExport(descriptions: Record<string, string>): string {
  const payload: LabelDescriptionExportPayload = {
    version: 1,
    plugin: "siyuan-autotag",
    exportedAt: new Date().toISOString(),
    descriptions: normalizeDescriptions(descriptions),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseLabelDescriptionImport(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON file");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Imported content must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const source = extractDescriptionSource(record);
  const descriptions = normalizeDescriptions(source);

  if (Object.keys(descriptions).length === 0) {
    throw new Error("No valid label descriptions found in the imported file");
  }

  return descriptions;
}

function extractDescriptionSource(record: Record<string, unknown>): Record<string, unknown> {
  if (record.descriptions && typeof record.descriptions === "object" && !Array.isArray(record.descriptions)) {
    return record.descriptions as Record<string, unknown>;
  }

  if (record.labelDescriptions && typeof record.labelDescriptions === "object" && !Array.isArray(record.labelDescriptions)) {
    return record.labelDescriptions as Record<string, unknown>;
  }

  return record;
}

function normalizeDescriptions(source: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source)
      .map(([label, description]) => [label.trim(), typeof description === "string" ? description.trim() : ""] as const)
      .filter(([label, description]) => Boolean(label) && Boolean(description)),
  );
}
