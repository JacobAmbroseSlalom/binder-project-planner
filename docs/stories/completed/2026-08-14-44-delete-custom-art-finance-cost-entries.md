# 44. Delete custom art finance cost entries

**Status:** Done (2026-08-14 14:57 EDT)

#### Acceptance criteria

- The Finances tab's sticky totals area has a single gear icon that opens a "Manage
  cost entries" modal.
- The modal lists all three shared catalogs' entries in one flat list, each row
  labeled with its catalog (Binder, Printing, or Holographic Paper) and a delete
  action. Entries are grouped by catalog in the same order the Material costs section
  presents them (Binder, then Printing, then Holographic Paper), and alphabetically by
  name (case-insensitive) within each catalog.
- Each entry displays a count of how many binders currently have it selected, so the
  user can see the impact before deleting.
- Selecting delete on an entry opens the shared confirmation modal before removing it.
- Deleting an entry succeeds even when one or more binders currently have it selected;
  those binders' selection for that catalog is cleared, and their Finances tab shows
  that field as unselected the next time it's viewed.
- Deleting a catalog entry uses the shared save-status toast, and the entry remains in
  the modal's list if deletion fails.

#### Technical requirements

- `DELETE /binder-cost-entries/{id}`, `DELETE /printing-cost-entries/{id}`, and
  `DELETE /holographic-paper-cost-entries/{id}` permanently delete a shared catalog
  entry regardless of whether any binder currently selects it. Deleting an entry
  currently referenced by `selectedBinderCostEntryId`, `selectedPrintingCostEntryId`,
  or `selectedHolographicPaperCostEntryId` on one or more binders nulls that field on
  every affected binder in the same database transaction as the delete, mirroring the
  existing dimension-mismatch clearing behavior from story 34.
- Each catalog's `GET` endpoint (or a dedicated modal-only endpoint) additionally
  returns, per entry, a count of binders currently selecting it, so the "Manage cost
  entries" modal can display that count without a separate request per entry.
- Deleting an existing or already absent catalog entry returns `204 No Content`; a
  malformed entry UUID receives a request-validation Problem Details response,
  consistent with the existing binder-deletion endpoint.
- The "Manage cost entries" gear icon sits in the Finances tab's existing sticky
  totals area, alongside the running-totals stats.
- The modal fetches all three catalogs and combines their entries client-side into one
  flat list, sorted by catalog (Binder, then Printing, then Holographic Paper, matching
  the Material costs section's display order) and alphabetically by name within each
  catalog; this reuses the same alphabetical `GET` ordering already returned by each
  catalog endpoint (story 34) rather than requiring a new combined-and-sorted endpoint.
- Confirming delete optimistically removes the entry from the modal's list immediately,
  matching the existing home-page binder-delete pattern (story 21); a failure restores
  it to its prior position in the sorted list and displays the shared failed toast.
