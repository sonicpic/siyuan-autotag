import { Dialog } from "siyuan";
import { escapeHtml, interpolate } from "./format";
import type {
  LabelDescriptionOption,
  ReviewDialogInput,
  ReviewDialogResult,
  TagOption,
} from "./types";

export function openReviewDialog(input: ReviewDialogInput): Promise<ReviewDialogResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = (result: ReviewDialogResult | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const dialog = new Dialog({
      title: input.i18n.reviewTitle,
      width: "700px",
      height: "auto",
      disableClose: true,
      destroyCallback: () => {
        finalize(null);
      },
      content: `
        <div class="b3-dialog__content">
          <div class="autotag__dialog">
            <div class="autotag__meta">
              <div>
                <div class="autotag__meta-label">${escapeHtml(input.i18n.reviewDocTitle)}</div>
                <div class="autotag__meta-value">${escapeHtml(input.title)}</div>
              </div>
              <div>
                <div class="autotag__meta-label">${escapeHtml(input.i18n.reviewDocPath)}</div>
                <div class="autotag__meta-value">${escapeHtml(input.hPath)}</div>
              </div>
            </div>
            <div class="autotag__section">
              <div class="autotag__section-title">${escapeHtml(input.i18n.reviewCurrentManaged)}</div>
              <div class="autotag__chips">${renderChips(input.currentManagedTags, input.i18n.reviewNoTags, "autotag__chip--muted")}</div>
            </div>
            <div class="autotag__section">
              <div class="autotag__section-title">${escapeHtml(input.i18n.reviewPreserved)}</div>
              <div class="autotag__chips">${renderChips(input.preservedTags, input.i18n.reviewNoTags, "autotag__chip--muted")}</div>
            </div>
            <div class="autotag__section">
              <div class="autotag__section-title">${escapeHtml(input.i18n.reviewSelected)}</div>
              <div class="autotag__checklist" id="autotag-review-selected"></div>
            </div>
            <div class="autotag__section">
              <div class="autotag__section-title">${escapeHtml(input.i18n.reviewAlternatives)}</div>
              <div class="autotag__checklist" id="autotag-review-alternatives"></div>
            </div>
            ${input.reason ? `
              <div class="autotag__section">
                <div class="autotag__section-title">${escapeHtml(input.i18n.reviewReason)}</div>
                <div class="autotag__reason">${escapeHtml(input.reason)}</div>
              </div>
            ` : ""}
            <div class="autotag__section">
              <div class="autotag__section-title">${escapeHtml(input.i18n.reviewFinal)}</div>
              <div class="autotag__chips" id="autotag-review-final">${renderChips(input.finalLabels, input.i18n.reviewNoTags)}</div>
            </div>
          </div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-type="cancel">${escapeHtml(input.i18n.reviewCancel)}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text" data-type="apply">${escapeHtml(input.i18n.reviewApply)}</button>
        </div>
      `,
    });

    const selectedContainer = dialog.element.querySelector("#autotag-review-selected") as HTMLElement;
    const alternativeContainer = dialog.element.querySelector("#autotag-review-alternatives") as HTMLElement;
    const finalContainer = dialog.element.querySelector("#autotag-review-final") as HTMLElement;
    const reasonMap = new Map(
      input.rankedCandidates
        .filter((candidate) => Boolean(candidate.reason))
        .map((candidate) => [candidate.label, candidate.reason as string]),
    );
    const candidateOrder = Array.from(new Set([
      ...input.selectedLabels,
      ...input.alternativeLabels,
      ...input.rankedCandidates.map((candidate) => candidate.label),
    ]));
    const selected = new Set(input.selectedLabels);

    const renderChecklist = (container: HTMLElement, labels: string[], checked: boolean, emptyText: string) => {
      container.innerHTML = "";
      if (labels.length === 0) {
        container.innerHTML = `<div class="autotag__placeholder">${escapeHtml(emptyText)}</div>`;
        return;
      }

      labels.forEach((label) => {
        const reason = reasonMap.get(label);
        const row = document.createElement("label");
        row.className = "autotag__check-item";
        row.innerHTML = `
          <input type="checkbox" ${checked ? "checked" : ""}>
          <span class="autotag__check-text">
            <span class="autotag__check-label">${escapeHtml(label)}</span>
            ${reason ? `<span class="autotag__check-reason">${escapeHtml(reason)}</span>` : ""}
          </span>
        `;
        const checkbox = row.querySelector("input") as HTMLInputElement;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selected.add(label);
          } else {
            selected.delete(label);
          }
          renderFinal();
        });
        container.appendChild(row);
      });
    };

    const renderFinal = () => {
      const chosenLabels = candidateOrder.filter((label) => selected.has(label));
      finalContainer.innerHTML = renderChips([...input.preservedTags, ...chosenLabels], input.i18n.reviewNoTags);
    };

    renderChecklist(selectedContainer, input.selectedLabels, true, input.i18n.reviewNoPrimary);
    renderChecklist(alternativeContainer, input.alternativeLabels, false, input.i18n.reviewNoAlternatives);
    renderFinal();

    const cancelButton = dialog.element.querySelector('[data-type="cancel"]') as HTMLButtonElement;
    const applyButton = dialog.element.querySelector('[data-type="apply"]') as HTMLButtonElement;

    cancelButton.addEventListener("click", () => {
      finalize(null);
      dialog.destroy();
    });

    applyButton.addEventListener("click", () => {
      finalize({
        labels: candidateOrder.filter((label) => selected.has(label)),
      });
      dialog.destroy();
    });
  });
}

