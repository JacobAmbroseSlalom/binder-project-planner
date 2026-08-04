'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The binder tabs in display order. "Card List" and "View Financials" are
// intentionally disabled placeholders until their stories are implemented,
// so they render as non-interactive labels rather than links.
const TABS = [
  { segment: 'details', label: 'Edit Details', disabled: false },
  { segment: 'layout', label: 'Edit Layout', disabled: false },
  { segment: 'card-list', label: 'Card List', disabled: true },
  { segment: 'financials', label: 'View Financials', disabled: true },
] as const;

// One `justify-self` value per tab position, keyed by index rather than
// computed from label length, so labels stay visually grouped toward the
// center while preserving left-to-right order.
const TAB_JUSTIFY_SELF = [
  'justify-self-end',
  'justify-self-center',
  'justify-self-center',
  'justify-self-start',
] as const;

// The binder route's tab bar (story 7): links to each nested tab route so
// the selected tab is bookmarkable/refresh-safe, and highlights whichever
// tab matches the current pathname. Rendered only once the binder route
// context has finished loading (see BinderRouteContext.tsx), so the tabs
// never appear before there's data for them to show.
export function BinderTabs({ binderId }: { binderId: string }) {
  const pathname = usePathname();

  return (
    // A 4-column grid keeps tab hit areas stable as disabled placeholders
    // are added for future stories.
    <nav className="grid w-full grid-cols-4 gap-10 border-b border-neutral-800 px-8 pt-4">
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
