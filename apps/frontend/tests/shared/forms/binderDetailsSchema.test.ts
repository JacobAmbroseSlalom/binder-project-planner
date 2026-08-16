import {
  BINDER_NAME_MAX_LENGTH,
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_PAGE_COUNT,
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  DEFAULT_BINDER_WIDTH,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';

import { binderDetailsSchema, defaultBinderDetailsFormValues } from '@/shared/forms';

// Story 24's dimension/style fields (plus story 51's `tags` field) are
// required by `binderDetailsSchema` alongside name/width/height/pages; every
// valid parse below spreads this so each test only overrides the field(s)
// it's actually exercising, using the same canonical shared defaults the
// form itself falls back to.
const validDimensionFields = {
  widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
  widthBase: DEFAULT_WIDTH_BASE_CM,
  heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
  heightBase: DEFAULT_HEIGHT_BASE_CM,
  borderColor: DEFAULT_BORDER_COLOR,
  borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
  borderWidth: DEFAULT_BORDER_WIDTH_CM,
  previewPhysicalPage: DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  tags: [] as string[],
};

// Verifies story 4's client-side validation rules: the Zod schema trims and
// bounds the binder name, coerces width/height/pages to positive integers,
// and the form's defaults match the canonical shared defaults.ts values
// rather than duplicating them.
describe('binderDetailsSchema', () => {
  it('defaults width, height, and pages from the canonical shared defaults', () => {
    expect(defaultBinderDetailsFormValues).toEqual({
      name: '',
      width: DEFAULT_BINDER_WIDTH,
      height: DEFAULT_BINDER_HEIGHT,
      pages: DEFAULT_BINDER_PAGE_COUNT,
      ...validDimensionFields,
    });
  });

  it('accepts a valid set of values, trimming the name and coercing numeric input strings', () => {
    const result = binderDetailsSchema.safeParse({
      name: '  My Binder  ',
      width: '3',
      height: '4',
      pages: '20',
      ...validDimensionFields,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'My Binder',
      width: 3,
      height: 4,
      pages: 20,
      ...validDimensionFields,
    });
  });

  it('rejects a name that is empty after trimming', () => {
    const result = binderDetailsSchema.safeParse({
      name: '   ',
      width: 1,
      height: 1,
      pages: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toContain('Binder name is required.');
    }
  });

  it(`rejects a name over ${BINDER_NAME_MAX_LENGTH} characters after trimming`, () => {
    const result = binderDetailsSchema.safeParse({
      name: `  ${'a'.repeat(BINDER_NAME_MAX_LENGTH + 1)}  `,
      width: 1,
      height: 1,
      pages: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toContain(
        `Binder name must be ${BINDER_NAME_MAX_LENGTH} characters or fewer.`,
      );
    }
  });

  it(`accepts a name of exactly ${BINDER_NAME_MAX_LENGTH} characters after trimming`, () => {
    const result = binderDetailsSchema.safeParse({
      name: `  ${'a'.repeat(BINDER_NAME_MAX_LENGTH)}  `,
      width: 1,
      height: 1,
      pages: 1,
      ...validDimensionFields,
    });

    expect(result.success).toBe(true);
  });

  it.each(['width', 'height', 'pages'] as const)('rejects a non-integer %s value', (field) => {
    const result = binderDetailsSchema.safeParse({
      name: 'My Binder',
      width: 3,
      height: 3,
      pages: 20,
      [field]: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it.each(['width', 'height', 'pages'] as const)('rejects a %s value less than 1', (field) => {
    const result = binderDetailsSchema.safeParse({
      name: 'My Binder',
      width: 3,
      height: 3,
      pages: 20,
      [field]: 0,
    });

    expect(result.success).toBe(false);
  });

  // planning.md: "Width and height have a maximum value of 8; pages has no
  // fixed maximum" - so only `pages` is exercised with an oversized value
  // here, while width/height stay within their documented cap.
  it('has no fixed maximum for pages', () => {
    const result = binderDetailsSchema.safeParse({
      name: 'My Binder',
      width: 8,
      height: 8,
      pages: 100000,
      ...validDimensionFields,
    });

    expect(result.success).toBe(true);
  });
});
