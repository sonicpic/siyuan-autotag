import { decodeHtmlEntities } from "./format";
import type { KernelTagNode, ManagedTagNode, TagOption } from "./types";

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function compareLabels(left: string, right: string): number {
  return collator.compare(left, right);
}

export function buildManagedTagTree(labels: string[], descriptions: Record<string, string> = {}): ManagedTagNode[] {
  const root: ManagedTagNode[] = [];
  const unique = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean))).sort(compareLabels);

  for (const label of unique) {
    const segments = label.split("/").map((segment) => segment.trim()).filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let currentLevel = root;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = currentLevel.find((item) => item.label === currentPath);
      if (!node) {
        node = {
          name: segment,
          label: currentPath,
          depth: index,
          description: descriptions[currentPath] || undefined,
          children: [],
        };
        currentLevel.push(node);
        currentLevel.sort((left, right) => compareLabels(left.label, right.label));
      } else if (descriptions[currentPath]) {
        node.description = descriptions[currentPath];
      }
      currentLevel = node.children;
    });
  }

  return root;
}

export function collectLeafLabels(nodes: ManagedTagNode[]): string[] {
  const labels: string[] = [];

  const visit = (node: ManagedTagNode) => {
    if (node.children.length === 0) {
      labels.push(node.label);
      return;
    }
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return labels.sort(compareLabels);
}

export function countLeafLabels(node: ManagedTagNode): number {
  if (node.children.length === 0) {
    return 1;
  }

  return node.children.reduce((total, child) => total + countLeafLabels(child), 0);
}

export function formatTagTreeForPrompt(nodes: ManagedTagNode[]): string {
  const lines: string[] = [];

  const visit = (node: ManagedTagNode) => {
    const indent = "  ".repeat(node.depth);
    const description = node.description ? ` | 说明：${node.description}` : "";
    lines.push(`${indent}- ${node.label}${description}`);
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return lines.join("\n");
}

export function flattenKernelTags(rawTags: KernelTagNode[]): TagOption[] {
  const options: TagOption[] = [];

  const visit = (tag: KernelTagNode, depth: number) => {
    if (!tag || typeof tag.label !== "string") {
      return;
    }

    const label = decodeHtmlEntities(tag.label);
    const name = decodeHtmlEntities(typeof tag.name === "string" ? tag.name : label);

    options.push({
      label,
      name,
      depth,
      count: typeof tag.count === "number" ? tag.count : 0,
    });

    if (Array.isArray(tag.children)) {
      tag.children.forEach((child) => visit(child, depth + 1));
    }
  };

  rawTags.forEach((tag) => visit(tag, 0));
  return options;
}