export function openWhitelistDialog(
  tags: TagOption[],
  selectedLabels: string[],
  i18n: Record<string, string>,
): Promise<string[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = (result: string[] | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const dialog = new Dialog({
      title: i18n.whitelistTitle,
      width: "720px",
      height: "auto",
      destroyCallback: () => {
        finalize(null);
      },
      content: `
        <div class="b3-dialog__content">
          <div class="autotag__dialog">
            <div class="autotag__toolbar">
              <input class="b3-text-field fn__flex-1" id="autotag-whitelist-search" placeholder="${escapeHtml(i18n.whitelistSearchPlaceholder)}">
              <button class="b3-button b3-button--outline" data-type="select-visible">${escapeHtml(i18n.whitelistSelectVisible)}</button>
              <button class="b3-button b3-button--outline" data-type="clear-visible">${escapeHtml(i18n.whitelistClearVisible)}</button>
            </div>
            <div class="autotag__summary" id="autotag-whitelist-summary"></div>
            <div class="autotag__tag-list" id="autotag-whitelist-list"></div>
          </div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-type="cancel">${escapeHtml(i18n.whitelistCancel)}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text" data-type="save">${escapeHtml(i18n.whitelistSave)}</button>
        </div>
      `,
    });

    const selected = new Set(selectedLabels);
    const list = dialog.element.querySelector("#autotag-whitelist-list") as HTMLElement;
    const summary = dialog.element.querySelector("#autotag-whitelist-summary") as HTMLElement;
    const searchInput = dialog.element.querySelector("#autotag-whitelist-search") as HTMLInputElement;

    if (tags.length === 0) {
      list.innerHTML = `<div class="autotag__placeholder">${escapeHtml(i18n.whitelistEmpty)}</div>`;
    }

    const rows = tags.map((tag) => {
      const row = document.createElement("label");
      row.className = "autotag__tag-row";
      row.innerHTML = `
        <input type="checkbox" ${selected.has(tag.label) ? "checked" : ""}>
        <span class="autotag__tag-label" style="padding-left:${tag.depth * 18}px">${escapeHtml(tag.label)}</span>
        <span class="autotag__tag-count">${tag.count > 0 ? String(tag.count) : ""}</span>
      `;

      const checkbox = row.querySelector("input") as HTMLInputElement;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selected.add(tag.label);
        } else {
          selected.delete(tag.label);
        }
        renderSummary();
      });
      list.appendChild(row);
      return {
        tag,
        row,
        checkbox,
      };
    });

    const filterRows = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      rows.forEach(({ tag, row }) => {
        const visible = !keyword || tag.label.toLowerCase().includes(keyword);
        row.dataset.hidden = visible ? "false" : "true";
      });
    };

    const renderSummary = () => {
      summary.textContent = interpolate(i18n.whitelistSummary, {
        selected: selected.size,
        total: tags.length,
      });
    };

    searchInput.addEventListener("input", filterRows);
    dialog.element.querySelector('[data-type="select-visible"]')?.addEventListener("click", () => {
      rows.forEach(({ tag, row, checkbox }) => {
        if (row.dataset.hidden === "true") {
          return;
        }
        checkbox.checked = true;
        selected.add(tag.label);
      });
      renderSummary();
    });
    dialog.element.querySelector('[data-type="clear-visible"]')?.addEventListener("click", () => {
      rows.forEach(({ tag, row, checkbox }) => {
        if (row.dataset.hidden === "true") {
          return;
        }
        checkbox.checked = false;
        selected.delete(tag.label);
      });
      renderSummary();
    });
    dialog.element.querySelector('[data-type="cancel"]')?.addEventListener("click", () => {
      finalize(null);
      dialog.destroy();
    });
    dialog.element.querySelector('[data-type="save"]')?.addEventListener("click", () => {
      finalize(Array.from(selected).sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true })));
      dialog.destroy();
    });

    renderSummary();
  });
}

