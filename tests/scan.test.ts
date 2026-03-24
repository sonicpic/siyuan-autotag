import { describe, expect, it } from "vitest";
import { filterUnclassifiedDocs, isUnclassifiedDocument } from "../src/core/scan";
import type { UnclassifiedDocItem } from "../src/core/types";

const ITEMS: UnclassifiedDocItem[] = [
  {
    rootId: "doc-1",
    notebookId: "nb-1",
    title: "Linear Algebra",
    path: "/study/linear-algebra",
    existingTags: ["math/algebra", "course"],
    classificationTags: [],
    isDailyNote: false,
    status: "idle",
  },
  {
    rootId: "doc-2",
    notebookId: "nb-1",
    title: "Computer Networks",
    path: "/study/computer-networks",
    existingTags: ["cs/network"],
    classificationTags: [],
    isDailyNote: false,
    status: "idle",
  },
];

describe("scan helpers", () => {
  it("treats docs without classification tags as unclassified", () => {
    expect(isUnclassifiedDocument(["course", "essay"], ["math/algebra", "cs/network"])).toBe(true);
    expect(isUnclassifiedDocument(["course", "math/algebra"], ["math/algebra", "cs/network"])).toBe(false);
  });

  it("filters by plain text over title and path", () => {
    expect(filterUnclassifiedDocs(ITEMS, { query: "linear", regex: false })).toEqual(["doc-1"]);
    expect(filterUnclassifiedDocs(ITEMS, { query: "computer-networks", regex: false })).toEqual(["doc-2"]);
  });

  it("filters by regex over title and path", () => {
    expect(filterUnclassifiedDocs(ITEMS, { query: "study/.+networks", regex: true })).toEqual(["doc-2"]);
  });

  it("throws on invalid regex", () => {
    expect(() => filterUnclassifiedDocs(ITEMS, { query: "[abc", regex: true })).toThrow();
  });
});
