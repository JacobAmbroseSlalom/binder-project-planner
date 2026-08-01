'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The 3 tabs story 7 requires, in display order. Each maps directly to one
// of the nested routes mounted below `[binderId]/layout.tsx`; a
// "checklist" tab is explicitly called out in planning.md as a later
// addition ("when implemented") and intentionally isn't included here yet.
// "View Financials" is disabled for now: per planning.md it needs card/price
// totals that later stories haven't implemented yet, so its page is just a
// placeholder today and shouldn't be navigable.
const TABS = [
  { segment: 'details', label: 'Edit Details', disabled: false },
  { segment: 'layout', label: 'Edit Layout', disabled: false },
  { segment: 'financials', label: 'View Financials', disabled: true },
] as const;

// One `justify-self` value per tab position, keyed by index rather than
// computed from label length: paired with the 3 equal grid columns below,
// this pins the middle tab's own center to the nav's horizontal center
// regardless of how wide the other two labels are, while pulling the first
// and third tabs toward that center column (rather than the nav's outer
// edges) so they sit as close to "Edit Layout" as the gap allows.
const TAB_JUSTIFY_SELF = ['justify-self-end', 'justify-self-center', 'justify-self-start'] as const;

// The binder route's tab bar (story 7): links to each nested tab route so
// the selected tab is bookmarkable/refresh-safe, and highlights whichever
// tab matches the current pathname. Rendered only once the binder route
// context has finished loading (see BinderRouteContext.tsx), so the tabs
// never appear before there's data for them to show.
export function BinderTabs({ binderId }: { binderId: string }) {
  const pathname = usePathname();

  return (
    // A 3-column grid with the outer two columns matched (`1fr`) and the
    // middle column sized to its own content (`auto`, not `1fr`) so the
    // middle tab ("Edit Layout") stays exactly on the nav's horizontal
    // center — the two equal flanking columns guarantee that — while its
    // column no longer eats up a full third of the nav's width. That's what
    // lets the outer tabs' `justify-self` (below) sit right up against it.
    <nav className="grid w-full grid-cols-[1fr_auto_1fr] gap-10 border-b border-neutral-800 px-8 pt-4">
      {TABS.map(({ segment, label, disabled }, index) => {
        const href = `/binders/${binderId}/${segment}`;
        const isActive = pathname === href;

        // Shared underline styling for both the clickable and disabled
        // variants: the active tab gets a primary-colored bottom border and
        // light text; inactive tabs stay borderless and muted; disabled tabs
        // additionally drop the hover effect and use a "not-allowed" cursor
        // so it's clear the tab isn't just unstyled but intentionally inert.
        const stateClassName = disabled
          ? 'cursor-not-allowed border-transparent text-neutral-500'
          : isActive
            ? 'hover:brightness-110 border-primary text-neutral-100'
            : 'hover:brightness-110 border-transparent text-neutral-500';
        const className = `${TAB_JUSTIFY_SELF[index]} -mb-px border-b-2 pb-3 font-bold ${stateClassName}`;

        // Disabled tabs render as a plain span rather than a `Link` so they
        // aren't focusable/navigable at all (not just visually greyed out)
        // until the story that implements this tab's page lands.
        if (disabled) {
          return (
            <span key={segment} aria-disabled="true" className={className}>
              {label}
            </span>
          );
        }

        return (
          <Link
            key={segment}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={className}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
