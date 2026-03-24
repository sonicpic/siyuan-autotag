import { escapeHtml, interpolate } from "./format";
import type { NotebookScanViewState, ScanDocStatus } from "./types";

export interface NotebookScanTabHandlers {
  onNotebookChange: (notebookId: string) => void;
  onStartScan: () => void;
  onQueryChange: (query: string) => void;
  onRegexChange: (enabled: boolean) => void;
  onToggleSelection: (rootId: string, checked: boolean) => void;
  onSelectVisible: () => void;
  onClearVisible: () => void;
  onRunSelected: () => void;
  onOpenDocument: (rootId: string) => void;
}

export function renderNotebookScanTab(
  container: HTMLElement,
  state: NotebookScanViewState,
  handlers: NotebookScanTabHandlers,
  i18n: Record<string, string>,
): void {
  const visibleSet = new Set(state.visibleRootIds);
  const selectedSet = new Set(state.selectedRootIds);
  const visibleItems = state.items.filter((item) => visibleSet.has(item.rootId));

  container.innerHTML = `
    <div class="autotag__scan">
      <div class="autotag__scan-toolbar">
        <select class="b3-select autotag__scan-select" id="autotag-scan-notebook">
          ${renderNotebookOptions(state, i18n)}
        </select>
        <button class="b3-button b3-button--outline" data-type="scan-start">${escapeHtml(state.hasScanned ? i18n.scanRescan : i18n.scanStart)}</button>
        <input class="b3-text-field autotag__scan-search" id="autotag-scan-query" placeholder="${escapeHtml(i18n.scanFilterPlaceholder)}" value="${escapeHtml(state.filter.query)}">
        <label class="autotag__scan-regex">
          <input type="checkbox" id="autotag-scan-regex" ${state.filter.regex ? "checked" : ""}>
          <span>${escapeHtml(i18n.scanRegexToggle)}</span>
        </label>
        <button class="b3-button b3-button--outline" data-type="scan-select-visible">${escapeHtml(i18n.scanSelectVisible)}</button>
        <button class="b3-button b3-button--outline" data-type="scan-clear-visible">${escapeHtml(i18n.scanClearVisible)}</button>
        <button class="b3-button b3-button--text" data-type="scan-run-selected">${escapeHtml(i18n.scanRunSelected)}</button>
      </div>
      <div class="autotag__scan-summary">
        <span>${escapeHtml(interpolate(i18n.scanProgressSummary, state.scanProgress))}</span>
        <span>${escapeHtml(interpolate(i18n.scanSelectionSummary, {
          visible: visibleItems.length,
          selected: state.selectedRootIds.length,
          total: state.items.length,
        }))}</span>
      </div>
      ${state.filter.error ? `<div class="autotag__scan-error">${escapeHtml(state.filter.error)}</div>` : ""}
      <div class="autotag__scan-list">
        ${renderScanList(state, visibleItems, selectedSet, i18n)}
      </div>
    </div>
  `;

  bindEvents(container, handlers);
}

function bindEvents(container: HTMLElement, handlers: NotebookScanTabHandlers) {
  const notebookSelect = container.querySelector("#autotag-scan-notebook") as HTMLSelectElement | null;
  notebookSelect?.addEventListener("change", () => {
    handlers.onNotebookChange(notebookSelect.value);
  });

  const queryInput = container.querySelector("#autotag-scan-query") as HTMLInputElement | null;
  queryInput?.addEventListener("input", () => {
    handlers.onQueryChange(queryInput.value);
  });

  const regexToggle = container.querySelector("#autotag-scan-regex") as HTMLInputElement | null;
  regexToggle?.addEventListener("change", () => {
    handlers.onRegexChange(regexToggle.checked);
  });

  container.querySelector('[data-type="scan-start"]')?.addEventListener("click", () => {
    handlers.onStartScan();
  });
  container.querySelector('[data-type="scan-select-visible"]')?.addEventListener("click", () => {
    handlers.onSelectVisible();
  });
  container.querySelector('[data-type="scan-clear-visible"]')?.addEventListener("click", () => {
    handlers.onClearVisible();
  });
  container.querySelector('[data-type="scan-run-selected"]')?.addEventListener("click", () => {
    handlers.onRunSelected();
  });

  container.querySelectorAll<HTMLInputElement>('input[data-role="scan-select-item"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      handlers.onToggleSelection(checkbox.dataset.rootId || "", checkbox.checked);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('button[data-role="scan-open-doc"]').forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onOpenDocument(button.dataset.rootId || "");
    });
  });
}

