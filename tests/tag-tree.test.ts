import { describe, expect, it } from "vitest";
import { buildManagedTagTree, collectLeafLabels, formatTagTreeForPrompt } from "../src/core/tagTree";

describe("tag tree helpers", () => {
  it("builds a nested tree from full labels", () => {
    const tree = buildManagedTagTree(["数学/代数", "数学/几何", "计算机/算法"]);

    expect(tree).toHaveLength(2);
    const mathNode = tree.find((node) => node.label === "数学");
    expect(mathNode?.children.map((child) => child.label)).toEqual(["数学/代数", "数学/几何"]);
  });

  it("collects leaf labels in sorted order", () => {
    const labels = collectLeafLabels(buildManagedTagTree(["计算机/算法", "数学/几何", "数学/代数"]));
    expect(labels).toEqual(["计算机/算法", "数学/代数", "数学/几何"]);
  });

  it("formats the tag tree for prompts", () => {
    const formatted = formatTagTreeForPrompt(buildManagedTagTree(["数学/代数", "计算机/算法"], {
      "数学/代数": "研究方程、结构与演算规则",
    }));
    expect(formatted).toContain("- 数学");
    expect(formatted).toContain("  - 数学/代数 | 说明：研究方程、结构与演算规则");
    expect(formatted).toContain("- 计算机");
  });
});
