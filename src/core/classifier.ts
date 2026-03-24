import {
  DEFAULT_LEAF_LABEL_THRESHOLD,
  MAX_BRANCH_OPTIONS,
  MAX_HIERARCHY_DEPTH,
} from "./settings";
import { compareLabels, collectLeafLabels, countLeafLabels, formatTagTreeForPrompt } from "./tagTree";
import { truncateMarkdownForPrompt } from "./text";
import type {
  ClassificationCandidate,
  ClassificationResult,
  ForwardProxyResult,
  ManagedTagNode,
  PluginSettings,
  ProviderAdapter,
} from "./types";

export interface ClassificationContext {
  title: string;
  hPath: string;
  markdown: string;
  currentManagedTags: string[];
  whitelistTree: ManagedTagNode[];
  labelDescriptions: Record<string, string>;
  maxTags: number;
  promptSuffix: string;
}

export interface ClassificationDeps {
  adapter: ProviderAdapter;
  settings: PluginSettings;
  performRequest: (payload: ReturnType<ProviderAdapter["buildRequest"]>) => Promise<ForwardProxyResult>;
}

export function shouldUseHierarchicalStrategy(labelCount: number, threshold = DEFAULT_LEAF_LABEL_THRESHOLD): boolean {
  return labelCount > threshold;
}

export async function classifyWithWhitelist(context: ClassificationContext, deps: ClassificationDeps): Promise<ClassificationResult> {
  const totalLabels = collectLeafLabels(context.whitelistTree);

  if (!shouldUseHierarchicalStrategy(totalLabels.length)) {
    return selectFinalLabels(totalLabels, context, deps, context.maxTags);
  }

  const groups = await narrowCandidateGroups(context.whitelistTree, context, deps, 0);
  const mergedLabels = Array.from(new Set(groups.flat())).sort(compareLabels);
  if (mergedLabels.length === 0) {
    return {
      labels: [],
      alternatives: [],
      rankedCandidates: [],
    };
  }

  return selectFinalLabels(mergedLabels, context, deps, context.maxTags);
}

async function narrowCandidateGroups(
  nodes: ManagedTagNode[],
  context: ClassificationContext,
  deps: ClassificationDeps,
  depth: number,
): Promise<string[][]> {
  const leafLabels = collectLeafLabels(nodes);
  if (!shouldUseHierarchicalStrategy(leafLabels.length) || depth >= MAX_HIERARCHY_DEPTH) {
    return [leafLabels];
  }

  const branchOptions = nodes.map((node) => ({
    label: node.label,
    leafCount: countLeafLabels(node),
  }));

  const branchSelection = await selectAllowedLabels(
    branchOptions.map((option) => option.label),
    context,
    deps,
    {
      title: "阶段一：分类分支筛选",
      prompt: [
        "你当前的任务是缩小分类范围，而不是输出最终标签。",
        "只选择明确相关的分支，不必凑满上限；如果把握不足，可以少选。",
        `最多选择 ${Math.min(MAX_BRANCH_OPTIONS, context.maxTags)} 项。`,
        "",
        "可选分支：",
        branchOptions.map((option) => `- ${option.label} (${option.leafCount} 个候选标签)`).join("\n"),
      ].join("\n"),
      maxSelections: Math.min(MAX_BRANCH_OPTIONS, context.maxTags),
      maxAlternatives: 0,
    },
  );

  const selectedNodes = nodes.filter((node) => branchSelection.labels.includes(node.label));
  if (selectedNodes.length === 0) {
    return [leafLabels];
  }

  const nestedGroups = await Promise.all(
    selectedNodes.map((node) => narrowCandidateGroups(node.children.length > 0 ? node.children : [node], context, deps, depth + 1)),
  );

  return nestedGroups.flat();
}

async function selectFinalLabels(
  labels: string[],
  context: ClassificationContext,
  deps: ClassificationDeps,
  maxSelections: number,
): Promise<ClassificationResult> {
  const maxAlternatives = Math.min(labels.length, Math.max(2, Math.min(6, maxSelections + 1)));

  return selectAllowedLabels(labels, context, deps, {
    title: "阶段二：最终分类",
    prompt: [
      "请只从下面的最终标签中选择最适合当前笔记的标签。",
      "标签数量应当动态判断，宁可少而准，也不要为了凑数量而强行选择。",
      "如果只有少数标签高度匹配，就只保留这些高度匹配标签。",
      "如果没有足够强的匹配，可以把相关但未达到主选标准的标签放进候补。",
      `主选标签最多 ${maxSelections} 项，候补标签最多 ${maxAlternatives} 项。`,
      "",
      "可选最终标签：",
      formatCandidateLabels(labels, context.labelDescriptions),
    ].join("\n"),
    maxSelections,
    maxAlternatives,
  });
}

