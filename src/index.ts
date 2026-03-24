import {
  Menu,
  Plugin,
  Setting,
  getAllEditor,
  openTab,
  showMessage,
} from "siyuan";
import "./index.scss";
import { classifyWithWhitelist } from "./core/classifier";
import { buildLabelDescriptionExport, parseLabelDescriptionImport } from "./core/descriptionTransfer";
import { openLabelDescriptionDialog, openReviewDialog, openWhitelistDialog } from "./core/dialogs";
import { interpolate } from "./core/format";
import { kernelRequest } from "./core/kernel";
import { getProviderAdapter } from "./core/providers";
import { filterUnclassifiedDocs, isUnclassifiedDocument, mapWithConcurrency } from "./core/scan";
import { renderNotebookScanTab } from "./core/scanTab";
import { buildPluginSettingsPanel } from "./core/settingsPanel";
import {
  DEFAULT_SETTINGS,
  STORAGE_NAME,
  normalizeSettings,
} from "./core/settings";
import { resolveCurrentProtyle } from "./core/siyuanInterop";
import { buildManagedTagTree, compareLabels, flattenKernelTags } from "./core/tagTree";
import { isDailyNoteAttrs, mergeManagedTags, splitStoredTags } from "./core/text";
import type { SiyuanEditorLike, SiyuanProtyle, SiyuanTabContext } from "./core/siyuanInterop";
import type {
  ExportMarkdownResult,
  ForwardProxyPayload,
  ForwardProxyResult,
  KernelListDocsResult,
  KernelListNotebooksResult,
  KernelTagNode,
  LabelDescriptionOption,
  NotebookOption,
  NotebookScanViewState,
  PluginSettings,
  ScanDocStatus,
  TagOption,
  UnclassifiedDocItem,
} from "./core/types";

type AnalysisScope = "current" | "current-and-children";
const SCAN_TAB_TYPE = "scan-unclassified";
const SCAN_TAB_ID_SUFFIX = "scan-unclassified";
const SCAN_ATTR_CONCURRENCY = 8;

interface AnalysisBatchSnapshot {
  settings: PluginSettings;
  managedWhitelistLabels: string[];
  labelDescriptions: Record<string, string>;
}

interface AnalysisTarget {
  rootId: string;
  notebookId?: string;
  path?: string;
  batch: AnalysisBatchSnapshot;
  batchMode: boolean;
}

interface NotebookDocEntry {
  rootId: string;
  notebookId: string;
  storagePath: string;
  displayPath: string;
  title: string;
}

interface ReviewJob {
  rootId: string;
  title: string;
  hPath: string;
  existingTags: string[];
  managedWhitelistLabels: string[];
  currentManagedTags: string[];
  preservedTags: string[];
  classification: Awaited<ReturnType<typeof classifyWithWhitelist>>;
}

