import { describe, expect, it } from "vitest";
import { classifyWithWhitelist, shouldUseHierarchicalStrategy } from "../src/core/classifier";
import { buildManagedTagTree } from "../src/core/tagTree";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { ForwardProxyPayload, ForwardProxyResult, ProviderAdapter } from "../src/core/types";

describe("classifier strategy helpers", () => {
  it("switches to hierarchical selection when label count exceeds threshold", () => {
    expect(shouldUseHierarchicalStrategy(81, 80)).toBe(true);
    expect(shouldUseHierarchicalStrategy(80, 80)).toBe(false);
  });

  it("narrows large branches before final selection", async () => {
    const labels = [
      ...Array.from({ length: 90 }, (_, index) => `数学/主题-${String(index + 1).padStart(3, "0")}`),
      ...Array.from({ length: 10 }, (_, index) => `计算机/主题-${String(index + 1).padStart(3, "0")}`),
    ];

    const adapter: ProviderAdapter = {
      buildRequest(input) {
        return {
          url: "https://example.com",
          method: "POST",
          timeout: 1000,
          contentType: "application/json",
          headers: [],
          payload: {
            messages: input.messages,
          },
          payloadEncoding: "text",
          responseEncoding: "text",
        };
      },
      parseResponse(raw) {
        return JSON.parse(raw.body);
      },
    };

    const performRequest = async (payload: ForwardProxyPayload): Promise<ForwardProxyResult> => {
      const messages = payload.payload.messages as Array<{ role: string; content: string }>;
      const prompt = messages[1].content;
      const finalOptionsMatch = prompt.match(/可选最终标签：\n([\s\S]*?)\n\n当前文档标题：/);
      const finalOptions = finalOptionsMatch?.[1] ?? "";

      if (prompt.includes("阶段一：分类分支筛选") && prompt.includes("计算机 (10 个候选标签)")) {
        return {
          body: JSON.stringify({ labels: ["数学"], alternatives: [], rankedCandidates: [] }),
          bodyEncoding: "text",
          contentType: "application/json",
          elapsed: 1,
          headers: {},
          status: 200,
          url: "https://example.com",
        };
      }

      if (prompt.includes("阶段一：分类分支筛选") && prompt.includes("数学/主题-001")) {
        return {
          body: JSON.stringify({ labels: ["数学/主题-003", "数学/主题-007"], alternatives: [], rankedCandidates: [] }),
          bodyEncoding: "text",
          contentType: "application/json",
          elapsed: 1,
          headers: {},
          status: 200,
          url: "https://example.com",
        };
      }

      if (prompt.includes("阶段二：最终分类") && finalOptions.includes("- 数学/主题-003") && finalOptions.includes("- 数学/主题-007")) {
        return {
          body: JSON.stringify({
            labels: ["数学/主题-003"],
            alternatives: ["数学/主题-007"],
            rankedCandidates: [
              { label: "数学/主题-003", selected: true, reason: "核心主题" },
              { label: "数学/主题-007", selected: false, reason: "次要相关" },
            ],
          }),
          bodyEncoding: "text",
          contentType: "application/json",
          elapsed: 1,
          headers: {},
          status: 200,
          url: "https://example.com",
        };
      }

      return {
        body: JSON.stringify({ labels: ["数学/主题-007"], alternatives: [], rankedCandidates: [] }),
        bodyEncoding: "text",
        contentType: "application/json",
        elapsed: 1,
        headers: {},
        status: 200,
        url: "https://example.com",
      };
    };

    const result = await classifyWithWhitelist(
      {
        title: "测试文档",
        hPath: "/daily/2026-03-23/测试文档",
        markdown: "# 测试\n\n这里主要在讨论数学主题 003 和 007。",
        currentManagedTags: [],
        whitelistTree: buildManagedTagTree(labels),
        labelDescriptions: {
          "数学/主题-003": "聚焦主题 003 的内容",
        },
        maxTags: 2,
        promptSuffix: "",
      },
      {
        adapter,
        settings: DEFAULT_SETTINGS,
        performRequest,
      },
    );

    expect(result.labels).toEqual(["数学/主题-003"]);
    expect(result.alternatives).toEqual(["数学/主题-007"]);
    expect(result.rankedCandidates).toEqual([
      { label: "数学/主题-003", selected: true, reason: "核心主题" },
      { label: "数学/主题-007", selected: false, reason: "次要相关" },
    ]);
  });
});
