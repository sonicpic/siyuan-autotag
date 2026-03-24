export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_, key) => String(values[key] ?? ""));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) {
    return value;
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}