export default class SiYuanAutoTagPlugin extends Plugin {
  private settingsState: PluginSettings = DEFAULT_SETTINGS;
  private topBarElement?: HTMLElement;
  private lastActiveRootId = "";
  private readonly maxConcurrentTasks = 2;
  private readonly failedTaskIds = new Set<string>();
  private readonly queuedTasks: AnalysisTarget[] = [];
  private readonly queuedTaskIds = new Set<string>();
  private readonly runningTaskIds = new Set<string>();
  private readonly reviewTaskIds = new Set<string>();
  private readonly reviewQueue: ReviewJob[] = [];
  private isReviewing = false;
  private scanRenderTimer?: number;
  private scanRequestId = 0;
  private scanTabElement?: HTMLElement;
  private scanViewState: NotebookScanViewState = {
    notebooks: [],
    selectedNotebookId: "",
    items: [],
    visibleRootIds: [],
    selectedRootIds: [],
    filter: {
      query: "",
      regex: false,
    },
    scanning: false,
    hasScanned: false,
    scanProgress: {
      scanned: 0,
      total: 0,
      matched: 0,
    },
  };
  private readonly handleProtyleSwitch = (event: CustomEvent<{ protyle?: { block?: { rootID?: string } } }>) => {
    const rootId = event.detail?.protyle?.block?.rootID;
    if (rootId) {
      this.lastActiveRootId = rootId;
    }
  };
  private readonly handleTopBarContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    this.openTopBarMenu(event);
  };

  async onload() {
    this.addIcons(`
      <symbol id="iconAutoTag" viewBox="0 0 32 32">
        <path d="M5.333 8A2.667 2.667 0 0 1 8 5.333h8.693a2.667 2.667 0 0 1 1.886.781l7.307 7.307a2.667 2.667 0 0 1 0 3.772l-8.693 8.693a2.667 2.667 0 0 1-3.772 0L6.114 18.58a2.667 2.667 0 0 1-.781-1.886V8Zm4 2.667a1.333 1.333 0 1 0 0-2.667 1.333 1.333 0 0 0 0 2.667Zm8.202 13.316 8.693-8.693-7.307-7.307H17.49l6.119 6.119a2 2 0 0 1 0 2.828l-6.074 6.074Z"></path>
        <path d="m16.992 9.992 1.885 1.885-7.116 7.116-1.885-1.885 7.116-7.116Zm3.333-1.326 1.009-3.333 1.009 3.333 3.324 1.009-3.324 1.009-1.009 3.324-1.009-3.324-3.333-1.009 3.333-1.009Z"></path>
      </symbol>
    `);

    this.data[STORAGE_NAME] = DEFAULT_SETTINGS;
    await this.loadData(STORAGE_NAME).catch(() => undefined);
    this.settingsState = normalizeSettings(this.data[STORAGE_NAME]);
    this.data[STORAGE_NAME] = this.settingsState;
    this.registerScanTab();
    this.buildSettingPanel();
    this.eventBus.on("switch-protyle", this.handleProtyleSwitch);

    this.addCommand({
      langKey: "runCommand",
      callback: () => {
        void this.enqueueAnalysisFromCurrent("current");
      },
    });
  }

  onLayoutReady() {
    this.topBarElement = this.addTopBar({
      icon: "iconAutoTag",
      title: this.i18n.topBarTitle,
      position: "right",
      callback: () => {
        void this.enqueueAnalysisFromCurrent("current");
      },
    });
    this.topBarElement.addEventListener("contextmenu", this.handleTopBarContextMenu);
    this.refreshTopBarState();
  }

  onunload() {
    this.eventBus.off("switch-protyle", this.handleProtyleSwitch);
    this.topBarElement?.removeEventListener("contextmenu", this.handleTopBarContextMenu);
    this.topBarElement?.remove();
    if (this.scanRenderTimer) {
      window.clearTimeout(this.scanRenderTimer);
      this.scanRenderTimer = undefined;
    }
    this.scanTabElement = undefined;
  }

  uninstall() {
    void this.removeData(STORAGE_NAME).catch(() => undefined);
  }

  private buildSettingPanel() {
    this.setting = new Setting({
      confirmCallback: async () => {
        await this.saveSettings();
      },
    });
    buildPluginSettingsPanel(this.setting, this.i18n, {
      getSettings: () => this.settingsState,
      saveSettings: (nextSettings, options) => this.saveSettings(nextSettings, options),
      openWhitelist: () => this.handleWhitelistSelection(),
      openDescriptionManager: () => this.handleDescriptionSelection(),
      exportDescriptionJson: () => this.exportDescriptionJson(),
      importDescriptionJson: () => this.importDescriptionJson(),
    });
  }

  private registerScanTab() {
    const plugin = this;
    this.addTab({
      type: SCAN_TAB_TYPE,
      init(this: SiyuanTabContext) {
        const container = (this.element || this.parent?.panelElement) as HTMLElement | undefined;
        if (!container) {
          return;
        }
        container.classList.add("autotag__scan-host");
        plugin.scanTabElement = container;
        plugin.renderScanTab();
      },
      beforeDestroy(this: SiyuanTabContext) {
        const container = (this.element || this.parent?.panelElement) as HTMLElement | undefined;
        if (container && plugin.scanTabElement === container) {
          plugin.scanTabElement = undefined;
        }
      },
      update() {
        plugin.scheduleScanTabRender();
      },
    });
  }

  private async openNotebookScanTab() {
    try {
      await this.ensureNotebookOptionsLoaded();
      await openTab({
        app: this.app,
        custom: {
          id: `${this.name}${SCAN_TAB_ID_SUFFIX}`,
          icon: "iconFiles",
          title: this.i18n.scanTabTitle,
        },
      });
      this.scheduleScanTabRender();
      if (!this.scanViewState.hasScanned && this.scanViewState.selectedNotebookId) {
        void this.startNotebookScan();
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  private async ensureNotebookOptionsLoaded() {
    const notebooks = await this.fetchNotebooks();
    const selectedNotebookId = notebooks.some((notebook) => notebook.id === this.scanViewState.selectedNotebookId)
      ? this.scanViewState.selectedNotebookId
      : this.getPreferredNotebookId(notebooks);

    this.scanViewState = {
      ...this.scanViewState,
      notebooks,
      selectedNotebookId,
    };
  }

  private async fetchNotebooks(): Promise<NotebookOption[]> {
    const result = await kernelRequest<KernelListNotebooksResult | NotebookOption[]>("/api/notebook/lsNotebooks", {});
    const notebooks = Array.isArray(result) ? result : result.notebooks;
    return (notebooks || [])
      .map((notebook) => ({
        id: notebook.id,
        name: notebook.name,
        closed: notebook.closed,
        icon: notebook.icon,
      }))
      .filter((notebook) => !notebook.closed)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  }

  private getPreferredNotebookId(notebooks: NotebookOption[]): string {
    const currentNotebookId = this.getCurrentProtyle()?.notebookId as string | undefined;
    if (currentNotebookId && notebooks.some((notebook) => notebook.id === currentNotebookId)) {
      return currentNotebookId;
    }
    return notebooks[0]?.id || "";
  }

  private setSelectedNotebook(notebookId: string) {
    this.scanRequestId += 1;
    this.scanViewState = {
      ...this.scanViewState,
      selectedNotebookId: notebookId,
      items: [],
      visibleRootIds: [],
      selectedRootIds: [],
      scanning: false,
      hasScanned: false,
      scanProgress: {
        scanned: 0,
        total: 0,
        matched: 0,
      },
      filter: {
        ...this.scanViewState.filter,
        error: undefined,
      },
    };
    this.scheduleScanTabRender();
  }

  private async startNotebookScan() {
    const notebookId = this.scanViewState.selectedNotebookId;
    if (!notebookId) {
      showMessage(this.i18n.scanNotebookRequired);
      return;
    }

    const requestId = ++this.scanRequestId;

    try {
      const { managedWhitelistLabels } = await this.resolveClassificationLabelScope();
      this.scanViewState = {
        ...this.scanViewState,
        items: [],
        visibleRootIds: [],
        selectedRootIds: [],
        scanning: true,
        hasScanned: true,
        scanProgress: {
          scanned: 0,
          total: 0,
          matched: 0,
        },
        filter: {
          ...this.scanViewState.filter,
          error: undefined,
        },
      };
      this.scheduleScanTabRender();

      const notebookDocs = await this.collectNotebookDocEntries(notebookId, "/", "");
      if (requestId !== this.scanRequestId) {
        return;
      }

      let scanned = 0;
      let matched = 0;
      this.scanViewState = {
        ...this.scanViewState,
        scanProgress: {
          scanned,
          total: notebookDocs.length,
          matched,
        },
      };
      this.scheduleScanTabRender();

      const classificationSet = new Set(managedWhitelistLabels);
      const results = await mapWithConcurrency(notebookDocs, SCAN_ATTR_CONCURRENCY, async (doc) => {
        const attrs = await kernelRequest<Record<string, string>>("/api/attr/getBlockAttrs", { id: doc.rootId });
        const existingTags = splitStoredTags(attrs.tags);
        const classificationTags = existingTags.filter((tag) => classificationSet.has(tag));
        const isDailyNote = isDailyNoteAttrs(attrs);
        const item = isUnclassifiedDocument(existingTags, managedWhitelistLabels)
          && (!this.settingsState.excludeDailyNotes || !isDailyNote)
          ? {
            rootId: doc.rootId,
            notebookId: doc.notebookId,
            title: attrs.title || doc.title,
            path: doc.displayPath,
            existingTags,
            classificationTags,
            isDailyNote,
            status: this.getTaskStatus(doc.rootId),
          } satisfies UnclassifiedDocItem
          : null;

        scanned += 1;
        if (item) {
          matched += 1;
        }
        if (requestId === this.scanRequestId) {
          this.scanViewState = {
            ...this.scanViewState,
            scanProgress: {
              scanned,
              total: notebookDocs.length,
              matched,
            },
          };
          this.scheduleScanTabRender();
        }

        return item;
      });

      if (requestId !== this.scanRequestId) {
        return;
      }

      const items = results.filter((item): item is UnclassifiedDocItem => Boolean(item));
      this.scanViewState = {
        ...this.scanViewState,
        items,
        selectedRootIds: [],
        scanning: false,
        scanProgress: {
          scanned: notebookDocs.length,
          total: notebookDocs.length,
          matched: items.length,
        },
      };
      this.applyScanFilter(true);
    } catch (error) {
      if (requestId === this.scanRequestId) {
        this.scanViewState = {
          ...this.scanViewState,
          scanning: false,
        };
        this.scheduleScanTabRender();
      }
      this.reportError(error);
    }
  }

  private async collectNotebookDocEntries(
    notebookId: string,
    parentStoragePath: string,
    parentDisplayPath: string,
  ): Promise<NotebookDocEntry[]> {
    const result = await kernelRequest<KernelListDocsResult>("/api/filetree/listDocsByPath", {
      notebook: notebookId,
      path: parentStoragePath,
      app: this.app.appId,
    });

    const items: NotebookDocEntry[] = [];
    for (const file of result.files) {
      const childStoragePath = this.normalizeDocPath(file.path) || file.path;
      const displayPath = `${parentDisplayPath}/${file.name}`.replace(/\/+/g, "/");
      items.push({
        rootId: file.id,
        notebookId,
        storagePath: childStoragePath,
        displayPath,
        title: file.name,
      });

      if (file.subFileCount > 0) {
        const descendants = await this.collectNotebookDocEntries(notebookId, childStoragePath, displayPath);
        items.push(...descendants);
      }
    }

    return items;
  }

  private applyScanFilter(fallbackToAll = false) {
    try {
      const visibleRootIds = filterUnclassifiedDocs(this.scanViewState.items, this.scanViewState.filter);
      const visibleSet = new Set(visibleRootIds);
      this.scanViewState = {
        ...this.scanViewState,
        visibleRootIds,
        selectedRootIds: this.scanViewState.selectedRootIds.filter((rootId) => visibleSet.has(rootId) || !fallbackToAll),
        filter: {
          ...this.scanViewState.filter,
          error: undefined,
        },
      };
    } catch (error) {
      this.scanViewState = {
        ...this.scanViewState,
        visibleRootIds: fallbackToAll ? this.scanViewState.items.map((item) => item.rootId) : this.scanViewState.visibleRootIds,
        filter: {
          ...this.scanViewState.filter,
          error: interpolate(this.i18n.scanRegexError, {
            message: error instanceof Error ? error.message : String(error),
          }),
        },
      };
    }
    this.scheduleScanTabRender();
  }

  private selectVisibleScanDocs() {
    this.scanViewState = {
      ...this.scanViewState,
      selectedRootIds: [...this.scanViewState.visibleRootIds],
    };
    this.scheduleScanTabRender();
  }

  private clearVisibleScanDocs() {
    const visibleSet = new Set(this.scanViewState.visibleRootIds);
    this.scanViewState = {
      ...this.scanViewState,
      selectedRootIds: this.scanViewState.selectedRootIds.filter((rootId) => !visibleSet.has(rootId)),
    };
    this.scheduleScanTabRender();
  }

  private toggleScanDocSelection(rootId: string, checked: boolean) {
    const selected = new Set(this.scanViewState.selectedRootIds);
    if (checked) {
      selected.add(rootId);
    } else {
      selected.delete(rootId);
    }
    this.scanViewState = {
      ...this.scanViewState,
      selectedRootIds: Array.from(selected),
    };
    this.scheduleScanTabRender();
  }

  private async runSelectedScanDocs() {
    if (this.scanViewState.selectedRootIds.length === 0) {
      showMessage(this.i18n.scanNoSelection);
      return;
    }

    try {
      const batch = await this.prepareBatchSnapshot();
      const selectedSet = new Set(this.scanViewState.selectedRootIds);
      const selectedItems = this.scanViewState.items.filter((item) => selectedSet.has(item.rootId));
      const skippedDailyNotes = this.settingsState.excludeDailyNotes
        ? selectedItems.filter((item) => item.isDailyNote).length
        : 0;
      const targets: AnalysisTarget[] = selectedItems
        .filter((item) => !this.settingsState.excludeDailyNotes || !item.isDailyNote)
        .map((item) => ({
          rootId: item.rootId,
          notebookId: item.notebookId,
          path: item.path,
          batch,
          batchMode: true,
        }));

      if (targets.length === 0) {
        showMessage(skippedDailyNotes > 0 ? interpolate(this.i18n.dailyNoteSkipped, { count: skippedDailyNotes }) : this.i18n.scanNoSelection);
        return;
      }

      this.enqueueTargets(targets);
      if (skippedDailyNotes > 0) {
        showMessage(interpolate(this.i18n.dailyNoteSkipped, { count: skippedDailyNotes }));
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  private async openScanDocument(rootId: string) {
    await openTab({
      app: this.app,
      doc: {
        id: rootId,
      },
      openNewTab: true,
      keepCursor: true,
    });
  }

  private scheduleScanTabRender() {
    if (this.scanRenderTimer) {
      return;
    }

    this.scanRenderTimer = window.setTimeout(() => {
      this.scanRenderTimer = undefined;
      this.renderScanTab();
    }, 50);
  }

  private renderScanTab() {
    if (!this.scanTabElement) {
      return;
    }

    renderNotebookScanTab(
      this.scanTabElement,
      this.scanViewState,
      {
        onNotebookChange: (notebookId) => {
          this.setSelectedNotebook(notebookId);
        },
        onStartScan: () => {
          void this.startNotebookScan();
        },
        onQueryChange: (query) => {
          this.scanViewState = {
            ...this.scanViewState,
            filter: {
              ...this.scanViewState.filter,
              query,
            },
          };
          this.applyScanFilter(false);
        },
        onRegexChange: (enabled) => {
          this.scanViewState = {
            ...this.scanViewState,
            filter: {
              ...this.scanViewState.filter,
              regex: enabled,
            },
          };
          this.applyScanFilter(false);
        },
        onToggleSelection: (rootId, checked) => {
          this.toggleScanDocSelection(rootId, checked);
        },
        onSelectVisible: () => {
          this.selectVisibleScanDocs();
        },
        onClearVisible: () => {
          this.clearVisibleScanDocs();
        },
        onRunSelected: () => {
          void this.runSelectedScanDocs();
        },
        onOpenDocument: (rootId) => {
          void this.openScanDocument(rootId);
        },
      },
      this.i18n,
    );
  }

  private async handleWhitelistSelection(forceRefresh = false) {
    try {
      showMessage(this.i18n.loadingTags);
      const tags = await this.fetchAllTags(forceRefresh);
      const result = await openWhitelistDialog(tags, this.settingsState.managedWhitelistLabels, this.i18n);
      if (!result) {
        return;
      }
      this.settingsState = {
        ...this.settingsState,
        managedWhitelistLabels: result,
      };
      await this.saveSettings();
      this.buildSettingPanel();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async handleDescriptionSelection() {
    try {
      showMessage(this.i18n.loadingTags);
      const tags = await this.fetchAllTags(false);
      const result = await openLabelDescriptionDialog(this.buildLabelDescriptionOptions(tags), this.i18n);
      if (!result) {
        return;
      }
      this.settingsState = {
        ...this.settingsState,
        labelDescriptions: result,
      };
      await this.saveSettings();
      this.buildSettingPanel();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async saveSettings(nextSettings?: PluginSettings, options?: { rebuild?: boolean }) {
    if (nextSettings) {
      this.settingsState = nextSettings;
    }
    this.data[STORAGE_NAME] = this.settingsState;
    await this.saveData(STORAGE_NAME, this.settingsState);
    if (options?.rebuild) {
      this.buildSettingPanel();
    }
  }

  private exportDescriptionJson() {
    const content = buildLabelDescriptionExport(this.settingsState.labelDescriptions);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `siyuan-autotag-label-descriptions-${this.formatTimestampForFileName(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showMessage(this.i18n.exportDescriptionSuccess);
  }

  private async importDescriptionJson() {
    try {
      const raw = await this.pickJsonFile();
      if (!raw) {
        return;
      }

      const imported = parseLabelDescriptionImport(raw);
      this.settingsState = {
        ...this.settingsState,
        labelDescriptions: {
          ...this.settingsState.labelDescriptions,
          ...imported,
        },
      };
      await this.saveSettings();
      this.buildSettingPanel();
      showMessage(interpolate(this.i18n.importDescriptionSuccess, {
        count: Object.keys(imported).length,
      }));
    } catch (error) {
      this.reportError(error);
    }
  }

  private async enqueueAnalysisFromCurrent(scope: AnalysisScope) {
    try {
      const protyle = this.getCurrentProtyle();
      if (!protyle) {
        showMessage(this.i18n.missingEditor);
        return;
      }

      const batch = await this.prepareBatchSnapshot();
      const rootId = protyle.block.rootID as string;
      this.lastActiveRootId = rootId;
      const path = this.normalizeDocPath(protyle.path as string | undefined);
      const targets: AnalysisTarget[] = [
        {
          rootId,
          notebookId: protyle.notebookId as string | undefined,
          path,
          batch,
          batchMode: scope !== "current",
        },
      ];

      if (scope === "current-and-children") {
        if (!protyle.notebookId || !path) {
          showMessage(this.i18n.missingDocPath);
          return;
        }
        const descendants = await this.collectChildTargets(protyle.notebookId as string, path, batch);
        targets.push(...descendants);
      }

      this.enqueueTargets(targets);
    } catch (error) {
      this.reportError(error);
    }
  }

  private hasAnalysisSettings(): boolean {
    return Boolean(this.settingsState.apiKey.trim() && this.settingsState.managedWhitelistLabels.length > 0);
  }

  private async resolveClassificationLabelScope(): Promise<{
    managedWhitelistLabels: string[];
    labelDescriptions: Record<string, string>;
  }> {
    const tags = await this.fetchAllTags(false);
    const availableLabels = new Set(tags.map((tag) => tag.label));
    const managedWhitelistLabels = this.settingsState.managedWhitelistLabels
      .filter((label) => availableLabels.has(label))
      .sort(compareLabels);

    if (managedWhitelistLabels.length === 0) {
      throw new Error(this.i18n.emptyWhitelist);
    }

    const labelDescriptions = Object.fromEntries(
      managedWhitelistLabels
        .map((label) => [label, this.settingsState.labelDescriptions[label]?.trim() || ""] as const)
        .filter(([, description]) => Boolean(description)),
    );

    return {
      managedWhitelistLabels,
      labelDescriptions,
    };
  }

  private async prepareBatchSnapshot(): Promise<AnalysisBatchSnapshot> {
    if (!this.hasAnalysisSettings()) {
      throw new Error(this.i18n.invalidSettings);
    }

    const { managedWhitelistLabels, labelDescriptions } = await this.resolveClassificationLabelScope();

    return {
      settings: normalizeSettings({
        ...this.settingsState,
        managedWhitelistLabels: [...this.settingsState.managedWhitelistLabels],
        labelDescriptions: { ...this.settingsState.labelDescriptions },
      }),
      managedWhitelistLabels,
      labelDescriptions,
    };
  }

  private async collectChildTargets(notebookId: string, parentPath: string, batch: AnalysisBatchSnapshot): Promise<AnalysisTarget[]> {
    const result = await kernelRequest<KernelListDocsResult>("/api/filetree/listDocsByPath", {
      notebook: notebookId,
      path: parentPath,
      app: this.app.appId,
    });

    const targets: AnalysisTarget[] = [];
    for (const file of result.files) {
      const childPath = this.normalizeDocPath(file.path);
      targets.push({
        rootId: file.id,
        notebookId,
        path: childPath,
        batch,
        batchMode: true,
      });

      if (file.subFileCount > 0 && childPath) {
        const descendants = await this.collectChildTargets(notebookId, childPath, batch);
        targets.push(...descendants);
      }
    }

    return targets;
  }

  private enqueueTargets(targets: AnalysisTarget[]) {
    let added = 0;
    let skipped = 0;

    targets.forEach((target) => {
      if (this.hasPendingTask(target.rootId)) {
        skipped += 1;
        return;
      }

      this.failedTaskIds.delete(target.rootId);
      this.queuedTasks.push(target);
      this.queuedTaskIds.add(target.rootId);
      this.updateScanDocStatus(target.rootId, "queued");
      added += 1;
    });

    if (added === 0) {
      showMessage(this.i18n.queueNoNewTasks);
      return;
    }

    showMessage(interpolate(skipped > 0 ? this.i18n.queueAddedWithSkipped : this.i18n.queueAdded, {
      count: added,
      skipped,
    }));
    this.refreshTopBarState();
    this.pumpTaskQueue();
  }

  private pumpTaskQueue() {
    while (this.runningTaskIds.size < this.maxConcurrentTasks && this.queuedTasks.length > 0) {
      const task = this.queuedTasks.shift();
      if (!task) {
        break;
      }

      this.queuedTaskIds.delete(task.rootId);
      this.runningTaskIds.add(task.rootId);
      this.updateScanDocStatus(task.rootId, "running");
      this.refreshTopBarState();
      void this.executeAnalysisTask(task).finally(() => {
        this.runningTaskIds.delete(task.rootId);
        this.refreshTopBarState();
        this.pumpTaskQueue();
      });
    }
  }

  private async executeAnalysisTask(task: AnalysisTarget) {
    try {
      const [markdown, attrs] = await Promise.all([
        kernelRequest<ExportMarkdownResult>("/api/export/exportMdContent", { id: task.rootId }),
        kernelRequest<Record<string, string>>("/api/attr/getBlockAttrs", { id: task.rootId }),
      ]);

      if (this.settingsState.excludeDailyNotes && isDailyNoteAttrs(attrs)) {
        this.updateScanDocStatus(task.rootId, "idle");
        if (!task.batchMode) {
          showMessage(this.i18n.dailyNoteSkipSingle);
        }
        return;
      }

      const existingTags = splitStoredTags(attrs.tags);
      const currentManagedTags = existingTags.filter((tag) => task.batch.managedWhitelistLabels.includes(tag));
      const preservedTags = existingTags.filter((tag) => !task.batch.managedWhitelistLabels.includes(tag));

      const classification = await classifyWithWhitelist(
        {
          title: attrs.title || markdown.hPath.split("/").pop() || "",
          hPath: markdown.hPath,
          markdown: markdown.content,
          currentManagedTags,
          whitelistTree: buildManagedTagTree(task.batch.managedWhitelistLabels, task.batch.labelDescriptions),
          labelDescriptions: task.batch.labelDescriptions,
          maxTags: task.batch.settings.maxTags,
          promptSuffix: task.batch.settings.promptSuffix,
        },
        {
          adapter: getProviderAdapter(task.batch.settings.provider),
          settings: task.batch.settings,
          performRequest: (payload) => this.forwardProxy(payload),
        },
      );

      if (classification.labels.length === 0 && classification.alternatives.length === 0) {
        this.updateScanDocStatus(task.rootId, "idle");
        if (!task.batchMode) {
          showMessage(this.i18n.emptySuggestion);
        }
        return;
      }

      this.reviewTaskIds.add(task.rootId);
      this.updateScanDocStatus(task.rootId, "review");
      this.reviewQueue.push({
        rootId: task.rootId,
        title: attrs.title || markdown.hPath.split("/").pop() || "",
        hPath: markdown.hPath,
        existingTags,
        managedWhitelistLabels: task.batch.managedWhitelistLabels,
        currentManagedTags,
        preservedTags,
        classification,
      });
      this.refreshTopBarState();
      void this.pumpReviewQueue();
    } catch (error) {
      this.failedTaskIds.add(task.rootId);
      this.updateScanDocStatus(task.rootId, "failed");
      this.reportError(error);
    }
  }

  private async pumpReviewQueue() {
    if (this.isReviewing || this.reviewQueue.length === 0) {
      return;
    }

    this.isReviewing = true;
    this.refreshTopBarState();
    const job = this.reviewQueue.shift();
    if (!job) {
      this.isReviewing = false;
      this.refreshTopBarState();
      return;
    }

    try {
      const finalTags = mergeManagedTags(job.existingTags, job.managedWhitelistLabels, job.classification.labels);
      const review = await openReviewDialog({
        title: job.title,
        hPath: job.hPath,
        currentManagedTags: job.currentManagedTags,
        preservedTags: job.preservedTags,
        selectedLabels: job.classification.labels,
        alternativeLabels: job.classification.alternatives,
        rankedCandidates: job.classification.rankedCandidates,
        finalLabels: finalTags,
        reason: job.classification.reason,
        i18n: this.i18n,
      });

      if (!review) {
        this.updateScanDocStatus(job.rootId, "idle");
        showMessage(this.i18n.applyCancelled);
        return;
      }

      const mergedTags = mergeManagedTags(job.existingTags, job.managedWhitelistLabels, review.labels);
      await kernelRequest<null>("/api/attr/setBlockAttrs", {
        id: job.rootId,
        attrs: {
          tags: mergedTags.join(","),
        },
      });
      await kernelRequest<null>("/api/ui/reloadTag", {});
      if (review.labels.some((label) => job.managedWhitelistLabels.includes(label))) {
        this.removeScanDoc(job.rootId);
      } else {
        this.updateScanDocStatus(job.rootId, "idle");
      }
      showMessage(interpolate(this.i18n.applySuccess, { count: review.labels.length }));
    } catch (error) {
      this.failedTaskIds.add(job.rootId);
      this.updateScanDocStatus(job.rootId, "failed");
      this.reportError(error);
    } finally {
      this.reviewTaskIds.delete(job.rootId);
      this.isReviewing = false;
      this.refreshTopBarState();
      void this.pumpReviewQueue();
    }
  }

  private hasPendingTask(rootId: string): boolean {
    return this.queuedTaskIds.has(rootId) || this.runningTaskIds.has(rootId) || this.reviewTaskIds.has(rootId);
  }

  private getTaskStatus(rootId: string): ScanDocStatus {
    if (this.reviewTaskIds.has(rootId)) {
      return "review";
    }
    if (this.runningTaskIds.has(rootId)) {
      return "running";
    }
    if (this.queuedTaskIds.has(rootId)) {
      return "queued";
    }
    if (this.failedTaskIds.has(rootId)) {
      return "failed";
    }
    return "idle";
  }

  private updateScanDocStatus(rootId: string, status: ScanDocStatus) {
    let changed = false;
    const items = this.scanViewState.items.map((item) => {
      if (item.rootId !== rootId || item.status === status) {
        return item;
      }
      changed = true;
      return {
        ...item,
        status,
      };
    });

    if (!changed) {
      return;
    }

    this.scanViewState = {
      ...this.scanViewState,
      items,
    };
    this.scheduleScanTabRender();
  }

  private removeScanDoc(rootId: string) {
    const nextItems = this.scanViewState.items.filter((item) => item.rootId !== rootId);
    if (nextItems.length === this.scanViewState.items.length) {
      return;
    }

    this.scanViewState = {
      ...this.scanViewState,
      items: nextItems,
      visibleRootIds: this.scanViewState.visibleRootIds.filter((id) => id !== rootId),
      selectedRootIds: this.scanViewState.selectedRootIds.filter((id) => id !== rootId),
      scanProgress: {
        ...this.scanViewState.scanProgress,
        matched: nextItems.length,
      },
    };
    this.scheduleScanTabRender();
  }

  private async fetchAllTags(_forceRefresh: boolean): Promise<TagOption[]> {
    const tags = await kernelRequest<KernelTagNode[]>("/api/tag/getTag", {
      sort: 0,
      ignoreMaxListHint: true,
      app: this.app.appId,
    });
    return flattenKernelTags(tags);
  }

  private async forwardProxy(payload: ForwardProxyPayload): Promise<ForwardProxyResult> {
    return kernelRequest<ForwardProxyResult>("/api/network/forwardProxy", payload as unknown as Record<string, unknown>);
  }

  private openTopBarMenu(event: MouseEvent) {
    const menu = new Menu("autotag-topbar-menu");
    menu.addItem({
      icon: "iconAutoTag",
      label: this.i18n.menuAnalyzeCurrent,
      click: () => {
        void this.enqueueAnalysisFromCurrent("current");
      },
    });
    menu.addItem({
      icon: "iconFiles",
      label: this.i18n.menuAnalyzeCurrentAndChildren,
      click: () => {
        void this.enqueueAnalysisFromCurrent("current-and-children");
      },
    });
    menu.addItem({
      icon: "iconSearch",
      label: this.i18n.menuScanNotebookUnclassified,
      click: () => {
        void this.openNotebookScanTab();
      },
    });
    menu.addSeparator();
    menu.addItem({
      icon: "iconSettings",
      label: this.i18n.menuOpenSettings,
      click: () => {
        this.openPluginSettings();
      },
    });
    menu.open({
      x: event.clientX,
      y: event.clientY,
    });
  }

  private buildLabelDescriptionOptions(tags: TagOption[]): LabelDescriptionOption[] {
    const existingLabels = new Set(tags.map((tag) => tag.label));
    const knownLabels = Array.from(new Set([
      ...tags.map((tag) => tag.label),
      ...Object.keys(this.settingsState.labelDescriptions),
    ])).sort(compareLabels);

    return knownLabels.map((label) => ({
      label,
      exists: existingLabels.has(label),
      description: this.settingsState.labelDescriptions[label] || "",
    }));
  }

  private normalizeDocPath(path?: string): string | undefined {
    if (!path || !path.trim()) {
      return undefined;
    }

    return path.trim().replace(/\.sy$/i, "");
  }

  private openPluginSettings() {
    this.setting?.open(this.i18n.pluginName || this.name);
  }

  private async pickJsonFile(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        resolve(await file.text());
      }, { once: true });
      input.click();
    });
  }

  private formatTimestampForFileName(date: Date): string {
    const parts = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0"),
    ];
    return parts.join("");
  }

  private getCurrentProtyle(): SiyuanProtyle | undefined {
    const { protyle, lastActiveRootId } = resolveCurrentProtyle(
      getAllEditor() as Array<SiyuanEditorLike | SiyuanProtyle>,
      document.activeElement,
      this.lastActiveRootId,
    );
    this.lastActiveRootId = lastActiveRootId;
    return protyle;
  }

  private refreshTopBarState() {
    if (!this.topBarElement) {
      return;
    }

    const queued = this.queuedTaskIds.size;
    const running = this.runningTaskIds.size;
    const review = this.reviewTaskIds.size;
    const active = queued + running + review > 0;

    this.topBarElement.setAttribute("aria-busy", String(active));
    this.topBarElement.classList.toggle("autotag__topbar--running", active);
    this.topBarElement.setAttribute("title", active
      ? interpolate(this.i18n.topBarBusyTitle, { queued, running, review })
      : this.i18n.topBarTitle);
  }

  private reportError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    showMessage(interpolate(this.i18n.errorPrefix, { message }));
  }
}
