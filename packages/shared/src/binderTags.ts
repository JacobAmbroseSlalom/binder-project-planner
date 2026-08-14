// Story 51: "Add binder tags". Shared trim/dedupe rules for a binder's tag
// list, used by both the frontend tags combobox (each Add action) and the
// backend's full-replacement array normalization (`POST`/`PATCH /binders`),
// so both apply the exact same rule rather than risking drift between two
// separate implementations.

// Adds `candidate` to `tags` following the story's case-insensitive
// deduplication rule: a trimmed candidate that case-insensitively matches
// an already-present tag is a no-op - it does not add a duplicate and the
// existing tag keeps its original casing. Otherwise the trimmed candidate
// is appended, preserving insertion order. A blank (post-trim) candidate is
// also a no-op.
export function addBinderTag(tags: readonly string[], candidate: string): string[] {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return [...tags];
  }

  const normalizedCandidate = trimmed.toLowerCase();
  if (tags.some((tag) => tag.toLowerCase() === normalizedCandidate)) {
    return [...tags];
  }

  return [...tags, trimmed];
}

// Normalizes a complete tag array (e.g. a `POST`/`PATCH /binders` request
// body's `tags` field, sent as a full replacement) by trimming each entry,
// dropping blanks, and case-insensitively deduplicating in array order -
// applying `addBinderTag`'s "first occurrence wins" rule one entry at a
// time.
export function normalizeBinderTagsList(rawTags: readonly string[]): string[] {
  return rawTags.reduce<string[]>((tags, rawTag) => addBinderTag(tags, rawTag), []);
}
