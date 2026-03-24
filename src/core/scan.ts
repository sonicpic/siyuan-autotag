import type { ScanFilterState, UnclassifiedDocItem } from "./types";

export function isUnclassifiedDocument(existingTags: string[], classificationLabels: string[]): boolean {
  const classificationSet = new Set(classificationLabels);
  return !existingTags.some((tag) => classificationSet.has(tag));
}

export function filterUnclassifiedDocs(
  items: UnclassifiedDocItem[],
  filter: Pick<ScanFilterState, "query" | "regex">,
): string[] {
  const query = filter.query.trim();
  if (!query) {
    return items.map((item) => item.rootId);
  }

  if (!filter.regex) {
    const needle = query.toLowerCase();
    return items
      .filter((item) => buildFilterHaystack(item).includes(needle))
      .map((item) => item.rootId);
  }

  const regex = new RegExp(query, "i");
  return items
    .filter((item) => regex.test(`${item.title}\n${item.path}`))
    .map((item) => item.rootId);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(normalizedLimit, items.length) }, () => runWorker()),
  );

  return results;
}

function buildFilterHaystack(item: Pick<UnclassifiedDocItem, "title" | "path">): string {
  return `${item.title}\n${item.path}`.toLowerCase();
}
