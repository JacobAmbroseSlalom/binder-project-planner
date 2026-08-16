// Temporary visual reference for the design tokens defined in globals.css.
// Lets the team review and iterate on the styling in the browser while the
// styling documentation (docs/planning.md story #2) is being written.
// Rendered with Tailwind utility classes generated from our `@theme` tokens
// (see globals.css) rather than inline styles.

import { Check, CircleAlert, CircleCheck, GripVertical, Loader2, Star, X } from 'lucide-react';

import { Tooltip } from '@/shared/feedback/Tooltip';

// A single, reusable class string for the filled-style form control look
// (text inputs, selects, textareas): a neutral-800 fill with no visible
// border until focused, at which point the border becomes primary-colored.
const inputClassName =
  'rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none';

// One color swatch: its label, the Tailwind class that applies it, the
// backing CSS variable, and its hex value for reference.
type ColorSwatch = {
  label: string;
  className: string;
  variable: string;
  hex: string;
};

type SwatchGroup = {
  title: string;
  swatches: ColorSwatch[];
};

// One entry in the type scale: sample text rendered with its Tailwind size
// and weight classes, plus the CSS variables that back them.
type TypeStep = {
  label: string;
  className: string;
  sizeVariable: string;
  weightVariable: string;
};

const typeSteps: TypeStep[] = [
  {
    label: 'Heading',
    className: 'text-heading font-bold',
    sizeVariable: '--text-heading',
    weightVariable: '--font-weight-bold',
  },
  {
    label: 'Subheading',
    className: 'text-subheading font-bold',
    sizeVariable: '--text-subheading',
    weightVariable: '--font-weight-bold',
  },
  {
    label: 'Body',
    className: 'text-body font-regular',
    sizeVariable: '--text-body',
    weightVariable: '--font-weight-regular',
  },
  {
    label: 'Caption',
    className: 'text-caption font-regular',
    sizeVariable: '--text-caption',
    weightVariable: '--font-weight-regular',
  },
];

// One entry in the spacing scale, using Tailwind's default numeric utilities
// (which already land on our chosen 8px-based steps).
type SpacingStep = {
  label: string;
  className: string;
  px: number;
};

const spacingSteps: SpacingStep[] = [
  { label: 'xs', className: 'w-2', px: 8 },
  { label: 'sm', className: 'w-4', px: 16 },
  { label: 'md', className: 'w-6', px: 24 },
  { label: 'lg', className: 'w-8', px: 32 },
  { label: 'xl', className: 'w-12', px: 48 },
  { label: '2xl', className: 'w-16', px: 64 },
  { label: '3xl', className: 'w-24', px: 96 },
];

// One entry in the icon size scale, using Tailwind's default `size-*`
// utilities (16px / 20px / 24px / 32px / 40px).
type IconSizeStep = {
  label: string;
  className: string;
  px: number;
  usage: string;
};

const iconSizeSteps: IconSizeStep[] = [
  { label: 'size-4', className: 'size-4', px: 16, usage: 'Inline with caption/body text' },
  { label: 'size-5', className: 'size-5', px: 20, usage: 'Buttons and standalone UI icons' },
  { label: 'size-6', className: 'size-6', px: 24, usage: 'Larger/prominent icons' },
  { label: 'size-8', className: 'size-8', px: 32, usage: 'Prominent standalone icons' },
  {
    label: 'size-10',
    className: 'size-10',
    px: 40,
    usage: "Largest; a page/list's own loading state",
  },
];

const swatchGroups: SwatchGroup[] = [
  {
    title: 'Brand palette',
    swatches: [
      {
        label: 'Background',
        className: 'bg-background',
        variable: '--color-background',
        hex: '#1D2731',
      },
      { label: 'Surface', className: 'bg-surface', variable: '--color-surface', hex: '#0B3C5D' },
      { label: 'Primary', className: 'bg-primary', variable: '--color-primary', hex: '#328CC1' },
      {
        label: 'Secondary',
        className: 'bg-secondary',
        variable: '--color-secondary',
        hex: '#D9B310',
      },
    ],
  },
  {
    title: 'Semantic colors',
    swatches: [
      { label: 'Success', className: 'bg-success', variable: '--color-success', hex: '#3FA34D' },
      { label: 'Error', className: 'bg-error', variable: '--color-error', hex: '#D6483D' },
      { label: 'Warning', className: 'bg-warning', variable: '--color-warning', hex: '#8A94A6' },
    ],
  },
  {
    title: 'Neutral scale',
    swatches: [
      {
        label: 'Neutral 900',
        className: 'bg-neutral-900',
        variable: '--color-neutral-900',
        hex: '#1D2731',
      },
      {
        label: 'Neutral 800',
        className: 'bg-neutral-800',
        variable: '--color-neutral-800',
        hex: '#28333F',
      },
      {
        label: 'Neutral 700',
        className: 'bg-neutral-700',
        variable: '--color-neutral-700',
        hex: '#3B4A59',
      },
      {
        label: 'Neutral 500',
        className: 'bg-neutral-500',
        variable: '--color-neutral-500',
        hex: '#6B7C8C',
      },
      {
        label: 'Neutral 300',
        className: 'bg-neutral-300',
        variable: '--color-neutral-300',
        hex: '#AEBAC4',
      },
      {
        label: 'Neutral 100',
        className: 'bg-neutral-100',
        variable: '--color-neutral-100',
        hex: '#E9EEF2',
      },
    ],
  },
];