function renderNotebookOptions(state: NotebookScanViewState, i18n: Record<string, string>): string {
  if (state.notebooks.length === 0) {
    return `<option value="">${escapeHtml(i18n.scanNotebookEmpty)}</option>`;
  }

  return state.notebooks
    .map((notebook) => `
      <option value="${escapeHtml(notebook.id)}" ${notebook.id === state.selectedNotebookId ? "selected" : ""}>
        ${escapeHtml(notebook.name)}
      </option>
    `)
    .join("");
}

function renderScanList(
  state: NotebookScanViewState,
  visibleItems: NotebookScanViewState["items"],
  selectedSet: Set<string>,
  i18n: Record<string, string>,
): string {
  if (state.scanning && state.items.length === 0) {
    return `<div class="autotag__placeholder">${escapeHtml(i18n.scanScanning)}</div>`;
  }

  if (!state.hasScanned) {
    return `<div class="autotag__placeholder">${escapeHtml(i18n.scanNotStarted)}</div>`;
  }

  if (state.items.length === 0) {
    return `<div class="autotag__placeholder">${escapeHtml(i18n.scanNoResults)}</div>`;
  }

  if (visibleItems.length === 0) {
    return `<div class="autotag__placeholder">${escapeHtml(i18n.scanNoVisibleResults)}</div>`;
  }

  return `
    <div class="autotag__scan-list-head">
      <div>${escapeHtml(i18n.scanColumnSelect)}</div>
      <div>${escapeHtml(i18n.scanColumnTitle)}</div>
      <div>${escapeHtml(i18n.scanColumnPath)}</div>
      <div>${escapeHtml(i18n.scanColumnTags)}</div>
      <div>${escapeHtml(i18n.scanColumnClassification)}</div>
      <div>${escapeHtml(i18n.scanColumnStatus)}</div>
    </div>
    <div class="autotag__scan-rows">
      ${visibleItems.map((item) => renderScanRow(item, selectedSet.has(item.rootId), i18n)).join("")}
    </div>
  `;
}

function renderScanRow(
  item: NotebookScanViewState["items"][number],
  checked: boolean,
  i18n: Record<string, string>,
): string {
  const statusKey = scanStatusI18nKey(item.status);
  return `
    <div class="autotag__scan-row">
      <div class="autotag__scan-cell autotag__scan-cell--select">
        <input type="checkbox" data-role="scan-select-item" data-root-id="${escapeHtml(item.rootId)}" ${checked ? "checked" : ""}>
      </div>
      <div class="autotag__scan-cell autotag__scan-cell--title">
        <button class="b3-button b3-button--outline autotag__scan-open" data-role="scan-open-doc" data-root-id="${escapeHtml(item.rootId)}">${escapeHtml(item.title)}</button>
      </div>
      <div class="autotag__scan-cell autotag__scan-cell--path">${escapeHtml(item.path)}</div>
      <div class="autotag__scan-cell">${renderTagGroup(item.existingTags, i18n.scanNoTags)}</div>
      <div class="autotag__scan-cell">${renderTagGroup(item.classificationTags, i18n.scanNoClassificationTags, "autotag__chip--muted")}</div>
      <div class="autotag__scan-cell">
        <span class="autotag__status autotag__status--${item.status}">${escapeHtml(i18n[statusKey])}</span>
      </div>
    </div>
  `;
}

function renderTagGroup(labels: string[], emptyText: string, extraClass = ""): string {
  if (labels.length === 0) {
    return `<span class="autotag__placeholder">${escapeHtml(emptyText)}</span>`;
  }

  return `
    <div class="autotag__chips">
      ${labels.map((label) => `<span class="autotag__chip ${extraClass}">${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function scanStatusI18nKey(status: ScanDocStatus): string {
  switch (status) {
    case "queued":
      return "scanStatusQueued";
    case "running":
      return "scanStatusRunning";
    case "review":
      return "scanStatusReview";
    case "failed":
      return "scanStatusFailed";
    case "idle":
    default:
      return "scanStatusIdle";
  }
}
