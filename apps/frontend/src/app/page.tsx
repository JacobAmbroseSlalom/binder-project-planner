'use client';

import { useState } from 'react';

import { BinderList, type BinderSortOption } from './_components/BinderList';
import { HomeToolbar } from './_components/HomeToolbar';

// Story 39's home-page sort default - "Last Active" (newest first), i.e.
// `GET /binders`'s own existing ordering, shown before the toggle is ever
// used. Neither this nor the search text is persisted across visits, so
// this is simply this module's own starting state (mirroring the Card
// List tab's own local `DEFAULT_SORT_OPTION` constant) rather than an
// application-wide default belonging in `defaults.ts`.
const DEFAULT_SORT_OPTION: BinderSortOption = 'lastActive';

// The home page (stories 4, 5, and 39): a single-line toolbar (search box,
// sort toggle, completion-metrics toggle, centered create button, and
// export/import) above the binder list. The search text and sort ordering
// are held here (rather than in either child) so both the toolbar's
// controls and the list's own filtering/sorting stay in sync; neither is
// persisted, so a fresh page load always starts blank/"Last Active" again.
export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<BinderSortOption>(DEFAULT_SORT_OPTION);
  // Story 51: the tag filter's currently selected tags (OR logic) and the
  // distinct tag options it offers - the latter reported up by `BinderList`
  // itself (derived from its own already-fetched binder list) rather than
  // a separate `GET /tags` request. Neither is persisted, so a fresh page
  // load always starts with no tags selected, matching the search box and
  // sort toggle's own reset-on-load behavior.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  return (
    <main className="flex flex-col items-center gap-8 p-8">
      {/* Stories 22/4/33/39/51: the search box, sort toggle,
          completion-metrics toggle, tag filter, the centered "Create new
          binder" button, and the export/import actions, all on one row. */}
      <HomeToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortOption={sortOption}
        onToggleSort={() =>
          setSortOption((previous) => (previous === 'lastActive' ? 'name' : 'lastActive'))
        }
        availableTags={availableTags}
        selectedTags={selectedTags}
        onSelectedTagsChange={setSelectedTags}
      />

      <BinderList
        searchQuery={searchQuery}
        sortOption={sortOption}
        selectedTags={selectedTags}
        onAvailableTagsChange={setAvailableTags}
      />
    </main>
  );
}
