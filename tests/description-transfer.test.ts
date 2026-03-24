import { describe, expect, it } from "vitest";
import { buildLabelDescriptionExport, parseLabelDescriptionImport } from "../src/core/descriptionTransfer";

describe("description transfer helpers", () => {
  it("builds a versioned export payload", () => {
    const raw = buildLabelDescriptionExport({
      "数学/代数": "研究方程与结构",
      "计算机/算法": "聚焦算法设计与复杂度",
    });
    const parsed = JSON.parse(raw) as {
      version: number;
      plugin: string;
      descriptions: Record<string, string>;
    };

    expect(parsed.version).toBe(1);
    expect(parsed.plugin).toBe("siyuan-autotag");
    expect(parsed.descriptions).toEqual({
      "数学/代数": "研究方程与结构",
      "计算机/算法": "聚焦算法设计与复杂度",
    });
  });

  it("parses both wrapped and plain description json", () => {
    expect(parseLabelDescriptionImport(JSON.stringify({
      descriptions: {
        "数学/代数": "研究方程与结构",
      },
    }))).toEqual({
      "数学/代数": "研究方程与结构",
    });

    expect(parseLabelDescriptionImport(JSON.stringify({
      "计算机/算法": "聚焦算法设计与复杂度",
    }))).toEqual({
      "计算机/算法": "聚焦算法设计与复杂度",
    });
  });
});