export function openLabelDescriptionDialog(
  options: LabelDescriptionOption[],
  i18n: Record<string, string>,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = (result: Record<string, string> | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const dialog = new Dialog({
      title: i18n.descriptionTitle,
      width: "860px",
      height: "auto",
      destroyCallback: () => {
        finalize(null);
      },
      content: `
        <div class="b3-dialog__content">
          <div class="autotag__dialog">
            <div class="autotag__toolbar">
              <input class="b3-text-field fn__flex-1" id="autotag-description-search" placeholder="${escapeHtml(i18n.descriptionSearchPlaceholder)}">
            </div>
            <div class="autotag__summary" id="autotag-description-summary"></div>
            <div class="autotag__description-list" id="autotag-description-list"></div>
          </div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-type="cancel">${escapeHtml(i18n.descriptionCancel)}</button>
          <div class="fn__space"></div>
          <button class="b3-button b3-button--text" data-type="save">${escapeHtml(i18n.descriptionSave)}</button>
        </div>
      `,
    });

    const descriptionMap = new Map(
      options
        .filter((option) => option.description.trim())
        .map((option) => [option.label, option.description.trim()] as const),
    );
    const list = dialog.element.querySelector("#autotag-description-list") as HTMLElement;
    const summary = dialog.element.querySelector("#autotag-description-summary") as HTMLElement;
    const searchInput = dialog.element.querySelector("#autotag-description-search") as HTMLInputElement;

    const rows = options.map((option) => {
      const row = document.createElement("div");
      row.className = "autotag__description-row";
      row.innerHTML = `
        <div class="autotag__description-head">
          <div class="autotag__description-label">${escapeHtml(option.label)}</div>
          <span class="autotag__rank-badge ${option.exists ? "autotag__rank-badge--selected" : "autotag__rank-badge--alternative"}">
            ${escapeHtml(option.exists ? i18n.descriptionStatusExisting : i18n.descriptionStatusMissing)}
          </span>
        </div>
        <textarea class="b3-text-field fn__block autotag__description-input" rows="3" placeholder="${escapeHtml(i18n.descriptionPlaceholder)}">${escapeHtml(option.description)}</textarea>
      `;

      const textarea = row.querySelector("textarea") as HTMLTextAreaElement;
      textarea.addEventListener("input", () => {
        const value = textarea.value.trim();
        if (value) {
          descriptionMap.set(option.label, value);
        } else {
          descriptionMap.delete(option.label);
        }
        renderSummary();
        filterRows();
      });

      list.appendChild(row);
      return {
        option,
        row,
        textarea,
      };
    });

    if (rows.length === 0) {
      list.innerHTML = `<div class="autotag__placeholder">${escapeHtml(i18n.whitelistEmpty)}</div>`;
    }

    const filterRows = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      rows.forEach(({ option, row, textarea }) => {
        const haystack = `${option.label}\n${textarea.value}`.toLowerCase();
        const visible = !keyword || haystack.includes(keyword);
        row.dataset.hidden = visible ? "false" : "true";
      });
    };

    const renderSummary = () => {
      summary.textContent = interpolate(i18n.descriptionSummary, {
        described: descriptionMap.size,
        total: options.length,
      });
    };

    searchInput.addEventListener("input", filterRows);
    dialog.element.querySelector('[data-type="cancel"]')?.addEventListener("click", () => {
      finalize(null);
      dialog.destroy();
    });
    dialog.element.querySelector('[data-type="save"]')?.addEventListener("click", () => {
      finalize(Object.fromEntries(descriptionMap.entries()));
      dialog.destroy();
    });

    renderSummary();
    filterRows();
  });
}

function renderChips(labels: string[], emptyText: string, extraClass = ""): string {
  if (labels.length === 0) {
    return `<span class="autotag__placeholder">${escapeHtml(emptyText)}</span>`;
  }

  return labels
    .map((label) => `<span class="autotag__chip ${extraClass}">${escapeHtml(label)}</span>`)
    .join("");
}
