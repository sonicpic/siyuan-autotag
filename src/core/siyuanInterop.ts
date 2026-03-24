export interface SiyuanProtyle {
  block: {
    rootID: string;
  };
  notebookId?: string;
  path?: string;
  element?: HTMLElement;
  wysiwyg?: {
    element?: HTMLElement;
  };
  title?: {
    editElement?: HTMLElement;
    editableElement?: HTMLElement;
  };
}

export interface SiyuanEditorLike {
  protyle?: SiyuanProtyle;
}

export interface SiyuanTabContext {
  element?: Element;
  parent?: {
    panelElement?: Element;
  };
}

export function resolveCurrentProtyle(
  editors: Array<SiyuanEditorLike | SiyuanProtyle>,
  activeElement: Element | null,
  lastActiveRootId: string,
): {
  protyle?: SiyuanProtyle;
  lastActiveRootId: string;
} {
  const protyles = editors
    .map(normalizeProtyle)
    .filter((protyle): protyle is SiyuanProtyle => Boolean(protyle));

  if (protyles.length === 0) {
    return {
      protyle: undefined,
      lastActiveRootId,
    };
  }

  const focused = protyles.find((protyle) => isActiveProtyle(protyle, activeElement));
  if (focused) {
    return {
      protyle: focused,
      lastActiveRootId: focused.block.rootID,
    };
  }

  if (lastActiveRootId) {
    const remembered = protyles.find((protyle) => protyle.block.rootID === lastActiveRootId);
    if (remembered) {
      return {
        protyle: remembered,
        lastActiveRootId,
      };
    }
  }

  const visible = protyles.filter((protyle) => isElementVisible(protyle.element));
  const current = visible[visible.length - 1] || protyles[protyles.length - 1];
  return {
    protyle: current,
    lastActiveRootId: current.block.rootID,
  };
}

function normalizeProtyle(editor: SiyuanEditorLike | SiyuanProtyle): SiyuanProtyle | undefined {
  const candidate = isEditorLike(editor) ? editor.protyle : editor;
  if (!candidate?.block?.rootID) {
    return undefined;
  }
  return candidate;
}

function isEditorLike(editor: SiyuanEditorLike | SiyuanProtyle): editor is SiyuanEditorLike {
  return !("block" in editor);
}

function isActiveProtyle(protyle: SiyuanProtyle, activeElement: Element | null): boolean {
  if (!activeElement) {
    return false;
  }

  const content = protyle.wysiwyg?.element;
  const title = protyle.title?.editElement || protyle.title?.editableElement;
  const container = protyle.element;

  return Boolean(
    (content && content.contains(activeElement)) ||
      (title && title.contains(activeElement)) ||
      (container && container.contains(activeElement)),
  );
}

function isElementVisible(element?: HTMLElement): boolean {
  if (!element || !element.isConnected) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return element.getClientRects().length > 0;
}
