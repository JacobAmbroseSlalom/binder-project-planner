---
description: 'Mark the story currently being implemented as Done and commit the work.'
argument-hint: '[story-number]'
tools: [read, edit, search, execute]
---

Mark the story currently being worked on as Done and commit the work:

1. Determine the story number: use the argument passed to this prompt if one was given,
   otherwise infer it from the story file under `docs/stories/ready-for-dev/` that's
   actively being implemented in this conversation.
2. If there is an active story, run `pnpm story:done <story-number>`
   (`scripts/move-story-to-done.mjs`) to update its `**Status:**` marker to
   `Done (<timestamp>)`, move its file into `docs/stories/completed/`, and update its
   row in `docs/stories/README.md`. If you're unsure the story is actually complete,
   say so instead of running the script.
3. If the current work isn't tied to a story (e.g. tooling, config, or doc-only
   changes), skip step 2.
4. Run `pnpm format` so the changed files are formatted.
5. Stage and `git commit` everything for this unit of work (implementation plus any
   doc updates from step 2) with a helpful, descriptive commit message.

This is the explicit trigger referenced by the Developer agent's constraint to wait
before marking a story `Done` or running `git commit`
([.github/agents/developer.agent.md](../agents/developer.agent.md)).
