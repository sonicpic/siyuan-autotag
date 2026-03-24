import { Setting } from "siyuan";
import { interpolate } from "./format";
import { applyProviderPreset, PROVIDER_PRESETS, normalizeSettings } from "./settings";
import type { PluginSettings, ProviderType } from "./types";

interface SettingsPanelHandlers {
  getSettings: () => PluginSettings;
  saveSettings: (nextSettings: PluginSettings, options?: { rebuild?: boolean }) => Promise<void>;
  openWhitelist: () => Promise<void>;
  openDescriptionManager: () => Promise<void>;
  exportDescriptionJson: () => void;
  importDescriptionJson: () => Promise<void>;
}

export function buildPluginSettingsPanel(
  setting: Setting,
  i18n: Record<string, string>,
  handlers: SettingsPanelHandlers,
): void {
  const settings = handlers.getSettings();
  let baseUrlInput: HTMLInputElement | undefined;
  let modelInput: HTMLInputElement | undefined;

  setting.addItem({
    title: i18n.settingsProvider,
    createActionElement: () => {
      const select = document.createElement("select");
      select.className = "b3-select";
      (Object.keys(PROVIDER_PRESETS) as ProviderType[]).forEach((provider) => {
        const preset = PROVIDER_PRESETS[provider];
        const option = document.createElement("option");
        option.value = provider;
        option.textContent = preset.label;
        option.selected = settings.provider === provider;
        select.appendChild(option);
      });
      select.addEventListener("change", async () => {
        const nextSettings = applyProviderPreset(handlers.getSettings(), select.value as ProviderType);
        if (baseUrlInput) {
          baseUrlInput.value = nextSettings.baseUrl;
        }
        if (modelInput) {
          modelInput.value = nextSettings.model;
        }
        await handlers.saveSettings(nextSettings);
      });
      return select;
    },
  });

  setting.addItem({
    title: i18n.settingsApiKey,
    createActionElement: () => createTextInput("password", settings.apiKey, async (value) => {
      await handlers.saveSettings({
        ...handlers.getSettings(),
        apiKey: value.trim(),
      });
    }),
  });

  setting.addItem({
    title: i18n.settingsBaseUrl,
    createActionElement: () => {
      baseUrlInput = createTextInput("text", settings.baseUrl, async (value) => {
        await handlers.saveSettings({
          ...handlers.getSettings(),
          baseUrl: value.trim(),
        });
      });
      return baseUrlInput;
    },
  });

  setting.addItem({
    title: i18n.settingsModel,
    createActionElement: () => {
      modelInput = createTextInput("text", settings.model, async (value) => {
        await handlers.saveSettings({
          ...handlers.getSettings(),
          model: value.trim(),
        });
      });
      return modelInput;
    },
  });

  setting.addItem({
    title: i18n.settingsMaxTags,
    createActionElement: () => {
      const input = createTextInput("number", String(settings.maxTags), async (value) => {
        await handlers.saveSettings(normalizeSettings({
          ...handlers.getSettings(),
          maxTags: Number(value),
        }));
      });
      input.min = "1";
      input.max = "20";
      return input;
    },
  });

  setting.addItem({
    title: i18n.settingsPromptSuffix,
    createActionElement: () => {
      const textarea = document.createElement("textarea");
      textarea.className = "b3-text-field fn__block";
      textarea.rows = 4;
      textarea.value = settings.promptSuffix;
      textarea.addEventListener("change", async () => {
        await handlers.saveSettings({
          ...handlers.getSettings(),
          promptSuffix: textarea.value.trim(),
        });
      });
      return textarea;
    },
  });

  setting.addItem({
    title: i18n.settingsExcludeDailyNotes,
    description: i18n.settingsExcludeDailyNotesDesc,
    createActionElement: () => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "b3-switch fn__flex-center";
      checkbox.checked = settings.excludeDailyNotes;
      checkbox.addEventListener("change", async () => {
        await handlers.saveSettings({
          ...handlers.getSettings(),
          excludeDailyNotes: checkbox.checked,
        }, { rebuild: true });
      });
      return checkbox;
    },
  });

  setting.addItem({
    title: i18n.settingsWhitelist,
    description: `${i18n.settingsWhitelistDesc} ${interpolate(i18n.whitelistSummary, {
      selected: settings.managedWhitelistLabels.length,
      total: settings.managedWhitelistLabels.length,
    })}`,
    actionElement: createWhitelistActionBar(i18n, handlers),
  });

  setting.addItem({
    title: i18n.settingsLabelDescriptions,
    description: `${i18n.settingsLabelDescriptionsDesc} ${interpolate(i18n.descriptionSummary, {
      described: Object.keys(settings.labelDescriptions).length,
      total: Object.keys(settings.labelDescriptions).length,
    })}`,
    actionElement: createDescriptionActionBar(i18n, handlers),
  });
}

function createWhitelistActionBar(
  i18n: Record<string, string>,
  handlers: Pick<SettingsPanelHandlers, "openWhitelist">,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "autotag__setting-actions autotag__setting-actions--single";

  const manageButton = document.createElement("button");
  manageButton.className = "b3-button b3-button--outline autotag__setting-button autotag__setting-button--wide";
  manageButton.textContent = i18n.openWhitelist;
  manageButton.addEventListener("click", async () => {
    await handlers.openWhitelist();
  });

  wrapper.appendChild(manageButton);
  return wrapper;
}

function createDescriptionActionBar(
  i18n: Record<string, string>,
  handlers: Pick<SettingsPanelHandlers, "openDescriptionManager" | "exportDescriptionJson" | "importDescriptionJson">,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "autotag__setting-actions autotag__setting-actions--description";

  const manageButton = document.createElement("button");
  manageButton.className = "b3-button b3-button--outline autotag__setting-button autotag__setting-button--wide";
  manageButton.textContent = i18n.openDescriptionManager;
  manageButton.addEventListener("click", async () => {
    await handlers.openDescriptionManager();
  });

  const exportButton = document.createElement("button");
  exportButton.className = "b3-button b3-button--outline autotag__setting-button";
  exportButton.textContent = i18n.exportDescriptionJson;
  exportButton.addEventListener("click", () => {
    handlers.exportDescriptionJson();
  });

  const importButton = document.createElement("button");
  importButton.className = "b3-button b3-button--outline autotag__setting-button";
  importButton.textContent = i18n.importDescriptionJson;
  importButton.addEventListener("click", async () => {
    await handlers.importDescriptionJson();
  });

  wrapper.appendChild(manageButton);
  wrapper.appendChild(exportButton);
  wrapper.appendChild(importButton);
  return wrapper;
}

function createTextInput(
  type: "text" | "password" | "number",
  value: string,
  onCommit: (value: string) => Promise<void>,
): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "b3-text-field fn__block";
  input.type = type;
  input.value = value;
  input.addEventListener("change", () => {
    void onCommit(input.value);
  });
  return input;
}
