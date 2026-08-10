# 7. Create the view/edit binder page

**Status:** Done (2026-08-01 01:35 EDT)

#### Acceptance criteria

- A view/edit binder page is created.
- Tabs appear at the top of the page.
- The tabs are labeled "Edit Details", "Edit Layout", and "View Financials".
- The new binder page and the "Edit Details" tab use the same reusable binder-details form component.
- Fields added to the reusable binder-details form appear on both the new binder page and the "Edit Details" tab.
- On the "Edit Details" tab, moving focus away from a changed field saves all currently valid changed fields.
- After a new binder is saved, the user is taken to its view/edit page with the "Edit Layout" tab selected.
- Selecting a binder from the home page list opens its view/edit page with the "Edit Layout" tab selected.
- Opening a binder uses the shared loading component until its details, cards, and multi-slot art are available or the request fails.
- Binder content is not displayed until its details, cards, and multi-slot art have all loaded successfully.
- Switching between a binder's tabs retains its already loaded details, cards, multi-slot art, and local updates without showing loading feedback or reloading the binder data.
- If the binder fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.
- A failed binder load provides a retry action that reloads the details, cards, and multi-slot art.
- If the requested binder does not exist, the user is redirected to the home page and the provided error is displayed using the shared failed toast.

#### Technical requirements

- Binder tabs use nested Next.js routes so the selected tab is linkable and remains selected after a browser refresh.
- The tab routes are `/binders/[binderId]/details`, `/binders/[binderId]/layout`, `/binders/[binderId]/financials`, and, when implemented, `/binders/[binderId]/checklist`.
- The binder UUID is the `binderId` route parameter.
- A client-side React context scoped to the binder route loads and shares the binder details, cards, multi-slot art, loading state, and local updates across nested tabs.
- The binder context uses independent typed React state values and update functions rather than a reducer or external state library.
- Binder details, cards, and multi-slot art are retrieved through three parallel OpenAPI-documented REST requests.
- `GET /binders/{binderId}` returns `200 OK` with the binder details used by the details tab and shared binder context.
- `GET /binders/{binderId}/cards` returns `200 OK` with every binder-owned card, including placed and unplaced cards, without image bytes.
- `GET /binders/{binderId}/art` returns `200 OK` with every binder-owned multi-slot-art record, including placed and unplaced art, without image bytes.
- `PATCH /binders/{binderId}` accepts documented partial binder-detail updates and returns `200 OK` with the complete persisted binder representation.
- The binder context publishes the three responses only after all requests succeed, so consumers never receive a partially loaded binder graph.
- If any request fails, the context discards that load attempt; retry starts all three requests again.
- The binder route context is mounted above the nested tab routes and remains mounted while the user switches between them.
- Navigating between binder tabs does not refetch unchanged binder data or discard existing local binder updates while the binder route context remains mounted.
- A missing binder returns HTTP `404 Not Found` using Problem Details; the client replaces the invalid history entry with the home route and preserves the error for the shared failed toast.
- A malformed `binderId` is rejected as a request-validation Problem Details response before database lookup and uses the same redirect-home and failed-toast behavior.
- The shared binder-details form uses its React Hook Form dirty-field state to identify unsaved edits.
- A field blur sends one partial-update request containing all currently valid dirty fields; no request is sent while any included field is invalid.
- After a successful update, the submitted fields are marked clean using the values returned by the backend.
- After a failed update, the submitted fields remain dirty and retain the user's values for correction or retry.
- Edit Details update requests are serialized so only one save is in progress at a time.
- If another blur occurs while a save is in progress, the latest remaining dirty fields are queued into one follow-up save after the current request finishes.