export default function StyleGuidePage() {
  return (
    <main className="flex flex-col gap-8 p-8">
      <h1>Style guide — colors</h1>
      {swatchGroups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2>{group.title}</h2>
          <div className="flex flex-wrap gap-4">
            {group.swatches.map((swatch) => (
              <div key={swatch.variable} className="w-40">
                <div
                  className={`h-20 rounded-standard border border-neutral-700 ${swatch.className}`}
                />
                <p className="mt-2 font-bold">{swatch.label}</p>
                <p className="text-caption text-neutral-500">{swatch.variable}</p>
                <p className="text-caption text-neutral-500">{swatch.hex}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <h1>Style guide — typography</h1>
      <section className="flex flex-col gap-4">
        {typeSteps.map((step) => (
          <div key={step.label}>
            <p className={step.className}>{step.label} sample text</p>
            <p className="text-caption text-neutral-500">
              {step.sizeVariable} · {step.weightVariable}
            </p>
          </div>
        ))}
      </section>

      <h1>Style guide — spacing</h1>
      <section className="flex flex-col gap-3">
        {spacingSteps.map((step) => (
          <div key={step.className} className="flex items-center gap-4">
            <div className={`h-4 rounded-standard bg-primary ${step.className}`} />
            <p className="text-caption text-neutral-500">
              {step.label} — {step.className} ({step.px}px)
            </p>
          </div>
        ))}
      </section>

      <h1>Style guide — interactive states</h1>
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110">
            Hover me
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-standard bg-primary px-4 py-2 font-bold opacity-50"
          >
            Disabled
          </button>
        </div>
        <div>
          <p className="mb-2 text-caption text-neutral-500">
            Hover-revealed actions — hover the panel below to see the actions slide in from behind
            it.
          </p>
          <div className="group relative h-24 w-64 overflow-hidden rounded-standard bg-surface p-4">
            <p>Card / slot / binder</p>
            <div className="absolute right-2 bottom-2 flex translate-y-6 gap-2 opacity-0 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <button className="rounded-standard bg-primary px-2 py-1 text-caption font-bold hover:brightness-110">
                Edit
              </button>
              <button className="rounded-standard bg-error px-2 py-1 text-caption font-bold hover:brightness-110">
                Remove
              </button>
            </div>
          </div>
        </div>
      </section>

      <h1>Style guide — iconography</h1>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-8">
          {iconSizeSteps.map((step) => (
            <div key={step.className} className="flex flex-col items-center gap-2">
              <Star className={step.className} strokeWidth={2} />
              <p className="text-caption text-neutral-500">
                {step.label} ({step.px}px)
              </p>
              <p className="max-w-32 text-center text-caption text-neutral-500">{step.usage}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-caption text-neutral-500">
            Icons inherit color from surrounding text (currentColor):
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Star className="size-5" strokeWidth={2} />
              <span>Default text</span>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <Star className="size-5" strokeWidth={2} />
              <span>Primary text</span>
            </div>
          </div>
        </div>
      </section>

      <h1>Style guide — tooltips</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Shows instantly on hover/focus (no native `title` delay), portaled into{' '}
          <code>document.body</code> so it&apos;s never clipped by a scrollable ancestor. Wrap a
          single icon-only trigger; the trigger keeps its own `aria-label`.
        </p>
        <div className="flex items-center gap-6">
          <Tooltip label="Reorder">
            <button
              type="button"
              aria-label="Reorder"
              className="cursor-pointer rounded-standard p-2 hover:brightness-110"
            >
              <GripVertical className="size-5" />
            </button>
          </Tooltip>
          <p className="text-caption text-neutral-500">Hover or focus the handle to the left</p>
        </div>
      </section>

      <h1>Style guide — elevation &amp; surfaces</h1>
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-20 w-40 items-center justify-center rounded-standard bg-surface shadow-panel">
              Panel
            </div>
            <p className="text-caption text-neutral-500">shadow-panel — cards, flat panels</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-20 w-40 items-center justify-center rounded-standard bg-surface shadow-modal">
              Modal
            </div>
            <p className="text-caption text-neutral-500">
              shadow-modal — modals, dropdowns, popovers
            </p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-caption text-neutral-500">
            Modal backdrop — a slightly-darkened overlay behind the modal:
          </p>
          <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-standard bg-background">
            <p className="absolute top-2 left-2 text-caption text-neutral-500">Page content</p>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative flex h-16 w-48 items-center justify-center rounded-standard bg-surface shadow-modal">
              Modal
            </div>
          </div>
        </div>
      </section>

      <h1>Style guide — forms &amp; inputs</h1>
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-caption text-neutral-500">Default (click to see focus)</label>
            <input type="text" placeholder="Binder name" className={inputClassName} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-caption text-neutral-500">Error</label>
            <input
              type="text"
              defaultValue="Invalid value"
              className={`${inputClassName} border-error bg-error/10 ring-2 ring-error`}
            />
            <p className="text-caption text-error">This field is required.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-8">
          <label className="flex items-center gap-2">
            <span className="relative inline-flex size-5 items-center justify-center">
              <input
                type="checkbox"
                defaultChecked
                className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
              />
              <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
            </span>
            Checkbox
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="style-guide-radio"
              defaultChecked
              className="size-5 appearance-none rounded-full border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
            />
            Radio
          </label>
        </div>
      </section>

      <h1>Style guide — modals</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          One `fixed inset-0` element is both the dimmed backdrop and the dialog&apos;s stacking
          layer; the panel (`role=&quot;dialog&quot;`) stops click propagation so clicking inside it
          doesn&apos;t close it. Focus capture/restore and the Tab-trap come from the shared
          `useModalFocusTrap` hook.
        </p>
        <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-standard bg-background">
          <p className="absolute top-2 left-2 text-caption text-neutral-500">Page content</p>
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div
              role="dialog"
              aria-modal="true"
              className="flex w-64 flex-col gap-2 rounded-standard bg-surface p-4 shadow-modal"
            >
              <h3>Modal title</h3>
              <p className="text-caption text-neutral-500">Modal content goes here.</p>
            </div>
          </div>
        </div>
      </section>

      <h1>Style guide — toast notifications</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Bottom-right of the viewport; concurrent toasts stack vertically.
        </p>
        <div className="relative h-56 w-full overflow-hidden rounded-standard bg-background">
          <p className="absolute top-2 left-2 text-caption text-neutral-500">Page content</p>
          <div className="absolute right-4 bottom-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-standard bg-warning px-4 py-3 text-neutral-100 shadow-panel">
              <Loader2 className="size-5 animate-spin" />
              <span>Saving…</span>
            </div>
            <div className="flex items-center gap-2 rounded-standard bg-success px-4 py-3 text-neutral-100 shadow-panel">
              <CircleCheck className="size-5" />
              <span>Saved</span>
            </div>
            <div className="flex items-center gap-2 rounded-standard bg-error px-4 py-3 text-neutral-100 shadow-panel">
              <CircleAlert className="size-5" />
              <span>Failed to save binder</span>
              <button aria-label="Dismiss" className="ml-2">
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <h1>Style guide — loading spinner</h1>
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Loader2 className="size-4 animate-spin text-neutral-500" />
          <Loader2 className="size-5 animate-spin text-neutral-500" />
          <Loader2 className="size-6 animate-spin text-neutral-500" />
          <Loader2 className="size-8 animate-spin text-neutral-500" />
          <Loader2 className="size-10 animate-spin text-neutral-500" />
        </div>
        <p className="text-caption text-neutral-500">
          The spinner reuses the standard icon size scale (no dedicated spinner sizes). Prefer
          `size-8`/`size-10` for a page or list&apos;s own prominent content-loading state (e.g. the
          binder list).
        </p>
        <p className="text-caption text-neutral-500">
          Content-loading state: the spinner replaces panel content until it&apos;s ready. Actions
          that save/mutate data use the shared `saving` toast instead of an inline spinner.
        </p>
        <div className="flex h-32 w-full items-center justify-center rounded-standard bg-surface shadow-panel">
          <Loader2 className="size-10 animate-spin text-neutral-500" />
        </div>
      </section>

      <h1>Style guide — z-index / layering</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Fixed numeric convention, low to high: sticky headers (z-10), dropdowns (z-20), modal
          (z-50, backdrop + panel share one wrapping element), toasts (z-50, painted above modals
          via DOM order since `ToastViewport` mounts at the app root), a confirmation dialog nested
          above another open modal (z-[60]).
        </p>
        <div className="relative h-40 w-full overflow-hidden rounded-standard bg-background">
          <div className="absolute top-2 left-2 z-10 rounded-standard bg-neutral-700 px-3 py-1 text-caption">
            Sticky header (z-10)
          </div>
          <div className="absolute top-12 left-12 z-20 rounded-standard bg-neutral-700 px-3 py-1 text-caption shadow-panel">
            Dropdown (z-20)
          </div>
          <div className="absolute inset-0 z-50 bg-black/40" />
          <div className="absolute top-16 left-1/2 z-50 -translate-x-1/2 rounded-standard bg-surface px-4 py-2 shadow-modal">
            Modal (z-50)
          </div>
          <div className="absolute top-24 left-1/2 z-[60] -translate-x-1/2 rounded-standard bg-surface px-4 py-2 text-caption shadow-modal">
            Nested dialog (z-[60])
          </div>
          <div className="absolute right-4 bottom-4 z-50 rounded-standard bg-success px-3 py-1 text-caption text-neutral-100 shadow-panel">
            Toast (z-50)
          </div>
        </div>
      </section>

      <h1>Style guide — drag and drop</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Binder grid (`@dnd-kit/core`) — dragged card: no visual change (no
          opacity/scale/rotation). Source slot: empty placeholder. Valid drop target: border
          switches to `border-primary`, matching a focused input.
        </p>
        <div className="flex gap-4">
          <div className="flex aspect-[2/3] w-24 items-center justify-center rounded-standard border border-neutral-700 bg-neutral-800 text-caption text-neutral-500">
            Empty (source)
          </div>
          <div className="flex aspect-[2/3] w-24 items-center justify-center rounded-standard bg-surface text-caption shadow-panel">
            Dragged card
          </div>
          <div className="flex aspect-[2/3] w-24 items-center justify-center rounded-standard border border-primary bg-neutral-800 text-caption text-primary">
            Drop target
          </div>
        </div>
      </section>

      <h1>Style guide — sortable list reordering</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Animated (FLIP-style) row reordering (`@dnd-kit/sortable`) — a dedicated grip handle (not
          the whole row) is the drag activator; the actively-dragged row lifts above its siblings
          and dims slightly while other rows animate into their new slot.
        </p>
        <div className="flex w-72 flex-col rounded-standard bg-surface shadow-panel">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
            <GripVertical className="size-4 text-neutral-500" />
            <span>Row 1</span>
          </div>
          <div className="relative z-10 flex items-center gap-2 rounded-standard bg-neutral-800 px-3 py-2 opacity-90">
            <GripVertical className="size-4 text-neutral-500" />
            <span>Row 2 (dragging)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <GripVertical className="size-4 text-neutral-500" />
            <span>Row 3</span>
          </div>
        </div>
      </section>

      <h1>Style guide — virtualized lists &amp; grids</h1>
      <section className="flex flex-col gap-2">
        <p className="text-caption text-neutral-500">
          Long lists/grids (unplaced-cards panel, unplaced-art panel, catalog search results) use
          `@tanstack/react-virtual`&apos;s `useVirtualizer` — rows are absolutely positioned inside
          a container sized to the virtualizer&apos;s total height, each translated into place via
          `translateY`, with only the visible-plus-overscan rows actually rendered.
        </p>
        <div className="relative h-32 w-full overflow-hidden rounded-standard bg-neutral-800">
          <div className="absolute top-0 right-0 left-0 rounded-standard bg-surface px-3 py-2 text-caption shadow-panel">
            Row (translateY: 0px)
          </div>
          <div className="absolute top-11 right-0 left-0 rounded-standard bg-surface px-3 py-2 text-caption shadow-panel">
            Row (translateY: 44px)
          </div>
          <div className="absolute top-[88px] right-0 left-0 rounded-standard bg-surface px-3 py-2 text-caption shadow-panel">
            Row (translateY: 88px)
          </div>
          <p className="absolute right-2 bottom-2 text-caption text-neutral-500">
            + off-screen rows (not rendered)
          </p>
        </div>
      </section>
    </main>
  );
}
