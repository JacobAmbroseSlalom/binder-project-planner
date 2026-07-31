import {
  BINDER_NAME_MAX_LENGTH,
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_PAGE_COUNT,
  DEFAULT_BINDER_WIDTH,
} from '@binder-project-planner/shared';

import { binderDetailsSchema, defaultBinderDetailsFormValues } from '@/shared/forms';

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
    });
  });

  it('accepts a valid set of values, trimming the name and coercing numeric input strings', () => {
    const result = binderDetailsSchema.safeParse({
      name: '  My Binder  ',
      width: '3',
      height: '4',
      pages: '20',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'My Binder', width: 3, height: 4, pages: 20 });
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

  it('has no fixed maximum for width, height, or pages', () => {
    const result = binderDetailsSchema.safeParse({
      name: 'My Binder',
      width: 1000,
      height: 1000,
      pages: 100000,
    });

    expect(result.success).toBe(true);
  });
});
