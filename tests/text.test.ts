import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  isDailyNoteAttrs,
  mergeManagedTags,
  normalizeLabelList,
  truncateMarkdownForPrompt,
} from "../src/core/text";

describe("text helpers", () => {
  it("extracts json from fenced model output", () => {
    const raw = "```json\n{\"labels\":[\"math/algebra\"],\"reason\":\"relevant\"}\n```";
    expect(extractJsonObject(raw)).toBe("{\"labels\":[\"math/algebra\"],\"reason\":\"relevant\"}");
  });

  it("normalizes label arrays and strings", () => {
    expect(normalizeLabelList(["math/algebra", "math/algebra", "cs/algorithms"])).toEqual(["math/algebra", "cs/algorithms"]);
    expect(normalizeLabelList("math/algebra, cs/algorithms")).toEqual(["math/algebra", "cs/algorithms"]);
  });

  it("merges managed tags while preserving non-managed ones", () => {
    const merged = mergeManagedTags(
      ["personal/todo", "math/algebra", "reading/list"],
      ["math/algebra", "math/geometry"],
      ["math/geometry"],
    );
    expect(merged).toEqual(["personal/todo", "reading/list", "math/geometry"]);
  });

  it("truncates markdown while preserving headings", () => {
    const markdown = ["# Title", "## Section", "Body".repeat(5000)].join("\n\n");
    const truncated = truncateMarkdownForPrompt(markdown, 2000);
    expect(truncated).toContain("# Title");
    expect(truncated.length).toBeGreaterThan(0);
  });

  it("detects daily note attributes", () => {
    expect(isDailyNoteAttrs({
      "custom-dailynote-20260323": "1",
    })).toBe(true);
    expect(isDailyNoteAttrs({
      title: "normal",
    })).toBe(false);
  });
});
