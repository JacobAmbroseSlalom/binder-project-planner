import { BINDER_NAME_MAX_LENGTH } from './defaults.js';

// Pure name-generation algorithm for binder copies (story 21: "Manage
// binders from the home page"), shared by the backend's authoritative
// `POST /binders/{binderId}/duplicate` endpoint and the frontend's
// optimistic copy-name preview, so both always agree on the exact same
// generated name. Tries `${sourceName} Copy`, then ` Copy 2`, ` Copy 3`,
// and increasing integers until the case-insensitively normalized
// candidate isn't already present in `existingNormalizedNames`, truncating
// the source-name portion as needed so the generated name still fits
// within `BINDER_NAME_MAX_LENGTH`. Kept framework-free (like
// binderSpread.ts) so both apps can import it directly.
export function generateUniqueBinderCopyName(
  existingNormalizedNames: ReadonlySet<string>,
  sourceName: string,
): string {
  let attempt = 1;
  while (true) {
    const suffix = attempt === 1 ? ' Copy' : ` Copy ${attempt}`;
    const maxSourceLength = Math.max(0, BINDER_NAME_MAX_LENGTH - suffix.length);
    const candidate = `${sourceName.slice(0, maxSourceLength)}${suffix}`;
    const normalizedCandidate = candidate.toLowerCase();
    if (!existingNormalizedNames.has(normalizedCandidate)) return candidate;
    attempt += 1;
  }
}
