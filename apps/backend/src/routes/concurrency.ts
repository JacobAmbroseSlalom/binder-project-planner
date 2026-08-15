// Runs `task` for every item in `items` with at most `limit` tasks in
// flight at once, resolving with results in the same order as `items`
// regardless of completion order (planning.md: "Bulk outcome entries
// preserve submitted array order regardless of processing completion
// order"). A small worker-pool loop over a shared index cursor rather than
// an external concurrency-limiting dependency. Shared between
// routes/cards/ (stories 17/18/38) and routes/watchlistEntries/
// (story 45), which both bulk-process TCGdex lookups/downloads this way.
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await task(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