async function selectAllowedLabels(
  allowedLabels: string[],
  context: ClassificationContext,
  deps: ClassificationDeps,
  options: {
    title: string;
    prompt: string;
    maxSelections: number;
    maxAlternatives: number;
  },
): Promise<ClassificationResult> {
  const allowedSet = new Set(allowedLabels);
  const markdown = truncateMarkdownForPrompt(context.markdown);
  const systemPrompt = [
    "你是一个严格的中文知识分类助手。",
    "你必须只从用户给出的允许标签中选择结果。",
    "labels 表示模型主选标签，alternatives 表示相关但未入选的候补标签。",
    "优先少而准，不要为了凑满数量而强行选择标签。",
    "只有在文档内容有明确依据时才把标签放入 labels。",
    "如果没有足够强的匹配，labels 可以为空；alternatives 只保留确实相关的少量候补。",
    "若某个上位标签和下位标签都能分别提供有价值的主题概括与具体定位，则可以同时选择。无需刻意避免上下位标签共存。但应避免选择仅因字面接近而实际没有额外信息价值的标签。",
    "ranked_candidates 需要按相关性从高到低排序，每项格式为 {\"label\": string, \"selected\": boolean, \"reason\": string}。",
    "只输出合法的 json 对象，不要输出 markdown 代码块。",
    [
      "输出格式：",
      "{\"labels\": string[], \"alternatives\": string[], \"ranked_candidates\": [{\"label\": string, \"selected\": boolean, \"reason\": string}], \"reason\": string}",
    ].join(" "),
    `labels 数量必须在 0 到 ${options.maxSelections} 之间。`,
    `alternatives 数量必须在 0 到 ${options.maxAlternatives} 之间。`,
    options.maxAlternatives === 0 ? "当前阶段 alternatives 必须返回空数组 []。" : "alternatives 不能与 labels 重复。",
  ].join("\n");

  const userPrompt = [
    options.title,
    options.prompt,
    "",
    `当前文档标题：${context.title}`,
    `当前文档路径：${context.hPath}`,
    `当前已存在的分类标签：${context.currentManagedTags.join(", ") || "(无)"}`,
    "",
    "文档内容：",
    markdown,
    "",
    "分类标签树：",
    formatTagTreeForPrompt(context.whitelistTree),
    context.promptSuffix ? `\n补充要求：\n${context.promptSuffix}` : "",
  ].join("\n");

  const request = deps.adapter.buildRequest({
    settings: deps.settings,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const raw = await deps.performRequest(request);
  const parsed = deps.adapter.parseResponse(raw);
  return sanitizeClassificationResult(parsed, allowedSet, options.maxSelections, options.maxAlternatives);
}

function sanitizeClassificationResult(
  parsed: ClassificationResult,
  allowedSet: Set<string>,
  maxSelections: number,
  maxAlternatives: number,
): ClassificationResult {
  const ranked = filterCandidates(parsed.rankedCandidates, allowedSet);
  const rankedSelected = ranked.filter((candidate) => candidate.selected).map((candidate) => candidate.label);
  const rankedAlternatives = ranked.filter((candidate) => !candidate.selected).map((candidate) => candidate.label);

  const labels = uniqueLabels(parsed.labels.length > 0 ? parsed.labels : rankedSelected, allowedSet).slice(0, maxSelections);
  const alternatives = uniqueLabels(parsed.alternatives.length > 0 ? parsed.alternatives : rankedAlternatives, allowedSet)
    .filter((label) => !labels.includes(label))
    .slice(0, maxAlternatives);

  const rankedCandidates = buildRankedCandidates(ranked, labels, alternatives);

  return {
    labels,
    alternatives,
    rankedCandidates,
    reason: parsed.reason,
    rawText: parsed.rawText,
  };
}

function uniqueLabels(labels: string[], allowedSet: Set<string>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  labels.forEach((label) => {
    if (!allowedSet.has(label) || seen.has(label)) {
      return;
    }
    seen.add(label);
    normalized.push(label);
  });

  return normalized;
}

function filterCandidates(candidates: ClassificationCandidate[], allowedSet: Set<string>): ClassificationCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (!allowedSet.has(candidate.label) || seen.has(candidate.label)) {
      return false;
    }
    seen.add(candidate.label);
    return true;
  });
}

function buildRankedCandidates(
  ranked: ClassificationCandidate[],
  labels: string[],
  alternatives: string[],
): ClassificationCandidate[] {
  const selectedSet = new Set(labels);
  const alternativeSet = new Set(alternatives);
  const relevantLabels = new Set([...labels, ...alternatives]);
  const merged: ClassificationCandidate[] = [];
  const seen = new Set<string>();

  ranked.forEach((candidate) => {
    if (!relevantLabels.has(candidate.label) || seen.has(candidate.label)) {
      return;
    }

    seen.add(candidate.label);
    merged.push({
      label: candidate.label,
      selected: selectedSet.has(candidate.label),
      reason: candidate.reason,
    });
  });

  [...labels, ...alternatives].forEach((label) => {
    if (seen.has(label)) {
      return;
    }

    seen.add(label);
    merged.push({
      label,
      selected: selectedSet.has(label),
    });
  });

  return merged
    .map((candidate) => ({
      ...candidate,
      selected: selectedSet.has(candidate.label) && !alternativeSet.has(candidate.label),
    }));
}

function formatCandidateLabels(labels: string[], descriptions: Record<string, string>): string {
  return labels
    .map((label) => {
      const description = descriptions[label];
      return description ? `- ${label} | 标签说明：${description}` : `- ${label}`;
    })
    .join("\n");
}
